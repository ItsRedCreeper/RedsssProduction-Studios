"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  /** Top-nav chip (default). Bottom Discord-style bar is no longer used. */
  variant?: "nav";
};

/** Compact account + status control for the site top nav. */
export function UserPresenceBar({
  className = "",
  variant = "nav",
}: UserPresenceBarProps) {
  void variant;
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
  // Own profile is authoritative right after StatusPicker saves; feed can lag a beat.
  const liveMismatch =
    live?.status != null &&
    profile.status != null &&
    live.status.toLowerCase() !== profile.status.toLowerCase();
  const mergedStatus = liveMismatch
    ? profile.status
    : (live?.status ?? profile.status);
  const mergedLastSeen = liveMismatch
    ? (profile.last_seen_at ?? live?.lastSeenAt ?? null)
    : (live?.lastSeenAt ?? profile.last_seen_at);
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
      className={`relative flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.03] py-1 pl-1 pr-1.5 ${className}`}
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
          ringClassName="ring-[var(--ms-rail,#1a1b1e)]"
        />
      </button>
      <button
        type="button"
        onClick={() => void profileUi?.openBigProfile(user.id)}
        className="hidden min-w-0 max-w-[7.5rem] text-left sm:block"
      >
        <HoverTip label={name} onlyIfTruncated delayMs={40} className="block min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        </HoverTip>
        <HoverTip label={subtitle} onlyIfTruncated delayMs={40} className="block min-w-0">
          <p className="truncate text-[10px] text-muted">{subtitle}</p>
        </HoverTip>
      </button>
      <div className="relative shrink-0">
        <HoverTip label="Set status">
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground"
            aria-label="Set status"
            aria-expanded={pickerOpen}
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
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
          placement="below"
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
    </div>
  );
}
