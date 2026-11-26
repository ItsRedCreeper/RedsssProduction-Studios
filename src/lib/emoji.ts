export type ServerEmoji = {
  id: string;
  server_id: string;
  name: string;
  url: string;
  animated: boolean;
  created_by: string;
  created_at: string;
};

/** Discord-style custom emoji token: <:name:id> or <a:name:id> */
export const CUSTOM_EMOJI_RE = /<(a?):([a-zA-Z0-9_]{2,32}):([0-9a-f-]{36})>/gi;

/** Typed shortcode `:name:` — not already inside a <:name:id> token. */
export const EMOJI_SHORTCODE_RE = /(?<![<a]):([a-zA-Z0-9_]{2,32}):/g;

export function customEmojiToken(emoji: Pick<ServerEmoji, "id" | "name" | "animated">) {
  return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
}

/** Prefer current-server emoji when multiple servers share a name. */
export function findEmojiByName(
  name: string,
  catalog: ServerEmoji[],
  preferredServerId?: string | null,
): ServerEmoji | null {
  const needle = name.toLowerCase();
  const matches = catalog.filter((emoji) => emoji.name.toLowerCase() === needle);
  if (matches.length === 0) return null;
  if (preferredServerId) {
    const local = matches.find((emoji) => emoji.server_id === preferredServerId);
    if (local) return local;
  }
  return matches[0] ?? null;
}

/**
 * Turn typed `:name:` into Discord-style `<:name:id>` / `<a:name:id>` tokens
 * before send/edit so messages store a stable emoji id.
 * Same-name collisions prefer `preferredServerId` (the channel's server).
 */
export function resolveEmojiShortcodes(
  text: string,
  catalog: ServerEmoji[],
  preferredServerId?: string | null,
): string {
  if (!text || catalog.length === 0) return text;
  return text.replace(EMOJI_SHORTCODE_RE, (full, name: string) => {
    const hit = findEmojiByName(name, catalog, preferredServerId);
    return hit ? customEmojiToken(hit) : full;
  });
}

/**
 * Composer chip placeholder: ideographic space (≈1em advance) so the caret
 * lines up with a 1em mirror chip. Tokens live in a parallel ordered list.
 */
export const COMPOSER_SLOT_CHAR = "\u3000";

export function makeComposerSlot(_seq?: number) {
  return COMPOSER_SLOT_CHAR;
}

/**
 * Whether the composer draft can be sent.
 * Custom emoji chips use U+3000 (ideographic space), which String.trim()
 * strips — so a lone emoji chip must not be treated as empty.
 */
export function composerDraftHasContent(draft: string) {
  if (!draft) return false;
  if (draft.includes(COMPOSER_SLOT_CHAR)) return true;
  for (let i = 0; i < draft.length; i++) {
    const code = draft.charCodeAt(i);
    if (code >= 0xe000 && code <= 0xf8ff) return true;
  }
  return draft.trim().length > 0;
}

/** Length of a composer emoji slot starting at index, or 0. */
export function isComposerEmojiSlotAt(
  text: string,
  index: number,
  /** When using ordered slot lists, every ideographic space is a chip. */
  orderedSlots?: boolean,
) {
  if (orderedSlots) {
    return text[index] === COMPOSER_SLOT_CHAR ? 1 : 0;
  }
  const code = text.charCodeAt(index);
  if (code >= 0xe000 && code <= 0xf8ff) return 1;
  // Legacy: ideographic space + PUA / ZW id
  if (text[index] === "\u3000") {
    const mark = text.charCodeAt(index + 1);
    if (mark >= 0xe000 && mark <= 0xf8ff) return 2;
    if (index + 13 <= text.length) {
      let ok = true;
      for (let i = 1; i <= 12; i++) {
        const c = text[index + i];
        if (c !== "\u200B" && c !== "\u200C") {
          ok = false;
          break;
        }
      }
      if (ok) return 13;
    }
  }
  return 0;
}

