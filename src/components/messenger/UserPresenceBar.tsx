"use client";

import { useState } from "react";
import { ChevronDown, Settings } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { StatusPicker } from "@/components/profile/StatusPicker";
import { statusLabel } from "@/components/messenger/data";
import { LiveStatusDot } from "@/components/presence/LiveStatusDot";
import { useUserPresence } from "@/components/presence/PresenceFeed";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { useOptionalProfileUi } from "@/components/profile/ProfileProvider";
import { resolveDisplayStatus } from "@/lib/presence";

type UserPresenceBarProps = {
  className?: string;
};

export function UserPresenceBar({ className = "" }: UserPresenceBarProps) {
  const { user, profile } = useCurrentProfile();
  const profileUi = useOptionalProfileUi();
  const [pickerOpen, setPickerOpen] = useState(false);

  const live = useUserPresence(user?.id);
  if (!user || !profile) return null;

  const name = profile.username;
  const mergedStatus = live?.status ?? profile.status;
  const mergedLastSeen = live?.lastSeenAt ?? profile.last_seen_at;
  const custom =
    (live?.statusText !== undefined ? live.statusText : profile.status_text)?.trim() ||
    null;
  const display = resolveDisplayStatus(mergedStatus, mergedLastSeen);

  return (
    <div
      className={`relative flex items-center gap-2 border-t border-black/30 bg-[#232428] px-2 py-1.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => void profileUi?.openBigProfile(user.id)}
        className="relative shrink-0 rounded-full"
        title="Open profile"
      >
        <UserAvatar username={name} avatarUrl={profile.avatar_url} size="sm" />
        <LiveStatusDot
          userId={user.id}
          status={mergedStatus}
          lastSeenAt={mergedLastSeen}
          ringClassName="ring-[#232428]"
        />
      </button>
      <button
        type="button"
        onClick={() => void profileUi?.openBigProfile(user.id)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-sm font-semibold text-white">{name}</p>
        <p className="truncate text-[11px] text-[#949ba4]">
          {custom || statusLabel(display)}
        </p>
      </button>
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          className="rounded-md p-1.5 text-[#b5bac1] hover:bg-white/5 hover:text-white"
          aria-label="Set status"
          aria-expanded={pickerOpen}
          title="Set status"
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2} />
        </button>
        <StatusPicker
          mode="presence"
          open={pickerOpen}
          status={profile.status}
          manualStatus={profile.manual_status}
          statusText={profile.status_text}
          placement="above"
          onClose={() => setPickerOpen(false)}
          onSaved={() => setPickerOpen(false)}
        />
      </div>
      <button
        type="button"
        onClick={() => void profileUi?.openBigProfile(user.id)}
        className="rounded-md p-1.5 text-[#b5bac1] hover:bg-white/5 hover:text-white"
        aria-label="User settings"
        title="Edit profile"
      >
        <Settings className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}
