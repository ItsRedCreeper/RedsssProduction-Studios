"use client";

import { useEffect, useState } from "react";
import { Check, UserPlus } from "lucide-react";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
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
};

export function ProfileFriendButton({
  otherUserId,
  size = "md",
  className = "",
}: ProfileFriendButtonProps) {
  const { user } = useCurrentProfile();
  const [status, setStatus] = useState<FriendStatus | "loading">("loading");
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || user.id === otherUserId) {
      setStatus("none");
      setEdgeId(null);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    void (async () => {
      const result = await loadFriendshipWith(otherUserId);
      if (cancelled) return;
      setStatus(result.status);
      setEdgeId(result.edgeId);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, otherUserId]);

  if (!user || user.id === otherUserId) return null;

  const compact = size === "sm";
  const base =
    compact
      ? "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors"
      : "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors";

  async function handleAdd() {
    if (!user || busy) return;
    setBusy(true);
    const { error } = await sendFriendRequest(user.id, otherUserId);
    setBusy(false);
    if (error) return;
    setStatus("outgoing");
  }

  async function handleAccept() {
    if (!edgeId || busy) return;
    setBusy(true);
    const { error } = await acceptFriendRequest(edgeId);
    setBusy(false);
    if (error) return;
    setStatus("friends");
  }

  if (status === "loading") {
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

  if (status === "friends") {
    return (
      <button
        type="button"
        disabled
        title="You are already friends"
        className={`${base} cursor-default bg-[#3f4147] text-[#b5bac1] ${className}`}
      >
        <Check className="h-4 w-4" strokeWidth={2} />
        Friends
      </button>
    );
  }

  if (status === "outgoing") {
    return (
      <button
        type="button"
        disabled
        title="Friend request already sent"
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
