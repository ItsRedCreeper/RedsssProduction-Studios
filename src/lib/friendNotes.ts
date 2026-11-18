import { createClient } from "@/lib/supabase/client";

export async function loadFriendNote(friendId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { note: null as string | null, error: "Not signed in" as string | null };
  }
  const { data, error } = await supabase
    .from("friend_notes")
    .select("note")
    .eq("user_id", user.id)
    .eq("friend_id", friendId)
    .maybeSingle();
  if (error) return { note: null as string | null, error: error.message };
  return { note: data?.note ?? null, error: null as string | null };
}

export async function loadFriendNotesMap(friendIds: string[]) {
  const unique = [...new Set(friendIds.filter(Boolean))];
  if (unique.length === 0) {
    return {
      notes: {} as Record<string, string>,
      error: null as string | null,
    };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      notes: {} as Record<string, string>,
      error: "Not signed in" as string | null,
    };
  }
  const { data, error } = await supabase
    .from("friend_notes")
    .select("friend_id, note")
    .eq("user_id", user.id)
    .in("friend_id", unique);
  if (error) {
    return {
      notes: {} as Record<string, string>,
      error: error.message,
    };
  }
  const notes: Record<string, string> = {};
  for (const row of data ?? []) {
    const text = row.note?.trim();
    if (text) notes[row.friend_id] = text;
  }
  return { notes, error: null as string | null };
}

/** Empty note deletes the row so the list stays clean. */
export async function saveFriendNote(friendId: string, note: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as string | null };
  if (user.id === friendId) {
    return { error: "You can't note yourself." as string | null };
  }

  const cleaned = note.trim();
  if (!cleaned) {
    const { error } = await supabase
      .from("friend_notes")
      .delete()
      .eq("user_id", user.id)
      .eq("friend_id", friendId);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("friend_notes").upsert(
    {
      user_id: user.id,
      friend_id: friendId,
      note: cleaned.slice(0, 500),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,friend_id" },
  );
  return { error: error?.message ?? null };
}
