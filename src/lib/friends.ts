import { createClient } from "@/lib/supabase/client";
import { messengerHomePath } from "@/lib/messenger-routes";
import type { Tables } from "@/lib/supabase/database.types";

export type FriendStatus = "none" | "outgoing" | "incoming" | "friends";

export type FriendProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
  status: string;
  status_text: string | null;
  bio: string | null;
  banner_url: string | null;
};

export type FriendEdge = Tables<"friends"> & {
  other: FriendProfile;
};

function asProfile(row: Partial<FriendProfile> & { id: string; username: string }): FriendProfile {
  return {
    id: row.id,
    username: row.username,
    avatar_url: row.avatar_url ?? null,
    status: row.status ?? "offline",
    status_text: row.status_text ?? null,
    bio: row.bio ?? null,
    banner_url: row.banner_url ?? null,
  };
}

export async function loadFriendEdges(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("friends")
    .select("*")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
  if (error) return { edges: [] as FriendEdge[], error: error.message };

  const rows = data ?? [];
  const otherIds = rows.map((row) =>
    row.user_id === userId ? row.friend_id : row.user_id,
  );
  const unique = [...new Set(otherIds)];
  if (unique.length === 0) return { edges: [] as FriendEdge[], error: null as string | null };

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, status, status_text, bio, banner_url")
    .in("id", unique);
  if (profileError) return { edges: [] as FriendEdge[], error: profileError.message };

  const map = new Map((profiles ?? []).map((profile) => [profile.id, asProfile(profile)]));
  const edges: FriendEdge[] = [];
  for (const row of rows) {
    const otherId = row.user_id === userId ? row.friend_id : row.user_id;
    const other = map.get(otherId);
    if (!other) continue;
    edges.push({ ...row, other });
  }
  return { edges, error: null as string | null };
}

export function splitFriendEdges(userId: string, edges: FriendEdge[]) {
  const friends: FriendEdge[] = [];
  const incoming: FriendEdge[] = [];
  const outgoing: FriendEdge[] = [];
  for (const edge of edges) {
    if (edge.status === "accepted") {
      friends.push(edge);
      continue;
    }
    if (edge.status !== "pending") continue;
    if (edge.friend_id === userId) incoming.push(edge);
    else if (edge.user_id === userId) outgoing.push(edge);
  }
  friends.sort((a, b) => a.other.username.localeCompare(b.other.username));
  incoming.sort((a, b) => a.other.username.localeCompare(b.other.username));
  outgoing.sort((a, b) => a.other.username.localeCompare(b.other.username));
  return { friends, incoming, outgoing };
}

export function relationshipFor(
  userId: string,
  otherId: string,
  edges: FriendEdge[],
): { status: FriendStatus; edge: FriendEdge | null } {
  const edge =
    edges.find(
      (row) =>
        (row.user_id === userId && row.friend_id === otherId) ||
        (row.user_id === otherId && row.friend_id === userId),
    ) ?? null;
  if (!edge) return { status: "none", edge: null };
  if (edge.status === "accepted") return { status: "friends", edge };
  if (edge.user_id === userId) return { status: "outgoing", edge };
  return { status: "incoming", edge };
}

export async function searchProfiles(query: string, excludeId: string) {
  const trimmed = query.trim();
  if (trimmed.length < 1) return { results: [] as FriendProfile[], error: null as string | null };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, status, status_text, bio, banner_url")
    .ilike("username", `%${trimmed}%`)
    .neq("id", excludeId)
    .limit(20);
  if (error) return { results: [] as FriendProfile[], error: error.message };
  return {
    results: (data ?? []).map((row) => asProfile(row)),
    error: null as string | null,
  };
}

export async function sendFriendRequest(fromUserId: string, toUserId: string, fromUsername: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("friends")
    .insert({
      user_id: fromUserId,
      friend_id: toUserId,
      status: "pending",
    })
    .select("*")
    .single();
  if (error || !data) return { edge: null, error: error?.message ?? "Could not send request." };

  await supabase.rpc("create_notification", {
    p_user_id: toUserId,
    p_type: "friend_request",
    p_title: "Friend request",
    p_body: `${fromUsername} sent you a friend request.`,
    p_link: `${messengerHomePath()}?friends=pending`,
  });

  return { edge: data, error: null as string | null };
}

export async function acceptFriendRequest(requestId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("accept_friend_request", {
    request_id: requestId,
  });
  if (error) return { conversationId: null as string | null, error: error.message };
  return { conversationId: data as string, error: null as string | null };
}

export async function declineOrCancelFriendRequest(requestId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("friends").delete().eq("id", requestId);
  return { error: error?.message ?? null };
}

export async function removeFriendship(edgeId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("friends").delete().eq("id", edgeId);
  return { error: error?.message ?? null };
}

export async function ensureDmConversation(otherUserId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ensure_dm_conversation", {
    other_user_id: otherUserId,
  });
  if (error) return { conversationId: null as string | null, error: error.message };
  return { conversationId: data as string, error: null as string | null };
}

export async function uploadProfileAsset(
  userId: string,
  file: File,
  kind: "avatar" | "banner",
) {
  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("profile-assets").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (error) return { url: null as string | null, error: error.message };
  const { data } = supabase.storage.from("profile-assets").getPublicUrl(path);
  return { url: data.publicUrl, error: null as string | null };
}
