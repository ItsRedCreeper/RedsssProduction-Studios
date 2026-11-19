import { NextResponse } from "next/server";

type GiphyImage = {
  url?: string;
  width?: string;
  height?: string;
};

type GiphyItem = {
  id?: string;
  title?: string;
  images?: {
    original?: GiphyImage;
    downsized?: GiphyImage;
    downsized_medium?: GiphyImage;
    fixed_width?: GiphyImage;
    fixed_width_small?: GiphyImage;
    preview_gif?: GiphyImage;
  };
};

function isAllowedGiphyHost(hostname: string) {
  return (
    /(^|\.)giphy\.com$/i.test(hostname) ||
    /(^|\.)giphyusercontent\.com$/i.test(hostname)
  );
}

function mapGif(row: GiphyItem) {
  if (!row.id || !row.images) return null;
  // Prefer smaller assets to stay under beta rate limits / bandwidth.
  const full =
    row.images.downsized_medium ||
    row.images.downsized ||
    row.images.fixed_width ||
    row.images.original;
  const preview =
    row.images.fixed_width ||
    row.images.fixed_width_small ||
    row.images.preview_gif ||
    full;
  const url = full?.url;
  const previewUrl = preview?.url || url;
  if (!url || !previewUrl) return null;
  // Relative proxy URL so previews work on custom CDN hosts too.
  return {
    id: row.id,
    title: row.title ?? "",
    url,
    previewUrl: `/api/gifs?media=${encodeURIComponent(previewUrl)}`,
    width: Number(full?.width ?? preview?.width ?? 0) || 0,
    height: Number(full?.height ?? preview?.height ?? 0) || 0,
  };
}

async function proxyMedia(rawUrl: string) {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid GIF url" }, { status: 400 });
  }
  if (target.protocol !== "https:" || !isAllowedGiphyHost(target.hostname)) {
    return NextResponse.json({ error: "Invalid GIF url" }, { status: 400 });
  }
  const upstream = await fetch(target.toString(), {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent": "RedsssMessenger/1.0",
    },
    cache: "force-cache",
  });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "Could not load GIF media." },
      { status: 502 },
    );
  }
  const bytes = await upstream.arrayBuffer();
  const upstreamType = upstream.headers.get("content-type") || "";
  const type = upstreamType.startsWith("image/")
    ? upstreamType
    : target.pathname.toLowerCase().endsWith(".webp")
      ? "image/webp"
      : "image/gif";
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}

export async function GET(request: Request) {
  const key = process.env.GIPHY_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "GIF search isn't configured." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const { searchParams } = url;

  const mediaUrl = searchParams.get("media")?.trim();
  if (mediaUrl) {
    try {
      return await proxyMedia(mediaUrl);
    } catch {
      return NextResponse.json(
        { error: "Could not load GIF media." },
        { status: 502 },
      );
    }
  }

  const downloadUrl = searchParams.get("download")?.trim();
  if (downloadUrl) {
    try {
      return await proxyMedia(downloadUrl);
    } catch {
      return NextResponse.json(
        { error: "Could not download GIF." },
        { status: 502 },
      );
    }
  }

  const q = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(
    20,
    Math.max(1, Number(searchParams.get("limit") ?? "16") || 16),
  );

  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13&lang=en`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(key)}&limit=${limit}&rating=pg-13`;

  try {
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      next: { revalidate: q ? 30 : 120 },
    });
    if (res.status === 429) {
      return NextResponse.json(
        {
          error:
            "GIF search hit the free rate limit. Wait a bit and try again.",
        },
        { status: 429 },
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not load GIFs." },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { data?: GiphyItem[] };
    const results = (data.data ?? []).map(mapGif).filter(Boolean);
    return NextResponse.json(
      { results },
      {
        headers: {
          "Cache-Control": q
            ? "private, max-age=30"
            : "private, max-age=120",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load GIFs." },
      { status: 502 },
    );
  }
}
