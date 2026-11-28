"use client";

import { HoverTip } from "@/components/ui/HoverTip";
import {
  profileTagsMeta,
  type ProfileTagId,
} from "@/lib/profile-tags";

type ProfileTagsPillsProps = {
  tags?: readonly ProfileTagId[] | unknown | null;
  /**
   * `pills` — full text labels (small/big profile).
   * `dots` — compact circles for the member list.
   */
  variant?: "pills" | "dots";
  /** Pill sizing; ignored for `dots`. */
  size?: "sm" | "md";
  className?: string;
};

export function ProfileTagsPills({
  tags,
  variant = "pills",
  size = "sm",
  className = "",
}: ProfileTagsPillsProps) {
  const items = profileTagsMeta(tags ?? []);
  if (items.length === 0) return null;

  if (variant === "dots") {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 ${className}`}
        aria-label={items.map((t) => t.label).join(", ")}
      >
        {items.map((tag) => (
          <HoverTip
            key={tag.id}
            label={`${tag.label}\n${tag.tip}`}
            delayMs={40}
            side="top"
          >
            <span
              className={`inline-block h-3 w-3 shrink-0 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.28),0_0_0_1px_rgba(0,0,0,0.22)] ${tag.dotClassName}`}
              aria-label={tag.label}
            />
          </HoverTip>
        ))}
      </span>
    );
  }

  // Compact matched pills — hug content, never stretch.
  const pad =
    size === "md"
      ? "h-[18px] px-[7px] text-[10px] leading-none"
      : "h-[15px] px-[6px] text-[9px] leading-none";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 ${className}`}
    >
      {items.map((tag) => (
        <HoverTip key={tag.id} label={tag.tip} delayMs={40} side="top">
          <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide whitespace-nowrap ${pad} ${tag.className}`}
            style={{
              color: tag.textColor,
              WebkitTextFillColor: tag.textColor,
            }}
          >
            {tag.label}
          </span>
        </HoverTip>
      ))}
    </span>
  );
}
