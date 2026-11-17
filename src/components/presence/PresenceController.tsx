"use client";

import { useEffect, useRef } from "react";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import {
  HEARTBEAT_INTERVAL_MS,
  IDLE_AFTER_MS,
  TAB_PING_MS,
  clearExpiredStatusText,
  computeAutoEffectiveStatus,
  heartbeatPresence,
  type ManualStatus,
} from "@/lib/presence";
import type { PresenceStatus } from "@/components/messenger/data";
import { notifyProfileUpdated } from "@/hooks/useCurrentProfile";

type TabPing = {
  tabId: string;
  focused: boolean;
  lastInputAt: number;
  updatedAt: number;
};

const CHANNEL = "redsss-presence-tabs";

function readManual(profileManual: string | null | undefined): ManualStatus {
  const v = (profileManual ?? "online").toLowerCase();
  if (v === "idle" || v === "dnd" || v === "offline" || v === "online") {
    return v;
  }
  return "online";
}

/**
 * Owns local presence detection for the signed-in user:
 * focus, idle timer, multi-tab coordination, heartbeat, offline on last tab close.
 */
export function PresenceController() {
  const { user, profile } = useCurrentProfile();
  const tabIdRef = useRef<string | null>(null);
  const lastInputRef = useRef(0);
  const tabsRef = useRef<Map<string, TabPing>>(new Map());
  const lastWrittenRef = useRef<PresenceStatus | null>(null);
  const manualRef = useRef<ManualStatus>("online");
  const bcRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    manualRef.current = readManual(
      (profile as { manual_status?: string | null } | null)?.manual_status ??
        profile?.status,
    );
  }, [profile]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    if (!tabIdRef.current) {
      tabIdRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `tab-${Date.now().toString(36)}`;
    }
    const tabId = tabIdRef.current;
    lastInputRef.current = Date.now();
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bcRef.current = bc;
    } catch {
      bc = null;
    }

    function publishLocal() {
      const ping: TabPing = {
        tabId,
        focused: typeof document !== "undefined" && !document.hidden,
        lastInputAt: lastInputRef.current,
        updatedAt: Date.now(),
      };
      tabsRef.current.set(tabId, ping);
      try {
        bc?.postMessage({ type: "ping", ping });
      } catch {
        /* ignore */
      }
    }

    function pruneTabs(now: number) {
      for (const [id, ping] of tabsRef.current) {
        if (now - ping.updatedAt > TAB_PING_MS * 4) {
          tabsRef.current.delete(id);
        }
      }
    }

    function aggregate(now: number): {
      anyOpen: boolean;
      anyFocused: boolean;
      inputIdle: boolean;
    } {
      pruneTabs(now);
      publishLocal();
      const pings = [...tabsRef.current.values()];
      if (pings.length === 0) {
        return { anyOpen: true, anyFocused: !document.hidden, inputIdle: false };
      }
      const anyFocused = pings.some((p) => p.focused);
      const newestInput = Math.max(...pings.map((p) => p.lastInputAt));
      const inputIdle = now - newestInput >= IDLE_AFTER_MS;
      return { anyOpen: true, anyFocused, inputIdle };
    }

    function desiredStatus(now: number): PresenceStatus {
      const { anyFocused, inputIdle } = aggregate(now);
      return computeAutoEffectiveStatus({
        manual: manualRef.current,
        tabFocused: anyFocused,
        inputIdle,
      });
    }

    async function writeStatus(force = false) {
      if (cancelled) return;
      const next = desiredStatus(Date.now());
      if (!force && lastWrittenRef.current === next) {
        // Still heartbeat so last_seen_at stays fresh.
        await heartbeatPresence({ status: next });
        return;
      }
      lastWrittenRef.current = next;
      const { error } = await heartbeatPresence({ status: next });
      if (!error) notifyProfileUpdated();
    }

    function onVisibility() {
      publishLocal();
      void writeStatus(true);
    }

    function onInput() {
      lastInputRef.current = Date.now();
      publishLocal();
    }

    function onMessage(event: MessageEvent) {
      const data = event.data as
        | { type: "ping"; ping: TabPing }
        | { type: "bye"; tabId: string }
        | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "ping" && data.ping?.tabId) {
        tabsRef.current.set(data.ping.tabId, data.ping);
      } else if (data.type === "bye" && data.tabId) {
        tabsRef.current.delete(data.tabId);
        void writeStatus(true);
      }
    }

    function onPageHide() {
      try {
        bc?.postMessage({ type: "bye", tabId });
      } catch {
        /* ignore */
      }
      tabsRef.current.delete(tabId);
      // If this was the last known tab, mark offline immediately.
      pruneTabs(Date.now());
      const others = [...tabsRef.current.keys()].filter((id) => id !== tabId);
      if (others.length === 0) {
        void heartbeatPresence({ status: "offline" });
      }
    }

    if (bc) bc.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("blur", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);

    const inputEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "wheel",
    ] as const;
    for (const name of inputEvents) {
      window.addEventListener(name, onInput, { passive: true });
    }

    publishLocal();
    void writeStatus(true);

    const pingTimer = window.setInterval(() => {
      publishLocal();
    }, TAB_PING_MS);

    const beatTimer = window.setInterval(() => {
      void writeStatus(false);
    }, HEARTBEAT_INTERVAL_MS);

    const idleCheck = window.setInterval(() => {
      void writeStatus(true);
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(pingTimer);
      window.clearInterval(beatTimer);
      window.clearInterval(idleCheck);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("blur", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      for (const name of inputEvents) {
        window.removeEventListener(name, onInput);
      }
      try {
        bc?.postMessage({ type: "bye", tabId });
      } catch {
        /* ignore */
      }
      bc?.removeEventListener("message", onMessage);
      bc?.close();
      bcRef.current = null;
      // Best-effort offline if no other tabs replied recently.
      tabsRef.current.delete(tabId);
      pruneTabs(Date.now());
      if (tabsRef.current.size === 0) {
        void heartbeatPresence({ status: "offline" });
      }
    };
  }, [user?.id]);

  // Sync manual preference from profile (StatusPicker) without looping on status.
  const lastManualApplied = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !profile) return;
    const raw =
      (profile as { manual_status?: string | null }).manual_status ?? "online";
    if (lastManualApplied.current === raw) return;
    lastManualApplied.current = raw;
    const manual = readManual(raw);
    manualRef.current = manual;
    const focused = typeof document !== "undefined" && !document.hidden;
    const inputIdle = Date.now() - lastInputRef.current >= IDLE_AFTER_MS;
    const next = computeAutoEffectiveStatus({
      manual,
      tabFocused: focused,
      inputIdle,
    });
    lastWrittenRef.current = next;
    void heartbeatPresence({ status: next });
  }, [
    user?.id,
    (profile as { manual_status?: string | null } | null)?.manual_status,
  ]);

  // Clear timed custom statuses when their timer elapses.
  useEffect(() => {
    if (!user || !profile) return;
    const expiresAt = (
      profile as { status_text_expires_at?: string | null }
    ).status_text_expires_at;
    if (!expiresAt) return;
    const at = Date.parse(expiresAt);
    if (Number.isNaN(at)) return;

    function maybeClear() {
      if (at <= Date.now()) void clearExpiredStatusText();
    }
    maybeClear();
    const timer = window.setInterval(maybeClear, 30_000);
    return () => window.clearInterval(timer);
  }, [
    user?.id,
    (profile as { status_text_expires_at?: string | null } | null)
      ?.status_text_expires_at,
  ]);

  return null;
}
