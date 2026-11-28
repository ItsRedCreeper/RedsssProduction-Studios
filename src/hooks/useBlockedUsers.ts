"use client";

import { useCallback, useEffect, useId, useMemo, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import {
  blockUser as blockUserRpc,
  loadBlockedIds,
  unblockUser as unblockUserRpc,
} from "@/lib/blocking";

const BLOCKED_CHANGED_EVENT = "redsss-blocked-changed";

export function notifyBlockedChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BLOCKED_CHANGED_EVENT));
}

type Snapshot = {
  ids: string[];
  loading: boolean;
  userId: string | null;
};

let snapshot: Snapshot = { ids: [], loading: true, userId: null };
const listeners = new Set<() => void>();
let loadPromise: Promise<void> | null = null;
let startedForUser: string | null = null;
let realtimeChannel: ReturnType<ReturnType<typeof createClient>["channel"]> | null =
  null;

function emit() {
  for (const listener of listeners) listener();
}

function setSnapshot(next: Snapshot) {
  snapshot = next;
  emit();
}

async function refreshBlocked(userId: string) {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const { ids: next } = await loadBlockedIds();
    if (snapshot.userId === userId) {
      setSnapshot({ ids: next, loading: false, userId });
    }
  })().finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

let bootTimer: number | null = null;

function ensureBlockedStore(userId: string | null) {
  if (typeof window === "undefined") return;
  if (bootTimer) {
    window.clearTimeout(bootTimer);
    bootTimer = null;
  }
  if (!userId) {
    startedForUser = null;
    if (realtimeChannel) {
      const supabase = createClient();
      void supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    setSnapshot({ ids: [], loading: false, userId: null });
    return;
  }
  if (startedForUser === userId) return;
  startedForUser = userId;
  setSnapshot({
    ids: snapshot.userId === userId ? snapshot.ids : [],
    loading: true,
    userId,
  });

  // Defer past messenger server/message boot (avoids PostgREST 504 stampede).
  bootTimer = window.setTimeout(() => {
    bootTimer = null;
    void refreshBlocked(userId);

    if (realtimeChannel) {
      const supabase = createClient();
      void supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    const supabase = createClient();
    realtimeChannel = supabase
      .channel(`blocked-users:shared:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "blocked_users",
          filter: `blocker_id=eq.${userId}`,
        },
        () => {
          void refreshBlocked(userId);
        },
      )
      .subscribe();
  }, 400);
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot() {
  return snapshot;
}

const serverSnapshot: Snapshot = { ids: [], loading: true, userId: null };

function getServerSnapshot() {
  return serverSnapshot;
}

/** Live set of user IDs the current user has blocked. Shared across mounts. */
export function useBlockedUsers() {
  const { user } = useCurrentProfile();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    ensureBlockedStore(user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    function onChanged() {
      const id = snapshot.userId;
      if (id) void refreshBlocked(id);
    }
    window.addEventListener(BLOCKED_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(BLOCKED_CHANGED_EVENT, onChanged);
  }, []);

  // Keep a unique id available for any future per-instance needs without
  // creating duplicate realtime topics.
  useId();

  const blockedSet = useMemo(() => new Set(state.ids), [state.ids]);

  const isBlocked = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return false;
      return blockedSet.has(userId);
    },
    [blockedSet],
  );

  const refresh = useCallback(async () => {
    const id = user?.id;
    if (!id) {
      setSnapshot({ ids: [], loading: false, userId: null });
      return;
    }
    await refreshBlocked(id);
  }, [user?.id]);

  const blockUser = useCallback(async (targetId: string) => {
    const { error } = await blockUserRpc(targetId);
    if (!error) notifyBlockedChanged();
    return { error };
  }, []);

  const unblockUser = useCallback(async (targetId: string) => {
    const { error } = await unblockUserRpc(targetId);
    if (!error) notifyBlockedChanged();
    return { error };
  }, []);

  return {
    blockedIds: state.ids,
    blockedSet,
    isBlocked,
    loading: state.loading,
    refresh,
    blockUser,
    unblockUser,
  };
}
