export const UNREAD_BADGE_RED = "#ed4245";

export function formatUnreadCount(count: number) {
  if (count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

export type UnreadChannelRow = {
  channel_id: string;
  server_id: string;
  channel_name: string;
  server_name: string;
  server_icon: string | null;
  unread_count: number;
  latest_at: string;
};

export type UnreadDmRow = {
  conversation_id: string;
  is_group: boolean;
  group_name: string | null;
  unread_count: number;
  latest_at: string;
  other_user_id: string | null;
  other_username: string | null;
  other_avatar_url: string | null;
};

export type UnreadSummary = {
  channels: UnreadChannelRow[];
  dms: UnreadDmRow[];
};

export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
  meta?: Record<string, unknown> | null;
};

/** Types shown as individual inbox rows (not folded into aggregates). */
export const INDIVIDUAL_NOTIFICATION_TYPES = new Set([
  "mention",
  "reply",
  "friend_request",
  "friend_accepted",
  "friend_declined",
  "friend_removed",
]);

export function isIndividualNotification(type: string) {
  return INDIVIDUAL_NOTIFICATION_TYPES.has(type);
}

/** Bell badge and panel Unread section must use this same formula. */
export function countUnreadPanelRows(opts: {
  notifications: AppNotification[];
  channels: UnreadChannelRow[];
  dms: UnreadDmRow[];
}) {
  const individual = opts.notifications.filter(
    (n) => !n.read && isIndividualNotification(n.type),
  ).length;
  const serverRows = aggregateServerUnread(opts.channels).length;
  const dmRows = opts.dms.length;
  return { total: individual + serverRows + dmRows, individual, serverRows, dmRows };
}

export function aggregateServerUnread(channels: UnreadChannelRow[]) {
  const map = new Map<
    string,
    {
      serverId: string;
      serverName: string;
      serverIcon: string | null;
      count: number;
      latestAt: string;
      latestChannelId: string;
      latestChannelName: string;
    }
  >();
  for (const row of channels) {
    const prev = map.get(row.server_id);
    if (!prev) {
      map.set(row.server_id, {
        serverId: row.server_id,
        serverName: row.server_name,
        serverIcon: row.server_icon,
        count: row.unread_count,
        latestAt: row.latest_at,
        latestChannelId: row.channel_id,
        latestChannelName: row.channel_name,
      });
      continue;
    }
    prev.count += row.unread_count;
    if (Date.parse(row.latest_at) > Date.parse(prev.latestAt)) {
      prev.latestAt = row.latest_at;
      prev.latestChannelId = row.channel_id;
      prev.latestChannelName = row.channel_name;
      prev.serverIcon = row.server_icon ?? prev.serverIcon;
      prev.serverName = row.server_name || prev.serverName;
    }
  }
  return [...map.values()].sort(
    (a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt),
  );
}
