import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import {
  normalizeProfileTags,
  type ProfileTagId,
} from "@/lib/profile-tags";

export type FriendStatus = "none" | "outgoing" | "incoming" | "friends";

export type FriendProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
  status: string;
  status_text: string | null;
  last_seen_at?: string | null;
  manual_status?: string | null;
  /** Only meaningful for your own profile UI — when idle/dnd/offline clears. */
  manual_status_expires_at?: string | null;
  /** Only meaningful for your own profile UI — when custom status clears. */
  status_text_expires_at?: string | null;
  bio: string | null;
  banner_url: string | null;
  banner_color: string | null;
  created_at?: string | null;
  /** Site reward tags (pioneer / funder) — not server roles. */
  profile_tags?: ProfileTagId[];
};

export type FriendEdge = Tables<"friends"> & {
  other: FriendProfile;
};

function asProfile(row: {
  id: string;
  username: string;
  avatar_url?: string | null;
  status?: string | null;
  status_text?: string | null;
  last_seen_at?: string | null;
  manual_status?: string | null;
  manual_status_expires_at?: string | null;
  status_text_expires_at?: string | null;
  bio?: string | null;
  banner_url?: string | null;
  banner_color?: string | null;
  created_at?: string | null;
  /** DB returns string[]; normalize to known tag ids. */
  profile_tags?: unknown;
}): FriendProfile {
  return {
    id: row.id,
    username: row.username,
    avatar_url: row.avatar_url ?? null,
    status: row.status ?? "offline",
    status_text: row.status_text ?? null,
    last_seen_at: row.last_seen_at ?? null,
    manual_status: row.manual_status ?? null,
    manual_status_expires_at: row.manual_status_expires_at ?? null,
    status_text_expires_at: row.status_text_expires_at ?? null,
    bio: row.bio ?? null,
    banner_url: row.banner_url ?? null,
    banner_color: row.banner_color ?? null,
    created_at: row.created_at ?? null,
    profile_tags: normalizeProfileTags(row.profile_tags),
  };
}

/** Discord-style long date for Member Since / Friends Since. */
export function formatSinceDate(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function loadFriendsSince(otherUserId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id === otherUserId) {
    return { friendsSince: null as string | null, error: null as string | null };
  }
  const { data, error } = await supabase
    .from("friends")
    .select("created_at, user_id, friend_id, status")
    .eq("status", "accepted")
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
  if (error) return { friendsSince: null as string | null, error: error.message };
  const match = (data ?? []).find(
    (row) =>
      (row.user_id === user.id && row.friend_id === otherUserId) ||
      (row.user_id === otherUserId && row.friend_id === user.id),
  );
  return {
    friendsSince: match?.created_at ?? null,
    error: null as string | null,
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
    .select("id, username, avatar_url, status, status_text, last_seen_at, manual_status, bio, banner_url, banner_color, profile_tags")
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

/** Friendship status between the signed-in user and another profile. */
export async function loadFriendshipWith(otherUserId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id === otherUserId) {
    return {
      status: "none" as FriendStatus,
      edgeId: null as string | null,
      error: null as string | null,
    };
  }

  const { data, error } = await supabase
    .from("friends")
    .select("id, user_id, friend_id, status")
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

  if (error) {
    return {
      status: "none" as FriendStatus,
      edgeId: null as string | null,
      error: error.message,
    };
  }

  const row = (data ?? []).find(
    (edge) =>
      (edge.user_id === user.id && edge.friend_id === otherUserId) ||
      (edge.user_id === otherUserId && edge.friend_id === user.id),
  );

  if (!row) {
    return {
      status: "none" as FriendStatus,
      edgeId: null as string | null,
      error: null as string | null,
    };
  }
  if (row.status === "accepted") {
    return {
      status: "friends" as FriendStatus,
      edgeId: row.id,
      error: null as string | null,
    };
  }
  if (row.status === "pending" && row.user_id === user.id) {
    return {
      status: "outgoing" as FriendStatus,
      edgeId: row.id,
      error: null as string | null,
    };
  }
  if (row.status === "pending" && row.friend_id === user.id) {
    return {
      status: "incoming" as FriendStatus,
      edgeId: row.id,
      error: null as string | null,
    };
  }
  return {
    status: "none" as FriendStatus,
    edgeId: null as string | null,
    error: null as string | null,
  };
}

export async function searchProfiles(query: string, excludeId: string) {
  const trimmed = query.trim();
  if (trimmed.length < 1) return { results: [] as FriendProfile[], error: null as string | null };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, status, status_text, last_seen_at, manual_status, bio, banner_url, banner_color, profile_tags")
    .ilike("username", `%${trimmed}%`)
    .neq("id", excludeId)
    .limit(20);
  if (error) return { results: [] as FriendProfile[], error: error.message };
  return {
    results: (data ?? []).map((row) => asProfile(row)),
    error: null as string | null,
  };
}

export async function sendFriendRequest(fromUserId: string, toUserId: string) {
  const supabase = createClient();

  // Ignored users cannot receive (or send via this client) friend requests.
  const { data: ignoredRow } = await supabase
    .from("ignored_users")
    .select("ignored_id")
    .eq("ignorer_id", fromUserId)
    .eq("ignored_id", toUserId)
    .maybeSingle();
  if (ignoredRow) {
    return {
      edge: null,
      error: "Unignore this user before sending a friend request.",
    };
  }

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

  // Notification comes from DB trigger `friend_request_notify` (includes sender name).
  return { edge: data, error: null as string | null };
}

const DM_INBOX_CHANGED_EVENT = "redsss-dm-inbox-changed";

/** Tell open messenger shells to reload the Home/DM list. */
export function notifyDmInboxChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DM_INBOX_CHANGED_EVENT));
}

