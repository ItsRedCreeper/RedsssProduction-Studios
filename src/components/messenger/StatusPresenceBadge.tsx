"use client";

import { statusDotClass } from "@/components/messenger/data";
import { asPresenceStatus, resolveDisplayStatus } from "@/lib/presence";

type StatusPresenceBadgeProps = {
  status: string | null | undefined;
  lastSeenAt?: string | null;
  /** When true, status circle expands into Discord-style typing dots. */
  typing?: boolean;
  /** Outer ring color matching the parent surface. */
  ringClassName?: string;
  className?: string;
  title?: string;
  /** sm = lists, md = navbar, lg = big profile avatar. */
  size?: "sm" | "md" | "lg";
};

const DOT_SIZE = {
  sm: "bottom-0 right-0 h-2.5 w-2.5",
  md: "bottom-0 right-0 h-3 w-3",
  lg: "bottom-2 right-2 h-5 w-5",
} as const;

const TYPING_SIZE = {
  sm: "bottom-0 right-0 h-3.5 w-[18px]",
  md: "bottom-0 right-0 h-4 w-5",
  lg: "bottom-2 right-2 h-5 w-7",
} as const;

/**
 * Avatar corner badge: normal presence dot, or an expanded status-colored
 * typing pill with three animated dots (Discord member-list / DM-list behavior).
 * Typing keeps the user's status color (online/idle/dnd) even if heartbeat is stale.
 */
export function StatusPresenceBadge({
  status,
  lastSeenAt = null,
  typing = false,
  ringClassName = "ring-[#2b2d31]",
  className = "",
  title,
  size = "sm",
}: StatusPresenceBadgeProps) {
  // Discord: typing badge inherits the status color; don't gray out mid-type.
  const displayStatus = typing
    ? asPresenceStatus(status)
    : resolveDisplayStatus(status, lastSeenAt);
  const colorClass = statusDotClass(displayStatus);

  if (typing) {
    return (
      <span
        title={title ?? "Typing…"}
        aria-label="Typing"
        className={`absolute z-[1] flex items-center justify-center gap-[2px] rounded-full ring-2 ${TYPING_SIZE[size]} ${ringClassName} ${colorClass} ${className}`}
      >
        <span className="typing-dot h-[3px] w-[3px] rounded-full bg-[#111214]" />
        <span className="typing-dot typing-dot-delay-1 h-[3px] w-[3px] rounded-full bg-[#111214]" />
        <span className="typing-dot typing-dot-delay-2 h-[3px] w-[3px] rounded-full bg-[#111214]" />
      </span>
    );
  }

  return (
    <span
      title={title}
      className={`absolute rounded-full ring-2 ${DOT_SIZE[size]} ${ringClassName} ${colorClass} ${className}`}
      aria-hidden
    />
  );
}
