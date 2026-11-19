"use client";

import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { SpoilerMedia } from "@/components/messenger/SpoilerMedia";
import {
  extractEmbeddableUrlInfos,
  extractYoutubeId,
} from "@/lib/message-media";

type LinkPreview = {
  title?: string;
  description?: string;
  author_name?: string;
  thumbnail_url?: string;
  provider_name?: string;
  site_name?: string;
  url?: string;
};

type LinkEmbedsProps = {
  content: string;
};

/**
 * Discord-style unfurl: inline URL stays in the message; this is the preview card.
 * URLs wrapped in ||spoilers|| get a blurred card until revealed — then the
 * full preview (title, description, thumbnail / YouTube player) shows.
 */
export function LinkEmbeds({ content }: LinkEmbedsProps) {
  const urls = useMemo(
    () => extractEmbeddableUrlInfos(content).slice(0, 2),
    [content],
  );

  if (urls.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {urls.map((item) => (
        <LinkPreviewCard
          key={`${item.url}:${item.spoiler ? "s" : "n"}`}
          url={item.url}
          spoiler={item.spoiler}
        />
      ))}
    </div>
  );
}

function LinkPreviewCard({
  url,
  spoiler,
}: {
  url: string;
  spoiler: boolean;
}) {
  const youtubeId = useMemo(() => extractYoutubeId(url), [url]);
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<LinkPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMeta(null);
    void fetch(`/api/oembed?url=${encodeURIComponent(url)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as LinkPreview;
      })
      .then((data) => {
        if (!cancelled) setMeta(data);
      })
      .catch(() => {
        if (!cancelled) setMeta(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const site =
    meta?.site_name ||
    meta?.provider_name ||
    safeHostname(url) ||
    "Link";
  const title =
    meta?.title?.trim() ||
    (loading ? "Loading preview…" : safeHostname(url) || site);
  const description = meta?.description?.trim();
  const image =
    meta?.thumbnail_url ||
    (youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : null);

  // Still show a minimal card when OG fails so spoilered links aren't blank.
  if (!loading && !meta && !youtubeId && !safeHostname(url)) return null;

  const card = youtubeId ? (
    <div className="max-w-md overflow-hidden rounded-[4px] bg-[#2b2d31]">
      <div className="flex">
        <div className="w-1 shrink-0 bg-accent" aria-hidden />
        <div className="min-w-0 flex-1 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#949ba4]">
            {site}
          </p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 line-clamp-2 text-base font-semibold text-[#00a8fc] hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {title}
          </a>
          {meta?.author_name && (
            <p className="mt-1 line-clamp-1 text-sm text-[#dbdee1]">
              {meta.author_name}
            </p>
          )}
          <div className="mt-2 overflow-hidden rounded">
            {open ? (
              <div className="aspect-video w-full bg-black">
                <iframe
                  title={title}
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(true);
                }}
                className="group relative block w-full text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image ?? undefined}
                  alt=""
                  className="aspect-video w-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/35 transition group-hover:bg-black/45">
                  <span className="rounded-full bg-accent p-3 text-white shadow-lg">
                    <Play className="h-5 w-5 fill-current" strokeWidth={0} />
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block max-w-md overflow-hidden rounded-[4px] bg-[#2b2d31] transition hover:bg-[#2e3035]"
      onClick={(event) => {
        // While covered by SpoilerMedia, pointer-events are off; after reveal, navigate.
        if (spoiler) event.stopPropagation();
      }}
    >
      <div className="flex">
        <div className="w-1 shrink-0 bg-accent" aria-hidden />
        <div className="min-w-0 flex-1 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#949ba4]">
            {site}
          </p>
          <p className="mt-0.5 line-clamp-2 text-base font-semibold text-[#00a8fc]">
            {title}
          </p>
          {description ? (
            <p className="mt-1 line-clamp-3 text-sm leading-snug text-[#dbdee1]">
              {description}
            </p>
          ) : null}
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="mt-2 max-h-52 w-full rounded object-cover"
            />
          ) : null}
        </div>
      </div>
    </a>
  );

  if (!spoiler) return card;

  // Discord: blur the real preview until clicked, then show it fully.
  return <SpoilerMedia className="max-w-md">{card}</SpoilerMedia>;
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
