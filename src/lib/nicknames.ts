import { createClient } from "@/lib/supabase/client";

export type NicknameMap = Record<string, string>;

export async function loadFriendNicknames() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { map: {} as NicknameMap, error: null as string | null };

  const { data, error } = await supabase
    .from("friend_nicknames")
    .select("friend_id, nickname")
    .eq("user_id", user.id);
  if (error) return { map: {} as NicknameMap, error: error.message };

  const map: NicknameMap = {};
  for (const row of data ?? []) {
    map[row.friend_id] = row.nickname;
  }
  return { map, error: null as string | null };
}

export async function setFriendNickname(friendId: string, nickname: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_friend_nickname", {
    p_friend_id: friendId,
    p_nickname: nickname,
  });
  return { error: error?.message ?? null };
}

/** Prefer personal nickname, then server nickname, then username. */
export function displayNameFor(
  userId: string,
  username: string,
  opts?: {
    nicknames?: NicknameMap | null;
    serverNickname?: string | null;
  },
) {
  const personal = opts?.nicknames?.[userId]?.trim();
  if (personal) return personal;
  const server = opts?.serverNickname?.trim();
  if (server) return server;
  return username;
}
