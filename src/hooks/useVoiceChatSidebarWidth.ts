"use client";

import {
  useCallback,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

const STORAGE_KEY = "redsss-voice-chat-sidebar-width";

/** Discord-like floor — composer + messages stay usable. */
export const VOICE_CHAT_MIN = 340;
export const VOICE_CHAT_MAX = 520;
export const VOICE_CHAT_DEFAULT = 380;
/** Keep at least this much width for the voice stage while dragging. */
const VOICE_STAGE_MIN = 280;

function clamp(width: number, maxAllowed = VOICE_CHAT_MAX) {
  const upper = Math.min(VOICE_CHAT_MAX, Math.max(VOICE_CHAT_MIN, maxAllowed));
  return Math.min(upper, Math.max(VOICE_CHAT_MIN, Math.round(width)));
}

/** Right-side panel: drag left edge — left increases width, right shrinks. */
export function useVoiceChatSidebarWidth() {
  const [width, setWidth] = useState(VOICE_CHAT_DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? Number(raw) : VOICE_CHAT_DEFAULT;
      setWidth(Number.isFinite(parsed) ? clamp(parsed) : VOICE_CHAT_DEFAULT);
    } catch {
      setWidth(VOICE_CHAT_DEFAULT);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, [width, ready]);

  // If the window shrinks, don't leave a saved width that starves the stage.
  useEffect(() => {
    function onResize() {
      setWidth((current) => {
        const parent = document.querySelector(
          "[data-voice-chat-row]",
        ) as HTMLElement | null;
        if (!parent) return clamp(current);
        const maxForStage = parent.clientWidth - VOICE_STAGE_MIN;
        return clamp(current, maxForStage);
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const beginResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = width;
    const row = handle.closest("[data-voice-chat-row]") as HTMLElement | null;
    handle.setPointerCapture(event.pointerId);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    function onMove(moveEvent: PointerEvent) {
      const maxForStage = row
        ? row.clientWidth - VOICE_STAGE_MIN
        : VOICE_CHAT_MAX;
      setWidth(
        clamp(startWidth + (startX - moveEvent.clientX), maxForStage),
      );
    }

    function onUp(upEvent: PointerEvent) {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }, [width]);

  return { width, beginResize };
}
