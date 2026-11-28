/**
 * Subtle messenger UI sounds from `/public/sounds/*.mp3`.
 * Prefetches + decodes into AudioBuffers so join/leave fire with no fetch lag.
 */

export type UiSoundName =
  | "message-send"
  | "message-receive"
  | "mention"
  | "notification"
  | "voice-join"
  | "voice-leave"
  | "voice-user-join"
  | "voice-user-leave"
  | "mute"
  | "unmute"
  | "deafen"
  | "undeafen"
  | "screenshare-start"
  | "screenshare-stop"
  | "incoming-call"
  | "error";

export const UI_SOUNDS_STORAGE_KEY = "redsss-ui-sounds-enabled";

const VOLUME = 0.4;
const DEBOUNCE_MS: Partial<Record<UiSoundName, number>> = {
  "message-receive": 120,
  mention: 200,
  notification: 250,
  error: 400,
  mute: 80,
  unmute: 80,
  deafen: 80,
  undeafen: 80,
  "voice-join": 40,
  "voice-leave": 40,
  "voice-user-join": 180,
  "voice-user-leave": 180,
  "screenshare-start": 80,
  "screenshare-stop": 80,
};

const EAGER: UiSoundName[] = [
  "voice-leave",
  "voice-join",
  "voice-user-join",
  "voice-user-leave",
  "mute",
  "unmute",
  "deafen",
  "undeafen",
  "screenshare-start",
  "screenshare-stop",
  "message-send",
  "message-receive",
];

const missing = new Set<UiSoundName>();
const lastPlayedAt = new Map<UiSoundName, number>();
const buffers = new Map<UiSoundName, AudioBuffer>();
const loading = new Map<UiSoundName, Promise<AudioBuffer | null>>();

let audioCtx: AudioContext | null = null;
let unlocked = false;
let loopAudio: HTMLAudioElement | null = null;
let loopName: UiSoundName | null = null;
let loopSource: AudioBufferSourceNode | null = null;
let loopGain: GainNode | null = null;

function readEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(UI_SOUNDS_STORAGE_KEY);
    if (raw == null) return true;
    return raw !== "0" && raw !== "false";
  } catch {
    return true;
  }
}

let enabled = true;

