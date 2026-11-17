"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Check,
  EyeOff,
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
import { PresenceCaption } from "@/components/presence/PresenceCaption";
import { resolveDisplayStatus } from "@/lib/presence";
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
import {
  loadBlockedUsers,
  loadIsBlockedBy,
  type BlockedUser,
} from "@/lib/blocking";
import {
  loadIgnoredUsers,
  type IgnoredUser,
} from "@/lib/ignoring";
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
  { id: "ignored", label: "Ignored" },
  { id: "blocked", label: "Blocked" },
];

const BLOCKED_SEEN_KEY = "redsss-blocked-seen-ids";

function readSeenBlockedIds(userId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(`${BLOCKED_SEEN_KEY}:${userId}`);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeSeenBlockedIds(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(
      `${BLOCKED_SEEN_KEY}:${userId}`,
      JSON.stringify([...ids]),
    );
  } catch {
    /* ignore */
  }
}

export function FriendsPanel({
  open,
  onClose,
  onMessage,
  userId,
  initialTab = "friends",
}: FriendsPanelProps) {
  const profileUi = useOptionalProfileUi();
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
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [ignoredUsers, setIgnoredUsers] = useState<IgnoredUser[]>([]);
  const [seenBlockedIds, setSeenBlockedIds] = useState<Set<string>>(() => new Set());
  /** Search hits who have blocked the current user. */
  const [blockedByThemIds, setBlockedByThemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [unblockTarget, setUnblockTarget] = useState<BlockedUser | null>(null);
  const [unblocking, setUnblocking] = useState(false);
  const [unignoreBusyId, setUnignoreBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab(profileUi?.friendsTab ?? initialTab);
  }, [open, initialTab, profileUi?.friendsTab]);

  useEffect(() => {
    if (!userId) {
      setSeenBlockedIds(new Set());
      return;
    }
    const stored = readSeenBlockedIds(userId);
    if (stored) setSeenBlockedIds(stored);
  }, [userId]);

  // First visit: treat current blocks as already seen so only *new* blocks highlight.
  useEffect(() => {
    if (!userId || loading) return;
    if (readSeenBlockedIds(userId) != null) return;
    const seeded = new Set(blockedUsers.map((person) => person.id));
    writeSeenBlockedIds(userId, seeded);
    setSeenBlockedIds(seeded);
  }, [userId, loading, blockedUsers]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setEdges([]);
      setBlockedUsers([]);
      setIgnoredUsers([]);
      return;
    }
    setLoading(true);
    const [
      { edges: next, error: loadError },
      blockedResult,
      ignoredResult,
    ] = await Promise.all([
      loadFriendEdges(userId),
      loadBlockedUsers(),
      loadIgnoredUsers(),
    ]);
    const blockedIds = new Set(
      (blockedResult.users ?? []).map((person) => person.id),
    );
    // Hide anyone you've blocked from friends/pending lists.
    setEdges(next.filter((edge) => !blockedIds.has(edge.other.id)));
    setBlockedUsers(blockedResult.users);
    setIgnoredUsers(ignoredResult.users);
    setError(loadError ?? blockedResult.error ?? ignoredResult.error);
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "blocked_users",
          filter: `blocker_id=eq.${userId}`,
        },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ignored_users",
          filter: `ignorer_id=eq.${userId}`,
        },
        () => {
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            status?: string;
            status_text?: string | null;
            last_seen_at?: string | null;
            avatar_url?: string | null;
            username?: string;
          };
          if (!row?.id) return;
          setEdges((prev) => {
            if (!prev.some((edge) => edge.other.id === row.id)) return prev;
            return prev.map((edge) =>
              edge.other.id === row.id
                ? {
                    ...edge,
                    other: {
                      ...edge.other,
                      status: row.status ?? edge.other.status,
                      status_text:
                        row.status_text !== undefined
                          ? row.status_text
                          : edge.other.status_text,
                      last_seen_at:
                        row.last_seen_at !== undefined
                          ? row.last_seen_at
                          : edge.other.last_seen_at,
                      avatar_url:
                        row.avatar_url !== undefined
                          ? row.avatar_url
                          : edge.other.avatar_url,
                      username: row.username ?? edge.other.username,
                    },
                  }
                : edge,
            );
          });
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
      setBlockedByThemIds(new Set());
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
        const blockedChecks = await Promise.all(
          next.map(async (person) => {
            const { blockedByThem } = await loadIsBlockedBy(person.id);
            return blockedByThem ? person.id : null;
          }),
        );
        if (cancelled) return;
        setBlockedByThemIds(
          new Set(blockedChecks.filter((id): id is string => !!id)),
        );
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
    if (next === "blocked" && userId) {
      const nextSeen = new Set(blockedUsers.map((person) => person.id));
      setSeenBlockedIds(nextSeen);
      writeSeenBlockedIds(userId, nextSeen);
    }
  }

  // Opening directly on Blocked (e.g. from a notification) also clears the highlight.
  useEffect(() => {
    if (!open || !userId || tab !== "blocked") return;
    const nextSeen = new Set(blockedUsers.map((person) => person.id));
    setSeenBlockedIds((prev) => {
      let changed = nextSeen.size !== prev.size;
      if (!changed) {
        for (const id of nextSeen) {
          if (!prev.has(id)) {
            changed = true;
            break;
          }
        }
      }
      if (!changed) return prev;
      writeSeenBlockedIds(userId, nextSeen);
      return nextSeen;
    });
  }, [open, userId, tab, blockedUsers]);

  const unseenBlockedCount = useMemo(() => {
    let count = 0;
    for (const person of blockedUsers) {
      if (!seenBlockedIds.has(person.id)) count += 1;
    }
    return count;
  }, [blockedUsers, seenBlockedIds]);

  async function handleMessage(person: FriendProfile) {
    if (profileUi?.isBlocked(person.id)) {
      setError("You blocked this user. Unblock them to send messages.");
      return;
    }
    const { blockedByThem } = await loadIsBlockedBy(person.id);
    if (blockedByThem) {
      setError("This user has blocked you.");
      return;
    }
    onMessage({
      id: person.id,
      username: person.username,
      avatar_url: person.avatar_url,
      status: person.status,
    });
    const result = await profileUi?.messageUser(person.id);
    if (result?.error) {
      setError(result.error);
      return;
    }
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
    if (!userId) return;
    if (profileUi?.isBlocked(person.id)) {
      setError("Unblock this user before sending a friend request.");
      return;
    }
    if (blockedByThemIds.has(person.id)) {
      setError("This user has blocked you.");
      return;
    }
    const { blockedByThem } = await loadIsBlockedBy(person.id);
    if (blockedByThem) {
      setBlockedByThemIds((prev) => new Set(prev).add(person.id));
      setError("This user has blocked you.");
      return;
    }
    setBusyId(person.id);
    const { error: sendError } = await sendFriendRequest(userId, person.id);
    setBusyId(null);
    if (sendError) {
      const lower = sendError.toLowerCase();
      setError(
        lower.includes("violates row-level security") ||
          lower.includes("blocked")
          ? "This user has blocked you."
          : sendError,
      );
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

  async function confirmUnblock() {
    if (!unblockTarget || !profileUi) return;
    setUnblocking(true);
    const { error: unblockError } = await profileUi.unblockUser(unblockTarget.id);
    setUnblocking(false);
    if (unblockError) {
      setError(unblockError);
      return;
    }
    setUnblockTarget(null);
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
              {ignoredUsers.length > 0
                ? ` · ${ignoredUsers.length} ignored`
                : ""}
              {blockedUsers.length > 0
                ? ` · ${blockedUsers.length} blocked`
                : ""}
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
            const pendingBadge =
              item.id === "pending" ? incoming.length + outgoing.length : 0;
            const blockedTotal =
              item.id === "blocked" ? blockedUsers.length : 0;
            const blockedUnseen =
              item.id === "blocked" ? unseenBlockedCount : 0;
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
                {pendingBadge > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] text-white">
                    {pendingBadge}
                  </span>
                )}
                {blockedUnseen > 0 ? (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] text-white">
                    {blockedUnseen}
                  </span>
                ) : blockedTotal > 0 ? (
                  <span className="ml-1.5 text-[10px] font-medium text-muted">
                    {blockedTotal}
                  </span>
                ) : null}
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
                          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${statusDotClass(resolveDisplayStatus(edge.other.status, edge.other.last_seen_at))}`}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {profileUi?.nicknameFor(edge.other.id) ||
                            edge.other.username}
                        </span>
                        <PresenceCaption
                          userId={edge.other.id}
                          status={edge.other.status}
                          lastSeenAt={edge.other.last_seen_at}
                          customStatus={edge.other.status_text}
                          className="mt-0.5"
                        />
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
                  const blocked = profileUi?.isBlocked(person.id) ?? false;
                  const blockedByThem = blockedByThemIds.has(person.id);
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
                            {blocked
                              ? "Blocked"
                              : blockedByThem
                                ? "Blocked you"
                                : statusLabel(person.status)}
                          </span>
                        </span>
                      </button>
                      {blocked ? (
                        <button
                          type="button"
                          onClick={() => setUnblockTarget(
                            blockedUsers.find((row) => row.id === person.id) ?? {
                              ...person,
                              blocked_at: new Date().toISOString(),
                            },
                          )}
                          className="rounded-md bg-[#3f4147] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#4e5058]"
                        >
                          Unblock
                        </button>
                      ) : blockedByThem ? (
                        <button
                          type="button"
                          disabled
                          title="This user has blocked you"
                          className="inline-flex cursor-not-allowed items-center gap-1 rounded-md bg-[#3f4147] px-2.5 py-1.5 text-xs font-medium text-[#f2b8b5] opacity-90"
                        >
                          <Ban className="h-3.5 w-3.5" strokeWidth={2} />
                          They Blocked You
                        </button>
                      ) : (
                        <>
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
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {tab === "ignored" && (
            <ul>
              {loading && (
                <li className="px-3 py-6 text-center text-sm text-muted">
                  Loading ignored users…
                </li>
              )}
              {!loading && ignoredUsers.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted">
                  No ignored users.
                </li>
              )}
              {!loading &&
                ignoredUsers.map((person) => (
                  <li
                    key={person.id}
                    className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => profileUi?.openBigProfile(person.id)}
                    >
                      <span className="relative shrink-0">
                        <UserAvatar
                          username={person.username}
                          avatarUrl={person.avatar_url}
                          size="md"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface p-0.5 text-[#949ba4]">
                          <EyeOff className="h-3 w-3" strokeWidth={2} />
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {profileUi?.nicknameFor(person.id) || person.username}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          Ignored
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={unignoreBusyId === person.id}
                      onClick={() => {
                        if (!profileUi) return;
                        setUnignoreBusyId(person.id);
                        void profileUi.unignoreUser(person.id).then((result) => {
                          setUnignoreBusyId(null);
                          if (result.error) setError(result.error);
                          else void refresh();
                        });
                      }}
                      className="rounded-md bg-[#3f4147] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#4e5058] disabled:opacity-50"
                    >
                      Unignore
                    </button>
                  </li>
                ))}
            </ul>
          )}

          {tab === "blocked" && (
            <ul>
              {loading && (
                <li className="px-3 py-6 text-center text-sm text-muted">
                  Loading blocked users…
                </li>
              )}
              {!loading && blockedUsers.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted">
                  No blocked users.
                </li>
              )}
              {!loading &&
                blockedUsers.map((person) => (
                  <li
                    key={person.id}
                    className="mb-1 flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => profileUi?.openBigProfile(person.id)}
                    >
                      <span className="relative shrink-0">
                        <UserAvatar
                          username={person.username}
                          avatarUrl={person.avatar_url}
                          size="md"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface p-0.5 text-accent">
                          <Ban className="h-3 w-3" strokeWidth={2} />
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {person.username}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          Blocked
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setUnblockTarget(person)}
                      className="rounded-md bg-[#3f4147] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#4e5058]"
                    >
                      Unblock
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </aside>

      <ConfirmModal
        open={!!removeTarget}
        title="Remove friend"
        description={
          removeTarget
            ? `Remove ${removeTarget.other.username} from your friends? Your direct messages with them will stay.`
            : null
        }
        confirmLabel="Remove"
        danger
        busy={removing}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void confirmRemove()}
      />

      <ConfirmModal
        open={!!unblockTarget}
        title={
          unblockTarget
            ? `Unblock ${unblockTarget.username}?`
            : "Unblock user?"
        }
        description="They will be able to message you and send friend requests again. You will not automatically become friends."
        confirmLabel="Unblock"
        cancelLabel="Cancel"
        busy={unblocking}
        onCancel={() => {
          if (!unblocking) setUnblockTarget(null);
        }}
        onConfirm={() => void confirmUnblock()}
      />
    </>
  );
}
