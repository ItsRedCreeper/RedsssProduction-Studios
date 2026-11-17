"use client";

import { useEffect } from "react";
import { statusDotClass } from "@/components/messenger/data";
import {
  presenceCaption,
  resolveDisplayStatus,
} from "@/lib/presence";
import {
  useOptionalPresenceFeed,
  useUserPresence,
} from "@/components/presence/PresenceFeed";

type PresenceCaptionProps = {
  userId: string;
  status?: string | null;
  lastSeenAt?: string | null;
  customStatus?: string | null;
  /** When provided, skip feed activity (rare). */
  activityLabel?: string | null;
  className?: string;
  showDot?: boolean;
  dotClassName?: string;
};

export function PresenceCaption({
  userId,
  status = null,
  lastSeenAt = null,
  customStatus = null,
  activityLabel: activityLabelProp,
  className = "",
  showDot = false,
  dotClassName = "h-2 w-2",
}: PresenceCaptionProps) {
  const feed = useOptionalPresenceFeed();
  const live = useUserPresence(userId);

  // Seed the feed from props so first paint is correct before fetch returns.
  useEffect(() => {
    if (!feed || !userId) return;
    feed.watch(userId);
  }, [feed, userId]);

  // Live feed is the source of truth for activity + heartbeat. Explicit props
  // still win when provided (StatusPicker on own big profile).
  const mergedStatus = status ?? live?.status ?? null;
  const mergedLastSeen = live?.lastSeenAt ?? lastSeenAt ?? null;
  const mergedCustom =
    customStatus !== undefined && customStatus !== null
      ? customStatus
      : (live?.statusText ?? null);
  // Always prefer live activity label so own/true activity shows on profiles.
  const mergedActivity =
    live?.activityLabel ??
    (activityLabelProp !== undefined ? activityLabelProp : null);

  const displayStatus = resolveDisplayStatus(mergedStatus, mergedLastSeen);
  const caption = presenceCaption({
    status: mergedStatus,
    lastSeenAt: mergedLastSeen,
    activityLabel: mergedActivity,
    customStatus: mergedCustom,
    activityUpdatedAt: live?.activity?.updated_at ?? null,
  });

  const tone =
    displayStatus === "offline"
      ? "text-[#6d6f78]"
      : displayStatus === "idle"
        ? "text-[#f0b232]"
        : displayStatus === "dnd"
          ? "text-[#f23f43]"
          : "text-[#23a559]";

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      {showDot && (
        <span
          className={`shrink-0 rounded-full ${dotClassName} ${statusDotClass(displayStatus)}`}
          aria-hidden
        />
      )}
      <span className={`truncate text-xs ${tone}`}>{caption}</span>
    </span>
  );
}
