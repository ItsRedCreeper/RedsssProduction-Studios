"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadFavoriteFriendIds,
  setFriendFavorite as setFavoriteRpc,
} from "@/lib/friendFavorites";

const FAVORITES_CHANGED_EVENT = "redsss-favorites-changed";

export function notifyFavoritesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT));
}

export function useFriendFavorites() {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { ids: next } = await loadFavoriteFriendIds();
    setIds(new Set(next));
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    function onChanged() {
      void refresh();
    }
    window.addEventListener(FAVORITES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(FAVORITES_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const isFavorite = useCallback(
    (friendId: string | null | undefined) =>
      !!friendId && ids.has(friendId),
    [ids],
  );

  const setFavorite = useCallback(async (friendId: string, favorite: boolean) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (favorite) next.add(friendId);
      else next.delete(friendId);
      return next;
    });
    const { error } = await setFavoriteRpc(friendId, favorite);
    if (error) {
      setIds((prev) => {
        const next = new Set(prev);
        if (favorite) next.delete(friendId);
        else next.add(friendId);
        return next;
      });
      return { error };
    }
    notifyFavoritesChanged();
    return { error: null as string | null };
  }, []);

  return useMemo(
    () => ({
      favoriteIds: ids,
      isFavorite,
      setFavorite,
      refresh,
      loading,
    }),
    [ids, isFavorite, setFavorite, refresh, loading],
  );
}
