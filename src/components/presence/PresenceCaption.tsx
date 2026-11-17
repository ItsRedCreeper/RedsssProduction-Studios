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

  const displayStatus = resolveDisplayStatus(
    live?.status ?? status,
    live?.lastSeenAt ?? lastSeenAt,
  );
  const caption =
    live?.caption ??
    presenceCaption({
      status: displayStatus,
      lastSeenAt: live?.lastSeenAt ?? lastSeenAt,
      activityLabel:
        displayStatus === "offline"
          ? null
          : (activityLabelProp ?? live?.activityLabel ?? null),
      customStatus: live?.statusText ?? customStatus,
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
