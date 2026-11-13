"use client";

import { Check, Copy, Link2, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  inviteUrl,
  loadProfiles,
  makeInviteCode,
  statusDotClass,
} from "@/components/messenger/data";
import type { Server } from "@/components/messenger/types";

type FriendRow = {
  id: string;
  username: string;
  avatar_url: string | null;
  status: string;
  alreadyMember: boolean;
  alreadyInvited: boolean;
};

type InvitePeopleModalProps = {
  open: boolean;
  server: Server;
  userId: string;
  memberUserIds: string[];
  onClose: () => void;
};

async function ensurePermanentInvite(serverId: string, userId: string) {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("invites")
    .select("*")
    .eq("server_id", serverId)
    .eq("is_permanent", true)
    .maybeSingle();
  if (existing) return existing;

  const code = makeInviteCode();
  const { data, error } = await supabase
    .from("invites")
    .insert({
      code,
      server_id: serverId,
      creator_id: userId,
      max_uses: null,
      expires_at: null,
      is_permanent: true,
      uses: 0,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create invite link.");
  return data;
}

export function InvitePeopleModal({
  open,
  server,
  userId,
  memberUserIds,
  onClose,
}: InvitePeopleModalProps) {
  const memberIds = useMemo(() => new Set(memberUserIds), [memberUserIds]);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setCopied(false);
      setQuery("");
      try {
        const permanent = await ensurePermanentInvite(server.id, userId);
        if (cancelled) return;
        setInviteCode(permanent.code);

        const { data: friendRows, error: friendsError } = await supabase
          .from("friends")
          .select("user_id, friend_id")
          .eq("status", "accepted")
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
        if (friendsError) throw new Error(friendsError.message);

        const otherIds = (friendRows ?? []).map((row) =>
          row.user_id === userId ? row.friend_id : row.user_id,
        );
        const profiles = await loadProfiles(otherIds);

        const { data: sent } = await supabase
          .from("server_friend_invites")
          .select("invitee_id")
          .eq("server_id", server.id)
          .eq("inviter_id", userId);

        if (cancelled) return;
        const invited = new Set((sent ?? []).map((row) => row.invitee_id));
        setFriends(
          profiles
            .map((profile) => ({
              id: profile.id,
              username: profile.username,
              avatar_url: profile.avatar_url,
              status: profile.status || "offline",
              alreadyMember: memberIds.has(profile.id),
              alreadyInvited: invited.has(profile.id),
            }))
            .sort((a, b) => a.username.localeCompare(b.username)),
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : "Could not load invites.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, server.id, userId, memberUserIds]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return friends;
    return friends.filter((friend) => friend.username.toLowerCase().includes(needle));
  }, [friends, query]);

  if (!open) return null;

  async function copyLink() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(inviteCode));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy the invite link.");
    }
  }

  async function inviteFriend(friend: FriendRow) {
    if (friend.alreadyInvited || friend.alreadyMember || !inviteCode) return;
    setSendingId(friend.id);
    setError(null);
    const supabase = createClient();

    const { error: insertError } = await supabase.from("server_friend_invites").insert({
      server_id: server.id,
      inviter_id: userId,
      invitee_id: friend.id,
    });

    if (insertError) {
      setSendingId(null);
      if (/duplicate|unique/i.test(insertError.message)) {
        setFriends((prev) =>
          prev.map((row) =>
            row.id === friend.id ? { ...row, alreadyInvited: true } : row,
          ),
        );
        return;
      }
      setError(insertError.message);
      return;
    }

    // Deliver the permanent invite link in a DM so the friend can open the preview.
    try {
      const { data: mine } = await supabase
        .from("dm_participants")
        .select("conversation_id")
        .eq("user_id", userId);
      const mineIds = new Set((mine ?? []).map((row) => row.conversation_id));
      const { data: theirs } = await supabase
        .from("dm_participants")
        .select("conversation_id")
        .eq("user_id", friend.id);
      let conversationId =
        (theirs ?? []).find((row) => mineIds.has(row.conversation_id))?.conversation_id ??
        null;

      if (!conversationId) {
        const { data: created } = await supabase
          .from("dm_conversations")
          .insert({})
          .select("id")
          .single();
        if (created) {
          conversationId = created.id;
          await supabase.from("dm_participants").insert([
            { conversation_id: created.id, user_id: userId },
            { conversation_id: created.id, user_id: friend.id },
          ]);
        }
      }

      if (conversationId) {
        await supabase.from("dm_messages").insert({
          conversation_id: conversationId,
          user_id: userId,
          content: `You're invited to join ${server.name}: ${inviteUrl(inviteCode)}`,
        });
      }
    } catch {
      /* friend invite row already saved — DM delivery is best-effort */
    }

    setFriends((prev) =>
      prev.map((row) => (row.id === friend.id ? { ...row, alreadyInvited: true } : row)),
    );
    setSendingId(null);
  }

  const link = inviteCode ? inviteUrl(inviteCode) : "";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-people-title"
        className="relative z-10 flex max-h-[min(36rem,90dvh)] w-full max-w-md flex-col overflow-hidden rounded-md border border-[#1e1f22] bg-[#313338] shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between border-b border-black/30 px-5 py-4">
          <div>
            <h2 id="invite-people-title" className="text-lg font-semibold text-white">
              Invite friends to {server.name}
            </h2>
            <p className="mt-1 text-sm text-[#b5bac1]">
              Send a join invite to friends, or copy the permanent link.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#b5bac1] hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="border-b border-black/30 px-5 py-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search friends"
            className="w-full rounded-md border border-transparent bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none placeholder:text-[#6d6f78] focus:border-accent/40"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <p className="px-2 py-4 text-sm text-[#949ba4]">Loading friends…</p>
          ) : visible.length === 0 ? (
            <p className="px-2 py-4 text-sm text-[#949ba4]">
              {friends.length === 0
                ? "No friends yet. Copy the invite link below instead."
                : "No friends match that search."}
            </p>
          ) : (
            <ul className="space-y-1">
              {visible.map((friend) => {
                const disabled =
                  friend.alreadyMember || friend.alreadyInvited || sendingId === friend.id;
                return (
                  <li
                    key={friend.id}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/5"
                  >
                    <span className="relative shrink-0">
                      <UserAvatar
                        username={friend.username}
                        avatarUrl={friend.avatar_url}
                        size="sm"
                        className="!h-9 !w-9"
                      />
                      <span
                        className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[#313338] ${statusDotClass(friend.status)}`}
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#dbdee1]">
                      {friend.username}
                    </span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void inviteFriend(friend)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                        friend.alreadyMember || friend.alreadyInvited
                          ? "bg-[#1e1f22] text-[#6d6f78]"
                          : "bg-accent text-white hover:bg-accent-hover disabled:opacity-60"
                      }`}
                    >
                      {friend.alreadyMember ? (
                        "Joined"
                      ) : friend.alreadyInvited ? (
                        <>
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                          Invited
                        </>
                      ) : sendingId === friend.id ? (
                        "Sending…"
                      ) : (
                        <>
                          <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
                          Invite
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && (
          <p className="mx-5 mb-2 rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
            {error}
          </p>
        )}

        <div className="border-t border-black/30 bg-[#2b2d31] px-5 py-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
            <Link2 className="h-3.5 w-3.5" strokeWidth={2} />
            Permanent server invite link
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link || "Creating link…"}
              className="min-w-0 flex-1 truncate rounded-md border border-[#1e1f22] bg-[#1e1f22] px-3 py-2 text-sm text-[#dbdee1]"
            />
            <button
              type="button"
              disabled={!inviteCode}
              onClick={() => void copyLink()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {copied ? (
                <Check className="h-4 w-4" strokeWidth={2.5} />
              ) : (
                <Copy className="h-4 w-4" strokeWidth={2} />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