export function subscribeDmInboxChanged(handler: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(DM_INBOX_CHANGED_EVENT, handler);
  return () => window.removeEventListener(DM_INBOX_CHANGED_EVENT, handler);
}

export async function acceptFriendRequest(requestId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("accept_friend_request", {
    request_id: requestId,
  });
  if (error) return { conversationId: null as string | null, error: error.message };
  // RPC creates the shared DM (if missing) and unhides it for both users.
  notifyDmInboxChanged();
  return { conversationId: data as string, error: null as string | null };
}

export async function declineOrCancelFriendRequest(requestId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: row, error: loadError } = await supabase
    .from("friends")
    .select("id, user_id, friend_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (loadError || !row) {
    return { error: loadError?.message ?? "Request not found." };
  }

  const declining =
    row.status === "pending" && row.friend_id === user.id; // I was the recipient
  const requesterId = row.user_id;

  const { error } = await supabase.from("friends").delete().eq("id", requestId);
  if (error) return { error: error.message };

  if (declining && requesterId !== user.id) {
    const { data: me } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    await supabase.rpc("create_notification", {
      p_user_id: requesterId,
      p_type: "friend_declined",
      p_title: `${me?.username ?? "Someone"} declined your friend request`,
      p_body: "You can send another request from Add Friend.",
      p_link: "/messenger/channels/@me?friends=add",
    });
  }

  return { error: null as string | null };
}

export async function removeFriendship(edgeId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: row, error: loadError } = await supabase
    .from("friends")
    .select("id, user_id, friend_id, status")
    .eq("id", edgeId)
    .maybeSingle();
  if (loadError || !row) {
    return { error: loadError?.message ?? "Friendship not found." };
  }

  const otherId = row.user_id === user.id ? row.friend_id : row.user_id;
  const { error } = await supabase.from("friends").delete().eq("id", edgeId);
  if (error) return { error: error.message };

  // Keep the shared DM for both people — unfriending is not the same as closing/hiding chat.
  if (otherId !== user.id) {
    const { data: mine } = await supabase
      .from("dm_participants")
      .select("conversation_id")
      .eq("user_id", user.id);
    const mineIds = new Set((mine ?? []).map((part) => part.conversation_id));
    if (mineIds.size > 0) {
      const { data: theirs } = await supabase
        .from("dm_participants")
        .select("conversation_id")
        .eq("user_id", otherId)
        .in("conversation_id", [...mineIds]);
      const sharedIds = (theirs ?? []).map((part) => part.conversation_id);
      if (sharedIds.length > 0) {
        await supabase
          .from("dm_participants")
          .update({ hidden: false })
          .in("conversation_id", sharedIds)
          .eq("user_id", user.id);
      }
    }
    notifyDmInboxChanged();
  }

  if (row.status === "accepted" && otherId !== user.id) {
    const { data: me } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    await supabase.rpc("create_notification", {
      p_user_id: otherId,
      p_type: "friend_removed",
      p_title: `${me?.username ?? "Someone"} removed you as a friend`,
      p_body: "Open Friends to manage your friends list.",
      p_link: "/messenger/channels/@me?friends=friends",
    });
  }

  return { error: null as string | null };
}

export async function ensureDmConversation(otherUserId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ensure_dm_conversation", {
    other_user_id: otherUserId,
  });
  if (error) return { conversationId: null as string | null, error: error.message };
  return { conversationId: data as string, error: null as string | null };
}

export type MutualFriend = {
  id: string;
  username: string;
  avatar_url: string | null;
  status: string;
};

export type MutualServer = {
  id: string;
  name: string;
  icon_url: string | null;
};

export async function loadMutualFriends(otherUserId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_mutual_friends", {
    other_user_id: otherUserId,
  });
  if (error) return { friends: [] as MutualFriend[], error: error.message };
  return {
    friends: (data ?? []).map((row) => ({
      id: row.id,
      username: row.username,
      avatar_url: row.avatar_url,
      status: row.status,
    })),
    error: null as string | null,
  };
}

export async function loadMutualServers(otherUserId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_mutual_servers", {
    other_user_id: otherUserId,
  });
  if (error) return { servers: [] as MutualServer[], error: error.message };
  return {
    servers: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      icon_url: row.icon_url,
    })),
    error: null as string | null,
  };
}

export async function uploadProfileAsset(
  userId: string,
  file: File,
  kind: "avatar" | "banner",
) {
  const { GIF_NOT_ALLOWED_HERE, isAllowedStaticImage } = await import(
    "@/lib/upload-image-types"
  );
  if (!isAllowedStaticImage(file)) {
    return { url: null as string | null, error: GIF_NOT_ALLOWED_HERE };
  }
  const { fitImageToMaxBytes, PROFILE_ASSET_MAX_BYTES } = await import(
    "@/lib/compress-image"
  );
  const fitted = await fitImageToMaxBytes(file, PROFILE_ASSET_MAX_BYTES, {
    maxEdge: kind === "avatar" ? 1024 : 2560,
  });
  if (fitted.error) {
    return { url: null as string | null, error: fitted.error };
  }

  const uploadFile = fitted.file;
  const supabase = createClient();
  const ext = uploadFile.name.split(".").pop()?.toLowerCase() || "webp";
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("profile-assets")
    .upload(path, uploadFile, {
      contentType: uploadFile.type || "image/webp",
      upsert: true,
    });
  if (error) return { url: null as string | null, error: error.message };
  const { data } = supabase.storage.from("profile-assets").getPublicUrl(path);
  return { url: data.publicUrl, error: null as string | null };
}