/** @deprecated Use isComposerEmojiSlotAt */
export function isComposerEmojiSlot(ch: string) {
  const code = ch.codePointAt(0) ?? 0;
  return (
    ch === COMPOSER_SLOT_CHAR ||
    ch === "\u200B" ||
    ch === "\u200C" ||
    (code >= 0xe000 && code <= 0xf8ff)
  );
}

export function expandComposerDraft(
  text: string,
  slots: Map<string, string> | string[],
  catalog: ServerEmoji[],
  preferredServerId?: string | null,
) {
  let out = "";
  let i = 0;
  let slotIndex = 0;
  const ordered = Array.isArray(slots);
  while (i < text.length) {
    const len = isComposerEmojiSlotAt(text, i, ordered);
    if (len > 0) {
      if (ordered) {
        out += slots[slotIndex] ?? COMPOSER_SLOT_CHAR;
        slotIndex += 1;
      } else {
        const key = text.slice(i, i + len);
        out += slots.get(key) ?? key;
      }
      i += len;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return resolveEmojiShortcodes(out, catalog, preferredServerId);
}

/** Index of the slot that contains/ends at `pos` (ordered list mode). */
export function composerSlotIndexAt(text: string, pos: number) {
  let n = 0;
  for (let i = 0; i < text.length; ) {
    if (text[i] === COMPOSER_SLOT_CHAR) {
      if (i < pos && pos <= i + 1) return n;
      if (i >= pos) return -1;
      n += 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  return -1;
}

/** How many slot chars appear in `text` before `end`. */
export function countComposerSlotsBefore(text: string, end: number) {
  let n = 0;
  const lim = Math.min(end, text.length);
  for (let i = 0; i < lim; i++) {
    if (text[i] === COMPOSER_SLOT_CHAR) n += 1;
  }
  return n;
}

export function findEmojisByNamePrefix(
  query: string,
  catalog: ServerEmoji[],
  preferredServerId?: string | null,
) {
  const q = query.trim().toLowerCase();
  const matches = catalog.filter((emoji) =>
    q ? emoji.name.toLowerCase().includes(q) : true,
  );
  matches.sort((a, b) => {
    if (preferredServerId) {
      const aLocal = a.server_id === preferredServerId ? 0 : 1;
      const bLocal = b.server_id === preferredServerId ? 0 : 1;
      if (aLocal !== bLocal) return aLocal - bLocal;
    }
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.server_id.localeCompare(b.server_id);
  });
  return matches.slice(0, 12);
}

export function parseCustomEmojiToken(token: string): {
  animated: boolean;
  name: string;
  id: string;
} | null {
  const match = /^<(a?):([a-zA-Z0-9_]{2,32}):([0-9a-f-]{36})>$/i.exec(token.trim());
  if (!match) return null;
  return {
    animated: match[1] === "a",
    name: match[2],
    id: match[3],
  };
}

export function isCustomEmojiToken(token: string) {
  return !!parseCustomEmojiToken(token);
}

export function sanitizeEmojiName(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
}

export type UnicodeEmoji = {
  char: string;
  name: string;
  keywords?: string[];
};

export const UNICODE_EMOJI_GROUPS: {
  id: string;
  label: string;
  emojis: UnicodeEmoji[];
}[] = [
  {
    id: "smileys",
    label: "Smileys",
    emojis: [
      { char: "😀", name: "grinning" },
      { char: "😁", name: "beaming" },
      { char: "😂", name: "joy", keywords: ["laugh", "lol"] },
      { char: "🤣", name: "rofl" },
      { char: "😊", name: "blush" },
      { char: "😍", name: "heart_eyes" },
      { char: "🤩", name: "star_struck" },
      { char: "😘", name: "kissing_heart" },
      { char: "😎", name: "sunglasses", keywords: ["cool"] },
      { char: "🤔", name: "thinking" },
      { char: "😏", name: "smirk" },
      { char: "😒", name: "unamused" },
      { char: "🙄", name: "eye_roll" },
      { char: "😢", name: "cry" },
      { char: "😭", name: "sob" },
      { char: "😤", name: "triumph" },
      { char: "😠", name: "angry" },
      { char: "🤬", name: "cursing" },
      { char: "😱", name: "scream" },
      { char: "😴", name: "sleeping" },
      { char: "🤯", name: "exploding_head" },
      { char: "😈", name: "smiling_imp" },
      { char: "👻", name: "ghost" },
      { char: "💀", name: "skull" },
      { char: "👽", name: "alien" },
      { char: "🤖", name: "robot" },
      { char: "💩", name: "poop" },
      { char: "🙈", name: "see_no_evil" },
      { char: "🙉", name: "hear_no_evil" },
      { char: "🙊", name: "speak_no_evil" },
    ],
  },
  {
    id: "gestures",
    label: "Gestures",
    emojis: [
      { char: "👍", name: "thumbsup", keywords: ["+1", "like"] },
      { char: "👎", name: "thumbsdown", keywords: ["-1"] },
      { char: "👏", name: "clap" },
      { char: "🙌", name: "raised_hands" },
      { char: "👋", name: "wave" },
      { char: "🤝", name: "handshake" },
      { char: "✌️", name: "v" },
      { char: "🤞", name: "fingers_crossed" },
      { char: "🤟", name: "love_you_gesture" },
      { char: "👌", name: "ok_hand" },
      { char: "👊", name: "punch" },
      { char: "✊", name: "fist" },
      { char: "🫵", name: "point_you" },
      { char: "👀", name: "eyes" },
      { char: "🧠", name: "brain" },
      { char: "💪", name: "muscle" },
      { char: "🙏", name: "pray" },
      { char: "🫡", name: "salute" },
    ],
  },
  {
    id: "hearts",
    label: "Hearts",
    emojis: [
      { char: "❤️", name: "heart", keywords: ["love", "red"] },
      { char: "🧡", name: "orange_heart" },
      { char: "💛", name: "yellow_heart" },
      { char: "💚", name: "green_heart" },
      { char: "💙", name: "blue_heart" },
      { char: "💜", name: "purple_heart" },
      { char: "🖤", name: "black_heart" },
      { char: "🤍", name: "white_heart" },
      { char: "💔", name: "broken_heart" },
      { char: "💕", name: "two_hearts" },
      { char: "💖", name: "sparkling_heart" },
      { char: "💗", name: "growing_heart" },
      { char: "💘", name: "cupid" },
      { char: "💯", name: "100" },
    ],
  },
  {
    id: "objects",
    label: "Objects",
    emojis: [
      { char: "🔥", name: "fire", keywords: ["lit", "hot"] },
      { char: "✨", name: "sparkles" },
      { char: "⭐", name: "star" },
      { char: "🌟", name: "glowing_star" },
      { char: "⚡", name: "zap" },
      { char: "💥", name: "boom" },
      { char: "🎉", name: "tada", keywords: ["party"] },
      { char: "🎊", name: "confetti_ball" },
      { char: "🏆", name: "trophy" },
      { char: "🎮", name: "video_game" },
      { char: "🎯", name: "dart" },
      { char: "🚀", name: "rocket" },
      { char: "✅", name: "white_check_mark" },
      { char: "❌", name: "x" },
      { char: "⚠️", name: "warning" },
      { char: "📌", name: "pushpin" },
      { char: "📎", name: "paperclip" },
      { char: "💡", name: "bulb" },
      { char: "🔒", name: "lock" },
      { char: "🔑", name: "key" },
      { char: "🎵", name: "musical_note" },
      { char: "📷", name: "camera" },
      { char: "💻", name: "computer" },
      { char: "📱", name: "iphone" },
    ],
  },
  {
    id: "nature",
    label: "Nature",
    emojis: [
      { char: "🌞", name: "sun" },
      { char: "🌙", name: "moon" },
      { char: "🌈", name: "rainbow" },
      { char: "☁️", name: "cloud" },
      { char: "❄️", name: "snowflake" },
      { char: "🌸", name: "cherry_blossom" },
      { char: "🍀", name: "four_leaf_clover" },
      { char: "🌲", name: "evergreen_tree" },
      { char: "🐶", name: "dog" },
      { char: "🐱", name: "cat" },
      { char: "🦊", name: "fox" },
      { char: "🐻", name: "bear" },
      { char: "🐼", name: "panda" },
      { char: "🐸", name: "frog" },
      { char: "🐝", name: "bee" },
      { char: "🦄", name: "unicorn" },
    ],
  },
  {
    id: "food",
    label: "Food",
    emojis: [
      { char: "🍕", name: "pizza" },
      { char: "🍔", name: "burger" },
      { char: "🍟", name: "fries" },
      { char: "🌮", name: "taco" },
      { char: "🍣", name: "sushi" },
      { char: "🍦", name: "ice_cream" },
      { char: "🍩", name: "doughnut" },
      { char: "🍪", name: "cookie" },
      { char: "☕", name: "coffee" },
      { char: "🍺", name: "beer" },
      { char: "🍷", name: "wine" },
      { char: "🍰", name: "cake" },
    ],
  },
];

export const QUICK_REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "👀", "🎉"] as const;

export function emojiDisplayName(
  token: string,
  catalog?: Map<string, ServerEmoji>,
  serverNamesById?: Record<string, string>,
) {
  const custom = parseCustomEmojiToken(token);
  if (custom) {
    const row = catalog?.get(custom.id);
    const name = row?.name ?? custom.name;
    const serverLabel =
      row && serverNamesById?.[row.server_id]
        ? ` · ${serverNamesById[row.server_id]}`
        : "";
    return `:${name}:${serverLabel}`;
  }
  for (const group of UNICODE_EMOJI_GROUPS) {
    const hit = group.emojis.find((item) => item.char === token);
    if (hit) return `:${hit.name}:`;
  }
  return token;
}

/** True when the message is only custom emoji tokens (+ whitespace). */
export function isCustomEmojiOnlyMessage(content: string) {
  if (!content.trim()) return false;
  const tokenRe = /<(a?):([a-zA-Z0-9_]{2,32}):([0-9a-f-]{36})>/gi;
  if (!tokenRe.test(content)) return false;
  const leftover = content
    .replace(/<(a?):([a-zA-Z0-9_]{2,32}):([0-9a-f-]{36})>/gi, "")
    .replace(/\s+/g, "");
  return leftover.length === 0;
}

/** Discord-style jumbo: message is only custom and/or unicode emoji (+ spaces). */
export function isEmojiOnlyMessage(content: string) {
  if (!content.trim()) return false;
  if (isCustomEmojiOnlyMessage(content)) return true;
  const withoutCustom = content.replace(
    /<(a?):([a-zA-Z0-9_]{2,32}):([0-9a-f-]{36})>/gi,
    "",
  );
  // Strip unicode emoji sequences (incl. ZWJ / variation selectors) and spaces.
  const leftover = withoutCustom
    .replace(/\p{Extended_Pictographic}(\uFE0F|\uFE0E)?(\u200D\p{Extended_Pictographic}(\uFE0F|\uFE0E)?)*/gu, "")
    .replace(/[\u200D\uFE0F\uFE0E]/g, "")
    .replace(/\s+/g, "");
  return leftover.length === 0 && /\p{Extended_Pictographic}/u.test(content);
}

/** Inline emoji size in mixed messages (Discord ~22px). */
export const MESSAGE_EMOJI_INLINE_PX = 22;
/** Jumbo size when the message is emoji-only. */
export const MESSAGE_EMOJI_JUMBO_PX = 48;

export function filterUnicodeEmojis(query: string) {
  const q = query.trim().toLowerCase().replace(/^:|:$/g, "");
  if (!q) return UNICODE_EMOJI_GROUPS;
  return UNICODE_EMOJI_GROUPS.map((group) => ({
    ...group,
    emojis: group.emojis.filter((emoji) => {
      if (emoji.name.includes(q)) return true;
      if (emoji.keywords?.some((k) => k.includes(q))) return true;
      return emoji.char.includes(q);
    }),
  })).filter((group) => group.emojis.length > 0);
}
