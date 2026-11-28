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
 * Cap concurrent Supabase REST/RPC calls. Browsers allow ~6 connections per host;
 * messenger boot used to open dozens at once and stall everything.
 *
 * Auth (/auth/v1/*) bypasses the queue — otherwise GoTrue init/getUser can
 * hold slots while other calls wait on the auth lock → hard deadlock.
 */
const MAX_CONCURRENT_REST = 3;
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
  const isAuth = url.includes("/auth/v1/");
  if (isAuth) {
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
  // isSingleton: false — we own the singleton so global.fetch always queues.
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
