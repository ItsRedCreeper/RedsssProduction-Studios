import { createClient } from "@/lib/supabase/client";
import type { PresenceStatus } from "@/components/messenger/data";
import { notifyProfileUpdated } from "@/hooks/useCurrentProfile";

const CUSTOM_STATUS_MAX = 128;

/** If no heartbeat within this window, treat as offline when rendering. */
export const PRESENCE_STALE_MS = 120_000;
export const IDLE_AFTER_MS = 10 * 60 * 1000;
export const HEARTBEAT_INTERVAL_MS = 8_000;
export const TAB_PING_MS = 2_000;

export type ManualStatus = "online" | "idle" | "dnd" | "offline";

export function asPresenceStatus(
  value: string | null | undefined,
): PresenceStatus {
  const v = (value ?? "offline").toLowerCase();
  if (v === "online" || v === "idle" || v === "dnd" || v === "offline") {
    return v;
  }
  if (v === "invisible") return "offline";
  return "offline";
}

/**
 * Resolve what others should see, factoring in heartbeat freshness.
 * Offline when the user's last heartbeat is stale (all tabs closed / crashed).
 */
export function resolveDisplayStatus(
  status: string | null | undefined,
  lastSeenAt?: string | null,
  now = Date.now(),
): PresenceStatus {
  const stored = asPresenceStatus(status);
  // Only force-offline from heartbeat staleness when we have a last_seen value.
  // Missing last_seen (legacy / not yet heartbeating) trusts the stored status.
  if (lastSeenAt) {
    const seen = Date.parse(lastSeenAt);
    if (!Number.isNaN(seen) && now - seen > PRESENCE_STALE_MS) {
      return "offline";
    }
  }
  return stored;
}

/**
 * Combined caption under a username.
 * Discord: custom status overrides activity in member/friends lists; Invisible
 * hides custom status and shows Offline.
 */
export function presenceCaption(opts: {
  status: string | null | undefined;
  lastSeenAt?: string | null;
  activityLabel?: string | null;
  customStatus?: string | null;
  /** Fresh activity timestamp — keeps caption from flashing Offline mid-switch. */
  activityUpdatedAt?: string | null;
}): string {
  const stored = asPresenceStatus(opts.status);
  const custom = opts.customStatus?.trim() || null;
  const activity = opts.activityLabel?.trim() || null;

  // Invisible / offline — Discord hides custom status from others.
  if (stored === "offline") {
    return "Offline";
  }

  let status = resolveDisplayStatus(opts.status, opts.lastSeenAt);
  // Heartbeat can lag a beat during navigation; if activity just updated, stay present.
  if (status === "offline" && opts.activityUpdatedAt) {
    const act = Date.parse(opts.activityUpdatedAt);
    if (!Number.isNaN(act) && Date.now() - act < PRESENCE_STALE_MS) {
      status = stored;
    }
  }

  if (status === "offline") {
    return "Offline";
  }

  // Custom status wins over "Playing / In voice / …" in list captions.
  if (custom) return custom;
  if (activity) return activity;
  if (status === "idle") return "Idle";
  if (status === "dnd") return "Do Not Disturb";
  return "Online";
}

export function computeAutoEffectiveStatus(opts: {
  manual: ManualStatus;
  tabFocused: boolean;
  inputIdle: boolean;
}): PresenceStatus {
  const { manual, tabFocused, inputIdle } = opts;
  if (manual === "dnd") return "dnd";
  if (manual === "offline") return "offline";
  if (manual === "idle") return "idle";
  // manual === online → auto
  if (!tabFocused || inputIdle) return "idle";
  return "online";
}

export type StatusClearAfter = null | number | "today" | "week";

/** Presence (Online / Idle / DND / Invisible) — default Don't clear (forever). */
export const PRESENCE_CLEAR_AFTER_OPTIONS = [
  { label: "Don't clear", minutes: null },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "4 hours", minutes: 240 },
  { label: "Today", minutes: "today" as const },
  { label: "24 hours", minutes: 1440 },
] as const;

/** Custom status text — default 24 hours. */
export const CUSTOM_STATUS_CLEAR_AFTER_OPTIONS = [
  { label: "24 hours", minutes: 1440 },
  { label: "Today", minutes: "today" as const },
  { label: "4 hours", minutes: 240 },
  { label: "1 hour", minutes: 60 },
  { label: "30 minutes", minutes: 30 },
  { label: "Don't clear", minutes: null },
] as const;

/** @deprecated Use PRESENCE_ / CUSTOM_STATUS_CLEAR_AFTER_OPTIONS */
export const STATUS_CLEAR_AFTER_OPTIONS = CUSTOM_STATUS_CLEAR_AFTER_OPTIONS;

