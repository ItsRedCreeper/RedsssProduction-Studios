"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

type SignalPayload =
  | { kind: "hello"; from: string }
  | { kind: "goodbye"; from: string }
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
};

export type VoiceMeshOptions = {
  supabase: SupabaseClient;
  channelId: string;
  userId: string;
  onSpeaking?: (userId: string, speaking: boolean) => void;
  onPeerCount?: (count: number) => void;
  onError?: (message: string) => void;
};

/**
 * Simple WebRTC mesh for a voice channel.
 * Signaling via Supabase Realtime broadcast. Lower userId is the impolite (offer) peer.
 */
export class VoiceMesh {
  private opts: VoiceMeshOptions;
  private signal: RealtimeChannel | null = null;
  private peers = new Map<string, PeerSlot>();
  private localStream: MediaStream | null = null;
  private muted = false;
  private deafened = false;
  private outputDeviceId = "";
  private outputVolume = 1;
  private closed = false;
  private started = false;

  constructor(opts: VoiceMeshOptions) {
    this.opts = opts;
  }

  async start(existingPeerIds: string[] = []) {
    if (this.started || this.closed) return;
    this.started = true;
    const { supabase, channelId, userId } = this.opts;

    this.signal = supabase
      .channel(`voice-rtc:${channelId}`, {
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
      });
  }

  async stop() {
    if (this.closed) return;
    this.closed = true;
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
    this.started = false;
  }

  /** Attach or replace the outbound mic stream (tracks kept alive; mute uses enabled). */
  async setLocalStream(stream: MediaStream | null) {
    this.localStream = stream;
    if (!stream) {
      for (const slot of this.peers.values()) {
        for (const sender of slot.pc.getSenders()) {
          if (sender.track?.kind === "audio") {
            try {
              await sender.replaceTrack(null);
            } catch {
              /* ignore */
            }
          }
        }
      }
      return;
    }

    const track = stream.getAudioTracks()[0] ?? null;
    if (track) track.enabled = !this.muted;

    for (const slot of this.peers.values()) {
      const sender = slot.pc.getSenders().find((s) => s.track?.kind === "audio" || !s.track);
      if (sender) {
        try {
          await sender.replaceTrack(track);
        } catch {
          /* ignore */
        }
      } else if (track) {
        try {
          slot.pc.addTrack(track, stream);
        } catch {
          /* ignore */
        }
      }
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const track = this.localStream?.getAudioTracks()[0];
    if (track) track.enabled = !muted;
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

  peerCount() {
    return this.peers.size;
  }

  private applyRemoteAudio() {
    const volume = this.deafened ? 0 : this.outputVolume;
    for (const slot of this.peers.values()) {
      slot.audioEl.muted = this.deafened;
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
        // Resend offer if the first one was missed before they subscribed.
        if (
          !existing.polite &&
          existing.pc.connectionState !== "connected" &&
          existing.pc.signalingState === "stable"
        ) {
          await this.makeOffer(payload.from, existing);
        }
        return;
      }
      await this.ensurePeer(payload.from);
      return;
    }
    if (payload.kind === "goodbye") {
      this.closePeer(payload.from);
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

    const slot: PeerSlot = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      polite,
      audioEl,
    };
    this.peers.set(peerId, slot);
    this.opts.onPeerCount?.(this.peers.size);
    this.applyRemoteAudio();

    const localTrack = this.localStream?.getAudioTracks()[0];
    if (localTrack && this.localStream) {
      localTrack.enabled = !this.muted;
      try {
        pc.addTrack(localTrack, this.localStream);
      } catch {
        /* ignore */
      }
    } else {
      // Transceiver so we can receive even before mic is ready.
      try {
        pc.addTransceiver("audio", { direction: "sendrecv" });
      } catch {
        /* ignore */
      }
    }

    pc.onnegotiationneeded = () => {
      if (slot.polite) return;
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
      const [stream] = event.streams;
      if (stream) {
        audioEl.srcObject = stream;
        void audioEl.play().catch(() => undefined);
      } else if (event.track) {
        const ms = new MediaStream([event.track]);
        audioEl.srcObject = ms;
        void audioEl.play().catch(() => undefined);
      }
      this.applyRemoteAudio();
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected"
      ) {
        // Soft disconnect: keep peer briefly; failed → recreate later via hello.
        if (pc.connectionState === "failed") {
          this.closePeer(peerId);
          // Re-announce so a fresh negotiation can start.
          void this.send({ kind: "hello", from: this.opts.userId });
        }
      }
    };

    // Impolite (lower id) peer creates the initial offer.
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
