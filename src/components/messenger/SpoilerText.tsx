"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { LinkPreviewCard } from "@/components/messenger/LinkEmbeds";
import { HoverTip } from "@/components/ui/HoverTip";

type SpoilerTextProps = {
  children: ReactNode;
  /** When set, revealing also shows these link previews (no separate spoiler). */
  embedUrls?: string[];
};

/**
 * Discord-style spoiler: one clickable cover. Links stay fully hidden until
 * reveal; any embed URLs expand under the same reveal (not a second spoiler).
 */
export function SpoilerText({ children, embedUrls = [] }: SpoilerTextProps) {
  const [revealed, setRevealed] = useState(false);

  function reveal() {
    setRevealed(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      reveal();
    }
  }

  if (revealed) {
    return (
      <>
        <span className="rounded bg-white/10 px-0.5">{children}</span>
        {embedUrls.length > 0 ? (
          <span className="mt-1.5 flex flex-col gap-2">
            {embedUrls.map((url) => (
              <LinkPreviewCard key={url} url={url} />
            ))}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <HoverTip label="Reveal spoiler" delayMs={40} side="top">
      <span
        role="button"
        tabIndex={0}
        onClick={reveal}
        onKeyDown={onKeyDown}
        className="relative inline cursor-pointer rounded bg-[var(--ms-border)] px-0.5 text-transparent transition hover:bg-[var(--ms-sidebar)]"
        aria-label="Reveal spoiler"
      >
        {/*
          Keep layout width from the real content, but force every nested link
          (and other colored bits) fully invisible so nothing peeks through.
        */}
        <span
          aria-hidden
          className="pointer-events-none select-none text-transparent [text-shadow:none] [&_*]:!text-transparent [&_*]:!no-underline [&_*]:![text-decoration:none] [&_a]:!text-transparent [&_a]:!decoration-transparent"
        >
          {children}
        </span>
      </span>
    </HoverTip>
  );
}
