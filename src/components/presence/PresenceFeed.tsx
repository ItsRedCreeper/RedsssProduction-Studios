"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import {
  formatActivityLabel,
  loadActivitiesFor,
  type UserActivityRow,
} from "@/lib/activity";
import { loadFriendEdges } from "@/lib/friends";
import {
  asPresenceStatus,
  presenceCaption,
  resolveDisplayStatus,
} from "@/lib/presence";

export type PresenceSnapshot = {
  userId: string;
  status: string;
  statusText: string | null;
  lastSeenAt: string | null;
  activity: UserActivityRow | null;
  activityLabel: string | null;
  caption: string;
  displayStatus: string;
};

type PresenceFeedValue = {
  get: (userId: string) => PresenceSnapshot | null;
  /** Ensure this user is in the watched set (fetches if missing). */
  watch: (userId: string) => void;
  watchMany: (userIds: string[]) => void;
  version: number;
};

const PresenceFeedContext = createContext<PresenceFeedValue | null>(null);

const POLL_MS = 8_000;

function emptySnap(userId: string): PresenceSnapshot {
  // Use online as a neutral placeholder so activity-only patches don't flash Offline.
  return {
    userId,
    status: "online",
    statusText: null,
    lastSeenAt: new Date().toISOString(),
    activity: null,
    activityLabel: null,
    caption: "Online",
    displayStatus: "online",
  };
}

function buildCaption(
  snap: Omit<PresenceSnapshot, "caption" | "displayStatus" | "activityLabel"> & {
    activityLabel: string | null;
  },
): Pick<PresenceSnapshot, "caption" | "displayStatus"> {
  const caption = presenceCaption({
    status: snap.status,
    lastSeenAt: snap.lastSeenAt,
    activityLabel: snap.activityLabel,
    customStatus: snap.statusText,
    activityUpdatedAt: snap.activity?.updated_at ?? null,
  });
  let displayStatus = resolveDisplayStatus(snap.status, snap.lastSeenAt);
  if (
    displayStatus === "offline" &&
    snap.activity?.updated_at &&
    asPresenceStatus(snap.status) !== "offline"
  ) {
    const act = Date.parse(snap.activity.updated_at);
    if (!Number.isNaN(act) && Date.now() - act < 120_000) {
      displayStatus = asPresenceStatus(snap.status);
    }
  }
  return { displayStatus, caption };
}

