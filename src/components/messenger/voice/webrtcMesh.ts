"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function isTrackRenderable(
  track: MediaStreamTrack | null | undefined,
): track is MediaStreamTrack {
  return !!track && track.readyState === "live" && !track.muted;
}

/** Wait until capture is actually producing (unmuted). Cancel/fail → false. */
function waitUntilTrackLive(
  track: MediaStreamTrack,
  timeoutMs = 8000,
): Promise<boolean> {
  if (track.readyState === "ended") return Promise.resolve(false);
  if (!track.muted) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      track.removeEventListener("unmute", onUnmute);
      track.removeEventListener("ended", onEnded);
      window.clearTimeout(timer);
      resolve(ok);
    };
    const onUnmute = () => finish(track.readyState === "live");
    const onEnded = () => finish(false);
    const timer = window.setTimeout(() => {
      finish(track.readyState === "live" && !track.muted);
    }, timeoutMs);
    track.addEventListener("unmute", onUnmute);
    track.addEventListener("ended", onEnded);
  });
}

type SignalPayload =
  | { kind: "hello"; from: string }
  | { kind: "goodbye"; from: string }
  | {
      kind: "media";
      from: string;
      camera: boolean;
      screen: boolean;
    }
  | { kind: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | {
      kind: "ice";
      from: string;
      to: string;
      candidate: RTCIceCandidateInit | null;
    };

type PeerSlot = {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
  audioEl: HTMLAudioElement;
  /** Dedicated video m-lines — first camera, second screen (same order on every peer). */
  cameraTransceiver: RTCRtpTransceiver;
  screenTransceiver: RTCRtpTransceiver;
  /** What the remote peer last announced they are sending. */
  remoteCamera: boolean;
  remoteScreen: boolean;
};

export type VoiceMeshOptions = {
  supabase: SupabaseClient;
  channelId: string;
  userId: string;
  /** Realtime topic prefix. Default voice-rtc; use call-rtc for DM calls. */
  topicPrefix?: string;
  onSpeaking?: (userId: string, speaking: boolean) => void;
  onPeerCount?: (count: number) => void;
  /** Fired when a peer slot is created (hello / offer). */
  onPeerJoined?: (peerId: string) => void;
  /** Remote video/screen track for a peer (null when removed). */
  onRemoteVideo?: (
    peerId: string,
    stream: MediaStream | null,
    kind: "camera" | "screen" | "unknown",
  ) => void;
  onError?: (message: string) => void;
};

/**
 * Simple WebRTC mesh for a voice channel.
 * Signaling via Supabase Realtime broadcast. Lower userId is the impolite (offer) peer.
 *
 * Camera and screen each get a dedicated transceiver so remotes can tell them apart,
 * plus an explicit `media` announce because replaceTrack(null) does not fire `ended`.
 */
export class VoiceMesh {
  private opts: VoiceMeshOptions;
  private signal: RealtimeChannel | null = null;
  private peers = new Map<string, PeerSlot>();
  private localStream: MediaStream | null = null;
  private localVideoTrack: MediaStreamTrack | null = null;
  private localScreenTrack: MediaStreamTrack | null = null;
  /** Only true after a screen track is live+unmuted — Discord-like “actually sharing”. */
  private screenLive = false;
  /** Only true after a camera track is live+unmuted. */
  private cameraLive = false;
  private muted = false;
  private deafened = false;
  private outputDeviceId = "";
  private outputVolume = 1;
  /** Peers with either-direction block — no audio in or out. */
  private blockedPeerIds = new Set<string>();
  private closed = false;
  private started = false;
  /** Poll timers waiting for a muted receiver track to become renderable after announce. */
  private pendingVideoPublish = new Map<string, number>();

  constructor(opts: VoiceMeshOptions) {
    this.opts = opts;
  }

  async start(existingPeerIds: string[] = []) {
    if (this.started || this.closed) return;
    this.started = true;
    const { supabase, channelId, userId } = this.opts;

    const prefix = this.opts.topicPrefix ?? "voice-rtc";
    this.signal = supabase
      .channel(`${prefix}:${channelId}`, {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        void this.onSignal(payload as SignalPayload);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED" || this.closed) return;
        void this.send({ kind: "hello", from: userId });
        for (const peerId of existingPeerIds) {
          if (peerId !== userId) void this.ensurePeer(peerId);
        }
        void this.announceMedia();
      });
  }

  async stop() {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.pendingVideoPublish.values()) {
      window.clearInterval(timer);
    }
    this.pendingVideoPublish.clear();
    const userId = this.opts.userId;
    if (this.signal) {
      try {
        await this.signal.send({
          type: "broadcast",
          event: "signal",
          payload: { kind: "goodbye", from: userId } satisfies SignalPayload,
        });
      } catch {
        /* ignore */
      }
      const supabase = this.opts.supabase;
      void supabase.removeChannel(this.signal);
      this.signal = null;
    }
    for (const peerId of [...this.peers.keys()]) {
      this.closePeer(peerId);
    }
    this.localStream = null;
    this.cameraLive = false;
    this.screenLive = false;
    if (this.localVideoTrack) {
      try {
        this.localVideoTrack.stop();
      } catch {
        /* ignore */
      }
      this.localVideoTrack = null;
    }
    if (this.localScreenTrack) {
      try {
        this.localScreenTrack.stop();
      } catch {
        /* ignore */
      }
      this.localScreenTrack = null;
    }
    this.started = false;
  }

  /** Attach or replace the outbound mic stream (tracks kept alive; mute uses enabled). */
  async setLocalStream(stream: MediaStream | null) {
    this.localStream = stream;
    if (!stream) {
      for (const peerId of this.peers.keys()) {
        await this.applyOutboundToPeer(peerId);
      }
      return;
    }

    const track = stream.getAudioTracks()[0] ?? null;
    if (track) track.enabled = !this.muted;

    for (const peerId of this.peers.keys()) {
      await this.applyOutboundToPeer(peerId);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const track = this.localStream?.getAudioTracks()[0];
    if (track) track.enabled = !muted;
  }

  /** Camera or null to stop. Returns false if the track never became live. */
  async setLocalVideoTrack(track: MediaStreamTrack | null): Promise<boolean> {
    if (this.localVideoTrack && this.localVideoTrack !== track) {
      try {
        this.localVideoTrack.stop();
      } catch {
        /* ignore */
      }
    }
    this.localVideoTrack = track;
    this.cameraLive = false;
    if (track && "contentHint" in track) {
      try {
        (track as MediaStreamTrack & { contentHint: string }).contentHint =
          "motion";
      } catch {
        /* ignore */
      }
    }
    for (const peerId of this.peers.keys()) {
      await this.applyVideoToPeer(peerId, "camera");
    }
    if (!track) {
      await this.announceMedia();
      return true;
    }
    const ok = await waitUntilTrackLive(track);
    if (!ok || this.localVideoTrack !== track || this.closed) {
      if (this.localVideoTrack === track) this.localVideoTrack = null;
      this.cameraLive = false;
      for (const peerId of this.peers.keys()) {
        await this.applyVideoToPeer(peerId, "camera");
      }
      await this.announceMedia();
      return false;
    }
    this.cameraLive = true;
    await this.announceMedia();
    return true;
  }

  /**
   * Screen share or null to stop.
   * Peers are only told `screen: true` after the capture track is literally live
   * (unmuted) — same as Discord, so cancel / failed capture never spawns tiles.
   *
   * Restart path: announce off → replaceTrack → wait live → re-replace → renegotiate
   * → announce on. Chromium often leaves the remote receiver muted after a second
   * replaceTrack without an SDP renegotiation.
   */
  async setLocalScreenTrack(track: MediaStreamTrack | null): Promise<boolean> {
    if (this.localScreenTrack && this.localScreenTrack !== track) {
      try {
        this.localScreenTrack.stop();
      } catch {
        /* ignore */
      }
    }
    this.localScreenTrack = track;
    this.screenLive = false;
    // Always announce "off" first so remotes clear any stale tile before a new share.
    for (const peerId of this.peers.keys()) {
      await this.applyVideoToPeer(peerId, "screen");
    }
    await this.announceMedia();
    if (!track) return true;

    if ("contentHint" in track) {
      try {
        (track as MediaStreamTrack & { contentHint: string }).contentHint =
          "detail";
      } catch {
        /* ignore */
      }
    }
    track.addEventListener(
      "ended",
      () => {
        if (this.localScreenTrack === track) {
          void this.setLocalScreenTrack(null);
        }
      },
      { once: true },
    );
    for (const peerId of this.peers.keys()) {
      await this.applyVideoToPeer(peerId, "screen");
    }
    const ok = await waitUntilTrackLive(track);
    if (!ok || this.localScreenTrack !== track || this.closed) {
      if (this.localScreenTrack === track) this.localScreenTrack = null;
      this.screenLive = false;
      try {
        track.stop();
      } catch {
        /* ignore */
      }
      for (const peerId of this.peers.keys()) {
        await this.applyVideoToPeer(peerId, "screen");
      }
      await this.announceMedia();
      return false;
    }
    // Fresh replace after live so the second share isn't a no-op on remotes.
    for (const peerId of this.peers.keys()) {
      await this.applyVideoToPeer(peerId, "screen");
    }
    this.screenLive = true;
    await this.renegotiateAll();
    await this.announceMedia();
    // Late unmute / renegotiation: nudge remotes once more.
    window.setTimeout(() => {
      if (this.closed || !this.screenLive || this.localScreenTrack !== track) return;
      void this.announceMedia();
    }, 350);
    return true;
  }

  setDeafened(deafened: boolean) {
    this.deafened = deafened;
    this.applyRemoteAudio();
  }

  setOutputDeviceId(deviceId: string) {
    this.outputDeviceId = deviceId;
    this.applyRemoteAudio();
  }

  setOutputVolume(volume: number) {
    this.outputVolume = Math.min(1, Math.max(0, volume));
    this.applyRemoteAudio();
  }

  /** Mute remote audio and stop sending mic to these peer user IDs. */
  setBlockedPeerIds(ids: Iterable<string>) {
    this.blockedPeerIds = new Set(ids);
    this.applyRemoteAudio();
    for (const peerId of this.peers.keys()) {
      void this.applyOutboundToPeer(peerId);
    }
  }

  peerIds() {
    return [...this.peers.keys()];
  }

  peerCount() {
    return this.peers.size;
  }

  private isAudioBlocked(peerId: string) {
    return this.blockedPeerIds.has(peerId);
  }

  private async announceMedia() {
    await this.send({
      kind: "media",
      from: this.opts.userId,
      // Only advertise sources that are actually producing frames.
      camera: this.cameraLive && !!this.localVideoTrack,
      screen: this.screenLive && !!this.localScreenTrack,
    });
  }

  private async applyOutboundToPeer(peerId: string) {
    const slot = this.peers.get(peerId);
    if (!slot) return;
    const blocked = this.isAudioBlocked(peerId);
    const track =
      !blocked && this.localStream
        ? (this.localStream.getAudioTracks()[0] ?? null)
        : null;
    if (track) track.enabled = !this.muted;

    const senders = slot.pc.getSenders();
    const micSender =
      senders.find((s) => s.track?.kind === "audio") ??
      senders.find(
        (s) =>
          !s.track &&
          s !== slot.cameraTransceiver.sender &&
          s !== slot.screenTransceiver.sender,
      ) ??
      null;

    if (micSender) {
      try {
        await micSender.replaceTrack(track);
      } catch {
        /* ignore */
      }
    } else if (track && this.localStream) {
      try {
        slot.pc.addTrack(track, this.localStream);
      } catch {
        /* ignore */
      }
    }
    await this.applyVideoToPeer(peerId, "camera");
    await this.applyVideoToPeer(peerId, "screen");
  }

  private async applyVideoToPeer(
    peerId: string,
    kind: "camera" | "screen",
  ) {
    const slot = this.peers.get(peerId);
    if (!slot) return;
    const track =
      kind === "camera" ? this.localVideoTrack : this.localScreenTrack;
    const transceiver =
      kind === "camera" ? slot.cameraTransceiver : slot.screenTransceiver;
    try {
      await transceiver.sender.replaceTrack(track);
    } catch (error) {
      console.warn("[voice-mesh] replaceTrack failed", kind, error);
    }
  }

  private publishRemoteVideo(
    peerId: string,
    kind: "camera" | "screen",
    track: MediaStreamTrack | null,
  ) {
    // Muted/placeholder receiver tracks must not create Discord-style tiles.
    if (!isTrackRenderable(track)) {
      this.opts.onRemoteVideo?.(peerId, null, kind);
      return;
    }
    this.opts.onRemoteVideo?.(peerId, new MediaStream([track]), kind);
  }

  private clearPendingVideoPublish(peerId: string, kind: "camera" | "screen") {
    const key = `${peerId}:${kind}`;
    const timer = this.pendingVideoPublish.get(key);
    if (timer != null) {
      window.clearInterval(timer);
      this.pendingVideoPublish.delete(key);
    }
  }

  /** Keep trying until the receiver track unmutes after a restart replaceTrack. */
  private armPendingVideoPublish(peerId: string, kind: "camera" | "screen") {
    this.clearPendingVideoPublish(peerId, kind);
    const key = `${peerId}:${kind}`;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const slot = this.peers.get(peerId);
      if (!slot || this.closed) {
        this.clearPendingVideoPublish(peerId, kind);
        return;
      }
      const wanted = kind === "screen" ? slot.remoteScreen : slot.remoteCamera;
      if (!wanted) {
        this.clearPendingVideoPublish(peerId, kind);
        return;
      }
      const track =
        kind === "screen"
          ? slot.screenTransceiver.receiver.track
          : slot.cameraTransceiver.receiver.track;
      if (isTrackRenderable(track)) {
        this.publishRemoteVideo(peerId, kind, track);
        this.clearPendingVideoPublish(peerId, kind);
        return;
      }
      if (Date.now() - started > 6000) {
        this.clearPendingVideoPublish(peerId, kind);
      }
    }, 200);
    this.pendingVideoPublish.set(key, timer);
  }

  private syncRemoteMediaFromAnnounce(
    peerId: string,
    camera: boolean,
    screen: boolean,
  ) {
    const slot = this.peers.get(peerId);
    if (!slot) return;
    slot.remoteCamera = camera;
    slot.remoteScreen = screen;

    if (!camera) {
      this.clearPendingVideoPublish(peerId, "camera");
      this.publishRemoteVideo(peerId, "camera", null);
    } else {
      const track = slot.cameraTransceiver.receiver.track;
      if (isTrackRenderable(track)) {
        this.clearPendingVideoPublish(peerId, "camera");
        this.publishRemoteVideo(peerId, "camera", track);
      } else {
        this.armPendingVideoPublish(peerId, "camera");
      }
    }

    if (!screen) {
      this.clearPendingVideoPublish(peerId, "screen");
      this.publishRemoteVideo(peerId, "screen", null);
    } else {
      const track = slot.screenTransceiver.receiver.track;
      if (isTrackRenderable(track)) {
        this.clearPendingVideoPublish(peerId, "screen");
        this.publishRemoteVideo(peerId, "screen", track);
      } else {
        // Announce can beat unmute / renegotiation on a restarted share.
        this.armPendingVideoPublish(peerId, "screen");
      }
    }
  }

  private async renegotiateAll() {
    for (const [peerId, slot] of this.peers) {
      if (slot.makingOffer) continue;
      if (slot.pc.signalingState !== "stable") continue;
      // Impolite peers always offer; polite peers may also offer — glare is handled.
      await this.makeOffer(peerId, slot);
    }
  }

  private applyRemoteAudio() {
    for (const [peerId, slot] of this.peers) {
      const blocked = this.isAudioBlocked(peerId) || this.deafened;
      const volume = blocked ? 0 : this.outputVolume;
      slot.audioEl.muted = blocked;
      slot.audioEl.volume = volume;
      if (this.outputDeviceId && "setSinkId" in slot.audioEl) {
        void (
          slot.audioEl as HTMLAudioElement & {
            setSinkId: (id: string) => Promise<void>;
          }
        )
          .setSinkId(this.outputDeviceId)
          .catch(() => undefined);
      }
    }
  }

  private async send(payload: SignalPayload) {
    if (!this.signal || this.closed) return;
    try {
      await this.signal.send({
        type: "broadcast",
        event: "signal",
        payload,
      });
    } catch (error) {
      console.warn("[voice-mesh] signal send failed", error);
    }
  }

  private async onSignal(payload: SignalPayload) {
    if (this.closed || !payload?.from || payload.from === this.opts.userId) return;

    if (payload.kind === "hello") {
      const existing = this.peers.get(payload.from);
      if (existing) {
        if (
          !existing.polite &&
          existing.pc.connectionState !== "connected" &&
          existing.pc.signalingState === "stable"
        ) {
          await this.makeOffer(payload.from, existing);
        }
        await this.announceMedia();
        return;
      }
      await this.ensurePeer(payload.from);
      await this.announceMedia();
      return;
    }
    if (payload.kind === "goodbye") {
      this.closePeer(payload.from);
      return;
    }
    if (payload.kind === "media") {
      await this.ensurePeer(payload.from);
      this.syncRemoteMediaFromAnnounce(
        payload.from,
        !!payload.camera,
        !!payload.screen,
      );
      return;
    }
    if (payload.kind === "offer" || payload.kind === "answer" || payload.kind === "ice") {
      if (payload.to !== this.opts.userId) return;
      await this.ensurePeer(payload.from);
      const slot = this.peers.get(payload.from);
      if (!slot) return;

      if (payload.kind === "ice") {
        if (!payload.candidate) return;
        try {
          await slot.pc.addIceCandidate(payload.candidate);
        } catch (error) {
          if (!slot.ignoreOffer) console.warn("[voice-mesh] ice error", error);
        }
        return;
      }

      const pc = slot.pc;
      try {
        if (payload.kind === "offer") {
          const offerCollision =
            slot.makingOffer || pc.signalingState !== "stable";
          slot.ignoreOffer = !slot.polite && offerCollision;
          if (slot.ignoreOffer) return;
          await pc.setRemoteDescription(payload.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await this.send({
            kind: "answer",
            from: this.opts.userId,
            to: payload.from,
            sdp: {
              type: pc.localDescription!.type,
              sdp: pc.localDescription!.sdp,
            },
          });
        } else {
          await pc.setRemoteDescription(payload.sdp);
        }
      } catch (error) {
        console.warn("[voice-mesh] sdp error", error);
        this.opts.onError?.("Voice peer negotiation failed.");
      }
    }
  }

  private async ensurePeer(peerId: string) {
    if (this.closed || peerId === this.opts.userId || this.peers.has(peerId)) return;

    const polite = this.opts.userId > peerId;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.setAttribute("playsinline", "true");
    audioEl.dataset.peerId = peerId;
    document.body.appendChild(audioEl);

    // Always create camera then screen video m-lines in the same order so peers align.
    const cameraTransceiver = pc.addTransceiver("video", {
      direction: "sendrecv",
    });
    const screenTransceiver = pc.addTransceiver("video", {
      direction: "sendrecv",
    });

    const slot: PeerSlot = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      polite,
      audioEl,
      cameraTransceiver,
      screenTransceiver,
      remoteCamera: false,
      remoteScreen: false,
    };
    this.peers.set(peerId, slot);
    this.opts.onPeerCount?.(this.peers.size);
    this.opts.onPeerJoined?.(peerId);
    this.applyRemoteAudio();

    pc.onnegotiationneeded = () => {
      if (slot.makingOffer) return;
      void this.makeOffer(peerId, slot);
    };

    pc.onicecandidate = (event) => {
      void this.send({
        kind: "ice",
        from: this.opts.userId,
        to: peerId,
        candidate: event.candidate ? event.candidate.toJSON() : null,
      });
    };

    pc.ontrack = (event) => {
      const track = event.track;
      if (track.kind === "video") {
        const transceiver = event.transceiver;
        let kind: "camera" | "screen" =
          transceiver === slot.screenTransceiver ||
          transceiver?.sender === slot.screenTransceiver.sender
            ? "screen"
            : "camera";
        if (
          transceiver !== slot.cameraTransceiver &&
          transceiver !== slot.screenTransceiver
        ) {
          const videoTx = pc
            .getTransceivers()
            .filter(
              (t) =>
                t === slot.cameraTransceiver ||
                t === slot.screenTransceiver ||
                t.receiver.track?.kind === "video",
            );
          const index = videoTx.indexOf(transceiver);
          if (index >= 1) kind = "screen";
          else if (index === 0) kind = "camera";
        }

        // Only surface video once announced AND the track is actually renderable.
        const announced =
          kind === "screen" ? slot.remoteScreen : slot.remoteCamera;
        if (announced && isTrackRenderable(track)) {
          this.publishRemoteVideo(peerId, kind, track);
        }

        track.addEventListener("ended", () => {
          this.publishRemoteVideo(peerId, kind, null);
        });
        track.addEventListener("mute", () => {
          // replaceTrack(null) mutes without ending — only clear if share was announced off.
          const wanted =
            kind === "screen" ? slot.remoteScreen : slot.remoteCamera;
          if (!wanted) this.publishRemoteVideo(peerId, kind, null);
        });
        track.addEventListener("unmute", () => {
          const stillWanted =
            kind === "screen" ? slot.remoteScreen : slot.remoteCamera;
          if (stillWanted && isTrackRenderable(track)) {
            this.publishRemoteVideo(peerId, kind, track);
          }
        });
        return;
      }
      const [stream] = event.streams;
      if (stream) {
        audioEl.srcObject = stream;
        void audioEl.play().catch(() => undefined);
      } else if (track) {
        const ms = new MediaStream([track]);
        audioEl.srcObject = ms;
        void audioEl.play().catch(() => undefined);
      }
      this.applyRemoteAudio();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        this.closePeer(peerId);
        void this.send({ kind: "hello", from: this.opts.userId });
      }
    };

    const localTrack =
      !this.isAudioBlocked(peerId) && this.localStream
        ? (this.localStream.getAudioTracks()[0] ?? null)
        : null;
    if (localTrack && this.localStream) {
      localTrack.enabled = !this.muted;
      try {
        pc.addTrack(localTrack, this.localStream);
      } catch {
        try {
          pc.addTransceiver("audio", { direction: "sendrecv" });
        } catch {
          /* ignore */
        }
      }
    } else {
      try {
        pc.addTransceiver("audio", { direction: "sendrecv" });
      } catch {
        /* ignore */
      }
    }

    await this.applyVideoToPeer(peerId, "camera");
    await this.applyVideoToPeer(peerId, "screen");

    if (!polite) {
      await this.makeOffer(peerId, slot);
    }
  }

  private async makeOffer(peerId: string, slot: PeerSlot) {
    const pc = slot.pc;
    try {
      slot.makingOffer = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.send({
        kind: "offer",
        from: this.opts.userId,
        to: peerId,
        sdp: {
          type: pc.localDescription!.type,
          sdp: pc.localDescription!.sdp,
        },
      });
    } catch (error) {
      console.warn("[voice-mesh] offer failed", error);
    } finally {
      slot.makingOffer = false;
    }
  }

  private closePeer(peerId: string) {
    const slot = this.peers.get(peerId);
    if (!slot) return;
    this.peers.delete(peerId);
    this.clearPendingVideoPublish(peerId, "camera");
    this.clearPendingVideoPublish(peerId, "screen");
    this.opts.onRemoteVideo?.(peerId, null, "camera");
    this.opts.onRemoteVideo?.(peerId, null, "screen");
    try {
      slot.pc.close();
    } catch {
      /* ignore */
    }
    slot.audioEl.pause();
    slot.audioEl.srcObject = null;
    slot.audioEl.remove();
    this.opts.onPeerCount?.(this.peers.size);
    this.opts.onSpeaking?.(peerId, false);
  }
}
