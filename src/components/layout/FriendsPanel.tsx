"use client";

import { useRouter } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { useEffect, useState } from "react";
import { messengerHomePath } from "@/lib/messenger-routes";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { loadProfiles, statusDotClass, statusLabel } from "@/components/messenger/data";

export type FriendListItem = {
  id: string;
  username: string;
  avatar_url: string | null;
  status: string;
};

type FriendsPanelProps = {
  open: boolean;
  onClose: () => void;
  onMessage: (friend: FriendListItem) => void;
  userId: string | null;
};

export function FriendsPanel({
  open,
  onClose,
  onMessage,
  userId,
}: FriendsPanelProps) {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;

    const supabase = createClient();
    let cancelled = false;

    async function loadFriends() {
      if (!userId) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("friends")
        .select("user_id, friend_id")
        .eq("status", "accepted")
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

      if (cancelled) return;

      if (error || !data) {
        setFriends([]);
        setLoading(false);
        return;
      }

      const otherIds = data.map((row) =>
        row.user_id === userId ? row.friend_id : row.user_id,
      );
      const profiles = await loadProfiles(otherIds);
      if (cancelled) return;

      setFriends(
        profiles.map((profile) => ({
          id: profile.id,
          username: profile.username,
          avatar_url: profile.avatar_url,
          status: profile.status || "offline",
        })),
      );
      setLoading(false);
    }

    void loadFriends();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close friends panel"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-border bg-surface shadow-2xl shadow-black/50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="friends-panel-title"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2
              id="friends-panel-title"
              className="text-sm font-semibold tracking-wide text-foreground"
            >
              Friends
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {friends.length} friend{friends.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <ul className="flex-1 overflow-y-auto px-3 py-3">
          {loading && (
            <li className="px-3 py-6 text-center text-sm text-muted">
              Loading friends…
            </li>
          )}
          {!loading && friends.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">
              No friends yet. Friend requests will show up here.
            </li>
          )}
          {!loading &&
            friends.map((friend) => (
              <li
                key={friend.id}
                className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <div className="relative shrink-0">
                  <UserAvatar
                    username={friend.username}
                    avatarUrl={friend.avatar_url}
                    size="md"
                  />
                  <span
                    className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${statusDotClass(friend.status)}`}
                    aria-hidden
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {friend.username}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {statusLabel(friend.status)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    router.push(`${messengerHomePath()}?dm=${friend.id}`);
                    onMessage(friend);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
                  Message
                </button>
              </li>
            ))}
        </ul>
      </aside>
    </>
  );
}
