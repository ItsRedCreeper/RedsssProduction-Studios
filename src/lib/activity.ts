import { createClient } from "@/lib/supabase/client";

export type ActivityType =
  | "home"
  | "games"
  | "reports"
  | "funding"
  | "discover"
  | "dm"
  | "server"
  | "voice"
  | "editing_profile"
  | "other";

export type UserActivityRow = {
  user_id: string;
  activity_type: string;
  context_id: string | null;
  context_name: string | null;
  context_extra: string | null;
  is_public_context: boolean;
  updated_at: string;
};

const ACTIVITY_CHANGED = "redsss-activity-changed";

export function notifyActivityChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACTIVITY_CHANGED));
}

export function onActivityChanged(handler: () => void) {
  window.addEventListener(ACTIVITY_CHANGED, handler);
  return () => window.removeEventListener(ACTIVITY_CHANGED, handler);
}

export async function setUserActivity(opts: {
  type: ActivityType | string;
  contextId?: string | null;
  contextName?: string | null;
  contextExtra?: string | null;
  isPublic?: boolean;
}) {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_user_activity", {
    p_activity_type: opts.type,
    p_context_id: opts.contextId ?? null,
    p_context_name: opts.contextName ?? null,
    p_context_extra: opts.contextExtra ?? null,
    p_is_public: opts.isPublic ?? true,
  });
  if (!error) notifyActivityChanged();
  return { error: error?.message ?? null };
}

export async function loadActivitiesFor(userIds: string[]) {
  if (userIds.length === 0) {
    return { rows: [] as UserActivityRow[], error: null as string | null };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_activity")
    .select(
      "user_id, activity_type, context_id, context_name, context_extra, is_public_context, updated_at",
    )
    .in("user_id", userIds);
  if (error) return { rows: [] as UserActivityRow[], error: error.message };
  return { rows: (data ?? []) as UserActivityRow[], error: null as string | null };
}

type ActivityViewOpts = {
  viewerId: string | null;
  /** Friend IDs of the viewer. */
  friendIds: Set<string>;
  /** Server IDs the viewer belongs to. */
  viewerServerIds: Set<string>;
  /** When activity is a DM, the other participant id (context_extra). */
  activityOwnerId: string;
};

/**
 * Privacy-aware activity label for display on profiles / friends list.
 * Never reveals private server names or DM partners without friendship+membership.
 * Own profile always sees the full/true label.
 */
export function formatActivityLabel(
  row: UserActivityRow | null | undefined,
  opts: ActivityViewOpts,
): string | null {
  if (!row) return null;
  const type = row.activity_type;
  const name = row.context_name?.trim() || null;
  const extra = row.context_extra?.trim() || null;
  const isPublic = row.is_public_context;
  const isSelf = !!opts.viewerId && opts.viewerId === opts.activityOwnerId;
  const isFriend =
    isSelf || opts.friendIds.has(opts.activityOwnerId);
  const inServer =
    isSelf ||
    (!!row.context_id && opts.viewerServerIds.has(row.context_id));
  /** Viewer is the other person in this DM. */
  const messagingYou =
    !!opts.viewerId && !!extra && opts.viewerId === extra;

  switch (type) {
    case "home":
      return "On Home";
    case "games":
      return "Browsing Games";
    case "reports":
      return "On Reports";
    case "funding":
      return "On Funding";
    case "discover":
      return "Browsing servers";
    case "editing_profile":
      return "Editing profile";
    case "dm": {
      if (messagingYou) return "Messaging you";
      if (isSelf && name) return `Messaging ${name}`;
      if (isFriend && extra && opts.friendIds.has(extra) && name) {
        return `Messaging ${name}`;
      }
      return "Messaging someone";
    }
    case "server": {
      if ((isPublic || isSelf || (isFriend && inServer)) && name) {
        return `In ${name}`;
      }
      return "In a server";
    }
    case "voice": {
      if ((isPublic || isSelf || (isFriend && inServer)) && name) {
        return `In voice — ${name}`;
      }
      return "In a voice channel";
    }
    case "other":
      return name || null;
    default:
      return name ? name : null;
  }
}
