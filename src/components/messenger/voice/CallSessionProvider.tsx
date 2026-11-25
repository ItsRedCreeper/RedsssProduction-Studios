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
import type { VoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";

export type CallConnection = {
  conversationId: string;
  label: string;
  withVideo: boolean;
};

type IncomingCall = {
  conversationId: string;
  fromUserId: string;
  fromUsername: string;
  withVideo: boolean;
};

type CallSessionContextValue = {
  connection: CallConnection | null;
  incoming: IncomingCall | null;
  muted: boolean;
  deafened: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  quality: VoiceConnectionQuality;
  localVideoStream: MediaStream | null;
  remoteVideos: Record<string, MediaStream>;
  micError: string | null;
  micLevel: number;
  watchConversation: (conversationId: string | null) => void;
  startCall: (args: {
    conversationId: string;
    label: string;
    peerUserIds: string[];
    withVideo?: boolean;
  }) => Promise<void>;
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
    }
  | { kind: "decline"; from: string; conversationId: string }
  | { kind: "end"; from: string; conversationId: string };

async function broadcastCtrl(
  conversationId: string,
  payload: CtrlPayload,
) {
  const supabase = createClient();
  const channel = supabase.channel(`call-ctrl-pub:${conversationId}:${crypto.randomUUID()}`);
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });
  await channel.send({
    type: "broadcast",
    event: "ctrl",
    payload,
  });
  void supabase.removeChannel(channel);
}

export function CallSessionProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useCurrentProfile();
  const devices = useAudioDevices();
  const [connection, setConnection] = useState<CallConnection | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [micLevel] = useState(0);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(
    null,
  );
  const [remoteVideos, setRemoteVideos] = useState<
    Record<string, MediaStream>
  >({});
  const [watchId, setWatchId] = useState<string | null>(null);

  const meshRef = useRef<VoiceMesh | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const connectionRef = useRef(connection);
  const mutedRef = useRef(muted);
  const userIdRef = useRef(user?.id ?? null);

  connectionRef.current = connection;
  mutedRef.current = muted;
  userIdRef.current = user?.id ?? null;

  const quality = useVoiceConnectionQuality(!!connection);

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
    setRemoteVideos({});
  }, []);

  const leaveCall = useCallback(async () => {
    const conn = connectionRef.current;
    const uid = userIdRef.current;
    if (conn && uid) {
      void broadcastCtrl(conn.conversationId, {
        kind: "end",
        from: uid,
        conversationId: conn.conversationId,
      });
    }
    if (meshRef.current) {
      await meshRef.current.stop();
      meshRef.current = null;
    }
    cleanupMedia();
    setConnection(null);
    setMuted(false);
    setDeafened(false);
    setMicError(null);
  }, [cleanupMedia]);

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

  const joinMesh = useCallback(
    async (args: {
      conversationId: string;
      label: string;
      withVideo: boolean;
      peerUserIds: string[];
    }) => {
      if (!user) return;
      if (meshRef.current) {
        await meshRef.current.stop();
        meshRef.current = null;
      }
      cleanupMedia();
      const stream = await startMedia(args.withVideo);
      const supabase = createClient();
      const mesh = new VoiceMesh({
        supabase,
        channelId: args.conversationId,
        userId: user.id,
        topicPrefix: "call-rtc",
        onRemoteVideo: (peerId, remoteStream) => {
          setRemoteVideos((prev) => {
            const next = { ...prev };
            if (!remoteStream) delete next[peerId];
            else next[peerId] = remoteStream;
            return next;
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
      setConnection({
        conversationId: args.conversationId,
        label: args.label,
        withVideo: args.withVideo,
      });
    },
    [cleanupMedia, startMedia, user],
  );

  const startCall = useCallback(
    async (args: {
      conversationId: string;
      label: string;
      peerUserIds: string[];
      withVideo?: boolean;
    }) => {
      if (!user) return;
      const withVideo = !!args.withVideo;
      await joinMesh({
        conversationId: args.conversationId,
        label: args.label,
        withVideo,
        peerUserIds: args.peerUserIds,
      });
      void broadcastCtrl(args.conversationId, {
        kind: "invite",
        from: user.id,
        fromUsername: profile?.username ?? "Someone",
        conversationId: args.conversationId,
        withVideo,
      });
    },
    [joinMesh, profile?.username, user],
  );

  const acceptCall = useCallback(async () => {
    const invite = incoming;
    if (!invite || !user) return;
    setIncoming(null);
    await joinMesh({
      conversationId: invite.conversationId,
      label: invite.fromUsername,
      withVideo: invite.withVideo,
      peerUserIds: [invite.fromUserId],
    });
  }, [incoming, joinMesh, user]);

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

  const toggleCamera = useCallback(async () => {
    if (!meshRef.current) return;
    if (cameraTrackRef.current) {
      await meshRef.current.setLocalVideoTrack(null);
      cameraTrackRef.current.stop();
      cameraTrackRef.current = null;
      setCameraOn(false);
      setLocalVideoStream(null);
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
    } catch {
      setMicError("Camera permission denied.");
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (!meshRef.current) return;
    if (screenTrackRef.current) {
      await meshRef.current.setLocalScreenTrack(null);
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
      setScreenSharing(false);
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
          })();
        },
        { once: true },
      );
      await meshRef.current.setLocalScreenTrack(track);
    } catch {
      setMicError("Screen share cancelled or blocked.");
    }
  }, []);

  const watchConversation = useCallback((conversationId: string | null) => {
    setWatchId(conversationId);
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
          });
        }
        if (msg.kind === "decline" && msg.from !== user.id) {
          setIncoming(null);
        }
        if (msg.kind === "end" && msg.from !== user.id) {
          setIncoming(null);
          if (connectionRef.current?.conversationId === watchId) {
            void leaveCall();
          }
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [leaveCall, user, watchId]);

  useEffect(() => {
    return () => {
      void leaveCall();
    };
  }, [leaveCall]);

  const value = useMemo<CallSessionContextValue>(
    () => ({
      connection,
      incoming,
      muted,
      deafened,
      cameraOn,
      screenSharing,
      quality,
      localVideoStream,
      remoteVideos,
      micError,
      micLevel,
      watchConversation,
      startCall,
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
      muted,
      deafened,
      cameraOn,
      screenSharing,
      quality,
      localVideoStream,
      remoteVideos,
      micError,
      micLevel,
      watchConversation,
      startCall,
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
          <div className="w-full max-w-sm rounded-md border border-[#1e1f22] bg-[#313338] p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#949ba4]">
              Incoming {incoming.withVideo ? "video" : "voice"} call
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {incoming.fromUsername}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={declineCall}
                className="rounded-md px-3 py-2 text-sm text-[#dbdee1] hover:bg-white/5"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => void acceptCall()}
                className="rounded-md bg-[#23a559] px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
              >
                Accept
              </button>
            </div>
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
