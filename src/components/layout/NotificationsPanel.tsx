"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEscapeToClose } from "@/hooks/useEscapeToClose";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Mail,
  MessageSquare,
  AtSign,
  Reply,
  Trash2,
  X,
} from "lucide-react";
import { HoverTip } from "@/components/ui/HoverTip";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useOptionalUnread } from "@/components/notifications/UnreadProvider";
import {
  aggregateServerUnread,
  formatUnreadCount,
  isIndividualNotification,
  type AppNotification,
} from "@/lib/unread";
import {
  messengerChannelPath,
  messengerDmPath,
} from "@/lib/messenger-routes";
import { avatarLetter } from "@/lib/avatar";

type FriendsOpenTab = "friends" | "pending" | "add" | "blocked";

type NotificationsPanelProps = {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  onUnreadChange?: (count: number) => void;
  onOpenFriends?: (tab: FriendsOpenTab) => void;
};

function serverInitials(name: string) {
  return avatarLetter(name);
}

/** Prefer deep links with msg/thread; rewrite legacy /messenger/dms/ paths. */
function notificationHref(item: AppNotification): string | null {
  const meta = item.meta ?? {};
  const messageId =
    typeof meta.message_id === "string" ? meta.message_id : null;
  const threadId =
    typeof meta.thread_id === "string" ? meta.thread_id : null;
  const serverId =
    typeof meta.server_id === "string" ? meta.server_id : null;
  const channelId =
    typeof meta.channel_id === "string" ? meta.channel_id : null;
  const conversationId =
    typeof meta.conversation_id === "string" ? meta.conversation_id : null;

  if (serverId && channelId) {
    const params = new URLSearchParams();
    if (messageId) params.set("msg", messageId);
    if (threadId) params.set("thread", threadId);
    const qs = params.toString();
    return `${messengerChannelPath(serverId, channelId)}${qs ? `?${qs}` : ""}`;
  }
  if (conversationId) {
    const params = new URLSearchParams();
    if (messageId) params.set("msg", messageId);
    const qs = params.toString();
    return `${messengerDmPath(conversationId)}${qs ? `?${qs}` : ""}`;
  }

  let link = item.link?.trim() || null;
  if (!link) return null;
  // Legacy DM reply links used /messenger/dms/:id
  const legacyDm = link.match(/^\/messenger\/dms\/([^/?#]+)/i);
  if (legacyDm?.[1]) {
    const params = new URLSearchParams();
    if (messageId) params.set("msg", messageId);
    const qs = params.toString();
    return `${messengerDmPath(legacyDm[1])}${qs ? `?${qs}` : ""}`;
  }
  if (messageId && !/[?&]msg=/.test(link)) {
    link += `${link.includes("?") ? "&" : "?"}msg=${encodeURIComponent(messageId)}`;
  }
  if (threadId && !/[?&]thread=/.test(link)) {
    link += `${link.includes("?") ? "&" : "?"}thread=${encodeURIComponent(threadId)}`;
  }
  return link;
}

export function NotificationsPanel({
  open,
  onClose,
  userId,
  onUnreadChange,
  onOpenFriends,
}: NotificationsPanelProps) {
  const router = useRouter();
  const unread = useOptionalUnread();
  const [readOpen, setReadOpen] = useState(true);
  const [confirmDeleteAllRead, setConfirmDeleteAllRead] = useState(false);
  const [deletingAllRead, setDeletingAllRead] = useState(false);

  // Keep Navbar badge in sync when provider updates.
  const bellCount = unread?.bellCount ?? 0;
  useEffect(() => {
    onUnreadChange?.(bellCount);
  }, [bellCount, onUnreadChange]);

  useEscapeToClose(open, onClose);

  if (!open) return null;

  const loading = unread?.loading ?? false;
  const channels = unread?.channels ?? [];
  const dms = unread?.dms ?? [];
  const notifications = (unread?.notifications ?? []).filter((n) =>
    isIndividualNotification(n.type),
  );

  const serverAggregates = aggregateServerUnread(channels);

  type PanelItem =
    | {
        key: string;
        kind: "server";
        read: boolean;
        sortAt: string;
        serverId: string;
        serverName: string;
        serverIcon: string | null;
        count: number;
        channelId: string;
        channelName: string;
      }
    | {
        key: string;
        kind: "dm";
        read: boolean;
        sortAt: string;
        conversationId: string;
        title: string;
        avatarUrl: string | null;
        count: number;
      }
    | {
        key: string;
        kind: "notif";
        read: boolean;
        sortAt: string;
        item: AppNotification;
      };

  const unreadItems: PanelItem[] = [
    ...serverAggregates.map((row) => ({
      key: `server:${row.serverId}`,
      kind: "server" as const,
      read: false,
      sortAt: row.latestAt,
      serverId: row.serverId,
      serverName: row.serverName,
      serverIcon: row.serverIcon,
      count: row.count,
      channelId: row.latestChannelId,
      channelName: row.latestChannelName,
    })),
    ...dms.map((row) => ({
      key: `dm:${row.conversation_id}`,
      kind: "dm" as const,
      read: false,
      sortAt: row.latest_at,
      conversationId: row.conversation_id,
      title: row.is_group
        ? row.group_name?.trim() || "Group DM"
        : row.other_username || "Direct Message",
      avatarUrl: row.is_group ? null : row.other_avatar_url,
      count: row.unread_count,
    })),
    ...notifications
      .filter((n) => !n.read)
      .map((item) => ({
        key: `notif:${item.id}`,
        kind: "notif" as const,
        read: false,
        sortAt: item.created_at,
        item,
      })),
  ].sort((a, b) => Date.parse(b.sortAt) - Date.parse(a.sortAt));

  const readItems: PanelItem[] = notifications
    .filter((n) => n.read)
    .map((item) => ({
      key: `notif:${item.id}`,
      kind: "notif" as const,
      read: true,
      sortAt: item.created_at,
      item,
    }));

  const hasUnread = unreadItems.length > 0;
  const empty = unreadItems.length === 0 && readItems.length === 0;

  function friendsTabFromNotification(
    item: AppNotification,
  ): FriendsOpenTab | null {
    if (
      item.type === "friend_request" ||
      item.link?.includes("friends=pending")
    ) {
      return "pending";
    }
    if (
      item.type === "friend_declined" ||
      item.link?.includes("friends=add")
    ) {
      return "add";
    }
    if (
      item.type === "friend_accepted" ||
      item.type === "friend_removed" ||
      item.link?.includes("friends=friends")
    ) {
      return "friends";
    }
    return null;
  }

  async function openItem(entry: PanelItem) {
    // Aggregates: navigate only — auto-mark-on-view clears badges after the divider is seen.
    if (entry.kind === "server") {
      onClose();
      router.push(messengerChannelPath(entry.serverId, entry.channelId));
      return;
    }
    if (entry.kind === "dm") {
      onClose();
      router.push(messengerDmPath(entry.conversationId));
      return;
    }
    if (!entry.item.read) {
      await unread?.markNotificationRead(entry.item.id, true);
    }
    onClose();
    const friendsTab = friendsTabFromNotification(entry.item);
    if (friendsTab) {
      onOpenFriends?.(friendsTab);
      return;
    }
    const href = notificationHref(entry.item);
    if (href) router.push(href);
  }

  async function toggleRead(
    entry: PanelItem,
    event: { stopPropagation: () => void },
  ) {
    event.stopPropagation();
    if (entry.kind === "server") {
      if (entry.read) return;
      await unread?.markServerRead(entry.serverId);
      return;
    }
    if (entry.kind === "dm") {
      if (entry.read) return;
      await unread?.markDmRead(entry.conversationId);
      return;
    }
    await unread?.markNotificationRead(entry.item.id, !entry.item.read);
  }

  async function deleteItem(
    entry: PanelItem,
    event: { stopPropagation: () => void },
  ) {
    event.stopPropagation();
    if (entry.kind !== "notif") return;
    await unread?.deleteNotification(entry.item.id);
  }

  async function confirmDeleteAllReadAction() {
    setDeletingAllRead(true);
    try {
      await unread?.deleteAllReadNotifications();
      setConfirmDeleteAllRead(false);
    } finally {
      setDeletingAllRead(false);
    }
  }

  function NotifIcon({ type }: { type: string }) {
    if (type === "mention") return <AtSign className="h-4 w-4" strokeWidth={2} />;
    if (type === "reply") return <Reply className="h-4 w-4" strokeWidth={2} />;
    if (type.startsWith("friend")) {
      return <Mail className="h-4 w-4" strokeWidth={2} />;
    }
    return <Bell className="h-4 w-4" strokeWidth={2} />;
  }

  function Row({ entry }: { entry: PanelItem }) {
    const canDelete = entry.kind === "notif";
    return (
      <li>
        <div
          role="button"
          tabIndex={0}
          onClick={() => void openItem(entry)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              void openItem(entry);
            }
          }}
          className={`group flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-white/5 ${
            entry.read ? "opacity-75" : "bg-[#ed4245]/[0.06]"
          }`}
        >
          {entry.kind === "server" ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#3a3c43] text-sm font-bold text-white">
              {entry.serverIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.serverIcon}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                serverInitials(entry.serverName)
              )}
            </span>
          ) : entry.kind === "dm" ? (
            <UserAvatar
              username={entry.title}
              avatarUrl={entry.avatarUrl}
              size="sm"
              className="!h-9 !w-9"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3a3c43] text-[#b5bac1]">
              <NotifIcon type={entry.item.type} />
            </span>
          )}

          <span className="min-w-0 flex-1">
            {entry.kind === "server" ? (
              <>
                <span className="block truncate text-sm font-semibold text-white">
                  {entry.serverName}
                </span>
                <span className="mt-0.5 block text-xs text-[#b5bac1]">
                  {formatUnreadCount(entry.count)} new message
                  {entry.count === 1 ? "" : "s"}
                  {entry.channelName ? ` · #${entry.channelName}` : ""}
                </span>
              </>
            ) : entry.kind === "dm" ? (
              <>
                <span className="block truncate text-sm font-semibold text-white">
                  {entry.title}
                </span>
                <span className="mt-0.5 block text-xs text-[#b5bac1]">
                  {formatUnreadCount(entry.count)} new message
                  {entry.count === 1 ? "" : "s"}
                </span>
              </>
            ) : (
              <>
                <span className="block text-sm font-semibold text-white">
                  {entry.item.title}
                </span>
                {entry.item.body ? (
                  <span className="mt-0.5 line-clamp-2 block text-xs text-[#b5bac1]">
                    {entry.item.body}
                  </span>
                ) : null}
              </>
            )}
          </span>

          <span className="flex shrink-0 items-center gap-0.5">
            <HoverTip
              label={entry.read ? "Mark as unread" : "Mark as read"}
              delayMs={40}
            >
              <button
                type="button"
                onClick={(event) => void toggleRead(entry, event)}
                className="rounded-md p-1.5 text-[#b5bac1] opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white/10 hover:text-white"
                aria-label={entry.read ? "Mark as unread" : "Mark as read"}
              >
                {entry.read ? (
                  <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
                ) : (
                  <Check className="h-3.5 w-3.5" strokeWidth={2} />
                )}
              </button>
            </HoverTip>
            {canDelete ? (
              <HoverTip label="Delete notification" delayMs={40}>
                <button
                  type="button"
                  onClick={(event) => void deleteItem(entry, event)}
                  className="rounded-md p-1.5 text-[#b5bac1] opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 hover:bg-white/10 hover:text-[#ed4245]"
                  aria-label="Delete notification"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </HoverTip>
            ) : null}
          </span>
        </div>
      </li>
    );
  }

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close notifications"
        onClick={onClose}
      />
      <div className="absolute right-3 top-14 flex max-h-[min(80vh,32rem)] w-[min(100vw-1.5rem,24rem)] flex-col overflow-hidden rounded-lg border border-[var(--ms-border)] bg-[#111214] shadow-2xl shadow-black/50 sm:right-5">
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--ms-border)] px-3 py-2.5">
          <Bell className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <h2 className="flex-1 text-sm font-semibold text-foreground">
            Notifications
          </h2>
          <HoverTip label="Mark all as read" delayMs={40}>
            <button
              type="button"
              disabled={!hasUnread || !userId}
              onClick={() => void unread?.markAllNotificationsRead()}
              className="rounded-md p-1.5 text-muted transition hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Mark all as read"
            >
              <CheckCheck className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </HoverTip>
          <HoverTip label="Close" delayMs={40}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </HoverTip>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && empty ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Loading…</p>
          ) : empty ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              You’re all caught up
            </p>
          ) : (
            <>
              {unreadItems.length > 0 ? (
                <div>
                  <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#b5bac1]">
                    Unread
                  </p>
                  <ul className="divide-y divide-white/[0.04]">
                    {unreadItems.map((entry) => (
                      <Row key={entry.key} entry={entry} />
                    ))}
                  </ul>
                </div>
              ) : null}

              {readItems.length > 0 ? (
                <div className="border-t border-[var(--ms-border)]">
                  <div className="flex items-center gap-1 px-1 pr-2">
                    <button
                      type="button"
                      onClick={() => setReadOpen((v) => !v)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#b5bac1] hover:bg-white/[0.03]"
                    >
                      {readOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
                      )}
                      Read
                    </button>
                    <HoverTip label="Delete all read" delayMs={40}>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAllRead(true)}
                        className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#b5bac1] hover:bg-white/10 hover:text-[#ed4245]"
                      >
                        Delete all
                      </button>
                    </HoverTip>
                  </div>
                  {readOpen ? (
                    <ul className="divide-y divide-white/[0.04]">
                      {readItems.map((entry) => (
                        <Row key={entry.key} entry={entry} />
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmDeleteAllRead}
        title="Delete all read notifications?"
        description="This permanently removes every read notification. Unread items are kept."
        confirmLabel="Delete all"
        danger
        busy={deletingAllRead}
        onConfirm={() => void confirmDeleteAllReadAction()}
        onCancel={() => {
          if (!deletingAllRead) setConfirmDeleteAllRead(false);
        }}
      />
    </div>
  );
}
