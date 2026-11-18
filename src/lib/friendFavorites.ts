import { createClient } from "@/lib/supabase/client";

export async function loadFavoriteFriendIds() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ids: [] as string[],
      error: "Not signed in" as string | null,
    };
  }
  const { data, error } = await supabase
    .from("friend_favorites")
    .select("friend_id")
    .eq("user_id", user.id);
  if (error) {
    return { ids: [] as string[], error: error.message };
  }
  return {
    ids: (data ?? []).map((row) => row.friend_id),
    error: null as string | null,
  };
}

export async function setFriendFavorite(friendId: string, favorite: boolean) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as string | null };
  if (user.id === friendId) {
    return { error: "You can't favorite yourself." as string | null };
  }

  if (!favorite) {
    const { error } = await supabase
      .from("friend_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("friend_id", friendId);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("friend_favorites").upsert(
    {
      user_id: user.id,
      friend_id: friendId,
    },
    { onConflict: "user_id,friend_id" },
  );
  return { error: error?.message ?? null };
}
