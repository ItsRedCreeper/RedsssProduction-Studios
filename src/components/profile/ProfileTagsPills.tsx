"use client";

import { HoverTip } from "@/components/ui/HoverTip";
import {
  profileTagsMeta,
  type ProfileTagId,
} from "@/lib/profile-tags";

type ProfileTagsPillsProps = {
  tags?: readonly ProfileTagId[] | unknown | null;
  /** Tiny labels everywhere — `md` is only a hair roomier for the big profile. */
  size?: "sm" | "md";
  className?: string;
};

export function ProfileTagsPills({
  tags,
  size = "sm",
  className = "",
}: ProfileTagsPillsProps) {
  const items = profileTagsMeta(tags ?? []);
  if (items.length === 0) return null;

  // Tiny label chips — not buttons. Text stays fully readable.
  const pad =
    size === "md"
      ? "h-4 px-1.5 text-[10px] leading-none"
      : "h-3.5 px-1 text-[9px] leading-none";

  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-center gap-0.5 ${className}`}
    >
      {items.map((tag) => (
        <HoverTip key={tag.id} label={tag.tip} delayMs={40} side="top">
          <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium tracking-wide whitespace-nowrap ${pad} ${tag.className}`}
            // Beat inherited button / role WebkitTextFillColor on profile cards.
            style={
              tag.id === "funder"
                ? { color: "#1f1608", WebkitTextFillColor: "#1f1608" }
                : { color: "#fecaca", WebkitTextFillColor: "#fecaca" }
            }
          >
            {tag.label}
          </span>
        </HoverTip>
      ))}
    </span>
  );
}
