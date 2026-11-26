"use client";

import { useEffect } from "react";
import { statusDotClass } from "@/components/messenger/data";
import { HoverTip } from "@/components/ui/HoverTip";
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
  /**
   * Truncation for the caption text. Use `group-hover:truncate` when a parent
   * `group` shows action buttons only on hover.
   */
  truncateClassName?: string;
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
  truncateClassName = "truncate",
}: PresenceCaptionProps) {
  const feed = useOptionalPresenceFeed();
  const live = useUserPresence(userId);

  useEffect(() => {
    if (!feed || !userId) return;
    feed.watch(userId);
  }, [feed, userId]);

  // Prefer feed heartbeat; allow newer props (StatusPicker) to win briefly.
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
  const mergedCustom =
    live?.statusText !== undefined && live?.statusText !== null
      ? live.statusText
      : (customStatus ?? null);
  // Live feed owns activity text (self sees true private server / DM labels).
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
    <span
      className={`flex w-full min-w-0 max-w-full items-center gap-1.5 ${className}`}
    >
      {showDot && (
        <span
          className={`shrink-0 rounded-full ${dotClassName} ${statusDotClass(displayStatus)}`}
          aria-hidden
        />
      )}
      <HoverTip
        label={caption}
        onlyIfTruncated
        delayMs={40}
        className="min-w-0 flex-1"
      >
        <span className={`block text-xs ${tone} ${truncateClassName}`}>
          {caption}
        </span>
      </HoverTip>
    </span>
  );
}
