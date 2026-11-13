"use client";

import { useCallback, useSyncExternalStore } from "react";

export type VoiceMenuPanel =
  | "input"
  | "output"
  | "input-devices"
  | "output-devices";

export type VoiceMenuState = {
  ownerId: string;
  panel: VoiceMenuPanel;
  anchor: {
    top: number;
    right: number;
    bottom: number;
    left: number;
    width: number;
    height: number;
  };
} | null;

let state: VoiceMenuState = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

function rectToAnchor(rect: DOMRect) {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function openVoiceMenu(
  ownerId: string,
  panel: VoiceMenuPanel,
  rect: DOMRect,
) {
  state = {
    ownerId,
    panel,
    anchor: rectToAnchor(rect),
  };
  emit();
}

export function closeVoiceMenu(ownerId?: string) {
  if (!state) return;
  if (ownerId && state.ownerId !== ownerId) return;
  state = null;
  emit();
}

export function useVoiceMenu(ownerId: string) {
  const menu = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const open = useCallback(
    (panel: VoiceMenuPanel, rect: DOMRect) => {
      openVoiceMenu(ownerId, panel, rect);
    },
    [ownerId],
  );

  const close = useCallback(() => {
    closeVoiceMenu(ownerId);
  }, [ownerId]);

  const closeAny = useCallback(() => {
    closeVoiceMenu();
  }, []);

  const mine = menu?.ownerId === ownerId ? menu : null;

  return {
    menu: mine,
    anyOpen: !!menu,
    open,
    close,
    closeAny,
  };
}
