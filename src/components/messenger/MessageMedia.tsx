"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Film, Paperclip } from "lucide-react";
import { MediaLightbox } from "@/components/messenger/MediaLightbox";
import { SpoilerMedia } from "@/components/messenger/SpoilerMedia";
import {
  attachmentsFromMessage,
  formatFileSize,
  isImageMime,
  isVideoMime,
  type MessageAttachment,
} from "@/lib/message-media";

type MessageMediaProps = {
  message: {
    attachments?: unknown;
    attachment_url?: string | null;
    attachment_type?: string | null;
  };
};

function safeDownloadName(name: string | undefined | null) {
  const raw = (name ?? "download").trim() || "download";
  // Strip path separators / control chars that break Content-Disposition-like names.
  return raw.replace(/[\\/<>:"|?*\u0000-\u001f]/g, "_").slice(0, 180);
}

export function MessageMedia({ message }: MessageMediaProps) {
  const items = useMemo(() => attachmentsFromMessage(message), [message]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);
  const inlineVideoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());

  useEffect(() => {
    if (lightboxIndex == null) return;
    for (const video of inlineVideoRefs.current.values()) {
      try {
        video.pause();
      } catch {
        /* ignore */
      }
    }
  }, [lightboxIndex]);

  if (items.length === 0) return null;

  const mediaItems = items.filter(
    (item) => isImageMime(item.type, item.url) || isVideoMime(item.type, item.url),
  );

  function openLightboxAt(mediaIndex: number) {
    if (mediaIndex >= 0 && mediaIndex < mediaItems.length) {
      setLightboxIndex(mediaIndex);
    }
  }

  function closeLightbox() {
    setLightboxIndex(null);
  }

  async function downloadFile(item: MessageAttachment) {
    if (downloadingUrl === item.url) return;
    setDownloadingUrl(item.url);
    const filename = safeDownloadName(item.name);
    try {
      const res = await fetch(item.url);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback: open in a new tab if blob download is blocked (CORS / opaque).
      window.open(item.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingUrl(null);
    }
  }

  return (
    <>
      <div className="mt-2 flex max-w-3xl flex-col gap-2">
        {items.map((item, itemIndex) => {
          const image = isImageMime(item.type, item.url);
          const video = isVideoMime(item.type, item.url);
          const spoiler = Boolean(item.spoiler);
          const mediaIndex = mediaItems.indexOf(item);

          if (image) {
            const body = (
              <button
                type="button"
                onClick={() => openLightboxAt(mediaIndex)}
                className="block max-w-full text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt=""
                  className="max-h-[32rem] max-w-full rounded-md object-contain"
                />
              </button>
            );
            return spoiler ? (
              <SpoilerMedia key={`${item.url}:${itemIndex}`}>{body}</SpoilerMedia>
            ) : (
              <div key={`${item.url}:${itemIndex}`}>{body}</div>
            );
          }

          if (video) {
            const body = (
              <div className="relative max-w-full overflow-hidden rounded-md bg-black">
                <video
                  ref={(el) => {
                    if (el) inlineVideoRefs.current.set(itemIndex, el);
                    else inlineVideoRefs.current.delete(itemIndex);
                  }}
                  src={item.url}
                  controls
                  preload="metadata"
                  className={`max-h-[32rem] max-w-full ${
                    lightboxIndex != null ? "invisible absolute" : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={() => openLightboxAt(mediaIndex)}
                  className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-black/80"
                >
                  Expand
                </button>
              </div>
            );
            return spoiler ? (
              <SpoilerMedia key={`${item.url}:${itemIndex}`}>{body}</SpoilerMedia>
            ) : (
              <div key={`${item.url}:${itemIndex}`}>{body}</div>
            );
          }

          const body = (
            <button
              type="button"
              onClick={() => void downloadFile(item)}
              disabled={downloadingUrl === item.url}
              className="inline-flex max-w-full items-center gap-3 rounded-md border border-[#3f4147] bg-[var(--ms-sidebar)] px-3 py-2.5 text-left text-sm text-[var(--ms-text)] hover:bg-[#35373c] disabled:opacity-60"
            >
              {item.type.includes("pdf") || item.type.startsWith("text/") ? (
                <FileText className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.75} />
              ) : item.type.startsWith("video/") ? (
                <Film className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.75} />
              ) : (
                <Paperclip className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.75} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.name}</span>
                {item.size > 0 && (
                  <span className="text-[11px] text-[var(--ms-text-muted)]">
                    {formatFileSize(item.size)}
                  </span>
                )}
              </span>
              <Download className="h-4 w-4 shrink-0 text-[var(--ms-text-muted)]" strokeWidth={1.75} />
            </button>
          );

          return spoiler ? (
            <SpoilerMedia
              key={`${item.url}:${itemIndex}`}
              className="inline-flex max-w-full"
            >
              {body}
            </SpoilerMedia>
          ) : (
            <div key={`${item.url}:${itemIndex}`}>{body}</div>
          );
        })}
      </div>
      {lightboxIndex != null && mediaItems.length > 0 && (
        <MediaLightbox
          items={mediaItems}
          index={lightboxIndex}
          onClose={closeLightbox}
          onIndexChange={setLightboxIndex}
        />
      )}
    </>
  );
}
