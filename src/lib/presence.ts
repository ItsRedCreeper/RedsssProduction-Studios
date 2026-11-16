import { createClient } from "@/lib/supabase/client";
import type { PresenceStatus } from "@/components/messenger/data";
import { notifyProfileUpdated } from "@/hooks/useCurrentProfile";

const CUSTOM_STATUS_MAX = 128;

export async function updateOwnPresence(opts: {
  status?: PresenceStatus;
  statusText?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as string | null };

  const patch: { status?: string; status_text?: string | null } = {};
  if (opts.status !== undefined) patch.status = opts.status;
  if (opts.statusText !== undefined) {
    const cleaned = opts.statusText?.trim() || null;
    if (cleaned && cleaned.length > CUSTOM_STATUS_MAX) {
      return { error: `Custom status must be ${CUSTOM_STATUS_MAX} characters or fewer.` };
    }
    patch.status_text = cleaned;
  }
  if (Object.keys(patch).length === 0) return { error: null };

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return { error: error.message };
  notifyProfileUpdated();
  return { error: null as string | null };
}
