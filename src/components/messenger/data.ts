import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import type {
  ChatMessage,
  MiniProfile,
  Reaction,
  ReactionGroup,
  ReplyPreview,
} from "@/components/messenger/types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const month = MONTHS[date.getMonth()];
  const day = date.getDate();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
}

/** Short time for compact message gutter hover (Discord-style). */
export function formatMessageTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

/** Discord groups consecutive same-author messages within ~7 minutes. */
export const MESSAGE_GROUP_WINDOW_MS = 7 * 60 * 1000;

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Whether `current` should render without avatar/username under `previous`
 * (Discord message grouping).
 */
export function shouldGroupWithPrevious(
  previous:
    | {
        user_id: string;
        created_at: string;
        reply_to_id?: string | null;
        reply_to?: unknown;
      }
    | null
    | undefined,
  current: {
    user_id: string;
    created_at: string;
    reply_to_id?: string | null;
    reply_to?: unknown;
  },
) {
  if (!previous) return false;
  if (previous.user_id !== current.user_id) return false;
  // Replies start a new group so the reply preview sits under a full header.
  if (current.reply_to_id || current.reply_to) return false;
  const prevT = Date.parse(previous.created_at);
  const curT = Date.parse(current.created_at);
  if (Number.isNaN(prevT) || Number.isNaN(curT)) return false;
  if (Math.abs(curT - prevT) > MESSAGE_GROUP_WINDOW_MS) return false;
  if (!sameLocalDay(new Date(prevT), new Date(curT))) return false;
  return true;
}

/** Stable local calendar-day key for divider / grouping checks. */
export function localDayKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Day divider label: Today / Yesterday / Month Day, Year */
export function formatDayDivider(iso: string, now = Date.now()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const current = new Date(now);
  if (sameLocalDay(date, current)) return "Today";
  const yesterday = new Date(current);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameLocalDay(date, yesterday)) return "Yesterday";
  const month = MONTHS[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  if (year === current.getFullYear()) return `${month} ${day}`;
  return `${month} ${day}, ${year}`;
}

export type PresenceStatus = "online" | "idle" | "dnd" | "offline" | "invisible";

export function statusLabel(status: string | null | undefined) {
  const value = (status ?? "offline").toLowerCase();
  if (value === "online") return "Online";
  if (value === "idle") return "Idle";
  if (value === "dnd") return "Do Not Disturb";
  if (value === "invisible") return "Invisible";
  return "Offline";
}

export function isPresenceOnline(status: string | null | undefined) {
  const value = (status ?? "offline").toLowerCase();
  return value !== "offline" && value !== "invisible" && value !== "";
}

export function statusDotClass(status: string | null | undefined) {
  const value = (status ?? "offline").toLowerCase();
  if (value === "online") return "bg-[#23a559]";
  if (value === "idle") return "bg-[#f0b232]";
  if (value === "dnd") return "bg-[#dc2626]";
  return "bg-[#80848e]";
}

export function byPosition<T extends { position: number; name: string }>(
  a: T,
  b: T,
) {
  if (a.position !== b.position) return a.position - b.position;
  return a.name.localeCompare(b.name);
}

export function safeFileName(name: string) {
  const cleaned = name.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
  return (cleaned || "file").slice(0, 80);
}

export function makeInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function inviteUrl(code: string) {
  if (typeof window === "undefined") return `/invite/${code}`;
  return `${window.location.origin}/invite/${code}`;
}

export async function loadProfiles(ids: string[]): Promise<MiniProfile[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, username, avatar_url, status, status_text, last_seen_at, bio, banner_url, banner_color",
    )
    .in("id", unique);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    username: row.username,
    avatar_url: row.avatar_url,
    status: row.status,
    status_text: row.status_text,
    last_seen_at: row.last_seen_at,
    bio: row.bio,
    banner_url: row.banner_url,
    banner_color: row.banner_color,
  }));
}

