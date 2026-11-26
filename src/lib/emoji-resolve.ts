"use client";

import { createClient } from "@/lib/supabase/client";
import type { ServerEmoji } from "@/lib/emoji";

/** In-memory cache so cross-server emoji IDs resolve once per session. */
const cache = new Map<string, ServerEmoji | null>();
const inflight = new Map<string, Promise<ServerEmoji | null>>();

export function seedEmojiCache(emojis: ServerEmoji[]) {
  for (const emoji of emojis) {
    cache.set(emoji.id, emoji);
  }
}

export function getCachedEmoji(id: string): ServerEmoji | null | undefined {
  if (!cache.has(id)) return undefined;
  return cache.get(id) ?? null;
}

/**
 * Resolve custom emoji rows by id for display.
 * RLS already allows authenticated SELECT on all server_emojis so viewers
 * can render emojis from servers they don't belong to (Discord-style).
 */
export async function resolveServerEmojisByIds(
  ids: string[],
): Promise<ServerEmoji[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];

  const missing = unique.filter(
    (id) => !cache.has(id) && !inflight.has(id),
  );

  if (missing.length > 0) {
    const batch = (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("server_emojis")
        .select("*")
        .in("id", missing);
      const found = new Map(
        ((data as ServerEmoji[]) ?? []).map((row) => [row.id, row]),
      );
      for (const id of missing) {
        cache.set(id, found.get(id) ?? null);
      }
    })();

    for (const id of missing) {
      inflight.set(
        id,
        batch
          .then(() => cache.get(id) ?? null)
          .finally(() => {
            inflight.delete(id);
          }),
      );
    }
  }

  await Promise.all(
    unique.map((id) => inflight.get(id) ?? Promise.resolve(cache.get(id) ?? null)),
  );

  return unique
    .map((id) => cache.get(id) ?? null)
    .filter((row): row is ServerEmoji => row != null);
}

export async function resolveServerEmojiById(
  id: string,
): Promise<ServerEmoji | null> {
  const rows = await resolveServerEmojisByIds([id]);
  return rows[0] ?? null;
}
