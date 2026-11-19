import { NextResponse } from "next/server";

/** Legacy path — GIF search now uses GIPHY. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/api/giphy", url.origin);
  target.search = url.search;
  return NextResponse.redirect(target, 307);
}