export function hydrateMessages(
  rows: Tables<"messages">[],
  profiles: MiniProfile[],
  parents: Tables<"messages">[] = [],
): ChatMessage[] {
  const profileMap = new Map(
    profiles.map((profile) => [
      profile.id,
      { username: profile.username, avatar_url: profile.avatar_url },
    ]),
  );
  const byId = new Map<string, Tables<"messages">>();
  for (const row of parents) byId.set(row.id, row);
  for (const row of rows) byId.set(row.id, row);

  return rows.map((row) => {
    const parent = row.reply_to_id ? byId.get(row.reply_to_id) : undefined;
    const reply: ReplyPreview | null = parent
      ? {
          id: parent.id,
          content: parent.content,
          user_id: parent.user_id,
          profiles: profileMap.get(parent.user_id) ?? null,
        }
      : null;
    return {
      ...row,
      profiles: profileMap.get(row.user_id) ?? null,
      reply_to: reply,
    };
  });
}

/** Newest messages loaded per channel/DM open; scroll-up fetches the next page. */
export const CHANNEL_MESSAGE_PAGE_SIZE = 100;

async function hydrateMessageRows(
  rowsNewestFirst: Tables<"messages">[],
) {
  const rows = [...rowsNewestFirst].reverse();
  const present = new Set(rows.map((row) => row.id));
  const missingParentIds = [
    ...new Set(
      rows
        .map((row) => row.reply_to_id)
        .filter((id): id is string => !!id && !present.has(id)),
    ),
  ];

  const supabase = createClient();
  let parents: Tables<"messages">[] = [];
  if (missingParentIds.length > 0) {
    const parentResult = await supabase
      .from("messages")
      .select("*")
      .in("id", missingParentIds);
    parents = parentResult.data ?? [];
  }

  const profiles = await loadProfiles([
    ...rows.map((row) => row.user_id),
    ...parents.map((row) => row.user_id),
  ]);
  return hydrateMessages(rows, profiles, parents);
}

export async function loadChannelMessages(channelId: string) {
  const supabase = createClient();
  // Newest N first, then reverse so the timeline stays chronological.
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(CHANNEL_MESSAGE_PAGE_SIZE);

  if (error || !data) {
    return {
      messages: [] as ChatMessage[],
      hasMore: false,
      error: error?.message ?? "Failed to load messages",
    };
  }

  const messages = await hydrateMessageRows(data);
  return {
    messages,
    hasMore: data.length >= CHANNEL_MESSAGE_PAGE_SIZE,
    error: null as string | null,
  };
}

type PublicPreviewMember = {
  user_id: string;
  nickname: string | null;
  joined_at: string;
  username: string;
  avatar_url: string | null;
  status: string;
  status_text: string | null;
  last_seen_at: string | null;
  bio: string | null;
  banner_url: string | null;
  banner_color: string | null;
};

export type PublicServerPreview = {
  server: Tables<"servers">;
  channels: Tables<"channels">[];
  categories: Tables<"channel_categories">[];
  members: PublicPreviewMember[];
  member_count: number;
};

export async function loadPublicServerPreview(serverId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_public_server_preview", {
    p_server_id: serverId,
  });
  if (error) {
    return { preview: null as PublicServerPreview | null, error: error.message };
  }
  if (!data || typeof data !== "object") {
    return {
      preview: null as PublicServerPreview | null,
      error: "This server is not available for preview.",
    };
  }
  const raw = data as Record<string, unknown>;
  const server = raw.server as Tables<"servers"> | null;
  if (!server?.id) {
    return {
      preview: null as PublicServerPreview | null,
      error: "This server is not available for preview.",
    };
  }
  return {
    preview: {
      server,
      channels: (raw.channels as Tables<"channels">[]) ?? [],
      categories: (raw.categories as Tables<"channel_categories">[]) ?? [],
      members: (raw.members as PublicPreviewMember[]) ?? [],
      member_count: Number(raw.member_count) || 0,
    } satisfies PublicServerPreview,
    error: null as string | null,
  };
}

type PublicPreviewMessageRow = Tables<"messages"> & {
  profiles?: {
    id: string;
    username: string;
    avatar_url: string | null;
    status?: string;
    status_text?: string | null;
    last_seen_at?: string | null;
    bio?: string | null;
    banner_url?: string | null;
    banner_color?: string | null;
  } | null;
};

