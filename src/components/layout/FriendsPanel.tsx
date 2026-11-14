"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  MessageSquare,
  Search,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { statusDotClass, statusLabel } from "@/components/messenger/data";
import { useOptionalProfileUi, type FriendsTab } from "@/components/profile/ProfileProvider";
import {
  acceptFriendRequest,
  declineOrCancelFriendRequest,
  loadFriendEdges,
  relationshipFor,
  removeFriendship,
  searchProfiles,
  sendFriendRequest,
  splitFriendEdges,
  type FriendEdge,
  type FriendProfile,
} from "@/lib/friends";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import {
  FRIENDS_PANEL_MAX,
  FRIENDS_PANEL_MIN,
  useFriendsPanelWidth,
} from "@/hooks/useFriendsPanelWidth";

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
  initialTab?: FriendsTab;
};

const TABS: { id: FriendsTab; label: string }[] = [
  { id: "friends", label: "Friends" },
  { id: "pending", label: "Pending" },
  { id: "add", label: "Add Friend" },
];

export function FriendsPanel({
  open,
  onClose,
  onMessage,
  userId,
  initialTab = "friends",
}: FriendsPanelProps) {
  const profileUi = useOptionalProfileUi();
  const { profile } = useCurrentProfile();
  const { width, beginResize } = useFriendsPanelWidth();
  const [tab, setTab] = useState<FriendsTab>(initialTab);
  const [edges, setEdges] = useState<FriendEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FriendEdge | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(profileUi?.friendsTab ?? initialTab);
  }, [open, initialTab, profileUi?.friendsTab]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setEdges([]);
      return;
    }
    setLoading(true);
    const { edges: next, error: loadError } = await loadFriendEdges(userId);
    setEdges(next);
    setError(loadError);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!open || !userId) return;
    void refresh();
    const supabase = createClient();
    const channel = supabase
      .channel(`friends-panel:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friends" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, userId, refresh]);

  useEffect(() => {
    if (!open || tab !== "add" || !userId) return;
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        const { results: next, error: searchError } = await searchProfiles(q, userId);
        if (cancelled) return;
        setResults(next);
        if (searchError) setError(searchError);
        setSearching(false);
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, tab, query, userId]);

  const { friends, incoming, outgoing } = useMemo(() => {
    if (!userId) return { friends: [], incoming: [], outgoing: [] };
    return splitFriendEdges(userId, edges);
  }, [userId, edges]);

  function changeTab(next: FriendsTab) {
    setTab(next);
    profileUi?.setFriendsTab(next);
  }

  async function handleMessage(person: FriendProfile) {
    onMessage({
      id: person.id,
      username: person.username,
      avatar_url: person.avatar_url,
      status: person.status,
    });
    await profileUi?.messageUser(person.id);
    onClose();
  }

  async function handleAccept(edge: FriendEdge) {
    setBusyId(edge.id);
    const { error: acceptError } = await acceptFriendRequest(edge.id);
    setBusyId(null);
    if (acceptError) {
      setError(acceptError);
      return;
    }
    await refresh();
    changeTab("friends");
  }

  async function handleDeclineOrCancel(edge: FriendEdge) {
    setBusyId(edge.id);
    const { error: deleteError } = await declineOrCancelFriendRequest(edge.id);
    setBusyId(null);
    if (deleteError) {
      setError(deleteError);
      return;
    }
    await refresh();
  }

  async function handleAdd(person: FriendProfile) {
    if (!userId || !profile) return;
    setBusyId(person.id);
    const { error: sendError } = await sendFriendRequest(
      userId,
      person.id,
      profile.username,
    );
    setBusyId(null);
    if (sendError) {
      setError(sendError);
      return;
    }
    await refresh();
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    const { error: removeError } = await removeFriendship(removeTarget.id);
    setRemoving(false);
    if (removeError) {
      setError(removeError);
      return;
    }
    setRemoveTarget(null);
    await refresh();
  }

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
        className="fixed right-0 top-0 z-50 flex h-full max-w-[100vw] flex-col border-l border-border bg-surface shadow-2xl shadow-black/50"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="friends-panel-title"
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize friends sidebar"
          aria-valuemin={FRIENDS_PANEL_MIN}
          aria-valuemax={FRIENDS_PANEL_MAX}
          aria-valuenow={width}
          onPointerDown={beginResize}
          className="group absolute inset-y-0 -left-1 z-30 w-2 cursor-ew-resize touch-none"
        >
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-accent group-active:bg-accent" />
        </div>
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
              {incoming.length > 0 ? ` · ${incoming.length} pending` : ""}
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

        <div className="flex gap-1 border-b border-border px-3 py-2">
          {TABS.map((item) => {
            const active = tab === item.id;
            const badge =
              item.id === "pending" ? incoming.length + outgoing.length : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => changeTab(item.id)}
                className={`relative rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-accent-muted text-accent"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                {item.label}
                {badge > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] text-white">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <p className="border-b border-border px-4 py-2 text-xs text-accent">
            {error}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {tab === "friends" && (
            <ul>
              {loading && (
                <li className="px-3 py-6 text-center text-sm text-muted">
                  Loading friends…
                </li>
              )}
              {!loading && friends.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted">
                  No friends yet. Use Add Friend to send a request.
                </li>
              )}
              {!loading &&
                friends.map((edge) => (
                  <li
                    key={edge.id}
                    className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => profileUi?.openBigProfile(edge.other.id)}
                    >
                      <span className="relative shrink-0">
                        <UserAvatar
                          username={edge.other.username}
                          avatarUrl={edge.other.avatar_url}
                          size="md"
                        />
                        <span
                          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${statusDotClass(edge.other.status)}`}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {edge.other.username}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {statusLabel(edge.other.status)}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      title="Message"
                      aria-label={`Message ${edge.other.username}`}
                      onClick={() => void handleMessage(edge.other)}
                      className="rounded-md p-2 text-muted hover:bg-surface-raised hover:text-accent"
                    >
                      <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      title="Remove friend"
                      aria-label={`Remove ${edge.other.username}`}
                      onClick={() => setRemoveTarget(edge)}
                      className="rounded-md p-2 text-muted hover:bg-surface-raised hover:text-accent"
                    >
                      <UserMinus className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </li>
                ))}
            </ul>
          )}

          {tab === "pending" && (
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Incoming — {incoming.length}
                </h3>
                {incoming.length === 0 ? (
                  <p className="px-2 text-sm text-muted">No incoming requests.</p>
                ) : (
                  <ul>
                    {incoming.map((edge) => (
                      <li
                        key={edge.id}
                        className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-hover"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() =>
                            profileUi?.openBigProfile(edge.other.id)
                          }
                        >
                          <UserAvatar
                            username={edge.other.username}
                            avatarUrl={edge.other.avatar_url}
                            size="md"
                          />
                          <span className="truncate text-sm font-medium text-foreground">
                            {edge.other.username}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === edge.id}
                          onClick={() => void handleAccept(edge)}
                          className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                        >
                          <span className="inline-flex items-center gap-1">
                            <Check className="h-3.5 w-3.5" strokeWidth={2} />
                            Accept
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === edge.id}
                          onClick={() => void handleDeclineOrCancel(edge)}
                          className="rounded-md bg-[#3f4147] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#4e5058] disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Outgoing — {outgoing.length}
                </h3>
                {outgoing.length === 0 ? (
                  <p className="px-2 text-sm text-muted">No outgoing requests.</p>
                ) : (
                  <ul>
                    {outgoing.map((edge) => (
                      <li
                        key={edge.id}
                        className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-hover"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() =>
                            profileUi?.openBigProfile(edge.other.id)
                          }
                        >
                          <UserAvatar
                            username={edge.other.username}
                            avatarUrl={edge.other.avatar_url}
                            size="md"
                          />
                          <span className="truncate text-sm font-medium text-foreground">
                            {edge.other.username}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === edge.id}
                          onClick={() => void handleDeclineOrCancel(edge)}
                          className="rounded-md bg-[#3f4147] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#4e5058] disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {tab === "add" && (
            <div>
              <label className="relative mb-3 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by username"
                  className="w-full rounded-md border border-border bg-[#1e1f22] py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-accent/50"
                />
              </label>
              {searching && (
                <p className="px-2 py-4 text-center text-sm text-muted">
                  Searching…
                </p>
              )}
              {!searching && query.trim() && results.length === 0 && (
                <p className="px-2 py-4 text-center text-sm text-muted">
                  No users found.
                </p>
              )}
              <ul>
                {results.map((person) => {
                  const rel = userId
                    ? relationshipFor(userId, person.id, edges)
                    : { status: "none" as const, edge: null };
                  return (
                    <li
                      key={person.id}
                      className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-hover"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => profileUi?.openBigProfile(person.id)}
                      >
                        <UserAvatar
                          username={person.username}
                          avatarUrl={person.avatar_url}
                          size="md"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {person.username}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {statusLabel(person.status)}
                          </span>
                        </span>
                      </button>
                      {rel.status === "none" && (
                        <button
                          type="button"
                          disabled={busyId === person.id}
                          onClick={() => void handleAdd(person)}
                          className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                        >
                          <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
                          Add Friend
                        </button>
                      )}
                      {rel.status === "outgoing" && (
                        <span className="rounded-md bg-[#3f4147] px-2.5 py-1.5 text-xs font-medium text-[#dbdee1]">
                          Request Sent
                        </span>
                      )}
                      {rel.status === "friends" && (
                        <span className="rounded-md bg-accent-muted px-2.5 py-1.5 text-xs font-medium text-accent">
                          Friends
                        </span>
                      )}
                      {rel.status === "incoming" && rel.edge && (
                        <button
                          type="button"
                          disabled={busyId === rel.edge.id}
                          onClick={() => void handleAccept(rel.edge!)}
                          className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                        >
                          Accept
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </aside>

      <ConfirmModal
        open={!!removeTarget}
        title="Remove friend"
        description={
          removeTarget
            ? `Remove ${removeTarget.other.username} from your friends?`
            : null
        }
        confirmLabel="Remove"
        danger
        busy={removing}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void confirmRemove()}
      />
    </>
  );
}
