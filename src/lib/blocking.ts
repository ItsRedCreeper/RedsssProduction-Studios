import { createClient } from "@/lib/supabase/client";
import { getClientUser } from "@/lib/supabase/auth-user";
import type { FriendProfile } from "@/lib/friends";

export type BlockedUser = FriendProfile & {
  blocked_at: string;
};

function asBlockedProfile(
  row: Partial<FriendProfile> & { id: string; username: string },
  blockedAt: string,
): BlockedUser {
  return {
    id: row.id,
    username: row.username,
    avatar_url: row.avatar_url ?? null,
    status: row.status ?? "offline",
    status_text: row.status_text ?? null,
    bio: row.bio ?? null,
    banner_url: row.banner_url ?? null,
    banner_color: row.banner_color ?? null,
    created_at: row.created_at ?? null,
    blocked_at: blockedAt,
  };
}

/** IDs the current user has blocked (outgoing blocks only). */
export async function loadBlockedIds() {
  const supabase = createClient();
  const user = await getClientUser();
  if (!user) {
    return { ids: [] as string[], error: null as string | null };
  }
  const { data, error } = await supabase
    .from("blocked_users")
    .select("blocked_id")
    .eq("blocker_id", user.id);
  if (error) return { ids: [] as string[], error: error.message };
  return {
    ids: (data ?? []).map((row) => row.blocked_id),
    error: null as string | null,
  };
}

export async function loadBlockedUsers() {
  const supabase = createClient();
  const user = await getClientUser();
  if (!user) {
    return { users: [] as BlockedUser[], error: null as string | null };
  }

  const { data, error } = await supabase
    .from("blocked_users")
    .select("blocked_id, created_at")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return { users: [] as BlockedUser[], error: error.message };

  const rows = data ?? [];
  if (rows.length === 0) {
    return { users: [] as BlockedUser[], error: null as string | null };
  }

  const ids = rows.map((row) => row.blocked_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, username, avatar_url, status, status_text, bio, banner_url, banner_color, created_at",
    )
    .in("id", ids);
  if (profileError) {
    return { users: [] as BlockedUser[], error: profileError.message };
  }

  const map = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const users: BlockedUser[] = [];
  for (const row of rows) {
    const profile = map.get(row.blocked_id);
    if (!profile) continue;
    users.push(asBlockedProfile(profile, row.created_at));
  }
  return { users, error: null as string | null };
}

/** True if current user has blocked otherUserId (outgoing). */
export async function loadIsBlocked(otherUserId: string) {
  const supabase = createClient();
  const user = await getClientUser();
  if (!user || user.id === otherUserId) {
    return { blocked: false, error: null as string | null };
  }
  const { data, error } = await supabase
    .from("blocked_users")
    .select("id")
    .eq("blocker_id", user.id)
    .eq("blocked_id", otherUserId)
    .maybeSingle();
  if (error) return { blocked: false, error: error.message };
  return { blocked: !!data, error: null as string | null };
}

/** Either-direction block check via SECURITY DEFINER RPC helper. */
export async function loadAreUsersBlocked(otherUserId: string) {
  const supabase = createClient();
  const user = await getClientUser();
  if (!user || user.id === otherUserId) {
    return { blocked: false, error: null as string | null };
  }
  const { data, error } = await supabase.rpc("are_users_blocked", {
    a: user.id,
    b: otherUserId,
  });
  if (error) return { blocked: false, error: error.message };
  return { blocked: Boolean(data), error: null as string | null };
}

/** True if otherUserId has blocked the current user (incoming). */
export async function loadIsBlockedBy(otherUserId: string) {
  const supabase = createClient();
  const user = await getClientUser();
  if (!user || user.id === otherUserId) {
    return { blockedByThem: false, error: null as string | null };
  }
  const { data, error } = await supabase.rpc("is_blocked_by", {
    other_id: otherUserId,
  });
  if (error) return { blockedByThem: false, error: error.message };
  return { blockedByThem: Boolean(data), error: null as string | null };
}

export type BlockRelation = {
  blockedByMe: boolean;
  blockedByThem: boolean;
  either: boolean;
};

/** Outgoing + incoming block relation for profile / voice UI. */
export async function loadBlockRelation(otherUserId: string) {
  const [outgoing, incoming] = await Promise.all([
    loadIsBlocked(otherUserId),
    loadIsBlockedBy(otherUserId),
  ]);
  const blockedByMe = outgoing.blocked;
  const blockedByThem = incoming.blockedByThem;
  return {
    relation: {
      blockedByMe,
      blockedByThem,
      either: blockedByMe || blockedByThem,
    } satisfies BlockRelation,
    error: outgoing.error ?? incoming.error,
  };
}

/** Map RPC/RLS block failures to a clear user-facing message. */
export function friendlyBlockDmMessage(error: string | null | undefined) {
  if (!error) return null;
  const lower = error.toLowerCase();
  if (
    lower.includes("cannot message blocked user") ||
    lower.includes("blocked user") ||
    lower.includes("are_users_blocked")
  ) {
    return "This user has blocked you.";
  }
  // Real blocks still fail INSERT via RLS; keep the copy friendly instead of raw policy text.
  if (
    lower.includes("row-level security") &&
    lower.includes("dm_messages")
  ) {
    return "You can't message this user right now.";
  }
  return null;
}

export async function blockUser(targetId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("block_user", { target_id: targetId });
  return { error: error?.message ?? null };
}

export async function unblockUser(targetId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("unblock_user", {
    target_id: targetId,
  });
  return { error: error?.message ?? null };
}
