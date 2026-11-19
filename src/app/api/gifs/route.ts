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
    fixed_width?: GiphyImage;
    fixed_width_small?: GiphyImage;
    preview_gif?: GiphyImage;
  };
};

function mapGif(row: GiphyItem) {
  if (!row.id || !row.images) return null;
  const full =
    row.images.original || row.images.downsized || row.images.fixed_width;
  const preview =
    row.images.fixed_width_small ||
    row.images.preview_gif ||
    row.images.fixed_width ||
    full;
  const url = full?.url;
  const previewUrl = preview?.url || url;
  if (!url || !previewUrl) return null;
  return {
    id: row.id,
    title: row.title ?? "",
    url,
    previewUrl,
    width: Number(full?.width ?? preview?.width ?? 0) || 0,
    height: Number(full?.height ?? preview?.height ?? 0) || 0,
  };
}

export async function GET(request: Request) {
  const key = process.env.GIPHY_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "GIF search isn't configured." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(
    30,
    Math.max(1, Number(searchParams.get("limit") ?? "24") || 24),
  );

  // Download a selected GIF through our server (avoids browser CORS).
  const downloadUrl = searchParams.get("download")?.trim();
  if (downloadUrl) {
    try {
      const target = new URL(downloadUrl);
      if (
        target.protocol !== "https:" ||
        !/(^|\.)giphy\.com$/i.test(target.hostname)
      ) {
        return NextResponse.json({ error: "Invalid GIF url" }, { status: 400 });
      }
      const upstream = await fetch(target.toString(), {
        headers: { Accept: "image/*,*/*" },
      });
      if (!upstream.ok) {
        return NextResponse.json(
          { error: "Could not download GIF." },
          { status: 502 },
        );
      }
      const bytes = await upstream.arrayBuffer();
      const type = upstream.headers.get("content-type") || "image/gif";
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": type,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch {
      return NextResponse.json(
        { error: "Could not download GIF." },
        { status: 502 },
      );
    }
  }

  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13&lang=en`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(key)}&limit=${limit}&rating=pg-13`;

  try {
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not load GIFs." },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { data?: GiphyItem[] };
    const results = (data.data ?? []).map(mapGif).filter(Boolean);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Could not load GIFs." },
      { status: 502 },
    );
  }
}
