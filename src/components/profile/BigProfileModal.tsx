"use client";

import { MessageSquare, Pencil, X } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { statusDotClass, statusLabel } from "@/components/messenger/data";
import type { FriendProfile } from "@/lib/friends";

type BigProfileModalProps = {
  profile: FriendProfile;
  isSelf: boolean;
  onClose: () => void;
  onMessage: () => void;
  onEdit: () => void;
};

export function BigProfileModal({
  profile,
  isSelf,
  onClose,
  onMessage,
  onEdit,
}: BigProfileModalProps) {
  const bio = profile.bio?.trim() || "";
  const statusText = profile.status_text?.trim() || "";

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
        {/* Banner + avatar overlap live in one non-clipped header stack */}
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

            <div className="mt-4 border-t border-white/10 pt-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                About Me
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#dbdee1]">
                {bio || "No bio yet."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
