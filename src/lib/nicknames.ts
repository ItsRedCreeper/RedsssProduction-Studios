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

/**
 * Discord-style name resolution:
 * - Friend nicknames: DMs, friends list, your view of their profile — NOT servers.
 * - Server nicknames: that server only (member list, messages, voice).
 * - Otherwise: username (our stand-in for display name).
 */
export function displayNameFor(
  userId: string,
  username: string,
  opts?: {
    /** Private friend nickname (DM / friends contexts only). */
    friendNickname?: string | null;
    nicknames?: NicknameMap | null;
    /** Per-server nickname. */
    serverNickname?: string | null;
    /** When true, allow friend nickname. Default false (server-safe). */
    allowFriendNickname?: boolean;
  },
) {
  if (opts?.allowFriendNickname) {
    const personal =
      opts.friendNickname?.trim() ||
      opts.nicknames?.[userId]?.trim() ||
      null;
    if (personal) return personal;
  }
  const server = opts?.serverNickname?.trim();
  if (server) return server;
  return username;
}
