"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getClientUser } from "@/lib/supabase/auth-user";
import {
  ignoreUser as ignoreUserRpc,
  loadIgnoredIds,
  unignoreUser as unignoreUserRpc,
} from "@/lib/ignoring";

const IGNORED_CHANGED_EVENT = "redsss-ignored-changed";

export function notifyIgnoredChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(IGNORED_CHANGED_EVENT));
}

export function useIgnoredUsers() {
  const [ignoredIds, setIgnoredIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const channelSuffix = useId().replace(/:/g, "");

  const refresh = useCallback(async () => {
    const { ids } = await loadIgnoredIds();
    setIgnoredIds(ids);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Defer past messenger server/message boot (avoids PostgREST 504 stampede).
    const boot = window.setTimeout(() => {
      void refresh();
    }, 400);
    function onChanged() {
      void refresh();
    }
    window.addEventListener(IGNORED_CHANGED_EVENT, onChanged);
    return () => {
      window.clearTimeout(boot);
      window.removeEventListener(IGNORED_CHANGED_EVENT, onChanged);
    };
  }, [refresh]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const user = await getClientUser();
      if (cancelled || !user) return;
      channel = supabase
        .channel(`ignored-users:${user.id}:${channelSuffix}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "ignored_users",
            filter: `ignorer_id=eq.${user.id}`,
          },
          () => {
            void refresh();
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refresh, channelSuffix]);

  const ignoredSet = useMemo(() => new Set(ignoredIds), [ignoredIds]);

  const isIgnored = useCallback(
    (userId: string | null | undefined) =>
      !!userId && ignoredSet.has(userId),
    [ignoredSet],
  );

  const ignoreUser = useCallback(async (targetId: string) => {
    const { error } = await ignoreUserRpc(targetId);
    if (!error) {
      setIgnoredIds((prev) =>
        prev.includes(targetId) ? prev : [...prev, targetId],
      );
      notifyIgnoredChanged();
    }
    return { error };
  }, []);

  const unignoreUser = useCallback(async (targetId: string) => {
    const { error } = await unignoreUserRpc(targetId);
    if (!error) {
      setIgnoredIds((prev) => prev.filter((id) => id !== targetId));
      notifyIgnoredChanged();
    }
    return { error };
  }, []);

  return {
    ignoredIds,
    ignoredSet,
    isIgnored,
    ignoreUser,
    unignoreUser,
    refresh,
    loading,
  };
}
