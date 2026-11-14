"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

type FriendsOpenTab = "friends" | "pending" | "add";

type NotificationsPanelProps = {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  onUnreadChange?: (count: number) => void;
  onOpenFriends?: (tab: FriendsOpenTab) => void;
};

export function NotificationsPanel({
  open,
  onClose,
  userId,
  onUnreadChange,
  onOpenFriends,
}: NotificationsPanelProps) {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      onUnreadChange?.(0);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40);
    const rows = (data as AppNotification[] | null) ?? [];
    setItems(rows);
    onUnreadChange?.(rows.filter((row) => !row.read).length);
    setLoading(false);
  }, [userId, onUnreadChange]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  async function markRead(id: string) {
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item)),
    );
    onUnreadChange?.(
      Math.max(0, items.filter((item) => !item.read && item.id !== id).length),
    );
  }

  async function markAllRead() {
    if (!userId) return;
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    onUnreadChange?.(0);
  }

  function friendsTabFromNotification(item: AppNotification): FriendsOpenTab | null {
    if (item.type === "friend_request" || item.link?.includes("friends=pending")) {
      return "pending";
    }
    if (item.type === "friend_declined" || item.link?.includes("friends=add")) {
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

  async function openItem(item: AppNotification) {
    if (!item.read) await markRead(item.id);
    onClose();
    const friendsTab = friendsTabFromNotification(item);
    if (friendsTab) {
      onOpenFriends?.(friendsTab);
      return;
    }
    if (item.link) router.push(item.link);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close notifications"
        onClick={onClose}
      />
      <div className="absolute right-3 top-14 w-[min(100vw-1.5rem,22rem)] overflow-hidden rounded-lg border border-border bg-[#111214] shadow-2xl shadow-black/50 sm:right-5">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Bell className="h-4 w-4 text-accent" strokeWidth={1.75} />
          <h2 className="flex-1 text-sm font-semibold text-foreground">
            Notifications
          </h2>
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground"
            title="Mark all as read"
            aria-label="Mark all as read"
          >
            <CheckCheck className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
          {loading && items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="divide-y divide-border/80">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void openItem(item)}
                    className={`flex w-full flex-col gap-0.5 px-3 py-3 text-left transition-colors hover:bg-white/5 ${
                      item.read ? "opacity-70" : "bg-accent/5"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      {!item.read && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {item.title}
                        </span>
                        {item.body && (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted">
                            {item.body}
                          </span>
                        )}
                        <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted">
                          {item.type.replace(/_/g, " ")} ·{" "}
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
