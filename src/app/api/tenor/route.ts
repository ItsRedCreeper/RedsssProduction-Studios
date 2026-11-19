import { NextResponse } from "next/server";

type TenorMedia = {
  url?: string;
  dims?: number[];
};

type TenorResult = {
  id?: string;
  title?: string;
  media_formats?: Record<string, TenorMedia>;
};

function pickMedia(formats: Record<string, TenorMedia> | undefined) {
  if (!formats) return null;
  const preview =
    formats.tinygif ||
    formats.nanogif ||
    formats.gifpreview ||
    formats.tinygif;
  const full = formats.gif || formats.mediumgif || formats.tinygif;
  const url = full?.url;
  const previewUrl = preview?.url || url;
  if (!url || !previewUrl) return null;
  const dims = full?.dims ?? preview?.dims ?? [0, 0];
  return {
    url,
    previewUrl,
    width: dims[0] ?? 0,
    height: dims[1] ?? 0,
  };
}

export async function GET(request: Request) {
  const key = process.env.TENOR_API_KEY?.trim();
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

  const endpoint = q
    ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}&limit=${limit}&media_filter=gif,tinygif,nanogif,mediumgif`
    : `https://tenor.googleapis.com/v2/featured?key=${encodeURIComponent(key)}&limit=${limit}&media_filter=gif,tinygif,nanogif,mediumgif`;

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
    const data = (await res.json()) as { results?: TenorResult[] };
    const results = (data.results ?? [])
      .map((row) => {
        const media = pickMedia(row.media_formats);
        if (!media || !row.id) return null;
        return {
          id: row.id,
          title: row.title ?? "",
          url: media.url,
          previewUrl: media.previewUrl,
          width: media.width,
          height: media.height,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "Could not load GIFs." },
      { status: 502 },
    );
  }
}
