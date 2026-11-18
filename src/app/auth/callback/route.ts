import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_ERROR,
  mapOAuthRedirectError,
  profileSeedFromUser,
} from "@/lib/auth-oauth";
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

function applyCookies(response: NextResponse, pendingCookies: CookieToSet[]) {
  for (const { name, value, options } of pendingCookies) {
    const { domain: _domain, ...rest } = options ?? {};
    response.cookies.set(name, value, {
      ...rest,
      secure: true,
      sameSite: "lax",
      path: rest.path ?? "/",
    });
  }
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

/**
 * OAuth/PKCE cookies must be written onto the redirect response.
 * Automatic Google↔email linking is handled by Supabase Auth when emails match.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = publicRequestOrigin(request);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";

  const successUrl = new URL(safeNext, `${origin}/`);
  const loginUrl = new URL("/login", `${origin}/`);

  const oauthError = mapOAuthRedirectError(
    searchParams.get("error"),
    searchParams.get("error_description"),
  );

  if (oauthError === AUTH_ERROR.cancelled) {
    // Stay on auth page with no error banner.
    return NextResponse.redirect(loginUrl);
  }

  if (oauthError) {
    loginUrl.searchParams.set("error", oauthError);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    loginUrl.searchParams.set("error", AUTH_ERROR.callback);
    return NextResponse.redirect(loginUrl);
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
  await new Promise((resolve) => setTimeout(resolve, 0));

  if (error) {
    const mapped = mapOAuthRedirectError(error.name, error.message);
    loginUrl.searchParams.set(
      "error",
      mapped === AUTH_ERROR.cancelled
        ? AUTH_ERROR.callback
        : (mapped ?? AUTH_ERROR.callback),
    );
    return applyCookies(NextResponse.redirect(loginUrl), pendingCookies);
  }

  // First-time Google users (and any missed trigger) get a profiles row.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const seed = profileSeedFromUser(user);
    await supabase.from("profiles").upsert(seed, {
      onConflict: "id",
      ignoreDuplicates: true,
    });
  }

  return applyCookies(NextResponse.redirect(successUrl), pendingCookies);
}
