"use client";

import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

const STORAGE_KEY = "redsss-friends-panel-width";
export const FRIENDS_PANEL_MIN = 280;
export const FRIENDS_PANEL_MAX = 520;
export const FRIENDS_PANEL_DEFAULT = 384;

function clamp(width: number) {
  return Math.min(FRIENDS_PANEL_MAX, Math.max(FRIENDS_PANEL_MIN, Math.round(width)));
}

export function useFriendsPanelWidth() {
  const [width, setWidth] = useState(FRIENDS_PANEL_DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? Number(raw) : FRIENDS_PANEL_DEFAULT;
      setWidth(Number.isFinite(parsed) ? clamp(parsed) : FRIENDS_PANEL_DEFAULT);
    } catch {
      setWidth(FRIENDS_PANEL_DEFAULT);
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

  /** Drag the left edge; moving left widens the right-docked panel. */
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