function srcFor(name: UiSoundName) {
  // Absolute URL avoids odd relative-path resolution on some production hosts.
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/sounds/${name}.mp3`;
  }
  return `/sounds/${name}.mp3`;
}

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume().catch(() => undefined);
  }
  return audioCtx;
}

async function loadBuffer(name: UiSoundName): Promise<AudioBuffer | null> {
  if (missing.has(name)) return null;
  const cached = buffers.get(name);
  if (cached) return cached;
  const inflight = loading.get(name);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const res = await fetch(srcFor(name), { cache: "default" });
      if (!res.ok) {
        // Only permanently skip hard 404s — transient CDN blips should retry.
        if (res.status === 404) missing.add(name);
        return null;
      }
      const raw = await res.arrayBuffer();
      if (raw.byteLength < 64) return null;
      const ctx = getCtx();
      if (!ctx) return null;
      const buffer = await ctx.decodeAudioData(raw.slice(0));
      buffers.set(name, buffer);
      return buffer;
    } catch {
      // Don't blacklist on decode/network flukes — next play can retry.
      return null;
    } finally {
      loading.delete(name);
    }
  })();

  loading.set(name, promise);
  return promise;
}

function prefetchEager() {
  for (const name of EAGER) void loadBuffer(name);
}

function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const ctx = getCtx();
  void ctx?.resume().catch(() => undefined);
  prefetchEager();
}

if (typeof window !== "undefined") {
  enabled = readEnabled();
  window.addEventListener("storage", (event) => {
    if (event.key === UI_SOUNDS_STORAGE_KEY) {
      enabled = readEnabled();
      if (!enabled) stopSoundLoop();
    }
  });
  // Production browsers require a user gesture before AudioContext can play.
  // Prefetch files after first pointer/key — don't create a blocked context early.
  const unlock = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  // Warm the MP3 bytes without touching AudioContext (safe before gesture).
  window.setTimeout(() => {
    for (const name of EAGER) {
      void fetch(srcFor(name), { cache: "default" }).catch(() => undefined);
    }
  }, 900);
}

export function areUiSoundsEnabled() {
  return enabled;
}

export function setUiSoundsEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(UI_SOUNDS_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
  if (!on) stopSoundLoop();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("redsss-ui-sounds-changed", { detail: { enabled: on } }),
    );
  }
}

function shouldSkip(name: UiSoundName) {
  if (!enabled || missing.has(name)) return true;
  if (typeof window === "undefined") return true;
  const gap = DEBOUNCE_MS[name] ?? 60;
  const now = Date.now();
  const last = lastPlayedAt.get(name) ?? 0;
  if (now - last < gap) return true;
  lastPlayedAt.set(name, now);
  return false;
}

function playBuffer(buffer: AudioBuffer, opts?: { loop?: boolean; volume?: number }) {
  const ctx = getCtx();
  if (!ctx) return null;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.loop = !!opts?.loop;
  gain.gain.value = opts?.volume ?? VOLUME;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(0);
  return { source, gain };
}

/** HTMLAudio fallback — works even when Web Audio is still suspended. */
function playHtmlFallback(name: UiSoundName) {
  try {
    const audio = new Audio(srcFor(name));
    audio.volume = VOLUME;
    const play = audio.play();
    if (play && typeof play.catch === "function") {
      void play.catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Fire-and-forget one-shot. Prefetched buffers start in the same tick.
 */
export function playSound(name: UiSoundName) {
  if (shouldSkip(name)) return;
  unlockAudio();
  const ready = buffers.get(name);
  if (ready) {
    try {
      const ctx = getCtx();
      // Suspended Web Audio is silent on production until resume settles —
      // HTMLAudio plays immediately from the same user gesture.
      if (!ctx || ctx.state === "suspended") {
        void ctx?.resume().catch(() => undefined);
        playHtmlFallback(name);
        return;
      }
      playBuffer(ready);
    } catch {
      playHtmlFallback(name);
    }
    return;
  }
  // Not warm yet — kick decode and use HTMLAudio this time.
  void loadBuffer(name);
  playHtmlFallback(name);
}

/** Soft looping ringtone (incoming call). */
export function startSoundLoop(name: UiSoundName = "incoming-call") {
  stopSoundLoop();
  if (!enabled || missing.has(name) || typeof window === "undefined") {
    return { stop: () => undefined };
  }
  unlockAudio();

  const startFromBuffer = (buffer: AudioBuffer) => {
    stopSoundLoop();
    try {
      const nodes = playBuffer(buffer, {
        loop: true,
        volume: Math.min(VOLUME, 0.35),
      });
      if (!nodes) return;
      loopSource = nodes.source;
      loopGain = nodes.gain;
      loopName = name;
    } catch {
      /* fall through to HTMLAudio below if needed */
    }
  };

  const ready = buffers.get(name);
  if (ready) {
    startFromBuffer(ready);
    if (loopSource) return { stop: () => stopSoundLoop() };
  }

  // Fallback element until decode finishes / AudioContext unlocks.
  try {
    const audio = new Audio(srcFor(name));
    audio.loop = true;
    audio.volume = Math.min(VOLUME, 0.35);
    loopAudio = audio;
    loopName = name;
    void audio.play().catch(() => {
      window.addEventListener(
        "pointerdown",
        () => {
          if (loopAudio === audio) void audio.play().catch(() => undefined);
        },
        { once: true },
      );
    });
  } catch {
    /* ignore */
  }

  void loadBuffer(name).then((buffer) => {
    if (!buffer || loopName !== name) return;
    if (loopAudio) {
      try {
        loopAudio.pause();
        loopAudio.src = "";
      } catch {
        /* ignore */
      }
      loopAudio = null;
    }
    startFromBuffer(buffer);
  });

  return { stop: () => stopSoundLoop() };
}

export function stopSoundLoop() {
  if (loopSource) {
    try {
      loopSource.stop();
    } catch {
      /* already stopped */
    }
    loopSource = null;
    loopGain = null;
  }
  if (loopAudio) {
    try {
      loopAudio.pause();
      loopAudio.currentTime = 0;
      loopAudio.src = "";
    } catch {
      /* ignore */
    }
    loopAudio = null;
  }
  loopName = null;
}

export function isSoundLoopPlaying(name?: UiSoundName) {
  if (!loopName) return false;
  return name ? loopName === name : true;
}
