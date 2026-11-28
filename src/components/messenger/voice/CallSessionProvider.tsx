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
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { useVoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";
import { VoiceMesh } from "@/components/messenger/voice/webrtcMesh";
import { useOptionalVoiceSession } from "@/components/messenger/voice/VoiceSessionProvider";
import type { VoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";
import { encodeMissedCallMessage } from "@/lib/missed-call";
import {
  playSound,
  startSoundLoop,
  stopSoundLoop,
} from "@/lib/ui-sounds";

/** Discord-style: ~30s ring, then missed-call notice. Decline ends earlier with no chat message. */
const RING_TIMEOUT_MS = 30_000;

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
  localScreenStream: MediaStream | null;
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

async function broadcastOnTopic(topic: string, payload: CtrlPayload) {
  const supabase = createClient();
  const existing = supabase
    .getChannels()
    .find(
      (ch) =>
        ch.topic === topic ||
        ch.topic === `realtime:${topic}` ||
        ch.topic.endsWith(`:${topic}`),
    );
  if (existing) {
    await existing.send({ type: "broadcast", event: "ctrl", payload });
    return;
  }
  const channel = supabase.channel(topic, {
    config: { broadcast: { self: false } },
  });
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });
  await channel.send({ type: "broadcast", event: "ctrl", payload });
  void supabase.removeChannel(channel);
}

async function broadcastCtrl(conversationId: string, payload: CtrlPayload) {
  await broadcastOnTopic(`call-ctrl:${conversationId}`, payload);
}

async function broadcastInbox(userId: string, payload: CtrlPayload) {
  await broadcastOnTopic(`call-inbox:${userId}`, payload);
}

type RingtoneHandle = {
  stop: () => void;
};

