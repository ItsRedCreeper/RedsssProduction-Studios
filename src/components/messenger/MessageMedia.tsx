"use client";

import { useMemo, useState } from "react";
import { Download, FileText, Film, Paperclip } from "lucide-react";
import { MediaLightbox } from "@/components/messenger/MediaLightbox";
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

export function MessageMedia({ message }: MessageMediaProps) {
  const items = useMemo(() => attachmentsFromMessage(message), [message]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  const mediaItems = items.filter(
    (item) => isImageMime(item.type, item.url) || isVideoMime(item.type, item.url),
  );

  function openLightbox(item: MessageAttachment) {
    const idx = mediaItems.findIndex((row) => row.url === item.url);
    if (idx >= 0) setLightboxIndex(idx);
  }

  return (
    <>
      <div className="mt-2 flex max-w-xl flex-col gap-2">
        {items.map((item) => {
          const image = isImageMime(item.type, item.url);
          const video = isVideoMime(item.type, item.url);
          if (image) {
            return (
              <figure key={item.url} className="max-w-full">
                <button
                  type="button"
                  onClick={() => openLightbox(item)}
                  className="block max-w-full text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.name}
                    className="max-h-80 max-w-full rounded-md object-contain"
                  />
                </button>
                {item.name && item.name !== "attachment" && (
                  <figcaption className="mt-1.5 max-w-full truncate text-xs text-[#949ba4]">
                    {item.name}
                  </figcaption>
                )}
              </figure>
            );
          }
          if (video) {
            return (
              <figure key={item.url} className="max-w-full">
                <div className="relative max-w-full overflow-hidden rounded-md bg-black">
                  <video
                    src={item.url}
                    controls
                    preload="metadata"
                    className="max-h-80 max-w-full"
                  />
                  <button
                    type="button"
                    onClick={() => openLightbox(item)}
                    className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-black/80"
                  >
                    Expand
                  </button>
                </div>
                {item.name && item.name !== "attachment" && (
                  <figcaption className="mt-1.5 max-w-full truncate text-xs text-[#949ba4]">
                    {item.name}
                  </figcaption>
                )}
              </figure>
            );
          }
          return (
            <a
              key={item.url}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              download={item.name}
              className="inline-flex max-w-full items-center gap-3 rounded-md border border-[#3f4147] bg-[#2b2d31] px-3 py-2.5 text-sm text-[#dbdee1] hover:bg-[#35373c]"
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
                  <span className="text-[11px] text-[#949ba4]">
                    {formatFileSize(item.size)}
                  </span>
                )}
              </span>
              <Download className="h-4 w-4 shrink-0 text-[#949ba4]" strokeWidth={1.75} />
            </a>
          );
        })}
      </div>
      {lightboxIndex != null && mediaItems.length > 0 && (
        <MediaLightbox
          items={mediaItems}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </>
  );
}
