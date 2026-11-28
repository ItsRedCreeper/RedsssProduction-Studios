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
  aggregateServerUnread,
  countUnreadPanelRows,
  type AppNotification,
  type UnreadChannelRow,
  type UnreadDmRow,
  type UnreadSummary,
} from "@/lib/unread";
import { saveChannelRead } from "@/components/messenger/data";
import { publishReadSync } from "@/lib/read-sync";
import { loadBlockedIds } from "@/lib/blocking";
import { loadIgnoredIds } from "@/lib/ignoring";

type UnreadContextValue = {
  loading: boolean;
  notifications: AppNotification[];
  channels: UnreadChannelRow[];
  dms: UnreadDmRow[];
  /** Message counts by channel id */
  channelCountById: Record<string, number>;
  /** Message counts by server id */
  serverCountById: Record<string, number>;
  /** Message counts by DM conversation id */
  dmCountById: Record<string, number>;
  totalDmUnread: number;
  /** Bell badge: individual unread notifs + aggregate rows with activity */
  bellCount: number;
  refresh: () => Promise<void>;
  markNotificationRead: (id: string, read?: boolean) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  markChannelRead: (channelId: string, at?: string) => Promise<void>;
  markDmRead: (conversationId: string, at?: string) => Promise<void>;
  markServerRead: (serverId: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteAllReadNotifications: () => Promise<void>;
  /** Bump local last-activity so UI updates before RPC refresh */
  noteChannelActivity: (
    channelId: string,
    at: string,
    meta?: { serverId?: string; serverName?: string; channelName?: string },
  ) => void;
  noteDmActivity: (
    conversationId: string,
    at: string,
    meta?: { title?: string; avatarUrl?: string | null },
  ) => void;
};

const UnreadContext = createContext<UnreadContextValue | null>(null);

async function saveDmRead(userId: string, conversationId: string, at: string) {
  const supabase = createClient();
  const row = {
    user_id: userId,
    conversation_id: conversationId,
    last_read_at: at,
  };
  const upserted = await supabase
    .from("user_dm_reads")
    .upsert(row, { onConflict: "user_id,conversation_id" });
  if (!upserted.error) return null;
  const updated = await supabase
    .from("user_dm_reads")
    .update({ last_read_at: at })
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .select("user_id");
  if (!updated.error && (updated.data?.length ?? 0) > 0) return null;
  const inserted = await supabase.from("user_dm_reads").insert(row);
  return inserted.error?.message ?? upserted.error.message;
}

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useCurrentProfile();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [channels, setChannels] = useState<UnreadChannelRow[]>([]);
  const [dms, setDms] = useState<UnreadDmRow[]>([]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Optimistic read watermarks — refresh must not revive older badges. */
  const pendingChannelReadsRef = useRef(new Map<string, string>());
  const pendingDmReadsRef = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setChannels([]);
      setDms([]);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const [notifs, summary] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase.rpc("get_unread_summary"),
    ]);
    const [blocked, ignored] = await Promise.all([
      loadBlockedIds(),
      loadIgnoredIds(),
    ]);
    const hideActors = new Set([...blocked.ids, ...ignored.ids]);
    const nextNotifs = ((notifs.data as AppNotification[] | null) ?? []).filter(
      (item) => {
        const actor =
          (typeof item.meta?.actor_id === "string" && item.meta.actor_id) ||
          (typeof item.meta?.from_user_id === "string" &&
            item.meta.from_user_id) ||
          (typeof item.meta?.author_id === "string" && item.meta.author_id) ||
          null;
        if (!actor) return true;
        return !hideActors.has(actor);
      },
    );
    setNotifications(nextNotifs);
    let raw = summary.data as UnreadSummary | string | null;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw) as UnreadSummary;
      } catch {
        raw = null;
      }
    }
    if (summary.error) {
      // Transient RPC blips are common during reconnect; avoid console spam.
    }
    const nextChannels = Array.isArray(raw?.channels) ? raw!.channels : [];
    const nextDms = Array.isArray(raw?.dms) ? raw!.dms : [];
    setChannels(
      nextChannels.filter((row) => {
        const pending = pendingChannelReadsRef.current.get(row.channel_id);
        if (!pending) return true;
        if (Date.parse(pending) >= Date.parse(row.latest_at)) {
          pendingChannelReadsRef.current.delete(row.channel_id);
          return false;
        }
        pendingChannelReadsRef.current.delete(row.channel_id);
        return true;
      }),
    );
    setDms(
      nextDms.filter((row) => {
        const pending = pendingDmReadsRef.current.get(row.conversation_id);
        if (!pending) return true;
        if (Date.parse(pending) >= Date.parse(row.latest_at)) {
          pendingDmReadsRef.current.delete(row.conversation_id);
          return false;
        }
        pendingDmReadsRef.current.delete(row.conversation_id);
        return true;
      }),
    );
    setLoading(false);
  }, [user]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void refresh();
    }, 120);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onOnline() {
      void refresh();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`unread-feed:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_channel_reads",
          filter: `user_id=eq.${user.id}`,
        },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_dm_reads",
          filter: `user_id=eq.${user.id}`,
        },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages" },
        () => scheduleRefresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [user, scheduleRefresh]);

  const channelCountById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of channels) map[row.channel_id] = row.unread_count;
    return map;
  }, [channels]);

  const serverCountById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of aggregateServerUnread(channels)) {
      map[row.serverId] = row.count;
    }
    return map;
  }, [channels]);

  const dmCountById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of dms) map[row.conversation_id] = row.unread_count;
    return map;
  }, [dms]);

  const totalDmUnread = useMemo(
    () => dms.reduce((sum, row) => sum + row.unread_count, 0),
    [dms],
  );

  const bellCount = useMemo(
    () => countUnreadPanelRows({ notifications, channels, dms }).total,
    [notifications, channels, dms],
  );

  const markNotificationRead = useCallback(
    async (id: string, read = true) => {
      setNotifications((prev) =>
        prev.map((item) => (item.id === id ? { ...item, read } : item)),
      );
      const supabase = createClient();
      await supabase.from("notifications").update({ read }).eq("id", id);
    },
    [],
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!user) return;
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    // Also clear message unread by advancing reads to now for all unread channels/dms
    const now = new Date().toISOString();
    const channelIds = [...new Set(channels.map((c) => c.channel_id))];
    const dmIds = [...new Set(dms.map((d) => d.conversation_id))];
    setChannels([]);
    setDms([]);
    publishReadSync({ type: "mark-all", at: now, channelIds, dmIds });
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    await Promise.all([
      ...channelIds.map((id) => saveChannelRead(user.id, id, now)),
      ...dmIds.map((id) => saveDmRead(user.id, id, now)),
    ]);
    void refresh();
  }, [user, channels, dms, refresh]);

  const markChannelRead = useCallback(
    async (channelId: string, at?: string) => {
      if (!user) return;
      const when = at ?? new Date().toISOString();
      pendingChannelReadsRef.current.set(channelId, when);
      setChannels((prev) => prev.filter((row) => row.channel_id !== channelId));
      publishReadSync({ type: "channel", channelId, at: when });
      await saveChannelRead(user.id, channelId, when);
      // Mark related mention/reply notifs for this channel as read
      const toMark: string[] = [];
      setNotifications((prev) =>
        prev.map((item) => {
          if (item.read) return item;
          const meta = item.meta ?? {};
          if (meta.channel_id === channelId || item.link?.includes(channelId)) {
            toMark.push(item.id);
            return { ...item, read: true };
          }
          return item;
        }),
      );
      if (toMark.length > 0) {
        const supabase = createClient();
        await Promise.all(
          toMark.map((id) =>
            supabase.from("notifications").update({ read: true }).eq("id", id),
          ),
        );
      }
    },
    [user],
  );

  const markDmRead = useCallback(
    async (conversationId: string, at?: string) => {
      if (!user) return;
      const when = at ?? new Date().toISOString();
      pendingDmReadsRef.current.set(conversationId, when);
      setDms((prev) =>
        prev.filter((row) => row.conversation_id !== conversationId),
      );
      publishReadSync({ type: "dm", conversationId, at: when });
      await saveDmRead(user.id, conversationId, when);
      const toMark: string[] = [];
      setNotifications((prev) =>
        prev.map((item) => {
          if (item.read) return item;
          if (
            item.meta?.conversation_id === conversationId ||
            item.link?.includes(conversationId)
          ) {
            toMark.push(item.id);
            return { ...item, read: true };
          }
          return item;
        }),
      );
      if (toMark.length > 0) {
        const supabase = createClient();
        await Promise.all(
          toMark.map((id) =>
            supabase.from("notifications").update({ read: true }).eq("id", id),
          ),
        );
      }
    },
    [user],
  );

  const markServerRead = useCallback(
    async (serverId: string) => {
      if (!user) return;
      const now = new Date().toISOString();
      const ids = channels
        .filter((c) => c.server_id === serverId)
        .map((c) => c.channel_id);
      setChannels((prev) => prev.filter((c) => c.server_id !== serverId));
      for (const id of ids) {
        publishReadSync({ type: "channel", channelId: id, at: now });
      }
      await Promise.all(ids.map((id) => saveChannelRead(user.id, id, now)));
      setNotifications((prev) =>
        prev.map((item) => {
          if (item.read) return item;
          if (item.meta?.server_id === serverId) return { ...item, read: true };
          if (item.link?.includes(`/channels/${serverId}/`)) {
            return { ...item, read: true };
          }
          return item;
        }),
      );
      void refresh();
    },
    [user, channels, refresh],
  );

  const noteChannelActivity = useCallback(
    (
      channelId: string,
      at: string,
      meta?: { serverId?: string; serverName?: string; channelName?: string },
    ) => {
      const pending = pendingChannelReadsRef.current.get(channelId);
      if (pending && Date.parse(pending) >= Date.parse(at)) return;
      setChannels((prev) => {
        const idx = prev.findIndex((row) => row.channel_id === channelId);
        if (idx >= 0) {
          const next = [...prev];
          const row = next[idx]!;
          next[idx] = {
            ...row,
            unread_count: row.unread_count + 1,
            latest_at: at,
          };
          return next.sort(
            (a, b) => Date.parse(b.latest_at) - Date.parse(a.latest_at),
          );
        }
        if (!meta?.serverId) return prev;
        return [
          {
            channel_id: channelId,
            server_id: meta.serverId,
            channel_name: meta.channelName ?? "channel",
            server_name: meta.serverName ?? "Server",
            server_icon: null,
            unread_count: 1,
            latest_at: at,
          },
          ...prev,
        ];
      });
      scheduleRefresh();
    },
    [scheduleRefresh],
  );

  const noteDmActivity = useCallback(
    (
      conversationId: string,
      at: string,
      meta?: { title?: string; avatarUrl?: string | null },
    ) => {
      const pending = pendingDmReadsRef.current.get(conversationId);
      if (pending && Date.parse(pending) >= Date.parse(at)) return;
      setDms((prev) => {
        const idx = prev.findIndex(
          (row) => row.conversation_id === conversationId,
        );
        if (idx >= 0) {
          const next = [...prev];
          const row = next[idx]!;
          next[idx] = {
            ...row,
            unread_count: row.unread_count + 1,
            latest_at: at,
          };
          return next.sort(
            (a, b) => Date.parse(b.latest_at) - Date.parse(a.latest_at),
          );
        }
        return [
          {
            conversation_id: conversationId,
            is_group: false,
            group_name: null,
            unread_count: 1,
            latest_at: at,
            other_user_id: null,
            other_username: meta?.title ?? "Direct Message",
            other_avatar_url: meta?.avatarUrl ?? null,
          },
          ...prev,
        ];
      });
      scheduleRefresh();
    },
    [scheduleRefresh],
  );

  const deleteNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
  }, []);

  const deleteAllReadNotifications = useCallback(async () => {
    if (!user) return;
    setNotifications((prev) => prev.filter((item) => !item.read));
    const supabase = createClient();
    await supabase
      .from("notifications")
      .delete()
      .eq("user_id", user.id)
      .eq("read", true);
  }, [user]);

  const value = useMemo<UnreadContextValue>(
    () => ({
      loading,
      notifications,
      channels,
      dms,
      channelCountById,
      serverCountById,
      dmCountById,
      totalDmUnread,
      bellCount,
      refresh,
      markNotificationRead,
      markAllNotificationsRead,
      markChannelRead,
      markDmRead,
      markServerRead,
      deleteNotification,
      deleteAllReadNotifications,
      noteChannelActivity,
      noteDmActivity,
    }),
    [
      loading,
      notifications,
      channels,
      dms,
      channelCountById,
      serverCountById,
      dmCountById,
      totalDmUnread,
      bellCount,
      refresh,
      markNotificationRead,
      markAllNotificationsRead,
      markChannelRead,
      markDmRead,
      markServerRead,
      deleteNotification,
      deleteAllReadNotifications,
      noteChannelActivity,
      noteDmActivity,
    ],
  );

  return (
    <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>
  );
}

export function useUnread() {
  const ctx = useContext(UnreadContext);
  if (!ctx) {
    throw new Error("useUnread must be used within UnreadProvider");
  }
  return ctx;
}

export function useOptionalUnread() {
  return useContext(UnreadContext);
}
