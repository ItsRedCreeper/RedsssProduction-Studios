"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { HoverTip } from "@/components/ui/HoverTip";

type SpoilerMediaProps = {
  children: ReactNode;
  label?: string;
  className?: string;
};

/**
 * Discord-style spoiler cover for media / link embeds.
 * Blurred content + SPOILER badge until clicked; then full content shows.
 */
export function SpoilerMedia({
  children,
  label = "SPOILER",
  className = "",
}: SpoilerMediaProps) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) return <>{children}</>;

  function reveal() {
    setRevealed(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      reveal();
    }
  }

  return (
    <HoverTip label="Reveal spoiler" delayMs={40} side="top">
      <div
        role="button"
        tabIndex={0}
        onClick={reveal}
        onKeyDown={onKeyDown}
        className={`group relative block max-w-full cursor-pointer overflow-hidden rounded-md text-left ${className}`}
        aria-label="Reveal spoiler"
      >
        <div className="pointer-events-none select-none blur-[28px] brightness-75 saturate-50 transition group-hover:brightness-90">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 transition group-hover:bg-black/35">
          <span className="rounded-md bg-black/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg">
            {label}
          </span>
        </div>
      </div>
    </HoverTip>
  );
}
