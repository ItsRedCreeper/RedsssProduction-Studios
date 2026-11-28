import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Client-side current user from the local session (no /auth/v1/user round-trip).
 * Prefer this on boot / hot paths — parallel getUser() calls saturate the browser
 * connection pool and stall messenger bootstrap for tens of seconds.
 */
export async function getClientUser(): Promise<User | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}
