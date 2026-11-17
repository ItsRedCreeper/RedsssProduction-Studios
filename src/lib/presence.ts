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
 * Combined caption under a username: activity (when not offline), else custom
 * status, else Idle / DND / Offline fallback.
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

  // Explicit manual offline (and no fresh activity) → Offline.
  if (stored === "offline") {
    return custom || "Offline";
  }

  let status = resolveDisplayStatus(opts.status, opts.lastSeenAt);
  // Heartbeat can lag a beat during navigation; if activity just updated, stay present.
  if (status === "offline" && stored !== "offline" && opts.activityUpdatedAt) {
    const act = Date.parse(opts.activityUpdatedAt);
    if (!Number.isNaN(act) && Date.now() - act < PRESENCE_STALE_MS) {
      status = stored;
    }
  }

  if (status === "offline") {
    return custom || "Offline";
  }

  if (activity) return activity;
  if (custom) return custom;
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

export async function setManualStatus(opts: {
  manualStatus: ManualStatus;
  statusText?: string | null;
  clearStatusText?: boolean;
}) {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_manual_status", {
    p_manual_status: opts.manualStatus,
    p_status_text: opts.statusText ?? null,
    p_clear_status_text: opts.clearStatusText ?? false,
  });
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
