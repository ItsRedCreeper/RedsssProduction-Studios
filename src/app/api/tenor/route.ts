import { NextResponse } from "next/server";

/** Legacy path — GIF search now uses /api/media-search. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/api/media-search", url.origin);
  target.search = url.search;
  return NextResponse.redirect(target, 307);
}
