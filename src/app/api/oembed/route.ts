import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("url")?.trim();
  if (!raw) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Invalid protocol" }, { status: 400 });
  }

  const host = target.hostname.replace(/^www\./, "").toLowerCase();
  const isYouTube =
    host === "youtube.com" ||
    host === "youtu.be" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com";

  const endpoint = isYouTube
    ? `https://www.youtube.com/oembed?url=${encodeURIComponent(target.toString())}&format=json`
    : `https://noembed.com/embed?url=${encodeURIComponent(target.toString())}`;

  try {
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Lookup failed" }, { status: 502 });
    }
    const data = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({
      title: typeof data.title === "string" ? data.title : undefined,
      author_name:
        typeof data.author_name === "string" ? data.author_name : undefined,
      thumbnail_url:
        typeof data.thumbnail_url === "string" ? data.thumbnail_url : undefined,
      provider_name:
        typeof data.provider_name === "string" ? data.provider_name : undefined,
      html: typeof data.html === "string" ? data.html : undefined,
    });
  } catch {
    return NextResponse.json({ error: "Lookup failed" }, { status: 502 });
  }
}
