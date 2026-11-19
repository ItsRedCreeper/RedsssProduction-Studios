"use client";

import type { ReactNode } from "react";
import { CustomEmoji } from "@/components/messenger/CustomEmoji";
import {
  findEmojiByName,
  isComposerEmojiSlot,
  type ServerEmoji,
} from "@/lib/emoji";

type ComposerDraftMirrorProps = {
  draft: string;
  slots: Map<string, string>;
  catalog: Map<string, ServerEmoji>;
  customEmojis: ServerEmoji[];
  preferredServerId?: string | null;
  className?: string;
};

/** Renders draft text with custom emoji chips (for the transparent textarea overlay). */
export function ComposerDraftMirror({
  draft,
  slots,
  catalog,
  customEmojis,
  preferredServerId = null,
  className = "",
}: ComposerDraftMirrorProps) {
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < draft.length) {
    const ch = draft[i]!;
    if (isComposerEmojiSlot(ch)) {
      const token = slots.get(ch);
      if (token) {
        parts.push(
          <CustomEmoji
            key={key++}
            token={token}
            catalog={catalog}
            size={22}
            title=""
            className="mx-0.5"
          />,
        );
        i += 1;
        continue;
      }
    }

    const slice = draft.slice(i);
    const tokenMatch = slice.match(/^<(a?):([a-zA-Z0-9_]{2,32}):([0-9a-f-]{36})>/i);
    if (tokenMatch) {
      parts.push(
        <CustomEmoji
          key={key++}
          token={tokenMatch[0]}
          catalog={catalog}
          size={22}
          title=""
          className="mx-0.5"
        />,
      );
      i += tokenMatch[0].length;
      continue;
    }

    const short = slice.match(/^:([a-zA-Z0-9_]{2,32}):/);
    if (short) {
      const hit = findEmojiByName(short[1], customEmojis, preferredServerId);
      if (hit) {
        parts.push(
          <CustomEmoji
            key={key++}
            emoji={hit}
            catalog={catalog}
            size={22}
            title=""
            className="mx-0.5"
          />,
        );
        i += short[0].length;
        continue;
      }
    }

    // Plain run until next special.
    let next = i + 1;
    while (next < draft.length) {
      const c = draft[next]!;
      if (
        isComposerEmojiSlot(c) ||
        c === "<" ||
        c === ":" ||
        (c === "h" && draft.slice(next, next + 4) === "http")
      ) {
        break;
      }
      next += 1;
    }
    parts.push(<span key={key++}>{draft.slice(i, next)}</span>);
    i = next;
  }

  // Keep a trailing newline so empty last line still takes height like textarea.
  if (draft.endsWith("\n")) parts.push(<span key={key++}>{"\n"}</span>);

  return (
    <div
      aria-hidden
      className={`pointer-events-none whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`}
    >
      {parts}
    </div>
  );
}
