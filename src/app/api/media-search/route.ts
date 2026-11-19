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

function mapGif(row: GiphyItem) {
  if (!row.id || !row.images) return null;
  const full =
    row.images.downsized ||
    row.images.downsized_medium ||
    row.images.fixed_width ||
    row.images.original;
  const preview =
    row.images.fixed_width_small ||
    row.images.preview_gif ||
    row.images.fixed_width ||
    full;
  if (!full?.url && !preview?.url) return null;
  // Discord-style: first-party URLs only — never expose giphy hosts to the browser.
  return {
    id: row.id,
    title: row.title ?? "",
    url: `/api/m/${encodeURIComponent(row.id)}?v=f`,
    previewUrl: `/api/m/${encodeURIComponent(row.id)}?v=p`,
    width: Number(full?.width ?? preview?.width ?? 0) || 0,
    height: Number(full?.height ?? preview?.height ?? 0) || 0,
  };
}

async function searchGifs(q: string, limit: number, offset: number) {
  const key = process.env.GIPHY_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "GIF search isn't configured." },
      { status: 503 },
    );
  }

  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}&rating=pg-13&lang=en`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(key)}&limit=${limit}&offset=${offset}&rating=pg-13`;

  try {
    const res = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      cache: "no-store",
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
    const data = (await res.json()) as {
      data?: GiphyItem[];
      pagination?: {
        total_count?: number;
        count?: number;
        offset?: number;
      };
    };
    const results = (data.data ?? []).map(mapGif).filter(Boolean);
    const total = data.pagination?.total_count ?? results.length;
    const nextOffset = offset + results.length;
    return NextResponse.json(
      {
        results,
        nextOffset,
        hasMore: nextOffset < total && results.length > 0,
        total,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
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

function parsePaging(input: {
  q?: unknown;
  limit?: unknown;
  offset?: unknown;
}) {
  const q = typeof input.q === "string" ? input.q.trim() : "";
  const limit = Math.min(
    24,
    Math.max(1, Number(input.limit ?? 12) || 12),
  );
  const offset = Math.max(0, Number(input.offset ?? 0) || 0);
  return { q, limit, offset };
}

/** Prefer POST — keeps search off filterable query strings. */
export async function POST(request: Request) {
  let body: { q?: unknown; limit?: unknown; offset?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const { q, limit, offset } = parsePaging(body);
  return searchGifs(q, limit, offset);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { q, limit, offset } = parsePaging({
    q: searchParams.get("q") ?? "",
    limit: searchParams.get("limit"),
    offset: searchParams.get("offset"),
  });
  return searchGifs(q, limit, offset);
}
