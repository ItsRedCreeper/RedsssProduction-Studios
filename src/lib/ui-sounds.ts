/**
 * Subtle messenger UI sounds from `/public/sounds/*.mp3`.
 * Missing files fail silently. Respects a local mute toggle (default on).
 * Prefetches audio so join/leave/mute feel immediate.
 */

export type UiSoundName =
  | "message-send"
  | "message-receive"
  | "mention"
  | "notification"
  | "voice-join"
  | "voice-leave"
  | "mute"
  | "unmute"
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
  "voice-join": 40,
  "voice-leave": 40,
};

/** Prefetch first — these are the ones users notice lagging. */
const EAGER: UiSoundName[] = [
  "voice-join",
  "voice-leave",
  "mute",
  "unmute",
  "message-send",
  "message-receive",
];

const missing = new Set<UiSoundName>();
const lastPlayedAt = new Map<UiSoundName, number>();
/** Warm templates — clone on play so we never wait on a network fetch. */
const templates = new Map<UiSoundName, HTMLAudioElement>();

let loopAudio: HTMLAudioElement | null = null;
let loopName: UiSoundName | null = null;

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
  return `/sounds/${name}.mp3`;
}

function ensureTemplate(name: UiSoundName) {
  if (typeof window === "undefined" || missing.has(name)) return null;
  let audio = templates.get(name);
  if (audio) return audio;
  audio = new Audio(srcFor(name));
  audio.preload = "auto";
  audio.volume = VOLUME;
  audio.addEventListener(
    "error",
    () => {
      missing.add(name);
      templates.delete(name);
    },
    { once: true },
  );
  // Kick the download without playing.
  try {
    void audio.load();
  } catch {
    /* ignore */
  }
  templates.set(name, audio);
  return audio;
}

function prefetchEager() {
  for (const name of EAGER) ensureTemplate(name);
}

if (typeof window !== "undefined") {
  enabled = readEnabled();
  window.addEventListener("storage", (event) => {
    if (event.key === UI_SOUNDS_STORAGE_KEY) {
      enabled = readEnabled();
      if (!enabled) stopSoundLoop();
    }
  });
  // Prefetch after first gesture (also satisfies autoplay unlock).
  const unlock = () => {
    prefetchEager();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  // Idle prefetch when the tab is quiet — join/leave stay snappy.
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => prefetchEager(), { timeout: 2500 });
  } else {
    window.setTimeout(prefetchEager, 1200);
  }
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

function audioForPlay(name: UiSoundName) {
  const template = ensureTemplate(name);
  if (!template) return null;
  // Clone so overlaps don't cut each other off and we keep the warm buffer.
  const audio = template.cloneNode(true) as HTMLAudioElement;
  audio.volume = VOLUME;
  audio.currentTime = 0;
  return audio;
}

/**
 * Fire-and-forget one-shot. Never throws; never blocks UI.
 */
export function playSound(name: UiSoundName) {
  if (shouldSkip(name)) return;
  try {
    const audio = audioForPlay(name);
    if (!audio) return;
    const play = audio.play();
    if (play && typeof play.catch === "function") {
      void play.catch(() => {
        /* autoplay blocked — ignore; next gesture unlocks */
      });
    }
  } catch {
    missing.add(name);
  }
}

/** Soft looping ringtone (incoming call). Returns a stop handle. */
export function startSoundLoop(name: UiSoundName = "incoming-call") {
  stopSoundLoop();
  if (!enabled || missing.has(name) || typeof window === "undefined") {
    return { stop: () => undefined };
  }
  try {
    const audio = audioForPlay(name);
    if (!audio) return { stop: () => undefined };
    audio.loop = true;
    audio.volume = Math.min(VOLUME, 0.35);
    loopAudio = audio;
    loopName = name;
    const play = audio.play();
    if (play && typeof play.catch === "function") {
      void play.catch(() => {
        const retry = () => {
          if (loopAudio !== audio) return;
          void audio.play().catch(() => {
            missing.add(name);
            stopSoundLoop();
          });
        };
        window.addEventListener("pointerdown", retry, { once: true });
      });
    }
  } catch {
    missing.add(name);
  }
  return { stop: () => stopSoundLoop() };
}

export function stopSoundLoop() {
  if (!loopAudio) {
    loopName = null;
    return;
  }
  try {
    loopAudio.pause();
    loopAudio.currentTime = 0;
    loopAudio.src = "";
  } catch {
    /* ignore */
  }
  loopAudio = null;
  loopName = null;
}

export function isSoundLoopPlaying(name?: UiSoundName) {
  if (!loopAudio || !loopName) return false;
  return name ? loopName === name : true;
}
