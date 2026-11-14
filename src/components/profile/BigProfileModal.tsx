"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, MessageSquare, Pencil, X } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { statusDotClass, statusLabel } from "@/components/messenger/data";
import { avatarLetter } from "@/lib/avatar";
import type { MutualFocus } from "@/components/profile/SmallProfileCard";
import {
  formatSinceDate,
  loadFriendsSince,
  loadMutualFriends,
  loadMutualServers,
  type FriendProfile,
  type MutualFriend,
  type MutualServer,
} from "@/lib/friends";

const VISIBLE_LIMIT = 6;

type BigProfileModalProps = {
  profile: FriendProfile;
  isSelf: boolean;
  focusSection?: MutualFocus | null;
  onClose: () => void;
  onMessage: () => void;
  onEdit: () => void;
  onOpenProfile?: (userId: string) => void;
};

export function BigProfileModal({
  profile,
  isSelf,
  focusSection = null,
  onClose,
  onMessage,
  onEdit,
  onOpenProfile,
}: BigProfileModalProps) {
  const bio = profile.bio?.trim() || "";
  const statusText = profile.status_text?.trim() || "";
  const [mutualFriends, setMutualFriends] = useState<MutualFriend[]>([]);
  const [mutualServers, setMutualServers] = useState<MutualServer[]>([]);
  const [friendsSince, setFriendsSince] = useState<string | null>(null);
  const [loadingMutuals, setLoadingMutuals] = useState(!isSelf);
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [showAllServers, setShowAllServers] = useState(false);
  const [highlight, setHighlight] = useState<MutualFocus | null>(null);
  const friendsSectionRef = useRef<HTMLDivElement | null>(null);
  const serversSectionRef = useRef<HTMLDivElement | null>(null);
  const memberSince = formatSinceDate(profile.created_at);

  useEffect(() => {
    setShowAllFriends(false);
    setShowAllServers(false);
    setFriendsSince(null);
    setHighlight(null);
    if (isSelf) {
      setMutualFriends([]);
      setMutualServers([]);
      setLoadingMutuals(false);
      return;
    }

    let cancelled = false;
    setLoadingMutuals(true);

    void (async () => {
      const [friendsResult, serversResult, sinceResult] = await Promise.all([
        loadMutualFriends(profile.id),
        loadMutualServers(profile.id),
        loadFriendsSince(profile.id),
      ]);
      if (cancelled) return;
      setMutualFriends(friendsResult.friends);
      setMutualServers(serversResult.servers);
      setFriendsSince(sinceResult.friendsSince);
      setLoadingMutuals(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [profile.id, isSelf]);

  useEffect(() => {
    if (isSelf || loadingMutuals || !focusSection) return;
    const target =
      focusSection === "friends"
        ? friendsSectionRef.current
        : serversSectionRef.current;
    if (!target) return;
    if (focusSection === "friends") setShowAllFriends(true);
    if (focusSection === "servers") setShowAllServers(true);
    setHighlight(focusSection);
    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 40);
    const clear = window.setTimeout(() => setHighlight(null), 1800);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clear);
    };
  }, [focusSection, loadingMutuals, isSelf, profile.id]);

  const visibleFriends = showAllFriends
    ? mutualFriends
    : mutualFriends.slice(0, VISIBLE_LIMIT);
  const visibleServers = showAllServers
    ? mutualServers
    : mutualServers.slice(0, VISIBLE_LIMIT);

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="big-profile-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75"
        aria-label="Close profile"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(90vh,44rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-[#111214] shadow-2xl shadow-black/60">
        <div className="relative shrink-0 pb-12">
          <div className="relative h-36 sm:h-44">
            {profile.banner_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.banner_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-accent via-[#991b1b] to-[#1e1f22]" />
            )}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 rounded-md bg-black/50 p-1.5 text-white hover:bg-black/70"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="absolute bottom-0 left-5 flex items-end gap-3">
            <span className="relative rounded-full bg-[#111214] p-1.5">
              <UserAvatar
                username={profile.username}
                avatarUrl={profile.avatar_url}
                size="lg"
                className="!h-[88px] !w-[88px] !text-2xl"
              />
              <span
                className={`absolute bottom-2 right-2 h-4 w-4 rounded-full ring-[3px] ring-[#111214] ${statusDotClass(profile.status)}`}
              />
            </span>
          </div>

          <div className="absolute bottom-1 right-5">
            {isSelf ? (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
              >
                <Pencil className="h-4 w-4" strokeWidth={1.75} />
                Edit Profile
              </button>
            ) : (
              <button
                type="button"
                onClick={onMessage}
                className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
              >
                <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
                Message
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2">
          <div className="rounded-lg bg-[#1e1f22] p-4">
            <h2
              id="big-profile-title"
              className="text-2xl font-bold tracking-tight text-white"
            >
              {profile.username}
            </h2>
            <p className="mt-1 text-sm text-[#949ba4]">
              {statusLabel(profile.status)}
              {statusText ? ` · ${statusText}` : ""}
            </p>

            {(memberSince || (!isSelf && friendsSince)) && (
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/10 pt-4">
                {memberSince && (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                      Member Since
                    </h3>
                    <p className="mt-1 text-sm text-[#dbdee1]">{memberSince}</p>
                  </div>
                )}
                {!isSelf && friendsSince && (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                      Friends Since
                    </h3>
                    <p className="mt-1 text-sm text-[#dbdee1]">
                      {formatSinceDate(friendsSince)}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 border-t border-white/10 pt-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                About Me
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#dbdee1]">
                {bio || "No bio yet."}
              </p>
            </div>

            {!isSelf && (
              <>
                <div
                  ref={friendsSectionRef}
                  id="mutual-friends-section"
                  className={`mt-4 rounded-md border-t border-white/10 pt-4 transition-colors ${
                    highlight === "friends" ? "bg-accent/10 ring-1 ring-accent/40" : ""
                  }`}
                >
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                    Mutual Friends
                    {!loadingMutuals && (
                      <span className="ml-1 text-[#6d6f78]">
                        — {mutualFriends.length}
                      </span>
                    )}
                  </h3>
                  {loadingMutuals ? (
                    <p className="mt-2 text-sm text-[#6d6f78]">Loading…</p>
                  ) : mutualFriends.length === 0 ? (
                    <p className="mt-2 text-sm text-[#6d6f78]">No mutual friends</p>
                  ) : (
                    <>
                      <ul className="mt-2 space-y-1">
                        {visibleFriends.map((friend) => (
                          <li key={friend.id}>
                            <button
                              type="button"
                              onClick={() => onOpenProfile?.(friend.id)}
                              className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-white/5"
                            >
                              <span className="relative shrink-0">
                                <UserAvatar
                                  username={friend.username}
                                  avatarUrl={friend.avatar_url}
                                  size="sm"
                                  className="!h-8 !w-8"
                                />
                                <span
                                  className={`absolute bottom-0 right-0 h-2 w-2 rounded-full ring-2 ring-[#1e1f22] ${statusDotClass(friend.status)}`}
                                />
                              </span>
                              <span className="truncate text-sm text-[#dbdee1]">
                                {friend.username}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {mutualFriends.length > VISIBLE_LIMIT && (
                        <button
                          type="button"
                          onClick={() => setShowAllFriends((prev) => !prev)}
                          className="mt-1 inline-flex items-center gap-1 px-1.5 text-xs font-medium text-[#949ba4] hover:text-white"
                        >
                          {showAllFriends ? (
                            <>
                              Show less <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                            </>
                          ) : (
                            <>
                              Show {mutualFriends.length - VISIBLE_LIMIT} more{" "}
                              <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div
                  ref={serversSectionRef}
                  id="mutual-servers-section"
                  className={`mt-4 rounded-md border-t border-white/10 pt-4 transition-colors ${
                    highlight === "servers" ? "bg-accent/10 ring-1 ring-accent/40" : ""
                  }`}
                >
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                    Mutual Servers
                    {!loadingMutuals && (
                      <span className="ml-1 text-[#6d6f78]">
                        — {mutualServers.length}
                      </span>
                    )}
                  </h3>
                  {loadingMutuals ? (
                    <p className="mt-2 text-sm text-[#6d6f78]">Loading…</p>
                  ) : mutualServers.length === 0 ? (
                    <p className="mt-2 text-sm text-[#6d6f78]">No mutual servers</p>
                  ) : (
                    <>
                      <ul className="mt-2 space-y-1">
                        {visibleServers.map((server) => (
                          <li
                            key={server.id}
                            className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5"
                          >
                            {server.icon_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={server.icon_url}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded-md object-cover"
                              />
                            ) : (
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#313338] text-xs font-bold text-accent">
                                {avatarLetter(server.name)}
                              </span>
                            )}
                            <span className="truncate text-sm text-[#dbdee1]">
                              {server.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {mutualServers.length > VISIBLE_LIMIT && (
                        <button
                          type="button"
                          onClick={() => setShowAllServers((prev) => !prev)}
                          className="mt-1 inline-flex items-center gap-1 px-1.5 text-xs font-medium text-[#949ba4] hover:text-white"
                        >
                          {showAllServers ? (
                            <>
                              Show less <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                            </>
                          ) : (
                            <>
                              Show {mutualServers.length - VISIBLE_LIMIT} more{" "}
                              <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
