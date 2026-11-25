"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { useVoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";
import { VoiceMesh } from "@/components/messenger/voice/webrtcMesh";
import { useOptionalVoiceSession } from "@/components/messenger/voice/VoiceSessionProvider";
import type { VoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";

const RING_TIMEOUT_MS = 45_000;

export type CallConnection = {
  conversationId: string;
  label: string;
  withVideo: boolean;
  isGroup: boolean;
  peerUserIds: string[];
  participantIds: string[];
  peerNames: Record<string, string>;
};

export type OpenCallInfo = {
  conversationId: string;
  withVideo: boolean;
  participantCount: number;
  startedBy: string;
};

type IncomingCall = {
  conversationId: string;
  fromUserId: string;
  fromUsername: string;
  withVideo: boolean;
  label: string;
};

type OutgoingRing = {
  conversationId: string;
  label: string;
  withVideo: boolean;
  peerUserId: string;
};

type RemoteMedia = {
  camera: MediaStream | null;
  screen: MediaStream | null;
};

type CallSessionContextValue = {
  connection: CallConnection | null;
  incoming: IncomingCall | null;
  outgoing: OutgoingRing | null;
  openCalls: Record<string, OpenCallInfo>;
  stageExpanded: boolean;
  setStageExpanded: (expanded: boolean) => void;
  muted: boolean;
  deafened: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  watchingPeerId: string | null;
  setWatchingPeerId: (peerId: string | null) => void;
  quality: VoiceConnectionQuality;
  localVideoStream: MediaStream | null;
  remoteMedia: Record<string, RemoteMedia>;
  speakingPeerIds: ReadonlySet<string>;
  micError: string | null;
  micLevel: number;
  watchConversation: (conversationId: string | null) => void;
  refreshOpenCalls: (conversationIds: string[]) => Promise<void>;
  startCall: (args: {
    conversationId: string;
    label: string;
    peerUserIds: string[];
    peerNames?: Record<string, string>;
    isGroup?: boolean;
    withVideo?: boolean;
  }) => Promise<void>;
  joinCall: (args: {
    conversationId: string;
    label: string;
    peerUserIds: string[];
    peerNames?: Record<string, string>;
    isGroup?: boolean;
  }) => Promise<void>;
  cancelOutgoing: () => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  leaveCall: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
};

const CallSessionContext = createContext<CallSessionContextValue | null>(null);

type CtrlPayload =
  | {
      kind: "invite";
      from: string;
      fromUsername: string;
      conversationId: string;
      withVideo: boolean;
      label: string;
    }
  | { kind: "decline"; from: string; conversationId: string }
  | { kind: "cancel"; from: string; conversationId: string }
  | { kind: "end"; from: string; conversationId: string }
  | {
      kind: "joined";
      from: string;
      conversationId: string;
      peerUserIds: string[];
    };

async function broadcastCtrl(conversationId: string, payload: CtrlPayload) {
  const supabase = createClient();
  const channel = supabase.channel(
    `call-ctrl-pub:${conversationId}:${crypto.randomUUID()}`,
  );
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });
  await channel.send({ type: "broadcast", event: "ctrl", payload });
  void supabase.removeChannel(channel);
}

