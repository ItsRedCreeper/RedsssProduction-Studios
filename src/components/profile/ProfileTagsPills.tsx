"use client";

import { HoverTip } from "@/components/ui/HoverTip";
import {
  profileTagsMeta,
  type ProfileTagId,
} from "@/lib/profile-tags";

type ProfileTagsPillsProps = {
  tags?: readonly ProfileTagId[] | unknown | null;
  /** `sm` for member list / small card; `md` for big profile. */
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

  const pad =
    size === "md"
      ? "min-h-[1.25rem] px-2 py-0.5 text-[11px] leading-4"
      : "min-h-[1.125rem] px-1.5 py-0.5 text-[10px] leading-tight";

  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-center gap-1 ${className}`}
    >
      {items.map((tag) => (
        <HoverTip key={tag.id} label={tag.tip} delayMs={40} side="top">
          <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide whitespace-nowrap ${pad} ${tag.className}`}
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
