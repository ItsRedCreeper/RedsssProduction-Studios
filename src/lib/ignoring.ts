import { createClient } from "@/lib/supabase/client";
import { getClientUser } from "@/lib/supabase/auth-user";
import type { FriendProfile } from "@/lib/friends";

export type IgnoredUser = FriendProfile & {
  ignored_at: string;
};

function asIgnoredProfile(
  row: Partial<FriendProfile> & { id: string; username: string },
  ignoredAt: string,
): IgnoredUser {
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
    ignored_at: ignoredAt,
  };
}

export async function loadIgnoredIds() {
  const supabase = createClient();
  const user = await getClientUser();
  if (!user) return { ids: [] as string[], error: null as string | null };
  const { data, error } = await supabase
    .from("ignored_users")
    .select("ignored_id")
    .eq("ignorer_id", user.id);
  if (error) return { ids: [] as string[], error: error.message };
  return {
    ids: (data ?? []).map((row) => row.ignored_id),
    error: null as string | null,
  };
}

export async function loadIgnoredUsers() {
  const supabase = createClient();
  const user = await getClientUser();
  if (!user) return { users: [] as IgnoredUser[], error: null as string | null };

  const { data, error } = await supabase
    .from("ignored_users")
    .select("ignored_id, created_at")
    .eq("ignorer_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return { users: [] as IgnoredUser[], error: error.message };

  const rows = data ?? [];
  if (rows.length === 0) {
    return { users: [] as IgnoredUser[], error: null as string | null };
  }

  const ids = rows.map((row) => row.ignored_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, username, avatar_url, status, status_text, bio, banner_url, banner_color, created_at",
    )
    .in("id", ids);
  if (profileError) {
    return { users: [] as IgnoredUser[], error: profileError.message };
  }

  const map = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const users: IgnoredUser[] = [];
  for (const row of rows) {
    const profile = map.get(row.ignored_id);
    if (!profile) continue;
    users.push(asIgnoredProfile(profile, row.created_at));
  }
  return { users, error: null as string | null };
}

export async function ignoreUser(targetId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("ignore_user", { target_id: targetId });
  return { error: error?.message ?? null };
}

export async function unignoreUser(targetId: string) {
  const supabase = createClient();
  const { error } = await supabase.rpc("unignore_user", { target_id: targetId });
  return { error: error?.message ?? null };
}
