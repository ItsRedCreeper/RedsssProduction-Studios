"use client";

import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

const STORAGE_KEY = "redsss-voice-chat-sidebar-width";
export const VOICE_CHAT_MIN = 280;
export const VOICE_CHAT_MAX = 480;
export const VOICE_CHAT_DEFAULT = 340;

function clamp(width: number) {
  return Math.min(VOICE_CHAT_MAX, Math.max(VOICE_CHAT_MIN, Math.round(width)));
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

  const beginResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = width;
    handle.setPointerCapture(event.pointerId);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    function onMove(moveEvent: PointerEvent) {
      setWidth(clamp(startWidth + (startX - moveEvent.clientX)));
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
