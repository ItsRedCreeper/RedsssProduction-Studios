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
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { useVoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";
import { loadAreUsersBlocked } from "@/lib/blocking";
import { saveVoiceState } from "@/components/messenger/data";
import { VoiceMesh } from "@/components/messenger/voice/webrtcMesh";
import type { VoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";
import type { VoiceState } from "@/components/messenger/types";
import { playSound } from "@/lib/ui-sounds";

export type VoiceConnection = {
  channelId: string;
  serverId: string;
  channelName: string;
  serverName: string;
};

export type VoiceRemoteMedia = {
  camera: MediaStream | null;
  screen: MediaStream | null;
};

type JoinVoiceArgs = {
  channelId: string;
  serverId: string;
  channelName: string;
  serverName: string;
};

type VoiceSessionContextValue = {
  connection: VoiceConnection | null;
  muted: boolean;
  deafened: boolean;
  quality: VoiceConnectionQuality;
  speakingUserIds: ReadonlySet<string>;
  selfSpeaking: boolean;
  /** 0–1 input level for the local mic meter */
  micLevel: number;
  micError: string | null;
  isSpeaking: (userId: string) => boolean;
  inputDeviceId: string;
  outputDeviceId: string;
  inputVolume: number;
  outputVolume: number;
  inputs: { deviceId: string; label: string }[];
  outputs: { deviceId: string; label: string }[];
  joinVoice: (args: JoinVoiceArgs) => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  cameraOn: boolean;
  screenSharing: boolean;
  localVideoStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteMedia: Record<string, VoiceRemoteMedia>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  setInputDeviceId: (deviceId: string) => void;
  setOutputDeviceId: (deviceId: string) => void;
  setInputVolume: (value: number) => void;
  setOutputVolume: (value: number) => void;
  refreshDevices: () => void;
  shouldSkipAutoJoin: (channelId: string) => boolean;
  clearSkipAutoJoin: (channelId?: string) => void;
};

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null);

const SPEAKING_THRESHOLD = 0.04;
const SPEAKING_HANG_MS = 350;
const VOICE_SKIP_KEY = "redsss-voice-skip-channels";
/** Keep presence alive while connected; stop heartbeats → grace kick. */
const VOICE_HEARTBEAT_MS = 15_000;
/** Discord-like grace: drop after ~1 min without a heartbeat (tab close / crash). */
export const VOICE_STALE_AFTER_MS = 60_000;
const VOICE_STALE_INTERVAL = "60 seconds";
const VOICE_CLEANUP_POLL_MS = 20_000;

/**
 * Accidental unmount (refresh / Strict Mode) must NOT wipe voice_states immediately.
 * Heartbeats stop on close; cleanup_stale_voice_states removes the row after VOICE_STALE_AFTER_MS.
 * Intentional leaveVoice() still deletes right away.
 */
let pendingLeaveTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingLeave() {
  if (pendingLeaveTimer != null) {
    clearTimeout(pendingLeaveTimer);
    pendingLeaveTimer = null;
  }
}

function readSkipChannels(): Set<string> {
  try {
    const raw = sessionStorage.getItem(VOICE_SKIP_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function writeSkipChannels(channels: Set<string>) {
  try {
    sessionStorage.setItem(VOICE_SKIP_KEY, JSON.stringify([...channels]));
  } catch {
    /* ignore */
  }
}

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useCurrentProfile();
  const { blockedIds } = useBlockedUsers();
  const devices = useAudioDevices();

  const [connection, setConnection] = useState<VoiceConnection | null>(null);
  /** Peers who blocked us (incoming); outgoing blocks come from blockedIds. */
  const [inboundBlockedIds, setInboundBlockedIds] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [muteLinked, setMuteLinked] = useState(false);
  const [speakingUserIds, setSpeakingUserIds] = useState<Set<string>>(() => new Set());
  const [selfSpeaking, setSelfSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localVideoStream, setLocalVideoStream] =
    useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] =
    useState<MediaStream | null>(null);
  const [remoteMedia, setRemoteMedia] = useState<
    Record<string, VoiceRemoteMedia>
  >({});
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);

  const voiceOpRef = useRef(0);
  const muteOpRef = useRef(0);
  // Always empty on first paint (SSR-safe); syncSkipFromStorage fills from sessionStorage on client.
  const skipAutoJoinRef = useRef<Set<string>>(new Set());
  const connectionRef = useRef<VoiceConnection | null>(null);
  const mutedRef = useRef(muted);
  const deafenedRef = useRef(deafened);
  const muteLinkedRef = useRef(muteLinked);
  const userIdRef = useRef<string | null>(user?.id ?? null);

  const streamRef = useRef<MediaStream | null>(null);
  /** Raw getUserMedia capture — never sent to peers; feeds the gain graph. */
  const rawStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  /** Scales outbound mic before WebRTC; driven by input volume slider. */
  const inputGainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const speakingLocalRef = useRef(false);
  const speakingUntilRef = useRef(0);
  const levelFrameRef = useRef(0);
  const broadcastRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(
    null,
  );
  const meshRef = useRef<VoiceMesh | null>(null);
  const blockedIdsRef = useRef(blockedIds);
  const inboundBlockedRef = useRef(inboundBlockedIds);
  const inputDeviceRef = useRef(devices.inputDeviceId);
  const inputVolumeRef = useRef(devices.inputVolume);
  const outputDeviceRef = useRef(devices.outputDeviceId);
  const outputVolumeRef = useRef(devices.outputVolume);
  const inputsRef = useRef(devices.inputs);
  const setInputDeviceIdRef = useRef(devices.setInputDeviceId);
  const refreshDevicesRef = useRef(devices.refresh);
  const monitorGenRef = useRef(0);
  const silenceHandledRef = useRef(false);

  connectionRef.current = connection;
  mutedRef.current = muted;
  deafenedRef.current = deafened;
  muteLinkedRef.current = muteLinked;
  blockedIdsRef.current = blockedIds;
  inboundBlockedRef.current = inboundBlockedIds;

  const audioBlockedPeerIds = useMemo(() => {
    const ids = new Set(blockedIds);
    for (const id of inboundBlockedIds) ids.add(id);
    return ids;
  }, [blockedIds, inboundBlockedIds]);

  const syncBlockedAudio = useCallback((peerIds: string[] = []) => {
    const mesh = meshRef.current;
    const combined = new Set(blockedIdsRef.current);
    for (const id of inboundBlockedRef.current) combined.add(id);
    for (const id of peerIds) combined.add(id);
    mesh?.setBlockedPeerIds(combined);
  }, []);

  const checkPeerBlock = useCallback(
    async (peerId: string) => {
      if (!peerId || peerId === userIdRef.current) return;
      if (blockedIdsRef.current.includes(peerId)) {
        syncBlockedAudio();
        return;
      }
      const { blocked } = await loadAreUsersBlocked(peerId);
      if (!blocked) return;
      setInboundBlockedIds((prev) => {
        if (prev.includes(peerId)) return prev;
        return [...prev, peerId];
      });
    },
    [syncBlockedAudio],
  );
  userIdRef.current = user?.id ?? null;
  inputDeviceRef.current = devices.inputDeviceId;
  inputVolumeRef.current = devices.inputVolume;
  outputDeviceRef.current = devices.outputDeviceId;
  outputVolumeRef.current = devices.outputVolume;
  inputsRef.current = devices.inputs;
  setInputDeviceIdRef.current = devices.setInputDeviceId;
  refreshDevicesRef.current = devices.refresh;

  const quality = useVoiceConnectionQuality(!!connection);

  const clearLocalSpeakingState = useCallback(() => {
    speakingLocalRef.current = false;
    speakingUntilRef.current = 0;
    setSelfSpeaking(false);
    setMicLevel(0);
    const userId = userIdRef.current;
    if (!userId) return;
    setSpeakingUserIds((prev) => {
      if (!prev.has(userId)) return prev;
      const next = new Set(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  const stopMicMonitor = useCallback(
    (opts?: { bump?: boolean; keepStream?: boolean }) => {
      if (opts?.bump !== false) monitorGenRef.current += 1;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      analyserRef.current = null;
      silentGainRef.current = null;
      inputGainRef.current = null;
      if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch(() => undefined);
        audioCtxRef.current = null;
      }
      if (!opts?.keepStream) {
        if (rawStreamRef.current) {
          for (const track of rawStreamRef.current.getTracks()) track.stop();
          rawStreamRef.current = null;
        }
        if (streamRef.current) {
          for (const track of streamRef.current.getTracks()) track.stop();
          streamRef.current = null;
          void meshRef.current?.setLocalStream(null);
        }
      }
      clearLocalSpeakingState();
    },
    [clearLocalSpeakingState],
  );

  const stopMesh = useCallback(async () => {
    const mesh = meshRef.current;
    meshRef.current = null;
    if (mesh) await mesh.stop();
    setRemoteMedia({});
  }, []);

  const applyRemoteVideo = useCallback(
    (
      peerId: string,
      remoteStream: MediaStream | null,
      kind: "camera" | "screen" | "unknown",
    ) => {
      setRemoteMedia((prev) => {
        const current = prev[peerId] ?? { camera: null, screen: null };
        const next = { ...current };
        if (kind === "screen") next.screen = remoteStream;
        else if (kind === "camera") next.camera = remoteStream;
        else if (remoteStream) {
          if (!current.camera) next.camera = remoteStream;
          else next.screen = remoteStream;
        } else if (!current.camera) {
          next.screen = null;
        } else {
          next.camera = null;
        }
        // Avoid redundant updates that skip remounting <video> on restart.
        if (
          next.camera === current.camera &&
          next.screen === current.screen &&
          prev[peerId]
        ) {
          return prev;
        }
        if (!next.camera && !next.screen) {
          if (!prev[peerId]) return prev;
          const copy = { ...prev };
          delete copy[peerId];
          return copy;
        }
        return { ...prev, [peerId]: next };
      });
    },
    [],
  );

  const startMesh = useCallback(
    async (channelId: string) => {
      const userId = userIdRef.current;
      if (!userId) return;
      await stopMesh();
      // Ignore join/leave sounds for peers already present when we connect.
      let peersLive = false;
      const supabase = createClient();
      const { data: peers } = await supabase
        .from("voice_states")
        .select("user_id")
        .eq("channel_id", channelId)
        .neq("user_id", userId);
      const peerIds = (peers ?? []).map((row) => row.user_id);
      const mesh = new VoiceMesh({
        supabase,
        channelId,
        userId,
        onSpeaking: (peerId, speaking) => {
          setSpeakingUserIds((prev) => {
            const has = prev.has(peerId);
            if (speaking === has) return prev;
            const next = new Set(prev);
            if (speaking) next.add(peerId);
            else next.delete(peerId);
            return next;
          });
        },
        onPeerJoined: (peerId) => {
          void checkPeerBlock(peerId);
          if (peersLive) playSound("voice-user-join");
        },
        onPeerLeft: () => {
          if (peersLive) playSound("voice-user-leave");
        },
        onRemoteVideo: applyRemoteVideo,
        onError: (message) => setMicError(message),
      });
      mesh.setMuted(mutedRef.current);
      mesh.setDeafened(deafenedRef.current);
      mesh.setOutputDeviceId(outputDeviceRef.current);
      mesh.setOutputVolume(outputVolumeRef.current);
      mesh.setBlockedPeerIds(
        new Set([...blockedIdsRef.current, ...inboundBlockedRef.current]),
      );
      meshRef.current = mesh;
      await mesh.start(peerIds);
      peersLive = true;
      if (streamRef.current) await mesh.setLocalStream(streamRef.current);
      if (cameraTrackRef.current) {
        await mesh.setLocalVideoTrack(cameraTrackRef.current);
      }
      if (screenTrackRef.current) {
        await mesh.setLocalScreenTrack(screenTrackRef.current);
      }
      for (const peerId of peerIds) {
        void checkPeerBlock(peerId);
      }
    },
    [stopMesh, checkPeerBlock, applyRemoteVideo],
  );

  const publishSpeaking = useCallback((speaking: boolean) => {
    const channel = broadcastRef.current;
    const userId = userIdRef.current;
    if (!channel || !userId) return;
    void channel.send({
      type: "broadcast",
      event: "speaking",
      payload: { userId, speaking },
    });
  }, []);

  const setLocalSpeaking = useCallback(
    (speaking: boolean) => {
      if (speakingLocalRef.current === speaking) return;
      speakingLocalRef.current = speaking;
      setSelfSpeaking(speaking);
      const userId = userIdRef.current;
      if (!userId) return;
      setSpeakingUserIds((prev) => {
        const has = prev.has(userId);
        if (speaking === has) return prev;
        const next = new Set(prev);
        if (speaking) next.add(userId);
        else next.delete(userId);
        return next;
      });
      publishSpeaking(speaking);
    },
    [publishSpeaking],
  );

  const startMicMonitor = useCallback(async () => {
    const gen = ++monitorGenRef.current;
    stopMicMonitor({ bump: false });
    silenceHandledRef.current = false;
    // Always capture while connected so WebRTC senders stay attached; mute uses track.enabled.
    if (!connectionRef.current) return;
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setMicError("Mic needs https or localhost.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicError("Mic API unavailable in this browser.");
      return;
    }

    try {
      setMicError(null);
      const deviceId = inputDeviceRef.current;

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false,
        });
      } catch {
        // Some browsers reject exact:default — fall back to ideal.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { ideal: deviceId } } : true,
          video: false,
        });
      }
      if (gen !== monitorGenRef.current || !connectionRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      rawStreamRef.current = stream;
      const captureTrack = stream.getAudioTracks()[0];
      const trackLabel = captureTrack?.label ?? "microphone";
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        for (const track of stream.getTracks()) track.stop();
        rawStreamRef.current = null;
        setMicError("Web Audio is unavailable.");
        return;
      }
      const ctx = new AudioContextCtor();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => undefined);
      }
      if (gen !== monitorGenRef.current) {
        void ctx.close().catch(() => undefined);
        for (const track of stream.getTracks()) track.stop();
        rawStreamRef.current = null;
        return;
      }
      const source = ctx.createMediaStreamSource(stream);
      // Gain scales what peers hear; slider previously only affected the local meter.
      const inputGain = ctx.createGain();
      inputGain.gain.value = inputVolumeRef.current;
      inputGainRef.current = inputGain;
      const outboundDest = ctx.createMediaStreamDestination();
      source.connect(inputGain);
      inputGain.connect(outboundDest);
      const outboundStream = outboundDest.stream;
      streamRef.current = outboundStream;
      const outbound = outboundStream.getAudioTracks()[0];
      if (outbound) outbound.enabled = !mutedRef.current;
      void meshRef.current?.setLocalStream(outboundStream);
      // ScriptProcessor reads real PCM samples — more reliable than AnalyserNode alone.
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      const silent = ctx.createGain();
      silent.gain.value = 0;
      source.connect(processor);
      processor.connect(silent);
      silent.connect(ctx.destination);
      silentGainRef.current = silent;
      levelFrameRef.current = 0;
      let heardSignal = false;
      const startedAt = performance.now();

      processor.onaudioprocess = (event) => {
        if (gen !== monitorGenRef.current || !connectionRef.current) {
          return;
        }
        if (mutedRef.current) {
          setMicLevel(0);
          setLocalSpeaking(false);
          return;
        }
        if (ctx.state === "suspended") {
          void ctx.resume().catch(() => undefined);
        }
        const input = event.inputBuffer.getChannelData(0);
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < input.length; i += 1) {
          const value = input[i];
          sum += value * value;
          const abs = value < 0 ? -value : value;
          if (abs > peak) peak = abs;
        }
        const rms = Math.sqrt(sum / input.length);
        const raw = Math.min(1, Math.max(rms * 4, peak));
        const level = Math.min(1, raw * inputVolumeRef.current);
        levelFrameRef.current += 1;
        if (levelFrameRef.current % 2 === 0) setMicLevel(level);
        // Volume 0 should never light speaking.
        const speakingGate = SPEAKING_THRESHOLD * Math.max(0.15, inputVolumeRef.current);
        if (inputVolumeRef.current > 0.02 && level > speakingGate) {
          if (!heardSignal) {
            heardSignal = true;
            setMicError(null);
          }
          speakingUntilRef.current = performance.now() + SPEAKING_HANG_MS;
          setLocalSpeaking(true);
        } else if (performance.now() > speakingUntilRef.current) {
          setLocalSpeaking(false);
        }
        if (
          !heardSignal &&
          !silenceHandledRef.current &&
          performance.now() - startedAt > 1800
        ) {
          silenceHandledRef.current = true;
          setMicError(
            `No signal from “${trackLabel}”. Open input settings and pick another device.`,
          );
        }
      };

      analyserRef.current = null;
      void refreshDevicesRef.current();
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Mic permission denied — allow microphone access."
          : error instanceof Error
            ? error.message
            : "Mic monitor failed.";
      setMicError(message);
      console.warn("[voice] Mic monitor failed:", error);
    }
  }, [setLocalSpeaking, stopMicMonitor]);

  const detachBroadcast = useCallback(() => {
    const channel = broadcastRef.current;
    broadcastRef.current = null;
    if (!channel) return;
    const supabase = createClient();
    void supabase.removeChannel(channel);
  }, []);

  const attachBroadcast = useCallback(
    (channelId: string) => {
      detachBroadcast();
      setSpeakingUserIds(new Set());
      const supabase = createClient();
      const channel = supabase
        .channel(`voice-speaking:${channelId}`)
        .on("broadcast", { event: "speaking" }, ({ payload }) => {
          const userId = (payload as { userId?: string })?.userId;
          const speaking = Boolean((payload as { speaking?: boolean })?.speaking);
          if (!userId || userId === userIdRef.current) return;
          setSpeakingUserIds((prev) => {
            const has = prev.has(userId);
            if (speaking === has) return prev;
            const next = new Set(prev);
            if (speaking) next.add(userId);
            else next.delete(userId);
            return next;
          });
        })
        .subscribe();
      broadcastRef.current = channel;
    },
    [detachBroadcast],
  );

  const persistFlags = useCallback(
    async (nextMuted: boolean, nextDeafened: boolean) => {
      setMuted(nextMuted);
      setDeafened(nextDeafened);
      mutedRef.current = nextMuted;
      deafenedRef.current = nextDeafened;
      const muteOp = ++muteOpRef.current;
      const userId = userIdRef.current;
      // Mute/deafen must control real media, not just UI flags.
      meshRef.current?.setMuted(nextMuted);
      meshRef.current?.setDeafened(nextDeafened);
      const track = streamRef.current?.getAudioTracks()[0];
      if (track) track.enabled = !nextMuted;
      if (nextMuted) {
        setLocalSpeaking(false);
      } else if (connectionRef.current && !streamRef.current) {
        void startMicMonitor();
      }
      if (!userId || !connectionRef.current) return;
      const updatedAt = new Date().toISOString();
      const supabase = createClient();
      const { error } = await supabase
        .from("voice_states")
        .update({ muted: nextMuted, deafened: nextDeafened, updated_at: updatedAt })
        .eq("user_id", userId);
      if (muteOp !== muteOpRef.current) return;
      void error;
    },
    [setLocalSpeaking, startMicMonitor],
  );

  const persistMediaFlags = useCallback(
    async (camera: boolean, screen: boolean) => {
      const userId = userIdRef.current;
      if (!userId || !connectionRef.current) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("voice_states")
        .update({
          camera_on: camera,
          screen_on: screen,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      void error;
    },
    [],
  );

  const leaveVoice = useCallback(async () => {
    // Sound first — before any mesh/mic teardown work.
    if (connectionRef.current) playSound("voice-leave");
    const current = connectionRef.current;
    if (current) {
      // Merge with sessionStorage so an SSR-empty ref can't wipe prior skips.
      for (const id of readSkipChannels()) {
        skipAutoJoinRef.current.add(id);
      }
      skipAutoJoinRef.current.add(current.channelId);
      writeSkipChannels(skipAutoJoinRef.current);
    }
    voiceOpRef.current += 1;
    setMuteLinked(false);
    muteLinkedRef.current = false;
    setLocalSpeaking(false);
    cameraTrackRef.current?.stop();
    screenTrackRef.current?.stop();
    cameraTrackRef.current = null;
    screenTrackRef.current = null;
    setCameraOn(false);
    setScreenSharing(false);
    setLocalVideoStream(null);
    setLocalScreenStream(null);
    setRemoteMedia({});
    stopMicMonitor();
    await stopMesh();
    detachBroadcast();
    setSpeakingUserIds(new Set());
    setConnection(null);
    connectionRef.current = null;
    const userId = userIdRef.current;
    if (!userId) return;
    const supabase = createClient();
    const { error } = await supabase.from("voice_states").delete().eq("user_id", userId);
    void error;
  }, [detachBroadcast, setLocalSpeaking, stopMesh, stopMicMonitor]);

  const joinVoice = useCallback(
    async (args: JoinVoiceArgs) => {
      cancelPendingLeave();
      const userId = userIdRef.current;
      if (!userId) return;
      // Discord: leave DM/call session before joining server voice.
      window.dispatchEvent(new Event("redsss-leave-dm-call"));
      // Intentional joins clear the persisted leave skip for this channel.
      skipAutoJoinRef.current.delete(args.channelId);
      writeSkipChannels(skipAutoJoinRef.current);

      const already =
        connectionRef.current?.channelId === args.channelId &&
        connectionRef.current.serverId === args.serverId;
      if (already) {
        if (!mutedRef.current) void startMicMonitor();
        return;
      }

      const op = ++voiceOpRef.current;

      const next: VoiceConnection = {
        channelId: args.channelId,
        serverId: args.serverId,
        channelName: args.channelName,
        serverName: args.serverName,
      };
      setConnection(next);
      connectionRef.current = next;
      // Play immediately on click — don't wait for mesh / DB round-trips.
      playSound("voice-join");
      attachBroadcast(args.channelId);
      void startMesh(args.channelId);

      const row: VoiceState = {
        user_id: userId,
        channel_id: args.channelId,
        server_id: args.serverId,
        muted: mutedRef.current,
        deafened: deafenedRef.current,
        camera_on: !!cameraTrackRef.current,
        screen_on: !!screenTrackRef.current,
        updated_at: new Date().toISOString(),
      };

      if (op !== voiceOpRef.current) return;
      const voiceError = await saveVoiceState(row);
      if (op !== voiceOpRef.current || skipAutoJoinRef.current.has(args.channelId)) {
        const supabase = createClient();
        await supabase.from("voice_states").delete().eq("user_id", userId);
        stopMicMonitor();
        await stopMesh();
        detachBroadcast();
        setConnection(null);
        connectionRef.current = null;
        return;
      }
      void voiceError;
      void startMicMonitor();
    },
    [attachBroadcast, detachBroadcast, startMesh, startMicMonitor, stopMesh, stopMicMonitor],
  );

  const toggleMute = useCallback(() => {
    if (mutedRef.current) {
      setMuteLinked(false);
      muteLinkedRef.current = false;
      playSound("unmute");
      void persistFlags(false, false);
      return;
    }
    playSound("mute");
    void persistFlags(true, deafenedRef.current);
  }, [persistFlags]);

  const toggleCamera = useCallback(async () => {
    const mesh = meshRef.current;
    if (!mesh || !connectionRef.current) return;
    if (cameraTrackRef.current) {
      await mesh.setLocalVideoTrack(null);
      cameraTrackRef.current.stop();
      cameraTrackRef.current = null;
      setCameraOn(false);
      setLocalVideoStream(null);
      await persistMediaFlags(false, !!screenTrackRef.current);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      const ok = await mesh.setLocalVideoTrack(track);
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
      await persistMediaFlags(true, !!screenTrackRef.current);
    } catch {
      setMicError("Camera permission denied.");
    }
  }, [persistMediaFlags]);

  const toggleScreenShare = useCallback(async () => {
    const mesh = meshRef.current;
    if (!mesh || !connectionRef.current) return;
    if (screenTrackRef.current) {
      playSound("screenshare-stop");
      await mesh.setLocalScreenTrack(null);
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
      setScreenSharing(false);
      setLocalScreenStream(null);
      await persistMediaFlags(!!cameraTrackRef.current, false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      // Don't show local/remote tiles until capture is actually live.
      const ok = await mesh.setLocalScreenTrack(track);
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
      await persistMediaFlags(!!cameraTrackRef.current, true);
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
    } catch {
      // User cancelled the picker — remotes never saw a share tile.
      setMicError(null);
    }
  }, [persistMediaFlags]);

  const toggleDeafen = useCallback(() => {
    if (deafenedRef.current) {
      playSound("undeafen");
      if (muteLinkedRef.current) {
        setMuteLinked(false);
        muteLinkedRef.current = false;
        void persistFlags(false, false);
        return;
      }
      void persistFlags(mutedRef.current, false);
      return;
    }
    playSound("deafen");
    if (!mutedRef.current) {
      setMuteLinked(true);
      muteLinkedRef.current = true;
      void persistFlags(true, true);
      return;
    }
    setMuteLinked(false);
    muteLinkedRef.current = false;
    void persistFlags(true, true);
  }, [persistFlags]);

  const syncSkipFromStorage = useCallback(() => {
    for (const id of readSkipChannels()) {
      skipAutoJoinRef.current.add(id);
    }
  }, []);

  const shouldSkipAutoJoin = useCallback((channelId: string) => {
    syncSkipFromStorage();
    return skipAutoJoinRef.current.has(channelId);
  }, [syncSkipFromStorage]);

  const clearSkipAutoJoin = useCallback((channelId?: string) => {
    syncSkipFromStorage();
    if (channelId) skipAutoJoinRef.current.delete(channelId);
    else skipAutoJoinRef.current.clear();
    writeSkipChannels(skipAutoJoinRef.current);
  }, [syncSkipFromStorage]);

  // Restore connection from DB after remount — but never after an intentional leave.
  // Deferred so messenger servers/messages win the connection pool on first paint.
  useEffect(() => {
    // useRef(readSkipChannels()) can run during SSR with no sessionStorage; re-sync on client.
    syncSkipFromStorage();
    cancelPendingLeave();
    if (!user) return;
    let cancelled = false;
    const supabase = createClient();

    async function restore() {
      syncSkipFromStorage();
      const abort = new AbortController();
      const timer = window.setTimeout(() => abort.abort(), 5_000);
      let data: {
        channel_id: string;
        server_id: string;
        muted: boolean;
        deafened: boolean;
        updated_at: string;
      } | null = null;
      try {
        const result = await supabase
          .from("voice_states")
          .select("*")
          .eq("user_id", user!.id)
          .abortSignal(abort.signal)
          .maybeSingle();
        data = result.data;
      } catch {
        return;
      } finally {
        window.clearTimeout(timer);
      }
      if (cancelled || !data) return;
      if (connectionRef.current) return;

      // User disconnected on purpose — wipe any stale row and stay disconnected.
      if (skipAutoJoinRef.current.has(data.channel_id)) {
        await supabase.from("voice_states").delete().eq("user_id", user!.id);
        return;
      }

      // Timed out while away — don't rejoin a dead session.
      const ageMs = Date.now() - new Date(data.updated_at).getTime();
      if (Number.isFinite(ageMs) && ageMs > VOICE_STALE_AFTER_MS) {
        await supabase.from("voice_states").delete().eq("user_id", user!.id);
        return;
      }

      const [{ data: channel }, { data: server }] = await Promise.all([
        supabase.from("channels").select("id, name").eq("id", data.channel_id).maybeSingle(),
        supabase.from("servers").select("id, name").eq("id", data.server_id).maybeSingle(),
      ]);
      if (cancelled || !channel || !server) return;

      // Re-check skip after awaits — leave may have happened while we were fetching.
      syncSkipFromStorage();
      if (cancelled || skipAutoJoinRef.current.has(data.channel_id)) {
        await supabase.from("voice_states").delete().eq("user_id", user!.id);
        return;
      }

      setMuted(data.muted);
      setDeafened(data.deafened);
      mutedRef.current = data.muted;
      deafenedRef.current = data.deafened;
      const next: VoiceConnection = {
        channelId: data.channel_id,
        serverId: data.server_id,
        channelName: channel.name,
        serverName: server.name,
      };
      setConnection(next);
      connectionRef.current = next;
      attachBroadcast(data.channel_id);
      void startMesh(data.channel_id);
      void startMicMonitor();
    }

    const defer = window.setTimeout(() => {
      void restore();
    }, 1_500);
    return () => {
      cancelled = true;
      window.clearTimeout(defer);
    };
  }, [user, attachBroadcast, startMesh, startMicMonitor, syncSkipFromStorage]);

  // Leaving messenger (or the app shell) drops voice.
  useEffect(() => {
    if (pathname.startsWith("/messenger")) {
      cancelPendingLeave();
      return;
    }
    if (!connectionRef.current) return;
    void leaveVoice();
  }, [pathname, leaveVoice]);

  // Sign-out (or session loss) must delete the voice seat, not wait for stale cleanup.
  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      void leaveVoice();
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [leaveVoice]);

  // Heartbeat so other clients know we're still here; stopping implies grace disconnect.
  useEffect(() => {
    if (!connection || !user) return;
    const supabase = createClient();
    const userId = user.id;

    async function beat() {
      if (!connectionRef.current || userIdRef.current !== userId) return;
      const updatedAt = new Date().toISOString();
      const { error } = await supabase
        .from("voice_states")
        .update({ updated_at: updatedAt })
        .eq("user_id", userId);
      // Ignore transient heartbeat failures (tab sleep / brief offline).
      void error;
    }

    void beat();
    const timer = window.setInterval(() => void beat(), VOICE_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [connection, user]);

  // Periodically purge ghost occupants whose heartbeats stopped.
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();

    async function prune() {
      const { error } = await supabase.rpc("cleanup_stale_voice_states", {
        max_age: VOICE_STALE_INTERVAL,
      });
      void error;
    }

    void prune();
    const timer = window.setInterval(() => void prune(), VOICE_CLEANUP_POLL_MS);
    return () => window.clearInterval(timer);
  }, [user]);

  useEffect(() => {
    return () => {
      voiceOpRef.current += 1;
      stopMicMonitor();
      void stopMesh();
      detachBroadcast();
      // Do not delete voice_states here — brief refresh / remount should keep the seat
      // until heartbeats expire and cleanup_stale_voice_states runs.
      cancelPendingLeave();
    };
  }, [detachBroadcast, stopMesh, stopMicMonitor]);

  useEffect(() => {
    if (!connection) return;
    void startMicMonitor();
  }, [connection, devices.inputDeviceId, startMicMonitor]);

  useEffect(() => {
    meshRef.current?.setOutputDeviceId(devices.outputDeviceId);
  }, [devices.outputDeviceId]);

  useEffect(() => {
    meshRef.current?.setOutputVolume(devices.outputVolume);
  }, [devices.outputVolume]);

  useEffect(() => {
    const gain = inputGainRef.current;
    if (!gain) return;
    gain.gain.value = Math.min(1, Math.max(0, devices.inputVolume));
  }, [devices.inputVolume]);

  useEffect(() => {
    meshRef.current?.setBlockedPeerIds(audioBlockedPeerIds);
  }, [audioBlockedPeerIds]);

  // Drop inbound-only entries when we leave voice so lists don't grow forever.
  useEffect(() => {
    if (connection) return;
    setInboundBlockedIds([]);
  }, [connection]);

  // Auto-join / restore can start without a user gesture; unlock audio on the next interaction.
  useEffect(() => {
    if (!connection) return;
    function unlock() {
      const ctx = audioCtxRef.current;
      if (ctx?.state === "suspended") {
        void ctx.resume().catch(() => undefined);
      }
      if (!streamRef.current && connectionRef.current) {
        void startMicMonitor();
      }
      // Remote <audio> elements need a gesture in some browsers.
      for (const el of document.querySelectorAll<HTMLAudioElement>("audio[data-peer-id]")) {
        void el.play().catch(() => undefined);
      }
    }
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [connection, startMicMonitor]);

  const isSpeaking = useCallback(
    (userId: string) => speakingUserIds.has(userId),
    [speakingUserIds],
  );

  const value = useMemo<VoiceSessionContextValue>(
    () => ({
      connection,
      muted,
      deafened,
      quality,
      speakingUserIds,
      selfSpeaking,
      micLevel,
      micError,
      isSpeaking,
      inputDeviceId: devices.inputDeviceId,
      outputDeviceId: devices.outputDeviceId,
      inputVolume: devices.inputVolume,
      outputVolume: devices.outputVolume,
      inputs: devices.inputs,
      outputs: devices.outputs,
      joinVoice,
      leaveVoice,
      toggleMute,
      toggleDeafen,
      cameraOn,
      screenSharing,
      localVideoStream,
      localScreenStream,
      remoteMedia,
      toggleCamera,
      toggleScreenShare,
      setInputDeviceId: devices.setInputDeviceId,
      setOutputDeviceId: devices.setOutputDeviceId,
      setInputVolume: devices.setInputVolume,
      setOutputVolume: devices.setOutputVolume,
      refreshDevices: () => void devices.refresh(),
      shouldSkipAutoJoin,
      clearSkipAutoJoin,
    }),
    [
      connection,
      muted,
      deafened,
      quality,
      speakingUserIds,
      selfSpeaking,
      micLevel,
      micError,
      isSpeaking,
      devices.inputDeviceId,
      devices.outputDeviceId,
      devices.inputVolume,
      devices.outputVolume,
      devices.inputs,
      devices.outputs,
      devices.setInputDeviceId,
      devices.setOutputDeviceId,
      devices.setInputVolume,
      devices.setOutputVolume,
      devices.refresh,
      joinVoice,
      leaveVoice,
      toggleMute,
      toggleDeafen,
      cameraOn,
      screenSharing,
      localVideoStream,
      localScreenStream,
      remoteMedia,
      toggleCamera,
      toggleScreenShare,
      shouldSkipAutoJoin,
      clearSkipAutoJoin,
    ],
  );

  return (
    <VoiceSessionContext.Provider value={value}>{children}</VoiceSessionContext.Provider>
  );
}

export function useVoiceSession() {
  const value = useContext(VoiceSessionContext);
  if (!value) {
    throw new Error("useVoiceSession must be used within VoiceSessionProvider");
  }
  return value;
}

export function useOptionalVoiceSession() {
  return useContext(VoiceSessionContext);
}