export async function loadPublicChannelMessages(
  channelId: string,
  opts?: { limit?: number; before?: string | null },
) {
  const supabase = createClient();
  const limit = opts?.limit ?? CHANNEL_MESSAGE_PAGE_SIZE;
  const { data, error } = await supabase.rpc("get_public_channel_messages", {
    p_channel_id: channelId,
    p_limit: limit,
    p_before: opts?.before ?? null,
  });
  if (error) {
    return {
      messages: [] as ChatMessage[],
      hasMore: false,
      error: error.message,
    };
  }
  const rows = (Array.isArray(data) ? data : []) as PublicPreviewMessageRow[];
  const messages: ChatMessage[] = rows.map((row) => {
    const { profiles, ...message } = row;
    return {
      ...message,
      profiles: profiles
        ? { username: profiles.username, avatar_url: profiles.avatar_url }
        : null,
      reply_to: null,
    };
  });
  return {
    messages,
    hasMore: rows.length >= limit,
    error: null as string | null,
  };
}

/** Older page: messages strictly before `beforeCreatedAt` (oldest currently loaded). */
export async function loadOlderChannelMessages(
  channelId: string,
  beforeCreatedAt: string,
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .lt("created_at", beforeCreatedAt)
    .order("created_at", { ascending: false })
    .limit(CHANNEL_MESSAGE_PAGE_SIZE);

  if (error || !data) {
    return {
      messages: [] as ChatMessage[],
      hasMore: false,
      error: error?.message ?? "Failed to load older messages",
    };
  }

  const messages = await hydrateMessageRows(data);
  return {
    messages,
    hasMore: data.length >= CHANNEL_MESSAGE_PAGE_SIZE,
    error: null as string | null,
  };
}

export async function loadOlderDmMessages(
  conversationId: string,
  beforeCreatedAt: string,
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dm_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .lt("created_at", beforeCreatedAt)
    .order("created_at", { ascending: false })
    .limit(CHANNEL_MESSAGE_PAGE_SIZE);

  if (error || !data) {
    return {
      messages: [] as ChatMessage[],
      hasMore: false,
      error: error?.message ?? "Failed to load older messages",
    };
  }

  const rows = dmRowsToMessages(data);
  const messages = await hydrateMessageRows(rows);
  return {
    messages,
    hasMore: data.length >= CHANNEL_MESSAGE_PAGE_SIZE,
    error: null as string | null,
  };
}

export async function loadSingleMessage(messageId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle();
  if (error || !data) return null;

  let parents: Tables<"messages">[] = [];
  if (data.reply_to_id) {
    const parent = await supabase
      .from("messages")
      .select("*")
      .eq("id", data.reply_to_id)
      .maybeSingle();
    if (parent.data) parents = [parent.data];
  }

  const profiles = await loadProfiles([
    data.user_id,
    ...parents.map((row) => row.user_id),
  ]);
  return hydrateMessages([data], profiles, parents)[0] ?? null;
}

export function dmRowsToMessages(rows: Tables<"dm_messages">[]): Tables<"messages">[] {
  return rows.map((row) => ({
    id: row.id,
    channel_id: row.conversation_id,
    user_id: row.user_id,
    content: row.content,
    reply_to_id: row.reply_to_id,
    pinned: false,
    edited_at: row.edited_at,
    attachment_url: row.attachment_url ?? null,
    attachment_type: row.attachment_type ?? null,
    attachments: row.attachments ?? [],
    created_at: row.created_at,
  }));
}

export function groupReactions(
  reactions: Reaction[],
  userId: string | null,
): Record<string, ReactionGroup[]> {
  const buckets = new Map<string, Map<string, ReactionGroup>>();
  for (const reaction of reactions) {
    let emojis = buckets.get(reaction.message_id);
    if (!emojis) {
      emojis = new Map();
      buckets.set(reaction.message_id, emojis);
    }
    const current = emojis.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      reacted: false,
      userIds: [] as string[],
    };
    current.count += 1;
    if (!current.userIds.includes(reaction.user_id)) {
      current.userIds.push(reaction.user_id);
    }
    if (userId && reaction.user_id === userId) current.reacted = true;
    emojis.set(reaction.emoji, current);
  }

  const result: Record<string, ReactionGroup[]> = {};
  for (const [messageId, emojis] of buckets) {
    result[messageId] = [...emojis.values()];
  }
  return result;
}

