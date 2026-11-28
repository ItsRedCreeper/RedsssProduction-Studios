"use client";

import { useEffect, useState } from "react";
import { Ban, Check, UserPlus } from "lucide-react";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { useOptionalProfileUi } from "@/components/profile/ProfileProvider";
import { loadIsBlockedBy } from "@/lib/blocking";
import { createClient } from "@/lib/supabase/client";
import {
  acceptFriendRequest,
  loadFriendshipWith,
  sendFriendRequest,
  type FriendStatus,
} from "@/lib/friends";

type ProfileFriendButtonProps = {
  otherUserId: string;
  /** Compact = small card; default = big modal */
  size?: "sm" | "md";
  className?: string;
  /** Skip the loading flash when status is already known. */
  initialStatus?: FriendStatus;
  initialEdgeId?: string | null;
  /** When known up front (e.g. restricted profile), skip the blocked-by fetch. */
  initialBlockedByThem?: boolean;
};

export function ProfileFriendButton({
  otherUserId,
  size = "md",
  className = "",
  initialStatus,
  initialEdgeId = null,
  initialBlockedByThem,
}: ProfileFriendButtonProps) {
  const { user } = useCurrentProfile();
  const profileUi = useOptionalProfileUi();
  const [status, setStatus] = useState<FriendStatus | "loading">(
    initialStatus ?? "loading",
  );
  const [edgeId, setEdgeId] = useState<string | null>(initialEdgeId);
  const [busy, setBusy] = useState(false);
  const [blockedByThem, setBlockedByThem] = useState(
    initialBlockedByThem ?? false,
  );
  const [relationReady, setRelationReady] = useState(
    initialBlockedByThem !== undefined && !!initialStatus,
  );
  const blocked = profileUi?.isBlocked(otherUserId) ?? false;
  const ignored = profileUi?.isIgnored(otherUserId) ?? false;

  useEffect(() => {
    if (!user || user.id === otherUserId || blocked) {
      setStatus("none");
      setEdgeId(null);
      setBlockedByThem(false);
      setRelationReady(true);
      return;
    }
    let cancelled = false;

    async function refreshRelation(opts?: { silent?: boolean }) {
      const silent = opts?.silent === true;
      if (!silent) setRelationReady(false);
      const blockedResult =
        initialBlockedByThem !== undefined && !silent
          ? { blockedByThem: initialBlockedByThem }
          : await loadIsBlockedBy(otherUserId);
      if (cancelled) return;
      setBlockedByThem(blockedResult.blockedByThem);
      if (blockedResult.blockedByThem) {
        setStatus("none");
        setEdgeId(null);
        setRelationReady(true);
        return;
      }
      if (!silent && initialStatus) {
        setStatus(initialStatus);
        setEdgeId(initialEdgeId);
        setRelationReady(true);
      } else if (!silent) {
        setStatus("loading");
      }
      const result = await loadFriendshipWith(otherUserId);
      if (cancelled) return;
      setStatus(result.status);
      setEdgeId(result.edgeId);
      setRelationReady(true);
    }

    void refreshRelation();

    // Keep in sync when friends panel (or another tab) accepts / cancels.
    const supabase = createClient();
    const channel = supabase
      .channel(`profile-friend:${user.id}:${otherUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friends" },
        () => {
          void refreshRelation({ silent: true });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [
    user,
    otherUserId,
    blocked,
    initialStatus,
    initialEdgeId,
    initialBlockedByThem,
  ]);

  if (!user || user.id === otherUserId || blocked) return null;

  const compact = size === "sm";
  const base =
    compact
      ? "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors"
      : "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors";

  async function handleAdd() {
    if (!user || busy || blockedByThem || ignored) return;
    setBusy(true);
    const { error } = await sendFriendRequest(user.id, otherUserId);
    setBusy(false);
    if (error) return;
    setStatus("outgoing");
  }

  async function handleAccept() {
    if (!edgeId || busy || blockedByThem || ignored) return;
    setBusy(true);
    const { error } = await acceptFriendRequest(edgeId);
    setBusy(false);
    if (error) return;
    setStatus("friends");
  }

  if (!relationReady || status === "loading") {
    // Ignored users: don't flash a loading Add Friend control.
    if (ignored) return null;
    return (
      <button
        type="button"
        disabled
        className={`${base} bg-[#3f4147] text-[#949ba4] opacity-70 ${className}`}
      >
        …
      </button>
    );
  }

  if (blockedByThem) {
    return (
      <button
        type="button"
        disabled
        className={`${base} cursor-not-allowed bg-[#3f4147] text-[#f2b8b5] opacity-90 ${className}`}
      >
        <Ban className="h-4 w-4" strokeWidth={1.75} />
        {compact ? "Blocked You" : "They Blocked You"}
      </button>
    );
  }

  if (status === "friends") {
    return (
      <button
        type="button"
        disabled
        className={`${base} cursor-default bg-[#3f4147] text-[#b5bac1] ${className}`}
      >
        <Check className="h-4 w-4" strokeWidth={2} />
        Friends
      </button>
    );
  }

  // Ignored + not already friends → no Add / Accept / Request Sent.
  if (ignored) return null;

  if (status === "outgoing") {
    return (
      <button
        type="button"
        disabled
        className={`${base} cursor-default bg-[#3f4147] text-[#b5bac1] ${className}`}
      >
        Request Sent
      </button>
    );
  }

  if (status === "incoming") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleAccept()}
        className={`${base} bg-accent text-white hover:bg-accent-hover disabled:opacity-60 ${className}`}
      >
        <UserPlus className="h-4 w-4" strokeWidth={1.75} />
        Accept
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void handleAdd()}
      className={`${base} bg-[#3f4147] text-white hover:bg-[#4e5058] disabled:opacity-60 ${className}`}
    >
      <UserPlus className="h-4 w-4" strokeWidth={1.75} />
      Add Friend
    </button>
  );
}
