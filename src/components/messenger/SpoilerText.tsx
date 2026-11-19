"use client";

import { useState, type ReactNode } from "react";

/** Discord-style spoiler: hidden until clicked. */
export function SpoilerText({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) {
    return <span className="rounded bg-white/10 px-0.5">{children}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className="cursor-pointer rounded bg-[#1e1f22] px-0.5 text-transparent transition hover:bg-[#2b2d31]"
      aria-label="Reveal spoiler"
      title="Reveal spoiler"
    >
      <span className="pointer-events-none select-none text-transparent [text-shadow:none]">
        {children}
      </span>
    </button>
  );
}
