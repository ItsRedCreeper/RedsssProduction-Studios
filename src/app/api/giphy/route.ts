import { NextResponse } from "next/server";

/** Prefer /api/gifs — some blockers flag URLs containing "giphy". */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/api/gifs", url.origin);
  target.search = url.search;
  return NextResponse.redirect(target, 307);
}
