import { createClient } from "@/lib/supabase/client";
import { onceInflight } from "@/lib/supabase/inflight";
import type { Tables } from "@/lib/supabase/database.types";

/** Shared membership lookup — StrictMode / Presence / emoji loaders share one GET. */
export function loadMyServerIds(userId: string) {
  return onceInflight(`server_members:user:${userId}`, async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("server_members")
      .select("server_id")
      .eq("user_id", userId);
    return {
      serverIds: (data ?? []).map((row) => row.server_id),
      error: error?.message ?? null,
    };
  });
}

export function loadServersByIds(serverIds: string[]) {
  const key = [...serverIds].sort().join(",");
  return onceInflight(`servers:in:${key}`, async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("servers")
      .select("*")
      .in("id", serverIds)
      .order("created_at", { ascending: true });
    return {
      servers: (data as Tables<"servers">[] | null) ?? [],
      error: error?.message ?? null,
    };
  });
}
