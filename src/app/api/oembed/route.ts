import { NextResponse } from "next/server";

export type LinkPreviewPayload = {
  title?: string;
  description?: string;
  author_name?: string;
  thumbnail_url?: string;
  provider_name?: string;
  site_name?: string;
  url?: string;
  html?: string;
};

function metaContent(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtml(m[1].trim());
  }
  return undefined;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function absoluteUrl(base: URL, maybe: string | undefined) {
  if (!maybe) return undefined;
  try {
    return new URL(maybe, base).toString();
  } catch {
    return undefined;
  }
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0"
  ) {
    return true;
  }
  // Basic IPv4 private/link-local ranges
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

async function scrapeOpenGraph(
  target: URL,
): Promise<LinkPreviewPayload | null> {
  if (isPrivateHost(target.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; RedsssBot/1.0; +https://redsss.gg)",
      },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      return null;
    }
    const html = (await res.text()).slice(0, 400_000);
    const title =
      metaContent(html, "og:title") ||
      metaContent(html, "twitter:title") ||
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    const description =
      metaContent(html, "og:description") ||
      metaContent(html, "twitter:description") ||
      metaContent(html, "description");
    const image =
      metaContent(html, "og:image:secure_url") ||
      metaContent(html, "og:image") ||
      metaContent(html, "twitter:image");
    const siteName =
      metaContent(html, "og:site_name") || target.hostname.replace(/^www\./, "");

    return {
      title: title ? decodeHtml(title) : undefined,
      description,
      thumbnail_url: absoluteUrl(target, image),
      site_name: siteName,
      provider_name: siteName,
      url: target.toString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

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

  if (isPrivateHost(target.hostname)) {
    return NextResponse.json({ error: "Blocked host" }, { status: 400 });
  }

  const host = target.hostname.replace(/^www\./, "").toLowerCase();
  const isYouTube =
    host === "youtube.com" ||
    host === "youtu.be" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com";

  // YouTube: prefer official oEmbed (thumbnails + title).
  if (isYouTube) {
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(target.toString())}&format=json`,
        { headers: { Accept: "application/json" }, next: { revalidate: 3600 } },
      );
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        return NextResponse.json({
          title: typeof data.title === "string" ? data.title : undefined,
          author_name:
            typeof data.author_name === "string" ? data.author_name : undefined,
          thumbnail_url:
            typeof data.thumbnail_url === "string"
              ? data.thumbnail_url
              : undefined,
          provider_name: "YouTube",
          site_name: "YouTube",
          url: target.toString(),
        } satisfies LinkPreviewPayload);
      }
    } catch {
      // Fall through to OG scrape.
    }
  }

  const og = await scrapeOpenGraph(target);
  if (og && (og.title || og.description || og.thumbnail_url)) {
    return NextResponse.json(og);
  }

  // Last resort: noembed for known providers.
  try {
    const res = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(target.toString())}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 3600 } },
    );
    if (res.ok) {
      const data = (await res.json()) as Record<string, unknown>;
      if (!data.error) {
        return NextResponse.json({
          title: typeof data.title === "string" ? data.title : undefined,
          description:
            typeof data.description === "string" ? data.description : undefined,
          author_name:
            typeof data.author_name === "string" ? data.author_name : undefined,
          thumbnail_url:
            typeof data.thumbnail_url === "string"
              ? data.thumbnail_url
              : undefined,
          provider_name:
            typeof data.provider_name === "string"
              ? data.provider_name
              : undefined,
          site_name:
            typeof data.provider_name === "string"
              ? data.provider_name
              : target.hostname.replace(/^www\./, ""),
          url: target.toString(),
          html: typeof data.html === "string" ? data.html : undefined,
        } satisfies LinkPreviewPayload);
      }
    }
  } catch {
    // ignore
  }

  // Minimal fallback so the card can still show the site hostname.
  return NextResponse.json({
    site_name: target.hostname.replace(/^www\./, ""),
    provider_name: target.hostname.replace(/^www\./, ""),
    title: target.hostname.replace(/^www\./, ""),
    url: target.toString(),
  } satisfies LinkPreviewPayload);
}
