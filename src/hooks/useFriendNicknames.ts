"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadFriendNicknames,
  setFriendNickname as setNicknameRpc,
  type NicknameMap,
} from "@/lib/nicknames";

const NICKNAMES_CHANGED_EVENT = "redsss-nicknames-changed";

export function notifyNicknamesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NICKNAMES_CHANGED_EVENT));
}

export function useFriendNicknames() {
  const [map, setMap] = useState<NicknameMap>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { map: next } = await loadFriendNicknames();
    setMap(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    function onChanged() {
      void refresh();
    }
    window.addEventListener(NICKNAMES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NICKNAMES_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const nicknameFor = useCallback(
    (userId: string | null | undefined) =>
      userId ? map[userId] ?? null : null,
    [map],
  );

  const setNickname = useCallback(async (friendId: string, nickname: string) => {
    const { error } = await setNicknameRpc(friendId, nickname);
    if (!error) {
      const cleaned = nickname.trim();
      setMap((prev) => {
        const next = { ...prev };
        if (!cleaned) delete next[friendId];
        else next[friendId] = cleaned;
        return next;
      });
      notifyNicknamesChanged();
    }
    return { error };
  }, []);

  return useMemo(
    () => ({
      nicknames: map,
      nicknameFor,
      setNickname,
      refresh,
      loading,
    }),
    [map, nicknameFor, setNickname, refresh, loading],
  );
}
