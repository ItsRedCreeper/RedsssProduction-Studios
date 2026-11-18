"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { MessageAttachment } from "@/lib/message-media";
import { isImageMime, isVideoMime } from "@/lib/message-media";

type MediaLightboxProps = {
  items: MessageAttachment[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

export function MediaLightbox({
  items,
  index,
  onClose,
  onIndexChange,
}: MediaLightboxProps) {
  const current = items[index];
  const hasMany = items.length > 1;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (!hasMany) return;
      if (event.key === "ArrowRight") {
        onIndexChange((index + 1) % items.length);
      }
      if (event.key === "ArrowLeft") {
        onIndexChange((index - 1 + items.length) % items.length);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasMany, index, items.length, onClose, onIndexChange]);

  if (!current) return null;

  const image = isImageMime(current.type, current.url);
  const video = isVideoMime(current.type, current.url);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/85"
        aria-label="Close media"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col items-center">
        <div className="mb-3 flex w-full items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm text-[#dbdee1]">{current.name}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#b5bac1] hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="relative flex max-h-[80vh] w-full items-center justify-center">
          {hasMany && (
            <button
              type="button"
              onClick={() =>
                onIndexChange((index - 1 + items.length) % items.length)
              }
              className="absolute left-2 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Previous"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2} />
            </button>
          )}
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.url}
              alt={current.name}
              className="max-h-[80vh] max-w-full rounded-md object-contain"
            />
          ) : video ? (
            <video
              src={current.url}
              controls
              autoPlay
              className="max-h-[80vh] max-w-full rounded-md bg-black"
            />
          ) : (
            <a
              href={current.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-[#2b2d31] px-4 py-3 text-sm text-white hover:bg-[#35373c]"
            >
              Open {current.name}
            </a>
          )}
          {hasMany && (
            <button
              type="button"
              onClick={() => onIndexChange((index + 1) % items.length)}
              className="absolute right-2 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Next"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2} />
            </button>
          )}
        </div>
        {hasMany && (
          <p className="mt-3 text-xs text-[#949ba4]">
            {index + 1} / {items.length}
          </p>
        )}
      </div>
    </div>
  );
}
