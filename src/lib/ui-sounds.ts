/**
 * Subtle messenger UI sounds from `/public/sounds/*.mp3`.
 * Missing files fail silently. Respects a local mute toggle (default on).
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
};

const missing = new Set<UiSoundName>();
const lastPlayedAt = new Map<UiSoundName, number>();
const unlocked = { current: false };

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
if (typeof window !== "undefined") {
  enabled = readEnabled();
  window.addEventListener("storage", (event) => {
    if (event.key === UI_SOUNDS_STORAGE_KEY) {
      enabled = readEnabled();
      if (!enabled) stopSoundLoop();
    }
  });
  // Unlock audio after the first user gesture (browser autoplay policy).
  const unlock = () => {
    unlocked.current = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
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

function srcFor(name: UiSoundName) {
  return `/sounds/${name}.mp3`;
}

function makeAudio(name: UiSoundName) {
  const audio = new Audio(srcFor(name));
  audio.preload = "auto";
  audio.volume = VOLUME;
  return audio;
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

/**
 * Fire-and-forget one-shot. Never throws; never blocks UI.
 */
export function playSound(name: UiSoundName) {
  if (shouldSkip(name)) return;
  try {
    const audio = makeAudio(name);
    const play = audio.play();
    if (play && typeof play.catch === "function") {
      void play.catch(() => {
        // Autoplay blocked or missing file — mark missing only on hard media errors.
        audio.addEventListener(
          "error",
          () => {
            missing.add(name);
          },
          { once: true },
        );
      });
    }
    audio.addEventListener(
      "error",
      () => {
        missing.add(name);
      },
      { once: true },
    );
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
    const audio = makeAudio(name);
    audio.loop = true;
    audio.volume = Math.min(VOLUME, 0.35);
    loopAudio = audio;
    loopName = name;
    const play = audio.play();
    if (play && typeof play.catch === "function") {
      void play.catch(() => {
        /* autoplay blocked until gesture — retry once on next pointer */
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
    audio.addEventListener(
      "error",
      () => {
        missing.add(name);
        stopSoundLoop();
      },
      { once: true },
    );
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
