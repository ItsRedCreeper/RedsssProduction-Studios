import { NextResponse } from "next/server";

type Variant = "p" | "f";

function upstreamFor(id: string, variant: Variant) {
  // Stable short Giphy CDN paths — avoids leaking long v1 URLs to the client.
  // 200w keeps picker thumbs sharp without multi‑MB fixed_width files.
  const file = variant === "p" ? "200w.gif" : "giphy.gif";
  return `https://media.giphy.com/media/${encodeURIComponent(id)}/${file}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const id = rawId?.trim();
  if (!id || id.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid media id" }, { status: 400 });
  }

  const variantParam = new URL(request.url).searchParams.get("v");
  const variant: Variant = variantParam === "f" ? "f" : "p";
  const maxBytes = variant === "f" ? 8_000_000 : 1_500_000;
  const target = upstreamFor(id, variant);

  try {
    const upstream = await fetch(target, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent": "RedsssMessenger/1.0",
      },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Could not load media." },
        { status: 502 },
      );
    }
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > maxBytes) {
      return NextResponse.json(
        { error: "Media too large." },
        { status: 502 },
      );
    }
    const upstreamType = upstream.headers.get("content-type") || "";
    const type = upstreamType.startsWith("image/")
      ? upstreamType
      : "image/gif";
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load media." },
      { status: 502 },
    );
  }
}
