import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicRequestOrigin } from "@/lib/request-origin";

function getSupabaseKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

/**
 * OAuth/PKCE cookies must be written onto the *redirect* response.
 * Using cookies() from next/headers alone often drops Set-Cookie on
 * NextResponse.redirect, which looks like a successful Google login
 * that immediately dumps you back on /login (especially behind BunnyCDN).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = publicRequestOrigin(request);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";

  const successUrl = new URL(safeNext, `${origin}/`);
  const failureUrl = new URL("/login", `${origin}/`);
  failureUrl.searchParams.set("error", "auth_callback");

  if (!code) {
    return NextResponse.redirect(failureUrl);
  }

  const pendingCookies: CookieToSet[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            pendingCookies.push({ name, value, options });
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  // supabase-js may defer cookie/subscriber writes by a macrotask.
  await new Promise((resolve) => setTimeout(resolve, 0));

  const response = NextResponse.redirect(error ? failureUrl : successUrl);

  for (const { name, value, options } of pendingCookies) {
    // Host-only cookies (no Domain) so the session sticks to the BunnyCDN /
    // Vercel hostname the browser actually used — not the proxied origin host.
    const { domain: _domain, ...rest } = options ?? {};
    response.cookies.set(name, value, {
      ...rest,
      secure: true,
      sameSite: "lax",
      path: rest.path ?? "/",
    });
  }

  // Avoid Bunny/edge caching the callback redirect without cookies.
  response.headers.set("Cache-Control", "no-store, max-age=0");

  return response;
}
