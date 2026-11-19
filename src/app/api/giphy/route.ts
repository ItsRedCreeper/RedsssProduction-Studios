import { NextResponse } from "next/server";

/** Legacy path — blockers often filter URLs containing "giphy". */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/api/media-search", url.origin);
  target.search = url.search;
  return NextResponse.redirect(target, 307);
}
