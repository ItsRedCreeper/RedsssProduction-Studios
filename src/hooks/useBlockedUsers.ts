"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
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

/** Live set of user IDs the current user has blocked. */
export function useBlockedUsers() {
  const { user } = useCurrentProfile();
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // Stable unique topic per hook instance (avoid Math.random — breaks prerender).
  const instanceId = useId();
  const channelKey = `blocked-users:${instanceId}`;

  const refresh = useCallback(async () => {
    if (!user) {
      setIds([]);
      setLoading(false);
      return;
    }
    const { ids: next } = await loadBlockedIds();
    setIds(next);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`${channelKey}:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "blocked_users",
          filter: `blocker_id=eq.${user.id}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    function onChanged() {
      void refresh();
    }
    window.addEventListener(BLOCKED_CHANGED_EVENT, onChanged);

    return () => {
      window.removeEventListener(BLOCKED_CHANGED_EVENT, onChanged);
      void supabase.removeChannel(channel);
    };
  }, [user, refresh, channelKey]);

  const blockedSet = useMemo(() => new Set(ids), [ids]);

  const isBlocked = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return false;
      return blockedSet.has(userId);
    },
    [blockedSet],
  );

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
    blockedIds: ids,
    blockedSet,
    isBlocked,
    loading,
    refresh,
    blockUser,
    unblockUser,
  };
}
