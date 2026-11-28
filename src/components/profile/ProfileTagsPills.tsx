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
              className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] ${tag.dotClassName}`}
              aria-label={tag.label}
            />
          </HoverTip>
        ))}
      </span>
    );
  }

  const pad =
    size === "md"
      ? "h-[1.125rem] px-2 text-[10px] leading-none"
      : "h-4 px-1.5 text-[10px] leading-none";

  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-center gap-1 ${className}`}
    >
      {items.map((tag) => (
        <HoverTip key={tag.id} label={tag.tip} delayMs={40} side="top">
          <span
            className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium tracking-wide whitespace-nowrap ${pad} ${tag.className}`}
            // Beat inherited button / role WebkitTextFillColor on profile cards.
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
