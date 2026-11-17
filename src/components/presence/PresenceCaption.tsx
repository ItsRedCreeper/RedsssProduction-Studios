"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatActivityLabel,
  loadActivitiesFor,
  type UserActivityRow,
} from "@/lib/activity";
import {
  presenceCaption,
  resolveDisplayStatus,
} from "@/lib/presence";
import { createClient } from "@/lib/supabase/client";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { loadFriendEdges } from "@/lib/friends";
import { statusDotClass } from "@/components/messenger/data";

type PresenceCaptionProps = {
  userId: string;
  status: string | null | undefined;
  lastSeenAt?: string | null;
  customStatus?: string | null;
  /** When provided, skip per-user activity fetch (list batching). */
  activityLabel?: string | null;
  className?: string;
  /** Show status dot inline before the caption. */
  showDot?: boolean;
  dotClassName?: string;
};

type ViewerCtx = {
  friendIds: Set<string>;
  viewerServerIds: Set<string>;
};

let viewerCache: { userId: string; ctx: ViewerCtx; at: number } | null = null;
const VIEWER_TTL = 30_000;

async function loadViewerCtx(userId: string | undefined): Promise<ViewerCtx> {
  if (!userId) {
    return { friendIds: new Set(), viewerServerIds: new Set() };
  }
  if (
    viewerCache &&
    viewerCache.userId === userId &&
    Date.now() - viewerCache.at < VIEWER_TTL
  ) {
    return viewerCache.ctx;
  }
  const [edgesResult, membershipRes] = await Promise.all([
    loadFriendEdges(userId),
    createClient()
      .from("server_members")
      .select("server_id")
      .eq("user_id", userId),
  ]);
  const ctx: ViewerCtx = {
    friendIds: new Set(
      edgesResult.edges
        .filter((edge) => edge.status === "accepted")
        .map((edge) => edge.other.id),
    ),
    viewerServerIds: new Set(
      (membershipRes.data ?? []).map((row) => row.server_id),
    ),
  };
  viewerCache = { userId, ctx, at: Date.now() };
  return ctx;
}

export function PresenceCaption({
  userId,
  status,
  lastSeenAt = null,
  customStatus = null,
  activityLabel: activityLabelProp,
  className = "",
  showDot = false,
  dotClassName = "h-2 w-2",
}: PresenceCaptionProps) {
  const { user } = useCurrentProfile();
  const [activityLabel, setActivityLabel] = useState<string | null>(
    activityLabelProp ?? null,
  );

  const displayStatus = useMemo(
    () => resolveDisplayStatus(status, lastSeenAt),
    [status, lastSeenAt],
  );

  useEffect(() => {
    if (activityLabelProp !== undefined) {
      setActivityLabel(activityLabelProp);
    }
  }, [activityLabelProp]);

  useEffect(() => {
    if (activityLabelProp !== undefined) return;
    if (displayStatus === "offline") {
      setActivityLabel(null);
      return;
    }

    let cancelled = false;

    async function refresh(row?: UserActivityRow | null) {
      const ctx = await loadViewerCtx(user?.id);
      if (cancelled) return;
      const activity =
        row === undefined
          ? (await loadActivitiesFor([userId])).rows[0]
          : row;
      if (cancelled) return;
      if (!activity) {
        setActivityLabel(null);
        return;
      }
      setActivityLabel(
        formatActivityLabel(activity, {
          viewerId: user?.id ?? null,
          friendIds: ctx.friendIds,
          viewerServerIds: ctx.viewerServerIds,
          activityOwnerId: userId,
        }),
      );
    }

    void refresh();

    const supabase = createClient();
    const channel = supabase
      .channel(`presence-caption:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_activity",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = (payload.new ?? null) as UserActivityRow | null;
          void refresh(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        () => {
          // Status/last_seen changed — parent usually re-renders; keep activity.
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId, user?.id, displayStatus, activityLabelProp]);

  const caption = presenceCaption({
    status: displayStatus,
    lastSeenAt,
    activityLabel: displayStatus === "offline" ? null : activityLabel,
    customStatus,
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
