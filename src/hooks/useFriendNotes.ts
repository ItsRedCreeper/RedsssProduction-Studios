"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { saveFriendNote as saveNoteRpc } from "@/lib/friendNotes";

const NOTES_CHANGED_EVENT = "redsss-notes-changed";

export function notifyNotesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTES_CHANGED_EVENT));
}

async function loadAllNotes() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {} as Record<string, string>;
  const { data } = await supabase
    .from("friend_notes")
    .select("friend_id, note")
    .eq("user_id", user.id);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const text = row.note?.trim();
    if (text) map[row.friend_id] = text;
  }
  return map;
}

export function useFriendNotes() {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await loadAllNotes();
    setNotes(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    function onChanged() {
      void refresh();
    }
    window.addEventListener(NOTES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const noteFor = useCallback(
    (friendId: string | null | undefined) =>
      friendId ? notes[friendId] ?? null : null,
    [notes],
  );

  const saveNote = useCallback(
    async (friendId: string, note: string) => {
      const cleaned = note.trim();
      setNotes((prev) => {
        const next = { ...prev };
        if (!cleaned) delete next[friendId];
        else next[friendId] = cleaned.slice(0, 500);
        return next;
      });
      const { error } = await saveNoteRpc(friendId, note);
      if (error) {
        await refresh();
        return { error };
      }
      notifyNotesChanged();
      return { error: null as string | null };
    },
    [refresh],
  );

  return useMemo(
    () => ({
      notes,
      noteFor,
      saveNote,
      refresh,
      loading,
    }),
    [notes, noteFor, saveNote, refresh, loading],
  );
}
