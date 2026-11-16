"use client";

import { useEffect, useState } from "react";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import {
  formatActivityLabel,
  loadActivitiesFor,
  type UserActivityRow,
} from "@/lib/activity";
import { createClient } from "@/lib/supabase/client";
import { loadFriendEdges } from "@/lib/friends";

type ProfileActivityLineProps = {
  userId: string;
  className?: string;
};

export function ProfileActivityLine({
  userId,
  className = "",
}: ProfileActivityLineProps) {
  const { user } = useCurrentProfile();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ rows }, edgesResult, membershipRes] = await Promise.all([
        loadActivitiesFor([userId]),
        user ? loadFriendEdges(user.id) : Promise.resolve({ edges: [] }),
        user
          ? createClient()
              .from("server_members")
              .select("server_id")
              .eq("user_id", user.id)
          : Promise.resolve({ data: [] as { server_id: string }[] }),
      ]);
      if (cancelled) return;
      const row = rows[0] as UserActivityRow | undefined;
      const friendIds = new Set(
        edgesResult.edges
          .filter((edge) => edge.status === "accepted")
          .map((edge) => edge.other.id),
      );
      const viewerServerIds = new Set(
        (membershipRes.data ?? []).map((row) => row.server_id),
      );
      setLabel(
        formatActivityLabel(row, {
          viewerId: user?.id ?? null,
          friendIds,
          viewerServerIds,
          activityOwnerId: userId,
        }),
      );
    })();

    const supabase = createClient();
    const channel = supabase
      .channel(`activity:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_activity",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadActivitiesFor([userId]).then(({ rows }) => {
            if (cancelled) return;
            const row = rows[0];
            if (!row) {
              setLabel(null);
              return;
            }
            // Re-run full privacy path on next tick via re-fetch of friends is heavy;
            // show public-safe fallback then refresh.
            void (async () => {
              const edgesResult = user
                ? await loadFriendEdges(user.id)
                : { edges: [] };
              const membershipRes = user
                ? await createClient()
                    .from("server_members")
                    .select("server_id")
                    .eq("user_id", user.id)
                : { data: [] as { server_id: string }[] };
              if (cancelled) return;
              const friendIds = new Set(
                edgesResult.edges
                  .filter((edge) => edge.status === "accepted")
                  .map((edge) => edge.other.id),
              );
              const viewerServerIds = new Set(
                (membershipRes.data ?? []).map((m) => m.server_id),
              );
              setLabel(
                formatActivityLabel(row, {
                  viewerId: user?.id ?? null,
                  friendIds,
                  viewerServerIds,
                  activityOwnerId: userId,
                }),
              );
            })();
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId, user]);

  if (!label) return null;
  return (
    <p className={`truncate text-xs text-[#57f287] ${className}`}>{label}</p>
  );
}
