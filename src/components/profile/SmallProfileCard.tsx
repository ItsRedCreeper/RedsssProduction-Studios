"use client";

import { MessageSquare, X } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { statusDotClass, statusLabel } from "@/components/messenger/data";
import type { FriendProfile } from "@/lib/friends";

type SmallProfileCardProps = {
  profile: FriendProfile;
  top: number;
  left: number;
  isSelf: boolean;
  onClose: () => void;
  onMessage: () => void;
  onViewProfile: () => void;
};

export function SmallProfileCard({
  profile,
  top,
  left,
  isSelf,
  onClose,
  onMessage,
  onViewProfile,
}: SmallProfileCardProps) {
  const bio = profile.bio?.trim() || profile.status_text?.trim() || "";

  return (
    <div
      data-profile-popover
      className="fixed z-[80] w-[280px] overflow-hidden rounded-lg border border-[#1e1f22] bg-[#111214] shadow-2xl shadow-black/60"
      style={{ top, left }}
    >
      <div className="relative pb-8">
        <button
          type="button"
          onClick={onViewProfile}
          className="relative block h-16 w-full overflow-hidden"
          aria-label="View full profile"
        >
          {profile.banner_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.banner_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-accent to-[#7f1d1d]" />
          )}
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
          <p className="mt-2 line-clamp-3 text-sm text-[#dbdee1]">{bio}</p>
        )}

        <div className="mt-3 flex gap-2">
          {!isSelf && (
            <button
              type="button"
              onClick={onMessage}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
              Message
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
      </div>
    </div>
  );
}
