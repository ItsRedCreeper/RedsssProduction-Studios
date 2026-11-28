"use client";

import { useId } from "react";
import { HoverTip } from "@/components/ui/HoverTip";
import {
  profileTagsMeta,
  type ProfileTagId,
} from "@/lib/profile-tags";

type ProfileTagsPillsProps = {
  tags?: readonly ProfileTagId[] | unknown | null;
  /**
   * `pills` — full text labels (small/big profile).
   * `badges` — compact symbolic badges for the member list.
   * `dots` kept as an alias of `badges`.
   */
  variant?: "pills" | "badges" | "dots";
  /** Pill sizing; ignored for badges. */
  size?: "sm" | "md";
  className?: string;
};

/** Pioneer — early-supporter star (reads as “first in”). */
function PioneerBadge({ className = "" }: { className?: string }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`pg-${gid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e86a6a" />
          <stop offset="100%" stopColor="#9b2c2c" />
        </linearGradient>
      </defs>
      <path
        d="M8 1.2 9.7 5.6l4.7.4-3.6 3.1 1.1 4.6L8 11.4l-3.9 2.3 1.1-4.6L1.6 6l4.7-.4L8 1.2z"
        fill={`url(#pg-${gid})`}
        stroke="#f8c4c4"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      <path
        d="M8 3.4 9 6l2.7.2-2.1 1.8.6 2.6L8 9.2 5.8 10.6l.6-2.6L4.3 6.2 7 6 8 3.4z"
        fill="#ffe4e6"
        opacity="0.35"
      />
    </svg>
  );
}

/** Funder — soft gold coin with a cut gem center. */
function FunderBadge({ className = "" }: { className?: string }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`fg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f3d57a" />
          <stop offset="100%" stopColor="#c9922e" />
        </linearGradient>
      </defs>
      <circle
        cx="8"
        cy="8"
        r="6.4"
        fill={`url(#fg-${gid})`}
        stroke="#f8e7b0"
        strokeWidth="0.9"
      />
      <circle
        cx="8"
        cy="8"
        r="4.6"
        fill="none"
        stroke="#8a6418"
        strokeWidth="0.65"
        opacity="0.55"
      />
      <path
        d="M8 4.4 10.4 8 8 11.6 5.6 8Z"
        fill="#fff6d6"
        stroke="#8a6418"
        strokeWidth="0.55"
        strokeLinejoin="round"
        opacity="0.95"
      />
    </svg>
  );
}

function MemberTagBadge({ id }: { id: ProfileTagId }) {
  const common =
    "h-[14px] w-[14px] shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]";
  if (id === "pioneer") return <PioneerBadge className={common} />;
  return <FunderBadge className={common} />;
}

export function ProfileTagsPills({
  tags,
  variant = "pills",
  size = "sm",
  className = "",
}: ProfileTagsPillsProps) {
  const items = profileTagsMeta(tags ?? []);
  if (items.length === 0) return null;

  const asBadges = variant === "badges" || variant === "dots";

  if (asBadges) {
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
              className="inline-flex shrink-0 items-center justify-center"
              aria-label={tag.label}
            >
              <MemberTagBadge id={tag.id} />
            </span>
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
