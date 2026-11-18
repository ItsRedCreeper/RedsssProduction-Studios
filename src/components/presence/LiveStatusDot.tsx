"use client";

import { StatusPresenceBadge } from "@/components/messenger/StatusPresenceBadge";
import { useUserPresence } from "@/components/presence/PresenceFeed";

type LiveStatusDotProps = {
  userId: string;
  /** Fallback when feed hasn't loaded yet. */
  status?: string | null;
  lastSeenAt?: string | null;
  typing?: boolean;
  ringClassName?: string;
  className?: string;
  /** Dot size — big profile uses lg. */
  size?: "sm" | "md" | "lg";
};

/**
 * Avatar status circle that follows PresenceFeed (realtime + poll).
 * Prefer this anywhere a status dot should update live.
 */
export function LiveStatusDot({
  userId,
  status = null,
  lastSeenAt = null,
  typing = false,
  ringClassName,
  className = "",
  size = "sm",
}: LiveStatusDotProps) {
  const live = useUserPresence(userId);

  const propSeen = lastSeenAt ? Date.parse(lastSeenAt) : Number.NaN;
  const liveSeen = live?.lastSeenAt ? Date.parse(live.lastSeenAt) : Number.NaN;
  const propsNewer =
    status != null &&
    !Number.isNaN(propSeen) &&
    (Number.isNaN(liveSeen) || propSeen >= liveSeen);

  const mergedStatus = propsNewer
    ? status
    : (live?.status ?? status ?? null);
  const mergedLastSeen = propsNewer
    ? (lastSeenAt ?? live?.lastSeenAt ?? null)
    : (live?.lastSeenAt ?? lastSeenAt ?? null);

  return (
    <StatusPresenceBadge
      status={mergedStatus}
      lastSeenAt={mergedLastSeen}
      typing={typing}
      ringClassName={ringClassName}
      className={className}
      size={size}
    />
  );
}
