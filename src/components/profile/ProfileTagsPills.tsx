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
      ? "px-2 py-0.5 text-[11px]"
      : "px-1.5 py-px text-[10px]";

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 ${className}`}
    >
      {items.map((tag) => (
        <HoverTip key={tag.id} label={tag.tip} delayMs={40} side="top">
          <span
            className={`inline-flex shrink-0 items-center rounded-full font-semibold tracking-wide ${pad} ${tag.className}`}
          >
            {tag.label}
          </span>
        </HoverTip>
      ))}
    </span>
  );
}