export function clearAfterToMinutes(value: StatusClearAfter): number | null {
  if (value === null) return 0; // explicit don't-clear
  if (typeof value === "number") return value;
  const now = new Date();
  if (value === "today") {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 60_000));
  }
  // End of week = Sunday 23:59 local
  const end = new Date(now);
  const day = end.getDay(); // 0 Sun
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  end.setDate(end.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 60_000));
}

/** Absolute local expiry for a Clear-after choice; null = forever. */
export function clearAfterToExpiryDate(
  value: StatusClearAfter,
  from = Date.now(),
): Date | null {
  if (value === null) return null;
  if (typeof value === "number") {
    return new Date(from + value * 60_000);
  }
  const start = new Date(from);
  if (value === "today") {
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return end;
  }
  const end = new Date(start);
  const day = end.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  end.setDate(end.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);
  return end;
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Client-local expiry copy using the viewer's timezone / time of day.
 * Examples: "Expires at 3:45 PM", "Expires tomorrow at 9:00 AM",
 * "Expires Friday at 4:00 PM", "Expires Nov 20 at 4:00 PM".
 */
export function formatStatusExpiry(
  expiresAt: string | Date | null | undefined,
  now = Date.now(),
): string | null {
  if (!expiresAt) return null;
  const end = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(end.getTime())) return null;
  if (end.getTime() <= now) return "Expired";

  const current = new Date(now);
  const time = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (sameLocalDay(end, current)) {
    return `Expires at ${time}`;
  }

  const tomorrow = new Date(current);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameLocalDay(end, tomorrow)) {
    return `Expires tomorrow at ${time}`;
  }

  const daysOut = Math.round(
    (startOfLocalDay(end).getTime() - startOfLocalDay(current).getTime()) /
      86_400_000,
  );
  if (daysOut > 1 && daysOut < 7) {
    const weekday = end.toLocaleDateString(undefined, { weekday: "long" });
    return `Expires ${weekday} at ${time}`;
  }

  const date = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `Expires ${date} at ${time}`;
}

/** Preview line for a Clear-after draft (before save). */
export function formatClearAfterPreview(
  value: StatusClearAfter,
  from = Date.now(),
): string {
  const end = clearAfterToExpiryDate(value, from);
  if (!end) return "Doesn't expire";
  return formatStatusExpiry(end, from) ?? "Doesn't expire";
}

export async function setManualStatus(opts: {
  manualStatus: ManualStatus;
  statusText?: string | null;
  clearStatusText?: boolean;
  /** Minutes until custom status text clears; 0 = don't clear; omit = leave unchanged. */
  clearAfterMinutes?: number | null;
  /** Minutes until idle/dnd/offline reverts to online; 0 = don't clear; omit = leave. */
  manualClearAfterMinutes?: number | null;
}) {
  const supabase = createClient();
  // Always send all named args so PostgREST never hits an overload clash.
  const { error } = await supabase.rpc("set_manual_status", {
    p_manual_status: opts.manualStatus,
    p_status_text: opts.statusText !== undefined ? opts.statusText : null,
    p_clear_status_text: opts.clearStatusText ?? false,
    p_clear_after_minutes:
      opts.clearAfterMinutes !== undefined ? opts.clearAfterMinutes : null,
    p_manual_clear_after_minutes:
      opts.manualClearAfterMinutes !== undefined
        ? opts.manualClearAfterMinutes
        : null,
  });
  if (error) return { error: error.message };
  notifyProfileUpdated();
  return { error: null as string | null };
}

export async function clearExpiredStatusText() {
  const supabase = createClient();
  const { error } = await supabase.rpc("clear_expired_status_text");
  if (error) return { error: error.message };
  notifyProfileUpdated();
  return { error: null as string | null };
}

export async function heartbeatPresence(opts: {
  status: PresenceStatus;
  manualStatus?: ManualStatus | null;
}) {
  const supabase = createClient();
  const { error } = await supabase.rpc("heartbeat_presence", {
    p_status: opts.status,
    p_manual_status: opts.manualStatus ?? null,
  });
  if (error) return { error: error.message };
  return { error: null as string | null };
}

/** @deprecated Prefer setManualStatus — kept for StatusPicker migration. */
export async function updateOwnPresence(opts: {
  status?: PresenceStatus;
  statusText?: string | null;
}) {
  if (opts.status === undefined && opts.statusText === undefined) {
    return { error: null as string | null };
  }
  if (opts.statusText !== undefined) {
    const cleaned = opts.statusText?.trim() || null;
    if (cleaned && cleaned.length > CUSTOM_STATUS_MAX) {
      return {
        error: `Custom status must be ${CUSTOM_STATUS_MAX} characters or fewer.`,
      };
    }
  }
  const manual = (opts.status ?? "online") as ManualStatus;
  return setManualStatus({
    manualStatus:
      manual === "online" ||
      manual === "idle" ||
      manual === "dnd" ||
      manual === "offline"
        ? manual
        : "online",
    statusText: opts.statusText,
    clearStatusText: opts.statusText === null,
  });
}
