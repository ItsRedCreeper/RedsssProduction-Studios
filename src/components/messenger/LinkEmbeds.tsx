"use client";

import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { extractUrls, extractYoutubeId } from "@/lib/message-media";

type OEmbedData = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  provider_name?: string;
  html?: string;
};

type LinkEmbedsProps = {
  content: string;
};

export function LinkEmbeds({ content }: LinkEmbedsProps) {
  const youtubeId = useMemo(() => extractYoutubeId(content), [content]);
  const otherUrl = useMemo(() => {
    if (youtubeId) return null;
    return extractUrls(content)[0] ?? null;
  }, [content, youtubeId]);

  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<OEmbedData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const target = youtubeId
      ? `https://www.youtube.com/watch?v=${youtubeId}`
      : otherUrl;
    if (!target) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/oembed?url=${encodeURIComponent(target)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as OEmbedData;
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
  }, [youtubeId, otherUrl]);

  if (!youtubeId && !otherUrl) return null;

  if (youtubeId) {
    return (
      <div className="mt-2 max-w-md overflow-hidden rounded-md border border-[#3f4147] bg-[#2b2d31]">
        <div className="space-y-0.5 px-3 py-2">
          <p className="truncate text-sm font-semibold text-white">
            {meta?.title ?? (loading ? "Loading…" : "YouTube video")}
          </p>
          {meta?.author_name && (
            <p className="truncate text-xs text-[#949ba4]">{meta.author_name}</p>
          )}
        </div>
        {open ? (
          <div className="aspect-video w-full bg-black">
            <iframe
              title={meta?.title ?? "YouTube video"}
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative block w-full text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                meta?.thumbnail_url ??
                `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
              }
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
    );
  }

  if (!meta && !loading) return null;

  return (
    <a
      href={otherUrl ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="mt-2 block max-w-md overflow-hidden rounded-md border border-[#3f4147] bg-[#2b2d31] hover:bg-[#32343a]"
    >
      <div className="space-y-0.5 px-3 py-2">
        <p className="truncate text-sm font-semibold text-white">
          {meta?.title ?? (loading ? "Loading…" : otherUrl)}
        </p>
        {(meta?.author_name || meta?.provider_name) && (
          <p className="truncate text-xs text-[#949ba4]">
            {meta.author_name ?? meta.provider_name}
          </p>
        )}
      </div>
      {meta?.thumbnail_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.thumbnail_url}
          alt=""
          className="max-h-40 w-full object-cover"
        />
      )}
    </a>
  );
}
