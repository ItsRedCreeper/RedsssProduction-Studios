import { NextResponse } from "next/server";

type Variant = "p" | "f";

type GiphyImage = { url?: string; width?: string; height?: string };

type GiphyImages = {
  original?: GiphyImage;
  downsized?: GiphyImage;
  downsized_medium?: GiphyImage;
  fixed_width?: GiphyImage;
  fixed_width_small?: GiphyImage;
  preview_gif?: GiphyImage;
  preview_webp?: GiphyImage;
};

function pickUrl(images: GiphyImages | undefined, variant: Variant) {
  if (!images) return null;
  if (variant === "p") {
    return (
      images.fixed_width_small?.url ||
      images.preview_gif?.url ||
      images.preview_webp?.url ||
      images.fixed_width?.url ||
      images.downsized?.url ||
      images.original?.url ||
      null
    );
  }
  return (
    images.downsized?.url ||
    images.downsized_medium?.url ||
    images.fixed_width?.url ||
    images.original?.url ||
    null
  );
}

/** Legacy CDN guesses — only used if the Giphy lookup fails. */
function legacyTargets(id: string, variant: Variant) {
  const hosts = ["https://media.giphy.com", "https://i.giphy.com"];
  const files =
    variant === "p"
      ? ["200w.gif", "200.gif", "giphy-preview.webp", "giphy-preview.gif", "giphy.gif"]
      : ["giphy.gif", "giphy.webp", "200w.gif"];
  const out: string[] = [];
  for (const host of hosts) {
    for (const file of files) {
      out.push(`${host}/media/${encodeURIComponent(id)}/${file}`);
    }
  }
  return out;
}

async function resolveUpstream(id: string, variant: Variant) {
  const key = process.env.GIPHY_API_KEY?.trim();
  if (key) {
    try {
      const meta = await fetch(
        `https://api.giphy.com/v1/gifs/${encodeURIComponent(id)}?api_key=${encodeURIComponent(key)}`,
        {
          headers: { Accept: "application/json" },
          // Thumbnails repeat a lot in the picker — cache metadata a day.
          next: { revalidate: 86_400 },
        },
      );
      if (meta.ok) {
        const body = (await meta.json()) as {
          data?: { images?: GiphyImages };
        };
        const url = pickUrl(body.data?.images, variant);
        if (url) return [url];
      }
    } catch {
      /* fall through to legacy paths */
    }
  }
  return legacyTargets(id, variant);
}

async function fetchBytes(target: string, maxBytes: number) {
  const upstream = await fetch(target, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent": "RedsssMessenger/1.0",
    },
    cache: "force-cache",
    next: { revalidate: 86_400 },
  });
  if (!upstream.ok) return null;
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null;
  const upstreamType = upstream.headers.get("content-type") || "";
  const type = upstreamType.startsWith("image/")
    ? upstreamType
    : "image/gif";
  return { bytes, type };
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

  try {
    const targets = await resolveUpstream(id, variant);
    for (const target of targets) {
      const got = await fetchBytes(target, maxBytes);
      if (!got) continue;
      return new NextResponse(got.bytes, {
        status: 200,
        headers: {
          "Content-Type": got.type,
          "Cache-Control":
            "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }
    return NextResponse.json(
      { error: "Could not load media." },
      { status: 502 },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load media." },
      { status: 502 },
    );
  }
}