export function CallSessionProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useCurrentProfile();
  const voice = useOptionalVoiceSession();
  const devices = useAudioDevices();
  const [connection, setConnection] = useState<CallConnection | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [outgoing, setOutgoing] = useState<OutgoingRing | null>(null);
  const [openCalls, setOpenCalls] = useState<Record<string, OpenCallInfo>>({});
  const [stageExpanded, setStageExpanded] = useState(true);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [watchingPeerId, setWatchingPeerId] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [micLevel] = useState(0);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(
    null,
  );
  const [remoteMedia, setRemoteMedia] = useState<Record<string, RemoteMedia>>(
    {},
  );
  const [speakingPeerIds] = useState<Set<string>>(() => new Set());
  const [watchId, setWatchId] = useState<string | null>(null);

  const meshRef = useRef<VoiceMesh | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const connectionRef = useRef(connection);
  const outgoingRef = useRef(outgoing);
  const mutedRef = useRef(muted);
  const userIdRef = useRef(user?.id ?? null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  connectionRef.current = connection;
  outgoingRef.current = outgoing;
  mutedRef.current = muted;
  userIdRef.current = user?.id ?? null;

  const quality = useVoiceConnectionQuality(!!connection || !!outgoing);

  const cleanupMedia = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    for (const track of rawStreamRef.current?.getTracks() ?? []) track.stop();
    cameraTrackRef.current?.stop();
    screenTrackRef.current?.stop();
    streamRef.current = null;
    rawStreamRef.current = null;
    cameraTrackRef.current = null;
    screenTrackRef.current = null;
    setLocalVideoStream(null);
    setCameraOn(false);
    setScreenSharing(false);
    setRemoteMedia({});
    setWatchingPeerId(null);
  }, []);

  const clearRingTimer = useCallback(() => {
    if (ringTimerRef.current != null) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
  }, []);

  const upsertPresence = useCallback(
    async (
      conversationId: string,
      opts: { withVideo: boolean; cameraOn: boolean; screenOn: boolean },
    ) => {
      if (!user) return;
      const supabase = createClient();
      await supabase.from("dm_call_sessions").upsert({
        conversation_id: conversationId,
        started_by: user.id,
        with_video: opts.withVideo,
        updated_at: new Date().toISOString(),
      });
      await supabase.from("dm_call_participants").upsert({
        conversation_id: conversationId,
        user_id: user.id,
        camera_on: opts.cameraOn,
        screen_on: opts.screenOn,
      });
    },
    [user],
  );

  const removeSelfPresence = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      const supabase = createClient();
      await supabase
        .from("dm_call_participants")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", user.id);
      const { count } = await supabase
        .from("dm_call_participants")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", conversationId);
      if (!count) {
        await supabase
          .from("dm_call_sessions")
          .delete()
          .eq("conversation_id", conversationId);
      }
    },
    [user],
  );

  const leaveCall = useCallback(async () => {
    clearRingTimer();
    const conn = connectionRef.current;
    const uid = userIdRef.current;
    if (conn && uid) {
      void broadcastCtrl(conn.conversationId, {
        kind: "end",
        from: uid,
        conversationId: conn.conversationId,
      });
      await removeSelfPresence(conn.conversationId);
      setOpenCalls((prev) => {
        const next = { ...prev };
        delete next[conn.conversationId];
        return next;
      });
    }
    if (meshRef.current) {
      await meshRef.current.stop();
      meshRef.current = null;
    }
    cleanupMedia();
    setConnection(null);
    setOutgoing(null);
    setMuted(false);
    setDeafened(false);
    setMicError(null);
    setStageExpanded(true);
  }, [cleanupMedia, clearRingTimer, removeSelfPresence]);

  const startMedia = useCallback(
    async (withVideo: boolean) => {
      setMicError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicError("Voice is not supported in this browser.");
        return null;
      }
      try {
        const raw = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: devices.inputDeviceId
              ? { exact: devices.inputDeviceId }
              : undefined,
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: withVideo
            ? {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : false,
        });
        rawStreamRef.current = raw;
        const audioTrack = raw.getAudioTracks()[0] ?? null;
        if (audioTrack) audioTrack.enabled = !mutedRef.current;
        const out = new MediaStream(audioTrack ? [audioTrack] : []);
        streamRef.current = out;
        const video = raw.getVideoTracks()[0] ?? null;
        if (video) {
          cameraTrackRef.current = video;
          setCameraOn(true);
          setLocalVideoStream(new MediaStream([video]));
        }
        return out;
      } catch {
        setMicError("Mic permission denied — allow microphone access.");
        return null;
      }
    },
    [devices.inputDeviceId],
  );

  const ensureLeftOtherSessions = useCallback(async () => {
    if (voice?.connection) {
      await voice.leaveVoice();
    }
    if (connectionRef.current || outgoingRef.current) {
      await leaveCall();
    }
  }, [leaveCall, voice]);

  const joinMesh = useCallback(
    async (args: {
      conversationId: string;
      label: string;
      withVideo: boolean;
      isGroup: boolean;
      peerUserIds: string[];
      peerNames?: Record<string, string>;
      /** Skip leave when caller already cleaned sessions (1:1 ring). */
      skipEnsure?: boolean;
    }) => {
      if (!user) return;
      if (!args.skipEnsure) await ensureLeftOtherSessions();
      else {
        // Tear down media/mesh only if reconnecting same provider without leaveCall.
        if (meshRef.current) {
          await meshRef.current.stop();
          meshRef.current = null;
        }
        cleanupMedia();
      }
      const stream = await startMedia(args.withVideo);
      const supabase = createClient();
      const mesh = new VoiceMesh({
        supabase,
        channelId: args.conversationId,
        userId: user.id,
        topicPrefix: "call-rtc",
        onRemoteVideo: (peerId, remoteStream, kind) => {
          setRemoteMedia((prev) => {
            const current = prev[peerId] ?? { camera: null, screen: null };
            const next = { ...current };
            if (kind === "screen") next.screen = remoteStream;
            else next.camera = remoteStream;
            if (!next.camera && !next.screen) {
              const copy = { ...prev };
              delete copy[peerId];
              return copy;
            }
            return { ...prev, [peerId]: next };
          });
        },
        onError: (message) => setMicError(message),
      });
      meshRef.current = mesh;
      await mesh.start(args.peerUserIds);
      if (stream) await mesh.setLocalStream(stream);
      if (cameraTrackRef.current) {
        await mesh.setLocalVideoTrack(cameraTrackRef.current);
      }
      mesh.setMuted(mutedRef.current);
      await upsertPresence(args.conversationId, {
        withVideo: args.withVideo,
        cameraOn: !!cameraTrackRef.current,
        screenOn: false,
      });
      setConnection({
        conversationId: args.conversationId,
        label: args.label,
        withVideo: args.withVideo,
        isGroup: args.isGroup,
        peerUserIds: args.peerUserIds,
        participantIds: [user.id, ...args.peerUserIds],
        peerNames: args.peerNames ?? {},
      });
      setStageExpanded(true);
      setOpenCalls((prev) => ({
        ...prev,
        [args.conversationId]: {
          conversationId: args.conversationId,
          withVideo: args.withVideo,
          participantCount: 1 + args.peerUserIds.length,
          startedBy: user.id,
        },
      }));
      void broadcastCtrl(args.conversationId, {
        kind: "joined",
        from: user.id,
        conversationId: args.conversationId,
        peerUserIds: args.peerUserIds,
      });
    },
    [cleanupMedia, ensureLeftOtherSessions, startMedia, upsertPresence, user],
  );

  const startCall = useCallback(
    async (args: {
      conversationId: string;
      label: string;
      peerUserIds: string[];
      peerNames?: Record<string, string>;
      isGroup?: boolean;
      withVideo?: boolean;
    }) => {
      if (!user) return;
      const withVideo = !!args.withVideo;
      const isGroup = !!args.isGroup;

      const supabase = createClient();
      const { data: existing } = await supabase
        .from("dm_call_sessions")
        .select("conversation_id, with_video")
        .eq("conversation_id", args.conversationId)
        .maybeSingle();

      if (existing) {
        await joinMesh({
          conversationId: args.conversationId,
          label: args.label,
          withVideo: existing.with_video || withVideo,
          isGroup,
          peerUserIds: args.peerUserIds,
          peerNames: args.peerNames,
        });
        return;
      }

      if (isGroup) {
        await joinMesh({
          conversationId: args.conversationId,
          label: args.label,
          withVideo,
          isGroup: true,
          peerUserIds: args.peerUserIds,
          peerNames: args.peerNames,
        });
        return;
      }

      // 1:1 — ring then connect locally while waiting
      clearRingTimer();
      await ensureLeftOtherSessions();
      const peerUserId = args.peerUserIds[0];
      if (!peerUserId) return;
      setOutgoing({
        conversationId: args.conversationId,
        label: args.label,
        withVideo,
        peerUserId,
      });
      await joinMesh({
        conversationId: args.conversationId,
        label: args.label,
        withVideo,
        isGroup: false,
        peerUserIds: [peerUserId],
        peerNames: args.peerNames,
        skipEnsure: true,
      });
      void broadcastCtrl(args.conversationId, {
        kind: "invite",
        from: user.id,
        fromUsername: profile?.username ?? "Someone",
        conversationId: args.conversationId,
        withVideo,
        label: profile?.username ?? "Someone",
      });
      ringTimerRef.current = setTimeout(() => {
        void (async () => {
          const stillOutgoing =
            outgoingRef.current?.conversationId === args.conversationId;
          if (!stillOutgoing) return;
          await supabase.from("dm_messages").insert({
            conversation_id: args.conversationId,
            user_id: user.id,
            content: withVideo ? "Missed video call." : "Missed voice call.",
            is_system: true,
            pinned: false,
          });
          await leaveCall();
        })();
      }, RING_TIMEOUT_MS);
    },
    [
      clearRingTimer,
      ensureLeftOtherSessions,
      joinMesh,
      leaveCall,
      profile?.username,
      user,
    ],
  );

  const joinCall = useCallback(
    async (args: {
      conversationId: string;
      label: string;
      peerUserIds: string[];
      peerNames?: Record<string, string>;
      isGroup?: boolean;
    }) => {
      const supabase = createClient();
      const { data: existing } = await supabase
        .from("dm_call_sessions")
        .select("with_video")
        .eq("conversation_id", args.conversationId)
        .maybeSingle();
      await joinMesh({
        conversationId: args.conversationId,
        label: args.label,
        withVideo: !!existing?.with_video,
        isGroup: !!args.isGroup,
        peerUserIds: args.peerUserIds,
        peerNames: args.peerNames,
      });
    },
    [joinMesh],
  );

  const cancelOutgoing = useCallback(async () => {
    const ring = outgoingRef.current;
    clearRingTimer();
    if (ring && user) {
      void broadcastCtrl(ring.conversationId, {
        kind: "cancel",
        from: user.id,
        conversationId: ring.conversationId,
      });
    }
    setOutgoing(null);
    await leaveCall();
  }, [clearRingTimer, leaveCall, user]);

  const acceptCall = useCallback(async () => {
    const invite = incoming;
    if (!invite || !user) return;
    setIncoming(null);
    clearRingTimer();
    await joinMesh({
      conversationId: invite.conversationId,
      label: invite.fromUsername,
      withVideo: invite.withVideo,
      isGroup: false,
      peerUserIds: [invite.fromUserId],
      peerNames: { [invite.fromUserId]: invite.fromUsername },
    });
  }, [clearRingTimer, incoming, joinMesh, user]);

  const declineCall = useCallback(() => {
    const invite = incoming;
    if (!invite || !user) {
      setIncoming(null);
      return;
    }
    void broadcastCtrl(invite.conversationId, {
      kind: "decline",
      from: user.id,
      conversationId: invite.conversationId,
    });
    setIncoming(null);
  }, [incoming, user]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      meshRef.current?.setMuted(next);
      const track = streamRef.current?.getAudioTracks()[0];
      if (track) track.enabled = !next;
      return next;
    });
  }, []);

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => {
      const next = !prev;
      meshRef.current?.setDeafened(next);
      if (next) {
        setMuted(true);
        mutedRef.current = true;
        meshRef.current?.setMuted(true);
      }
      return next;
    });
  }, []);

  const persistMediaFlags = useCallback(
    async (camera: boolean, screen: boolean) => {
      const conn = connectionRef.current;
      if (!conn || !user) return;
      await supabaseFlags(conn.conversationId, user.id, camera, screen);
    },
    [user],
  );

  async function supabaseFlags(
    conversationId: string,
    userId: string,
    camera: boolean,
    screen: boolean,
  ) {
    const supabase = createClient();
    await supabase
      .from("dm_call_participants")
      .update({ camera_on: camera, screen_on: screen })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
  }

  const toggleCamera = useCallback(async () => {
    if (!meshRef.current) return;
    if (cameraTrackRef.current) {
      await meshRef.current.setLocalVideoTrack(null);
      cameraTrackRef.current.stop();
      cameraTrackRef.current = null;
      setCameraOn(false);
      setLocalVideoStream(null);
      await persistMediaFlags(false, screenSharing);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      cameraTrackRef.current = track;
      setCameraOn(true);
      setLocalVideoStream(new MediaStream([track]));
      await meshRef.current.setLocalVideoTrack(track);
      await persistMediaFlags(true, screenSharing);
    } catch {
      setMicError("Camera permission denied.");
    }
  }, [persistMediaFlags, screenSharing]);

  const toggleScreenShare = useCallback(async () => {
    if (!meshRef.current) return;
    if (screenTrackRef.current) {
      await meshRef.current.setLocalScreenTrack(null);
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
      setScreenSharing(false);
      await persistMediaFlags(cameraOn, false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      screenTrackRef.current = track;
      setScreenSharing(true);
      track.addEventListener(
        "ended",
        () => {
          void (async () => {
            await meshRef.current?.setLocalScreenTrack(null);
            screenTrackRef.current = null;
            setScreenSharing(false);
            await persistMediaFlags(!!cameraTrackRef.current, false);
          })();
        },
        { once: true },
      );
      await meshRef.current.setLocalScreenTrack(track);
      await persistMediaFlags(cameraOn, true);
    } catch {
      setMicError("Screen share cancelled or blocked.");
    }
  }, [cameraOn, persistMediaFlags]);

  const watchConversation = useCallback((conversationId: string | null) => {
    setWatchId(conversationId);
  }, []);

  const refreshOpenCalls = useCallback(async (conversationIds: string[]) => {
    if (conversationIds.length === 0) {
      setOpenCalls({});
      return;
    }
    const supabase = createClient();
    const { data: sessions } = await supabase
      .from("dm_call_sessions")
      .select("conversation_id, with_video, started_by")
      .in("conversation_id", conversationIds);
    const { data: parts } = await supabase
      .from("dm_call_participants")
      .select("conversation_id")
      .in("conversation_id", conversationIds);
    const counts = new Map<string, number>();
    for (const row of parts ?? []) {
      counts.set(row.conversation_id, (counts.get(row.conversation_id) ?? 0) + 1);
    }
    const next: Record<string, OpenCallInfo> = {};
    for (const session of sessions ?? []) {
      next[session.conversation_id] = {
        conversationId: session.conversation_id,
        withVideo: session.with_video,
        participantCount: counts.get(session.conversation_id) ?? 1,
        startedBy: session.started_by,
      };
    }
    setOpenCalls(next);
  }, []);

  useEffect(() => {
    if (!user || !watchId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`call-ctrl:${watchId}`, {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "ctrl" }, ({ payload }) => {
        const msg = payload as CtrlPayload;
        if (!msg || msg.conversationId !== watchId) return;
        if (msg.kind === "invite" && msg.from !== user.id) {
          if (connectionRef.current) return;
          setIncoming({
            conversationId: msg.conversationId,
            fromUserId: msg.from,
            fromUsername: msg.fromUsername,
            withVideo: msg.withVideo,
            label: msg.label,
          });
        }
        if (msg.kind === "decline" && msg.from !== user.id) {
          if (outgoingRef.current?.conversationId === watchId) {
            clearRingTimer();
            setOutgoing(null);
            void leaveCall();
          }
        }
        if (msg.kind === "cancel" && msg.from !== user.id) {
          setIncoming(null);
        }
        if (msg.kind === "end" && msg.from !== user.id) {
          setIncoming(null);
          if (connectionRef.current?.conversationId === watchId) {
            void leaveCall();
          }
        }
        if (msg.kind === "joined" && msg.from !== user.id) {
          clearRingTimer();
          setOutgoing(null);
          setConnection((prev) =>
            prev
              ? {
                  ...prev,
                  participantIds: [
                    ...new Set([...prev.participantIds, msg.from]),
                  ],
                }
              : prev,
          );
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clearRingTimer, leaveCall, user, watchId]);

  useEffect(() => {
    function onLeaveForVoice() {
      void leaveCall();
    }
    window.addEventListener("redsss-leave-dm-call", onLeaveForVoice);
    return () => {
      window.removeEventListener("redsss-leave-dm-call", onLeaveForVoice);
    };
  }, [leaveCall]);

  useEffect(() => {
    return () => {
      clearRingTimer();
      void leaveCall();
    };
  }, [clearRingTimer, leaveCall]);

  const value = useMemo<CallSessionContextValue>(
    () => ({
      connection,
      incoming,
      outgoing,
      openCalls,
      stageExpanded,
      setStageExpanded,
      muted,
      deafened,
      cameraOn,
      screenSharing,
      watchingPeerId,
      setWatchingPeerId,
      quality,
      localVideoStream,
      remoteMedia,
      speakingPeerIds,
      micError,
      micLevel,
      watchConversation,
      refreshOpenCalls,
      startCall,
      joinCall,
      cancelOutgoing,
      acceptCall,
      declineCall,
      leaveCall,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      toggleScreenShare,
    }),
    [
      connection,
      incoming,
      outgoing,
      openCalls,
      stageExpanded,
      muted,
      deafened,
      cameraOn,
      screenSharing,
      watchingPeerId,
      quality,
      localVideoStream,
      remoteMedia,
      speakingPeerIds,
      micError,
      micLevel,
      watchConversation,
      refreshOpenCalls,
      startCall,
      joinCall,
      cancelOutgoing,
      acceptCall,
      declineCall,
      leaveCall,
      toggleMute,
      toggleDeafen,
      toggleCamera,
      toggleScreenShare,
    ],
  );

  return (
    <CallSessionContext.Provider value={value}>
      {children}
      {incoming && !connection ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-md border border-[var(--ms-border)] bg-[var(--ms-chat)] p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
              Incoming {incoming.withVideo ? "video" : "voice"} call
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {incoming.fromUsername}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={declineCall}
                className="rounded-md px-3 py-2 text-sm text-[var(--ms-text)] hover:bg-white/5"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => void acceptCall()}
                className="rounded-md bg-[var(--ms-connected)] px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {outgoing && connection ? (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-[85] flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-[var(--ms-border)] bg-[var(--ms-chat)] px-4 py-2 shadow-xl">
            <span className="text-sm text-[var(--ms-text)]">
              Calling {outgoing.label}…
            </span>
            <button
              type="button"
              onClick={() => void cancelOutgoing()}
              className="rounded-md bg-[#ed4245] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#c03537]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </CallSessionContext.Provider>
  );
}

export function useCallSession() {
  const ctx = useContext(CallSessionContext);
  if (!ctx) {
    throw new Error("useCallSession must be used within CallSessionProvider");
  }
  return ctx;
}

export function useOptionalCallSession() {
  return useContext(CallSessionContext);
}
