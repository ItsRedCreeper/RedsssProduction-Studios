"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Ban, MessageSquare, X } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { ProfileFriendButton } from "@/components/profile/ProfileFriendButton";
import { statusDotClass, statusLabel } from "@/components/messenger/data";
import { avatarLetter } from "@/lib/avatar";
import type {
  FriendProfile,
  FriendStatus,
  MutualFriend,
  MutualServer,
} from "@/lib/friends";

export type MutualFocus = "friends" | "servers";

const VIEWPORT_MARGIN = 8;

function viewportSize() {
  const vv = window.visualViewport;
  return {
    width: Math.round(vv?.width ?? window.innerWidth),
    height: Math.round(vv?.height ?? window.innerHeight),
  };
}

function clampPopoverPosition(
  preferredTop: number,
  preferredLeft: number,
  width: number,
  height: number,
) {
  const { width: vw, height: vh } = viewportSize();
  const maxHeight = Math.max(120, vh - VIEWPORT_MARGIN * 2);
  const usedHeight = Math.min(height || 1, maxHeight);
  let nextTop = preferredTop;
  let nextLeft = preferredLeft;

  if (nextTop + usedHeight > vh - VIEWPORT_MARGIN) {
    nextTop = vh - usedHeight - VIEWPORT_MARGIN;
  }
  if (nextTop < VIEWPORT_MARGIN) nextTop = VIEWPORT_MARGIN;

  if (nextLeft + width > vw - VIEWPORT_MARGIN) {
    nextLeft = vw - width - VIEWPORT_MARGIN;
  }
  if (nextLeft < VIEWPORT_MARGIN) nextLeft = VIEWPORT_MARGIN;

  return { top: nextTop, left: nextLeft, maxHeight };
}

export type SmallProfileReadyData = {
  mutualFriends: MutualFriend[];
  mutualServers: MutualServer[];
  friendStatus: FriendStatus;
  friendEdgeId: string | null;
};

type SmallProfileCardProps = {
  profile: FriendProfile;
  top: number;
  left: number;
  isSelf: boolean;
  isBlocked?: boolean;
  /** Preloaded so the card opens at full size in one paint. */
  ready: SmallProfileReadyData;
  onClose: () => void;
  onMessage: () => void;
  onViewProfile: () => void;
  onViewMutuals: (section: MutualFocus) => void;
  onBlock?: () => void;
  onUnblock?: () => void;
};

export function SmallProfileCard({
  profile,
  top,
  left,
  isSelf,
  isBlocked = false,
  ready,
  onClose,
  onMessage,
  onViewProfile,
  onViewMutuals,
  onBlock,
  onUnblock,
}: SmallProfileCardProps) {
  const bio = profile.bio?.trim() || profile.status_text?.trim() || "";
  const { mutualFriends, mutualServers, friendStatus, friendEdgeId } = ready;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState(() =>
    clampPopoverPosition(top, left, 300, 520),
  );
  const [visible, setVisible] = useState(false);

  // Measure the fully-rendered card once, clamp, then reveal — no staged loading.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const apply = () => {
      const next = clampPopoverPosition(
        top,
        left,
        el.offsetWidth || 300,
        el.offsetHeight || 520,
      );
      setPos(next);
      setVisible(true);
    };

    apply();
    const onViewportChange = () => apply();
    window.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("resize", onViewportChange);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
    };
  }, [top, left, profile.id, isBlocked, isSelf, bio, mutualFriends.length, mutualServers.length]);

  const previewFriends = mutualFriends.slice(0, 3);
  const previewServers = mutualServers.slice(0, 3);

  return (
    <div
      ref={cardRef}
      data-profile-popover
      className="fixed z-[80] w-[300px] overflow-y-auto overflow-x-hidden rounded-lg border border-[#1e1f22] bg-[#111214] shadow-2xl shadow-black/60"
      style={{
        top: pos.top,
        left: pos.left,
        maxHeight: pos.maxHeight,
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
            <span
              className={`absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full ring-2 ring-[#111214] ${statusDotClass(profile.status)}`}
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
          <p className="truncate text-base font-semibold text-white">
            {profile.username}
          </p>
          <p className="truncate text-xs text-[#949ba4]">
            {statusLabel(profile.status)}
          </p>
        </button>

        {bio && (
          <p className="mt-2 line-clamp-2 text-sm text-[#dbdee1]">{bio}</p>
        )}

        {!isSelf && (mutualServers.length > 0 || mutualFriends.length > 0) && (
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
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={server.id}
                        src={server.icon_url}
                        alt=""
                        title={server.name}
                        className="h-6 w-6 rounded-[6px] object-cover ring-2 ring-[#111214]"
                      />
                    ) : (
                      <span
                        key={server.id}
                        title={server.name}
                        className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[#313338] text-[10px] font-bold text-accent ring-2 ring-[#111214]"
                      >
                        {avatarLetter(server.name)}
                      </span>
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
                    <span
                      key={friend.id}
                      className="rounded-full ring-2 ring-[#111214]"
                      title={friend.username}
                    >
                      <UserAvatar
                        username={friend.username}
                        avatarUrl={friend.avatar_url}
                        size="xs"
                        className="!h-6 !w-6"
                      />
                    </span>
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
          {!isSelf && !isBlocked && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onMessage}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
              >
                <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
                Message
              </button>
              <ProfileFriendButton
                otherUserId={profile.id}
                size="sm"
                initialStatus={friendStatus}
                initialEdgeId={friendEdgeId}
              />
            </div>
          )}
          {!isSelf && (
            <div className="flex gap-2">
              {isBlocked ? (
                <button
                  type="button"
                  onClick={onUnblock}
                  className="inline-flex flex-1 items-center justify-center rounded-md bg-[#3f4147] px-3 py-2 text-sm font-medium text-white hover:bg-[#4e5058]"
                >
                  Unblock
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onBlock}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#3f4147] px-3 py-2 text-sm font-medium text-[#f2b8b5] hover:bg-[#4e5058]"
                >
                  <Ban className="h-4 w-4" strokeWidth={1.75} />
                  Block
                </button>
              )}
              <button
                type="button"
                onClick={onViewProfile}
                className="inline-flex flex-1 items-center justify-center rounded-md bg-[#3f4147] px-3 py-2 text-sm font-medium text-white hover:bg-[#4e5058]"
              >
                View Profile
              </button>
            </div>
          )}
          {isSelf && (
            <button
              type="button"
              onClick={onViewProfile}
              className="inline-flex w-full items-center justify-center rounded-md bg-[#3f4147] px-3 py-2 text-sm font-medium text-white hover:bg-[#4e5058]"
            >
              View Profile
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
