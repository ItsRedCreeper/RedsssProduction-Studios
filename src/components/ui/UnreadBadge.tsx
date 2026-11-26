"use client";

import { formatUnreadCount, UNREAD_BADGE_RED } from "@/lib/unread";

type UnreadBadgeProps = {
  count: number;
  className?: string;
  /** Slightly larger for rail icons */
  size?: "sm" | "md";
};

/** Red circular unread count badge. Hidden when count is 0. */
export function UnreadBadge({
  count,
  className = "",
  size = "sm",
}: UnreadBadgeProps) {
  if (count <= 0) return null;
  const label = formatUnreadCount(count);
  const sizing =
    size === "md"
      ? "h-5 min-w-5 px-1 text-[10px]"
      : "h-4 min-w-4 px-1 text-[10px]";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold leading-none text-white ring-2 ring-[#1a1b1e] ${sizing} ${className}`}
      style={{ backgroundColor: UNREAD_BADGE_RED }}
      aria-label={`${count} unread`}
    >
      {label}
    </span>
  );
}
