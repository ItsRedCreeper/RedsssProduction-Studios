"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Settings } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { HoverTip } from "@/components/ui/HoverTip";
import { StatusPicker } from "@/components/profile/StatusPicker";
import { statusLabel } from "@/components/messenger/data";
import { LiveStatusDot } from "@/components/presence/LiveStatusDot";
import { useUserPresence } from "@/components/presence/PresenceFeed";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { useOptionalProfileUi } from "@/components/profile/ProfileProvider";
import {
  formatPresenceClearLabel,
  formatStatusExpiry,
  resolveDisplayStatus,
} from "@/lib/presence";

type UserPresenceBarProps = {
  className?: string;
};

export function UserPresenceBar({ className = "" }: UserPresenceBarProps) {
  const { user, profile } = useCurrentProfile();
  const profileUi = useOptionalProfileUi();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [manualExpiresAt, setManualExpiresAt] = useState<string | null>(null);
  const [customExpiresAt, setCustomExpiresAt] = useState<string | null>(null);

  const live = useUserPresence(user?.id);

  useEffect(() => {
    if (!profile) return;
    setManualExpiresAt(profile.manual_status_expires_at ?? null);
    setCustomExpiresAt(profile.status_text_expires_at ?? null);
  }, [
    profile?.manual_status_expires_at,
    profile?.status_text_expires_at,
    profile,
  ]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!user || !profile) return null;

  const name = profile.username;
  const mergedStatus = live?.status ?? profile.status;
  const mergedLastSeen = live?.lastSeenAt ?? profile.last_seen_at;
  const custom =
    (live?.statusText !== undefined ? live.statusText : profile.status_text)?.trim() ||
    null;
  const display = resolveDisplayStatus(mergedStatus, mergedLastSeen);
  const manual = (profile.manual_status ?? mergedStatus ?? "online").toLowerCase();
  const presenceClear = formatPresenceClearLabel(manualExpiresAt, nowTick, {
    isOnline: manual === "online",
  });
  const customClear = custom
    ? formatStatusExpiry(customExpiresAt, nowTick) ?? "Doesn't clear"
    : null;
  const subtitle = custom
    ? customClear
      ? `${custom} · ${customClear}`
      : custom
    : presenceClear
      ? `${statusLabel(display)} · ${presenceClear}`
      : statusLabel(display);

  return (
    <div
      className={`messenger-account-dock relative flex items-center gap-2 px-2 py-1.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => void profileUi?.openBigProfile(user.id)}
        className="relative shrink-0 rounded-full"
        aria-label="Open profile"
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
        <HoverTip label={name} onlyIfTruncated delayMs={40} className="block min-w-0">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
        </HoverTip>
        <HoverTip label={subtitle} onlyIfTruncated delayMs={40} className="block min-w-0">
          <p className="truncate text-[11px] text-[#949ba4]">{subtitle}</p>
        </HoverTip>
      </button>
      <div className="relative shrink-0">
        <HoverTip label="Set status">
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="rounded-md p-1.5 text-[#b5bac1] hover:bg-white/5 hover:text-white"
            aria-label="Set status"
            aria-expanded={pickerOpen}
          >
            <ChevronDown className="h-4 w-4" strokeWidth={2} />
          </button>
        </HoverTip>
        <StatusPicker
          mode="presence"
          open={pickerOpen}
          status={profile.status}
          manualStatus={profile.manual_status}
          statusText={profile.status_text}
          manualStatusExpiresAt={manualExpiresAt}
          statusTextExpiresAt={customExpiresAt}
          placement="above"
          onClose={() => setPickerOpen(false)}
          onSaved={(next) => {
            setManualExpiresAt(
              next.status === "online"
                ? null
                : (next.manualStatusExpiresAt ?? null),
            );
            setCustomExpiresAt(
              next.statusText?.trim()
                ? (next.statusTextExpiresAt ?? null)
                : null,
            );
            setPickerOpen(false);
          }}
        />
      </div>
      <HoverTip label="User Settings">
        <button
          type="button"
          onClick={() => void profileUi?.openBigProfile(user.id)}
          className="rounded-md p-1.5 text-[#b5bac1] hover:bg-white/5 hover:text-white"
          aria-label="User settings"
        >
          <Settings className="h-4 w-4" strokeWidth={2} />
        </button>
      </HoverTip>
    </div>
  );
}
