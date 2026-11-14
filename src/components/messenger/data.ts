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

export function statusLabel(status: string | null | undefined) {
  if (!status) return "Offline";
  return status.charAt(0).toUpperCase() + status.slice(1);
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
    .select("id, username, avatar_url, status, status_text, bio, banner_url")
    .in("id", unique);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    username: row.username,
    avatar_url: row.avatar_url,
    status: row.status,
    status_text: row.status_text,
    bio: row.bio,
    banner_url: row.banner_url,
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

export async function loadChannelMessages(channelId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error || !data) {
    return { messages: [] as ChatMessage[], error: error?.message ?? "Failed to load messages" };
  }

  const present = new Set(data.map((row) => row.id));
  const missingParentIds = [
    ...new Set(
      data
        .map((row) => row.reply_to_id)
        .filter((id): id is string => !!id && !present.has(id)),
    ),
  ];

  let parents: Tables<"messages">[] = [];
  if (missingParentIds.length > 0) {
    const parentResult = await supabase
      .from("messages")
      .select("*")
      .in("id", missingParentIds);
    parents = parentResult.data ?? [];
  }

  const profileIds = [
    ...data.map((row) => row.user_id),
    ...parents.map((row) => row.user_id),
  ];
  const profiles = await loadProfiles(profileIds);
  return { messages: hydrateMessages(data, profiles, parents), error: null };
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
    attachment_url: null,
    attachment_type: null,
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
    };
    current.count += 1;
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
  const supabase = createClient();
  const path = `${userId}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage
    .from("message-attachments")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) return { url: null as string | null, error: error.message };
  const { data } = supabase.storage.from("message-attachments").getPublicUrl(path);
  return { url: data.publicUrl, error: null as string | null };
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