export function CallSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
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
  const [localScreenStream, setLocalScreenStream] =
    useState<MediaStream | null>(null);
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
  const ringtoneRef = useRef<RingtoneHandle | null>(null);
  const desktopNotifRef = useRef<Notification | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const inviteResendRef = useRef<ReturnType<typeof setInterval> | null>(null);

  connectionRef.current = connection;
  outgoingRef.current = outgoing;
  incomingRef.current = incoming;
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
    setLocalScreenStream(null);
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
    if (inviteResendRef.current != null) {
      clearInterval(inviteResendRef.current);
      inviteResendRef.current = null;
    }
  }, []);

  const stopIncomingAlerts = useCallback(() => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
    stopSoundLoop();
    desktopNotifRef.current?.close();
    desktopNotifRef.current = null;
  }, []);

  const startIncomingAlerts = useCallback((fromUsername: string) => {
    stopIncomingAlerts();
    ringtoneRef.current = startSoundLoop("incoming-call");
    try {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        desktopNotifRef.current = new Notification(
          `${fromUsername} is calling`,
          {
            body: "Incoming call on Redsss Messenger",
            tag: "redsss-incoming-call",
            requireInteraction: true,
          },
        );
      }
    } catch {
      /* Notifications unavailable */
    }
  }, [stopIncomingAlerts]);

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
    // Sound before ringtone teardown / presence cleanup.
    if (connectionRef.current || outgoingRef.current) {
      playSound("voice-leave");
    }
    clearRingTimer();
    stopIncomingAlerts();
    const conn = connectionRef.current;
    const uid = userIdRef.current;
    const outgoingPeer = outgoingRef.current?.peerUserId;
    if (conn && uid) {
      const endPayload: CtrlPayload = {
        kind: "end",
        from: uid,
        conversationId: conn.conversationId,
      };
      void broadcastCtrl(conn.conversationId, endPayload);
      const peers = [
        ...new Set([
          ...conn.peerUserIds,
          ...(outgoingPeer ? [outgoingPeer] : []),
        ]),
      ].filter((id) => id !== uid);
      for (const peerId of peers) {
        void broadcastInbox(peerId, endPayload);
      }
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
    setIncoming(null);
    setMuted(false);
    setDeafened(false);
    setMicError(null);
    setStageExpanded(true);
  }, [cleanupMedia, clearRingTimer, removeSelfPresence, stopIncomingAlerts]);

  const startMedia = useCallback(
    async (withVideo: boolean) => {
      setMicError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicError("Voice is not supported in this browser.");
        return null;
      }
      const audioConstraint: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
      };
      if (devices.inputDeviceId) {
        audioConstraint.deviceId = { ideal: devices.inputDeviceId };
      }
      try {
        let raw: MediaStream;
        try {
          raw = await navigator.mediaDevices.getUserMedia({
            audio: devices.inputDeviceId
              ? {
                  ...audioConstraint,
                  deviceId: { exact: devices.inputDeviceId },
                }
              : audioConstraint,
            video: withVideo
              ? {
                  facingMode: "user",
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                }
              : false,
          });
        } catch {
          // Exact device missing (unplugged / revoked) — fall back to ideal/default.
          raw = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraint,
            video: withVideo
              ? {
                  facingMode: "user",
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                }
              : false,
          });
        }
        rawStreamRef.current = raw;
        const audioTrack = raw.getAudioTracks()[0] ?? null;
        if (audioTrack) {
          audioTrack.enabled = !mutedRef.current;
          audioTrack.onended = () => {
            setMicError("Microphone stopped — check permissions or device.");
          };
        }
        const out = new MediaStream(audioTrack ? [audioTrack] : []);
        streamRef.current = out;
        const video = raw.getVideoTracks()[0] ?? null;
        if (video) {
          cameraTrackRef.current = video;
          setCameraOn(true);
          setLocalVideoStream(new MediaStream([video]));
          video.onended = () => {
            setCameraOn(false);
            setLocalVideoStream(null);
            cameraTrackRef.current = null;
          };
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

  const callInputDeviceRef = useRef<string | null>(null);

  // Mid-call input device change / re-grant after revoke (skip first join).
  useEffect(() => {
    if (!connection) {
      callInputDeviceRef.current = null;
      return;
    }
    const prev = callInputDeviceRef.current;
    callInputDeviceRef.current = devices.inputDeviceId;
    if (prev === null) return;
    if (prev === devices.inputDeviceId) return;
    let cancelled = false;
    async function switchInput() {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        let raw: MediaStream;
        try {
          raw = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: devices.inputDeviceId
                ? { exact: devices.inputDeviceId }
                : undefined,
              echoCancellation: true,
              noiseSuppression: true,
            },
            video: false,
          });
        } catch {
          raw = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: devices.inputDeviceId
                ? { ideal: devices.inputDeviceId }
                : undefined,
              echoCancellation: true,
              noiseSuppression: true,
            },
            video: false,
          });
        }
        if (cancelled) {
          for (const track of raw.getTracks()) track.stop();
          return;
        }
        const nextAudio = raw.getAudioTracks()[0] ?? null;
        if (!nextAudio) {
          for (const track of raw.getTracks()) track.stop();
          setMicError("No microphone track available.");
          return;
        }
        nextAudio.enabled = !mutedRef.current;
        nextAudio.onended = () => {
          setMicError("Microphone stopped — check permissions or device.");
        };
        for (const track of streamRef.current?.getAudioTracks() ?? []) {
          track.stop();
        }
        for (const track of rawStreamRef.current?.getAudioTracks() ?? []) {
          track.stop();
        }
        const keepVideo = rawStreamRef.current?.getVideoTracks() ?? [];
        rawStreamRef.current = new MediaStream([
          nextAudio,
          ...keepVideo,
          ...raw.getVideoTracks(),
        ]);
        const out = new MediaStream([nextAudio]);
        streamRef.current = out;
        await meshRef.current?.setLocalStream(out);
        setMicError(null);
      } catch {
        if (!cancelled) {
          setMicError("Mic unavailable — check permissions or device.");
        }
      }
    }
    void switchInput();
    return () => {
      cancelled = true;
    };
  }, [connection, devices.inputDeviceId]);

  useEffect(() => {
    if (!connection) return;
    meshRef.current?.setOutputDeviceId(devices.outputDeviceId);
  }, [devices.outputDeviceId, connection]);

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
      // Immediate feedback — mesh/mic setup can take hundreds of ms.
      playSound("voice-join");
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
      // Skip join sounds for peers already in the call when we connect.
      let peersLive = false;
      const mesh = new VoiceMesh({
        supabase,
        channelId: args.conversationId,
        userId: user.id,
        topicPrefix: "call-rtc",
        onPeerJoined: () => {
          if (peersLive) playSound("voice-user-join");
        },
        onPeerLeft: () => {
          if (peersLive) playSound("voice-user-leave");
        },
        onRemoteVideo: (peerId, remoteStream, kind) => {
          setRemoteMedia((prev) => {
            const current = prev[peerId] ?? { camera: null, screen: null };
            const next = { ...current };
            if (kind === "screen") next.screen = remoteStream;
            else if (kind === "camera") next.camera = remoteStream;
            else if (remoteStream) {
              if (!current.camera) next.camera = remoteStream;
              else next.screen = remoteStream;
            } else if (current.screen && !current.camera) {
              next.screen = null;
            } else {
              next.camera = null;
            }
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
      peersLive = true;
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
      const invitePayload: CtrlPayload = {
        kind: "invite",
        from: user.id,
        fromUsername: profile?.username ?? "Someone",
        conversationId: args.conversationId,
        withVideo,
        label: profile?.username ?? "Someone",
      };
      const sendInvite = () => {
        void broadcastCtrl(args.conversationId, invitePayload);
        void broadcastInbox(peerUserId, invitePayload);
      };
      sendInvite();
      // Background tabs often drop the first broadcast — keep pinging while ringing.
      if (inviteResendRef.current != null) clearInterval(inviteResendRef.current);
      inviteResendRef.current = setInterval(() => {
        if (outgoingRef.current?.conversationId !== args.conversationId) {
          if (inviteResendRef.current != null) {
            clearInterval(inviteResendRef.current);
            inviteResendRef.current = null;
          }
          return;
        }
        sendInvite();
      }, 2500);
      ringTimerRef.current = setTimeout(() => {
        void (async () => {
          const stillOutgoing =
            outgoingRef.current?.conversationId === args.conversationId;
          if (!stillOutgoing) return;
          const callerName = profile?.username ?? "Someone";
          const peerName =
            args.peerNames?.[peerUserId] ?? args.label ?? "Someone";
          await supabase.from("dm_messages").insert({
            conversation_id: args.conversationId,
            user_id: user.id,
            content: encodeMissedCallMessage({
              withVideo,
              callerName,
              peerName,
              durationSec: Math.round(RING_TIMEOUT_MS / 1000),
            }),
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
      const cancelPayload: CtrlPayload = {
        kind: "cancel",
        from: user.id,
        conversationId: ring.conversationId,
      };
      void broadcastCtrl(ring.conversationId, cancelPayload);
      void broadcastInbox(ring.peerUserId, cancelPayload);
    }
    setOutgoing(null);
    await leaveCall();
  }, [clearRingTimer, leaveCall, user]);

  const acceptCall = useCallback(async () => {
    const invite = incoming;
    if (!invite || !user) return;
    stopIncomingAlerts();
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
  }, [clearRingTimer, incoming, joinMesh, stopIncomingAlerts, user]);

  const declineCall = useCallback(() => {
    const invite = incoming;
    stopIncomingAlerts();
    if (!invite || !user) {
      setIncoming(null);
      return;
    }
    const declinePayload: CtrlPayload = {
      kind: "decline",
      from: user.id,
      conversationId: invite.conversationId,
    };
    void broadcastCtrl(invite.conversationId, declinePayload);
    void broadcastInbox(invite.fromUserId, declinePayload);
    setIncoming(null);
  }, [incoming, stopIncomingAlerts, user]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      meshRef.current?.setMuted(next);
      const track = streamRef.current?.getAudioTracks()[0];
      if (track) track.enabled = !next;
      playSound(next ? "mute" : "unmute");
      return next;
    });
  }, []);

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => {
      const next = !prev;
      meshRef.current?.setDeafened(next);
      playSound(next ? "deafen" : "undeafen");
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
      const ok = await meshRef.current.setLocalVideoTrack(track);
      if (!ok) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
        setMicError("Camera failed to start.");
        return;
      }
      cameraTrackRef.current = track;
      setCameraOn(true);
      setLocalVideoStream(new MediaStream([track]));
      track.addEventListener(
        "ended",
        () => {
          void (async () => {
            await meshRef.current?.setLocalVideoTrack(null);
            if (cameraTrackRef.current === track) {
              cameraTrackRef.current = null;
            }
            setCameraOn(false);
            setLocalVideoStream(null);
            await persistMediaFlags(false, !!screenTrackRef.current);
          })();
        },
        { once: true },
      );
      await persistMediaFlags(true, screenSharing);
    } catch {
      setMicError("Camera permission denied.");
    }
  }, [persistMediaFlags, screenSharing]);

  const toggleScreenShare = useCallback(async () => {
    if (!meshRef.current) return;
    if (screenTrackRef.current) {
      playSound("screenshare-stop");
      await meshRef.current.setLocalScreenTrack(null);
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
      setScreenSharing(false);
      setLocalScreenStream(null);
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
      const ok = await meshRef.current.setLocalScreenTrack(track);
      if (!ok) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
        setMicError("Screen share failed to start.");
        return;
      }
      screenTrackRef.current = track;
      setScreenSharing(true);
      setLocalScreenStream(new MediaStream([track]));
      playSound("screenshare-start");
      track.addEventListener(
        "ended",
        () => {
          void (async () => {
            playSound("screenshare-stop");
            await meshRef.current?.setLocalScreenTrack(null);
            screenTrackRef.current = null;
            setScreenSharing(false);
            setLocalScreenStream(null);
            await persistMediaFlags(!!cameraTrackRef.current, false);
          })();
        },
        { once: true },
      );
      await persistMediaFlags(cameraOn, true);
    } catch {
      // Picker cancelled — nothing announced to peers.
      setMicError(null);
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

  const handleCtrlMessage = useCallback(
    (msg: CtrlPayload) => {
      if (!user || !msg || msg.from === user.id) return;

      if (msg.kind === "invite") {
        if (connectionRef.current) return;
        setIncoming((prev) => {
          if (prev?.conversationId === msg.conversationId) return prev;
          return {
            conversationId: msg.conversationId,
            fromUserId: msg.from,
            fromUsername: msg.fromUsername,
            withVideo: msg.withVideo,
            label: msg.label,
          };
        });
        return;
      }

      if (msg.kind === "decline") {
        if (outgoingRef.current?.conversationId === msg.conversationId) {
          clearRingTimer();
          setOutgoing(null);
          void leaveCall();
        }
        return;
      }

      if (msg.kind === "cancel" || msg.kind === "end") {
        setIncoming((prev) =>
          prev?.conversationId === msg.conversationId ? null : prev,
        );
        if (
          msg.kind === "end" &&
          connectionRef.current?.conversationId === msg.conversationId
        ) {
          void leaveCall();
        }
        return;
      }

      if (msg.kind === "joined") {
        clearRingTimer();
        setOutgoing(null);
        setConnection((prev) =>
          prev && prev.conversationId === msg.conversationId
            ? {
                ...prev,
                participantIds: [
                  ...new Set([...prev.participantIds, msg.from]),
                ],
                peerUserIds: [
                  ...new Set([...prev.peerUserIds, msg.from]),
                ].filter((id) => id !== user?.id),
              }
            : prev,
        );
        // Late joiners already send mesh hello; also ensure from our side.
        void meshRef.current?.connectPeer(msg.from);
      }
    },
    [clearRingTimer, leaveCall, user],
  );

  useEffect(() => {
    if (!incoming || connection) {
      stopIncomingAlerts();
      return;
    }
    startIncomingAlerts(incoming.fromUsername);
    return () => {
      stopIncomingAlerts();
    };
  }, [incoming, connection, startIncomingAlerts, stopIncomingAlerts]);

  /**
   * Background tabs often miss ephemeral invite broadcasts. When the user
   * returns, discover any still-ringing 1:1 call from the DB and show the modal.
   */
  const recoverMissedInvites = useCallback(async () => {
    if (!user) return;
    if (connectionRef.current || outgoingRef.current) return;
    if (incomingRef.current) {
      // Already have an invite — restart sound/title (blocked while hidden).
      startIncomingAlerts(incomingRef.current.fromUsername);
      return;
    }

    const supabase = createClient();
    const { data: mine } = await supabase
      .from("dm_participants")
      .select("conversation_id")
      .eq("user_id", user.id);
    const ids = [...new Set((mine ?? []).map((row) => row.conversation_id))];
    if (ids.length === 0) return;

    const { data: sessions } = await supabase
      .from("dm_call_sessions")
      .select("conversation_id, with_video, started_by, created_at, updated_at")
      .in("conversation_id", ids)
      .neq("started_by", user.id);
    if (!sessions?.length) return;

    const cutoff = Date.now() - (RING_TIMEOUT_MS + 8_000);
    for (const session of sessions) {
      const stamped = Date.parse(session.updated_at || session.created_at);
      if (!Number.isNaN(stamped) && stamped < cutoff) continue;

      const { data: parts } = await supabase
        .from("dm_call_participants")
        .select("user_id")
        .eq("conversation_id", session.conversation_id);
      const participants = parts ?? [];
      if (participants.some((row) => row.user_id === user.id)) continue;
      // 1:1 ring: only the caller is in the call so far.
      if (participants.length !== 1) continue;
      if (participants[0]?.user_id !== session.started_by) continue;

      const { data: caller } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", session.started_by)
        .maybeSingle();
      const name = caller?.username?.trim() || "Someone";
      setIncoming({
        conversationId: session.conversation_id,
        fromUserId: session.started_by,
        fromUsername: name,
        withVideo: !!session.with_video,
        label: name,
      });
      return;
    }
  }, [startIncomingAlerts, user]);

  useEffect(() => {
    if (!user) return;

    function onReturnToTab() {
      if (document.visibilityState === "hidden") return;
      void recoverMissedInvites();
    }

    document.addEventListener("visibilitychange", onReturnToTab);
    window.addEventListener("focus", onReturnToTab);
    // Catch invites that started before this client finished subscribing.
    // Deferred so channel bootstrap isn't fighting dm_call_* queries.
    const boot = window.setTimeout(() => {
      void recoverMissedInvites();
    }, 2_000);

    return () => {
      window.clearTimeout(boot);
      document.removeEventListener("visibilitychange", onReturnToTab);
      window.removeEventListener("focus", onReturnToTab);
    };
  }, [recoverMissedInvites, user]);

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
        handleCtrlMessage(msg);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [handleCtrlMessage, user, watchId]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`call-inbox:${user.id}`, {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "ctrl" }, ({ payload }) => {
        handleCtrlMessage(payload as CtrlPayload);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [handleCtrlMessage, user]);

  // leaveCall identity changes often — keep stable refs for listeners/teardown.
  const leaveCallRef = useRef(leaveCall);
  leaveCallRef.current = leaveCall;
  const clearRingTimerRef = useRef(clearRingTimer);
  clearRingTimerRef.current = clearRingTimer;

  useEffect(() => {
    function onLeaveForVoice() {
      void leaveCallRef.current();
    }
    window.addEventListener("redsss-leave-dm-call", onLeaveForVoice);
    return () => {
      window.removeEventListener("redsss-leave-dm-call", onLeaveForVoice);
    };
  }, []);

  // Leaving messenger drops DM/group calls (same rule as server voice).
  // Without this, AppShell keeps CallSessionProvider mounted and audio can
  // keep playing with no overlay / disconnect chrome.
  useEffect(() => {
    if (pathname.startsWith("/messenger")) return;
    if (
      !connectionRef.current &&
      !outgoingRef.current &&
      !incomingRef.current
    ) {
      return;
    }
    void leaveCallRef.current();
  }, [pathname]);

  // Unmount-only teardown. Deps on leaveCall re-ran cleanup and hung up live calls.
  useEffect(() => {
    return () => {
      clearRingTimerRef.current();
      void leaveCallRef.current();
    };
  }, []);

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
      localScreenStream,
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
      localScreenStream,
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
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-[var(--ms-border)] bg-[var(--ms-chat)] p-6 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-4 flex h-16 w-16 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-[var(--ms-connected)]/30" />
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ms-connected)] text-white">
                  {incoming.withVideo ? (
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
                      <path d="M17 10.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5l4 4v-11l-4 4z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
                      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z" />
                    </svg>
                  )}
                </span>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                Incoming call
              </p>
              <p className="mt-2 text-xl font-semibold text-white">
                {incoming.fromUsername}
              </p>
            </div>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={declineCall}
                className="min-w-[7rem] rounded-md bg-[#ed4245] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c03537]"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => void acceptCall()}
                className="min-w-[7rem] rounded-md bg-[var(--ms-connected)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
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