export function upsertReaction(prev: Reaction[], row: Reaction): Reaction[] {
  if (prev.some((reaction) => reaction.id === row.id)) return prev;
  const tempIndex = prev.findIndex(
    (reaction) =>
      reaction.id.startsWith("temp-") &&
      reaction.message_id === row.message_id &&
      reaction.user_id === row.user_id &&
      reaction.emoji === row.emoji,
  );
  if (tempIndex >= 0) {
    const next = [...prev];
    next[tempIndex] = row;
    return next;
  }
  return [...prev, row];
}

export async function uploadAttachment(userId: string, file: File) {
  const { fitImageToMaxBytes, MESSAGE_ATTACHMENT_MAX_BYTES } = await import(
    "@/lib/compress-image"
  );
  const { measureImage } = await import("@/lib/message-media");
  const fitted = await fitImageToMaxBytes(file, MESSAGE_ATTACHMENT_MAX_BYTES, {
    maxEdge: 4096,
  });
  if (fitted.error) {
    return {
      attachment: null as null,
      error: fitted.error,
    };
  }

  const uploadFile = fitted.file;
  const dims = await measureImage(uploadFile);
  const supabase = createClient();
  const path = `${userId}/${Date.now()}-${safeFileName(uploadFile.name)}`;
  const { error } = await supabase.storage
    .from("message-attachments")
    .upload(path, uploadFile, {
      contentType: uploadFile.type || "application/octet-stream",
      upsert: false,
    });
  if (error) {
    return { attachment: null as null, error: error.message };
  }
  const { data } = supabase.storage.from("message-attachments").getPublicUrl(path);
  return {
    attachment: {
      url: data.publicUrl,
      type: uploadFile.type || "application/octet-stream",
      name: uploadFile.name,
      size: uploadFile.size,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
    },
    error: null as string | null,
  };
}

export async function saveChannelRead(
  userId: string,
  channelId: string,
  at: string,
) {
  const supabase = createClient();
  const row = { user_id: userId, channel_id: channelId, last_read_at: at };
  const upserted = await supabase
    .from("user_channel_reads")
    .upsert(row, { onConflict: "user_id,channel_id" });
  if (!upserted.error) return null;

  const updated = await supabase
    .from("user_channel_reads")
    .update({ last_read_at: at })
    .eq("user_id", userId)
    .eq("channel_id", channelId)
    .select("user_id");
  if (!updated.error && (updated.data?.length ?? 0) > 0) return null;

  const inserted = await supabase.from("user_channel_reads").insert(row);
  return inserted.error?.message ?? upserted.error.message;
}

export async function saveVoiceState(row: Tables<"voice_states">) {
  const supabase = createClient();
  const upserted = await supabase
    .from("voice_states")
    .upsert(row, { onConflict: "user_id" });
  if (!upserted.error) return null;

  const updated = await supabase
    .from("voice_states")
    .update({
      channel_id: row.channel_id,
      server_id: row.server_id,
      muted: row.muted,
      deafened: row.deafened,
      updated_at: row.updated_at,
    })
    .eq("user_id", row.user_id)
    .select("user_id");
  if (!updated.error && (updated.data?.length ?? 0) > 0) return null;

  const inserted = await supabase.from("voice_states").insert(row);
  return inserted.error?.message ?? upserted.error.message;
}

export async function fetchLastMessageMap(channelIds: string[]) {
  const map: Record<string, string> = {};
  if (channelIds.length === 0) return map;
  const supabase = createClient();
  await Promise.all(
    channelIds.map(async (channelId) => {
      const { data } = await supabase
        .from("messages")
        .select("created_at")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.created_at) map[channelId] = data.created_at;
    }),
  );
  return map;
}