export function PresenceFeedProvider({ children }: { children: ReactNode }) {
  const { user } = useCurrentProfile();
  const [version, setVersion] = useState(0);
  const snapsRef = useRef<Map<string, PresenceSnapshot>>(new Map());
  const watchedRef = useRef<Set<string>>(new Set());
  const friendIdsRef = useRef<Set<string>>(new Set());
  const serverIdsRef = useRef<Set<string>>(new Set());
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const labelFor = useCallback(
    (ownerId: string, activity: UserActivityRow | null) => {
      if (!activity) return null;
      return formatActivityLabel(activity, {
        viewerId: user?.id ?? null,
        friendIds: friendIdsRef.current,
        viewerServerIds: serverIdsRef.current,
        activityOwnerId: ownerId,
      });
    },
    [user?.id],
  );

  const upsert = useCallback(
    (
      userId: string,
      patch: Partial<{
        status: string;
        statusText: string | null;
        lastSeenAt: string | null;
        activity: UserActivityRow | null;
      }>,
    ) => {
      const prev = snapsRef.current.get(userId) ?? emptySnap(userId);
      const nextBase = {
        userId,
        status: patch.status ?? prev.status,
        statusText:
          patch.statusText !== undefined ? patch.statusText : prev.statusText,
        lastSeenAt:
          patch.lastSeenAt !== undefined ? patch.lastSeenAt : prev.lastSeenAt,
        activity: patch.activity !== undefined ? patch.activity : prev.activity,
      };
      const activityLabel = labelFor(userId, nextBase.activity);
      const { caption, displayStatus } = buildCaption({
        ...nextBase,
        activityLabel,
      });
      snapsRef.current.set(userId, {
        ...nextBase,
        activityLabel,
        caption,
        displayStatus,
      });
      bump();
    },
    [bump, labelFor],
  );

  const fetchUsers = useCallback(
    async (ids: string[]) => {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return;
      const supabase = createClient();
      const [{ data: profiles }, { rows: activities }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, status, status_text, last_seen_at")
          .in("id", unique),
        loadActivitiesFor(unique),
      ]);
      const activityMap = new Map(activities.map((row) => [row.user_id, row]));
      for (const profile of profiles ?? []) {
        upsert(profile.id, {
          status: profile.status ?? "offline",
          statusText: profile.status_text ?? null,
          lastSeenAt: profile.last_seen_at ?? null,
          activity: activityMap.get(profile.id) ?? null,
        });
      }
      // Users with activity but no profile row (shouldn't happen) still get activity.
      for (const id of unique) {
        if (!snapsRef.current.has(id) && activityMap.has(id)) {
          upsert(id, { activity: activityMap.get(id) ?? null });
        }
      }
    },
    [upsert],
  );

  const watch = useCallback(
    (userId: string) => {
      if (!userId) return;
      if (watchedRef.current.has(userId) && snapsRef.current.has(userId)) return;
      watchedRef.current.add(userId);
      void fetchUsers([userId]);
    },
    [fetchUsers],
  );

  const watchMany = useCallback(
    (userIds: string[]) => {
      const missing: string[] = [];
      for (const id of userIds) {
        if (!id) continue;
        if (!watchedRef.current.has(id) || !snapsRef.current.has(id)) {
          watchedRef.current.add(id);
          missing.push(id);
        }
      }
      if (missing.length) void fetchUsers(missing);
    },
    [fetchUsers],
  );

  // Load viewer privacy context once, and always track self so own profiles
  // show the true status/activity.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    watchedRef.current.add(user.id);
    void fetchUsers([user.id]);
    void (async () => {
      const [edges, membership] = await Promise.all([
        loadFriendEdges(user.id),
        createClient()
          .from("server_members")
          .select("server_id")
          .eq("user_id", user.id),
      ]);
      if (cancelled) return;
      friendIdsRef.current = new Set(
        edges.edges
          .filter((edge) => edge.status === "accepted")
          .map((edge) => edge.other.id),
      );
      serverIdsRef.current = new Set(
        (membership.data ?? []).map((row) => row.server_id),
      );
      // Relabel existing snaps with fresh privacy context (includes self).
      for (const [id, snap] of snapsRef.current) {
        upsert(id, { activity: snap.activity });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, upsert, fetchUsers]);

  // One shared realtime channel for the whole app.
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`presence-feed:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload) => {
          const row = payload.new as {
            id?: string;
            status?: string;
            status_text?: string | null;
            last_seen_at?: string | null;
          } | null;
          if (!row?.id) return;
          if (!watchedRef.current.has(row.id) && row.id !== user.id) return;
          watchedRef.current.add(row.id);
          const patch: Partial<{
            status: string;
            statusText: string | null;
            lastSeenAt: string | null;
          }> = {};
          // Never invent "offline" from a partial payload — that caused the flicker.
          if (typeof row.status === "string") patch.status = row.status;
          if (row.status_text !== undefined) patch.statusText = row.status_text;
          if (row.last_seen_at !== undefined) patch.lastSeenAt = row.last_seen_at;
          if (Object.keys(patch).length) upsert(row.id, patch);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_activity" },
        (payload) => {
          const row = payload.new as UserActivityRow | null;
          if (!row?.user_id) return;
          if (!watchedRef.current.has(row.user_id) && row.user_id !== user.id) {
            return;
          }
          watchedRef.current.add(row.user_id);
          upsert(row.user_id, { activity: row });
        },
      )
      .subscribe();

    const poll = window.setInterval(() => {
      const ids = [...watchedRef.current];
      if (ids.length) void fetchUsers(ids);
    }, POLL_MS);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [user?.id, upsert, fetchUsers]);

  const get = useCallback((userId: string) => {
    return snapsRef.current.get(userId) ?? null;
  }, []);

  const value = useMemo(
    () => ({ get, watch, watchMany, version }),
    [get, watch, watchMany, version],
  );

  return (
    <PresenceFeedContext.Provider value={value}>
      {children}
    </PresenceFeedContext.Provider>
  );
}

export function usePresenceFeed() {
  const value = useContext(PresenceFeedContext);
  if (!value) {
    throw new Error("usePresenceFeed must be used within PresenceFeedProvider");
  }
  return value;
}

export function useOptionalPresenceFeed() {
  return useContext(PresenceFeedContext);
}

/** Hook for a single user's live combined presence caption. */
export function useUserPresence(userId: string | null | undefined) {
  const feed = useOptionalPresenceFeed();
  const version = feed?.version ?? 0;

  useEffect(() => {
    if (userId && feed) feed.watch(userId);
  }, [userId, feed]);

  if (!userId || !feed) return null;
  // version read forces re-render when feed bumps
  void version;
  return feed.get(userId);
}
