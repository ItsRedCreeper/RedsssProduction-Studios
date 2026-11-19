"use client";

import type { ReactNode } from "react";
import { CustomEmoji } from "@/components/messenger/CustomEmoji";
import {
  COMPOSER_SLOT_CHAR,
  findEmojiByName,
  type ServerEmoji,
} from "@/lib/emoji";

type ComposerDraftMirrorProps = {
  draft: string;
  /** Discord tokens parallel to each COMPOSER_SLOT_CHAR in draft. */
  slots: string[];
  catalog: Map<string, ServerEmoji>;
  customEmojis: ServerEmoji[];
  preferredServerId?: string | null;
  /** Measured textarea advance for one emoji slot — keeps caret aligned with chips. */
  slotWidthPx?: number | null;
  className?: string;
};

const CHIP = "mx-0 inline-block align-[-0.15em] object-contain";

/** Renders draft text with custom emoji chips (for the transparent textarea overlay). */
export function ComposerDraftMirror({
  draft,
  slots,
  catalog,
  customEmojis,
  preferredServerId = null,
  slotWidthPx = null,
  className = "",
}: ComposerDraftMirrorProps) {
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  let slotIndex = 0;
  const chipSize = slotWidthPx && slotWidthPx > 0 ? slotWidthPx : undefined;
  const chipClass = chipSize ? CHIP : `${CHIP} h-[1em] w-[1em]`;

  while (i < draft.length) {
    if (draft[i] === COMPOSER_SLOT_CHAR) {
      const token = slots[slotIndex++];
      if (token) {
        parts.push(
          <CustomEmoji
            key={key++}
            token={token}
            catalog={catalog}
            size={chipSize ?? 15}
            title=""
            className={chipClass}
            style={
              chipSize
                ? { width: chipSize, height: chipSize }
                : undefined
            }
          />,
        );
      } else {
        parts.push(<span key={key++}>{COMPOSER_SLOT_CHAR}</span>);
      }
      i += 1;
      continue;
    }

    const slice = draft.slice(i);
    const tokenMatch = slice.match(
      /^<(a?):([a-zA-Z0-9_]{2,32}):([0-9a-f-]{36})>/i,
    );
    if (tokenMatch) {
      // Keep raw token glyphs so width matches the textarea (until collapsed).
      parts.push(<span key={key++}>{tokenMatch[0]}</span>);
      i += tokenMatch[0].length;
      continue;
    }

    const short = slice.match(/^:([a-zA-Z0-9_]{2,32}):/);
    if (short) {
      const hit = findEmojiByName(short[1], customEmojis, preferredServerId);
      if (hit) {
        // Still typing/uncollapsed shortcode — show text width, not chip.
        parts.push(<span key={key++}>{short[0]}</span>);
        i += short[0].length;
        continue;
      }
    }

    let next = i + 1;
    while (next < draft.length) {
      const c = draft[next]!;
      if (c === COMPOSER_SLOT_CHAR || c === "<" || c === ":") break;
      next += 1;
    }
    parts.push(<span key={key++}>{draft.slice(i, next)}</span>);
    i = next;
  }

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
