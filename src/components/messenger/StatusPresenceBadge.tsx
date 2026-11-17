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
};

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
        className={`absolute bottom-0 right-0 z-[1] flex h-3.5 w-[18px] items-center justify-center gap-[2px] rounded-full ring-2 ${ringClassName} ${colorClass} ${className}`}
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
      className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ${ringClassName} ${colorClass} ${className}`}
      aria-hidden
    />
  );
}
