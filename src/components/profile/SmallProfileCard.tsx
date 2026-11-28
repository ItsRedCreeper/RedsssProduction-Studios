"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Ban, MessageSquare, X } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { HoverTip } from "@/components/ui/HoverTip";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { ProfileFriendButton } from "@/components/profile/ProfileFriendButton";
import { PresenceCaption } from "@/components/presence/PresenceCaption";
import { LiveStatusDot } from "@/components/presence/LiveStatusDot";
import { avatarLetter } from "@/lib/avatar";
import type {
  FriendProfile,
  FriendStatus,
  MutualFriend,
  MutualServer,
} from "@/lib/friends";
import type { Role } from "@/components/messenger/types";
import { RolePills } from "@/components/messenger/RolePills";
import { ProfileTagsPills } from "@/components/profile/ProfileTagsPills";

export type MutualFocus = "friends" | "servers";

const VIEWPORT_MARGIN = 8;

export type SmallProfileReadyData = {
  mutualFriends: MutualFriend[];
  mutualServers: MutualServer[];
  friendStatus: FriendStatus;
  friendEdgeId: string | null;
  /** Viewed user has blocked the current user. */
  restricted: boolean;
};

type SmallProfileCardProps = {
  profile: FriendProfile;
  top: number;
  left: number;
  isSelf: boolean;
  isBlocked?: boolean;
  isIgnored?: boolean;
  displayName?: string;
  /** Highest role color when viewing inside a server. */
  nameColor?: string | null;
  /** Server roles for the viewed member (highest first). */
  roles?: Role[];
  /** Preloaded so the card opens at full size in one paint. */
  ready: SmallProfileReadyData;
  onClose: () => void;
  onMessage: () => void;
  onViewProfile: () => void;
  onViewMutuals: (section: MutualFocus) => void;
  onBlock?: () => void;
  onUnblock?: () => void;
  onIgnore?: () => void;
  onUnignore?: () => void;
};

