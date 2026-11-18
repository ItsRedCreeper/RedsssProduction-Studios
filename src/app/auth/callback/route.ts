import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "");
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return url.origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = requestOrigin(request);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
