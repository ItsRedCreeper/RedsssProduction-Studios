import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

function getSupabaseKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Soft cap at the browser's typical per-host HTTP/1.1 limit.
 * High enough not to feel sluggish; still FIFO-queues true stampedes.
 * Auth bypasses the queue to avoid GoTrue lock deadlocks.
 */
const MAX_CONCURRENT_REST = 6;
let activeRest = 0;
const restWaiters: Array<() => void> = [];

async function acquireRestSlot() {
  if (activeRest < MAX_CONCURRENT_REST) {
    activeRest += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    restWaiters.push(() => {
      activeRest += 1;
      resolve();
    });
  });
}

function releaseRestSlot() {
  activeRest = Math.max(0, activeRest - 1);
  const next = restWaiters.shift();
  if (next) next();
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const queuedFetch: typeof fetch = async (input, init) => {
  const url = requestUrl(input);
  if (url.includes("/auth/v1/")) {
    return fetch(input, init);
  }
  await acquireRestSlot();
  try {
    return await fetch(input, init);
  } finally {
    releaseRestSlot();
  }
};

/** One shared browser client — avoids duplicate GoTrue init /auth/v1/user work. */
export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseKey(),
    {
      isSingleton: false,
      global: {
        fetch: queuedFetch,
      },
    },
  );
  return browserClient;
}