export function SmallProfileCard({
  profile,
  top,
  left,
  isSelf,
  isBlocked = false,
  isIgnored = false,
  displayName,
  nameColor = null,
  roles = [],
  ready,
  onClose,
  onMessage,
  onViewProfile,
  onViewMutuals,
  onBlock,
  onUnblock,
  onIgnore,
  onUnignore,
}: SmallProfileCardProps) {
  const shownName = displayName || profile.username;
  const {
    mutualFriends,
    mutualServers,
    friendStatus,
    friendEdgeId,
    restricted,
  } = ready;
  const bio =
    restricted
      ? ""
      : profile.bio?.trim() || profile.status_text?.trim() || "";
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top, left });
  const [visible, setVisible] = useState(false);

  // Measure the fully-rendered card once, clamp, then reveal — no staged loading.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const clampToViewport = () => {
      const height = el.offsetHeight;
      const width = el.offsetWidth;
      setPos(() => {
        let nextTop = top;
        let nextLeft = left;
        if (nextTop + height > window.innerHeight - VIEWPORT_MARGIN) {
          nextTop = Math.max(
            VIEWPORT_MARGIN,
            window.innerHeight - height - VIEWPORT_MARGIN,
          );
        }
        if (nextLeft + width > window.innerWidth - VIEWPORT_MARGIN) {
          nextLeft = Math.max(
            VIEWPORT_MARGIN,
            window.innerWidth - width - VIEWPORT_MARGIN,
          );
        }
        if (nextTop < VIEWPORT_MARGIN) nextTop = VIEWPORT_MARGIN;
        if (nextLeft < VIEWPORT_MARGIN) nextLeft = VIEWPORT_MARGIN;
        return { top: nextTop, left: nextLeft };
      });
      setVisible(true);
    };

    clampToViewport();
    const observer = new ResizeObserver(() => clampToViewport());
    observer.observe(el);
    window.addEventListener("resize", clampToViewport);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", clampToViewport);
    };
  }, [top, left, profile.id, isBlocked, isSelf, bio, restricted, mutualFriends.length, mutualServers.length]);

  const previewFriends = mutualFriends.slice(0, 3);
  const previewServers = mutualServers.slice(0, 3);

  return (
    <div
      ref={cardRef}
      data-profile-popover
      className="fixed z-[80] max-h-[calc(100dvh-16px)] w-[300px] overflow-y-auto overflow-x-hidden rounded-2xl border border-white/[0.08] bg-[#111214] shadow-2xl shadow-black/60 ring-1 ring-accent/15"
      style={{
        top: pos.top,
        left: pos.left,
        visibility: visible ? "visible" : "hidden",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="relative pb-8">
        <button
          type="button"
          onClick={onViewProfile}
          className="relative block h-16 w-full overflow-hidden"
          aria-label="View full profile"
        >
          <ProfileBanner
            bannerUrl={profile.banner_url}
            bannerColor={profile.banner_color}
            className="h-full w-full"
          />
        </button>

        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 rounded-md bg-black/45 p-1 text-white hover:bg-black/65"
          aria-label="Close"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={onViewProfile}
          className="absolute bottom-0 left-3 rounded-full bg-[#111214] p-1"
          aria-label={`Open ${profile.username}'s profile`}
        >
          <span className="relative block">
            <UserAvatar
              username={profile.username}
              avatarUrl={profile.avatar_url}
              size="lg"
              className="!h-14 !w-14 !text-base"
            />
            <LiveStatusDot
              userId={profile.id}
              status={profile.status}
              lastSeenAt={profile.last_seen_at}
              size="md"
              ringClassName="ring-2 ring-[#111214]"
              className="!bottom-0.5 !right-0.5"
            />
          </span>
        </button>
      </div>

      <div className="px-3 pb-3 pt-1">
        <button
          type="button"
          onClick={onViewProfile}
          className="block w-full text-left"
        >
          <HoverTip label={shownName} onlyIfTruncated delayMs={40} className="block min-w-0">
            <p
              className={`truncate text-base font-semibold ${
                nameColor ? "" : "text-white"
              }`}
              style={
                nameColor
                  ? { color: nameColor, WebkitTextFillColor: nameColor }
                  : undefined
              }
            >
              {shownName}
            </p>
          </HoverTip>
          {displayName && displayName !== profile.username && (
            <HoverTip
              label={`@${profile.username}`}
              onlyIfTruncated
              delayMs={40}
              className="block min-w-0"
            >
              <p className="truncate text-[11px] text-[#6d6f78]">
                @{profile.username}
              </p>
            </HoverTip>
          )}
          {!restricted ? (
            <PresenceCaption
              userId={profile.id}
              status={profile.status}
              lastSeenAt={profile.last_seen_at}
              customStatus={profile.status_text}
              className="mt-0.5"
            />
          ) : null}
        </button>
        <ProfileTagsPills
          tags={profile.profile_tags}
          size="sm"
          className="mt-0.5"
        />

        {roles.length > 0 && (
          <div className="mt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#949ba4]">
              Roles
            </p>
            <RolePills roles={roles} size="sm" />
          </div>
        )}

        {bio && bio !== profile.status_text?.trim() && (
          <p className="mt-2 line-clamp-2 text-sm text-[#dbdee1]">{bio}</p>
        )}

        {!isSelf &&
          !restricted &&
          (mutualServers.length > 0 || mutualFriends.length > 0) && (
          <div className="mt-3 space-y-2">
            {mutualServers.length > 0 && (
              <button
                type="button"
                onClick={() => onViewMutuals("servers")}
                className="flex w-full items-center gap-2 rounded-md py-0.5 text-left hover:opacity-90"
                aria-label={`${mutualServers.length} mutual servers`}
              >
                <span className="flex -space-x-1.5">
                  {previewServers.map((server) =>
                    server.icon_url ? (
                      <HoverTip key={server.id} label={server.name} delayMs={40}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={server.icon_url}
                          alt=""
                          className="h-6 w-6 rounded-[6px] object-cover ring-2 ring-[#111214]"
                        />
                      </HoverTip>
                    ) : (
                      <HoverTip key={server.id} label={server.name} delayMs={40}>
                        <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#313338] text-[10px] font-bold text-accent ring-2 ring-[#111214]">
                          {avatarLetter(server.name)}
                        </span>
                      </HoverTip>
                    ),
                  )}
                </span>
                <span className="text-xs font-medium text-[#b5bac1] hover:underline">
                  {mutualServers.length} Mutual Server
                  {mutualServers.length === 1 ? "" : "s"}
                </span>
              </button>
            )}

            {mutualFriends.length > 0 && (
              <button
                type="button"
                onClick={() => onViewMutuals("friends")}
                className="flex w-full items-center gap-2 rounded-md py-0.5 text-left hover:opacity-90"
                aria-label={`${mutualFriends.length} mutual friends`}
              >
                <span className="flex -space-x-1.5">
                  {previewFriends.map((friend) => (
                    <HoverTip
                      key={friend.id}
                      label={friend.username}
                      delayMs={40}
                      className="rounded-full ring-2 ring-[#111214]"
                    >
                      <span className="block">
                        <UserAvatar
                          username={friend.username}
                          avatarUrl={friend.avatar_url}
                          size="xs"
                          className="!h-6 !w-6"
                        />
                      </span>
                    </HoverTip>
                  ))}
                </span>
                <span className="text-xs font-medium text-[#b5bac1] hover:underline">
                  {mutualFriends.length} Mutual Friend
                  {mutualFriends.length === 1 ? "" : "s"}
                </span>
              </button>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-col gap-2">
          {!isSelf && isBlocked && (
            <div className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-[#f2b8b5]">
              You have blocked this user.
            </div>
          )}
          {!isSelf && !isBlocked && restricted && (
            <div className="rounded-md border border-white/10 bg-[#1e1f22] px-3 py-2 text-xs text-[#b5bac1]">
              This user has blocked you. Profile details are hidden.
            </div>
          )}
          {!isSelf && !isBlocked && !restricted && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onMessage}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
              >
                <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
                Message
              </button>
              <ProfileFriendButton
                otherUserId={profile.id}
                size="sm"
                initialStatus={friendStatus}
                initialEdgeId={friendEdgeId}
                initialBlockedByThem={restricted}
              />
            </div>
          )}
          {!isSelf && (
            <div className="flex flex-wrap gap-2">
              {isBlocked ? (
                <button
                  type="button"
                  onClick={onUnblock}
                  className="inline-flex flex-1 items-center justify-center rounded-lg bg-[#3f4147] px-3 py-2 text-sm font-medium text-white hover:bg-[#4e5058]"
                >
                  Unblock
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onBlock}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#3f4147] px-3 py-2 text-sm font-medium text-[#f2b8b5] hover:bg-[#4e5058]"
                >
                  <Ban className="h-4 w-4" strokeWidth={1.75} />
                  Block
                </button>
              )}
              {!isBlocked &&
                (isIgnored ? (
                  <button
                    type="button"
                    onClick={onUnignore}
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-[#3f4147] px-3 py-2 text-sm font-medium text-white hover:bg-[#4e5058]"
                  >
                    Unignore
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onIgnore}
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-[#3f4147] px-3 py-2 text-sm font-medium text-[#dbdee1] hover:bg-[#4e5058]"
                  >
                    Ignore
                  </button>
                ))}
              <button
                type="button"
                onClick={onViewProfile}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-[#3f4147] px-3 py-2 text-sm font-medium text-white hover:bg-[#4e5058]"
              >
                View Profile
              </button>
            </div>
          )}
          {isSelf && (
            <button
              type="button"
              onClick={onViewProfile}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#3f4147] px-3 py-2 text-sm font-medium text-white hover:bg-[#4e5058]"
            >
              View Profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
