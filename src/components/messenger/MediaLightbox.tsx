"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import type { MessageAttachment } from "@/lib/message-media";
import { isImageMime, isVideoMime } from "@/lib/message-media";

type MediaLightboxProps = {
  items: MessageAttachment[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;

export function MediaLightbox({
  items,
  index,
  onClose,
  onIndexChange,
}: MediaLightboxProps) {
  const current = items[index];
  const hasMany = items.length > 1;
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [downloading, setDownloading] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [index, current?.url]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP));
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        setZoom((value) => {
          const next = Math.max(MIN_ZOOM, value - ZOOM_STEP);
          if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
          return next;
        });
      }
      if (event.key === "0") {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      }
      if (!hasMany || zoom > 1) return;
      if (event.key === "ArrowRight") {
        onIndexChange((index + 1) % items.length);
      }
      if (event.key === "ArrowLeft") {
        onIndexChange((index - 1 + items.length) % items.length);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasMany, index, items.length, onClose, onIndexChange, zoom]);

  if (!current) return null;

  const image = isImageMime(current.type, current.url);
  const video = isVideoMime(current.type, current.url);
  const zoomed = zoom > 1;

  function bumpZoom(delta: number) {
    setZoom((value) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value + delta));
      if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
      return Math.round(next * 100) / 100;
    });
  }

  function resetZoom() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  async function downloadCurrent() {
    if (!current || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(current.url);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = current.name || "download";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback: open in a new tab if blob download is blocked.
      window.open(current.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!image) return;
    event.preventDefault();
    bumpZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLImageElement>) {
    if (!image || !zoomed) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLImageElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLImageElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/90"
        aria-label="Close media"
        onClick={onClose}
      />
      <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5 sm:right-4 sm:top-4">
        <button
          type="button"
          onClick={() => void downloadCurrent()}
          disabled={downloading}
          className="rounded-full bg-black/60 p-2 text-white shadow-lg backdrop-blur-sm hover:bg-black/80 disabled:opacity-50"
          aria-label="Download"
        >
          <Download className="h-5 w-5" strokeWidth={2.25} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-black/60 p-2 text-white shadow-lg backdrop-blur-sm hover:bg-black/80"
          aria-label="Close"
        >
          <X className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </div>

      <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-black/75 p-1 shadow-lg ring-1 ring-accent/20 backdrop-blur-sm">
        {image && (
          <>
            <button
              type="button"
              onClick={() => bumpZoom(-ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              className="rounded-md p-2 text-white hover:bg-white/10 disabled:opacity-40"
              aria-label="Zoom out"
            >
              <Minus className="h-4 w-4" strokeWidth={2} />
            </button>
            <span className="min-w-[3.25rem] text-center text-xs font-medium tabular-nums text-[var(--ms-text)]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => bumpZoom(ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              className="rounded-md p-2 text-white hover:bg-white/10 disabled:opacity-40"
              aria-label="Zoom in"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              disabled={zoom === MIN_ZOOM && offset.x === 0 && offset.y === 0}
              className="rounded-md p-2 text-white hover:bg-white/10 disabled:opacity-40"
              aria-label="Reset zoom"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2} />
            </button>
            <span className="mx-1 h-4 w-px bg-white/20" aria-hidden />
          </>
        )}
        <button
          type="button"
          onClick={() => void downloadCurrent()}
          disabled={downloading}
          className="rounded-md px-2 py-2 text-white hover:bg-white/10 disabled:opacity-40"
          aria-label="Download"
        >
          <Download className="h-4 w-4" strokeWidth={2} />
        </button>
        <span className="mx-1 h-4 w-px bg-white/20" aria-hidden />
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-2 text-white hover:bg-white/10"
          aria-label="Close"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      <div className="relative z-10 flex h-full w-full max-w-[100vw] flex-col items-center justify-center px-2 py-14 sm:px-4">
        <div
          className="relative flex h-full max-h-[92dvh] w-full max-w-[96vw] items-center justify-center overflow-hidden"
          onWheel={onWheel}
        >
          {hasMany && !zoomed && (
            <button
              type="button"
              onClick={() =>
                onIndexChange((index - 1 + items.length) % items.length)
              }
              className="absolute left-2 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 sm:left-4"
              aria-label="Previous"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2} />
            </button>
          )}
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.url}
              alt=""
              draggable={false}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={() => {
                if (zoom > 1) resetZoom();
                else bumpZoom(1);
              }}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              }}
              className={`max-h-[92vh] max-w-[96vw] select-none rounded-md object-contain transition-transform duration-100 will-change-transform ${
                zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
              }`}
            />
          ) : video ? (
            <video
              src={current.url}
              controls
              autoPlay
              className="max-h-[92vh] max-w-[96vw] rounded-md bg-black"
            />
          ) : (
            <a
              href={current.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-[var(--ms-sidebar)] px-4 py-3 text-sm text-white hover:bg-[#35373c]"
            >
              Open file
            </a>
          )}
          {hasMany && !zoomed && (
            <button
              type="button"
              onClick={() => onIndexChange((index + 1) % items.length)}
              className="absolute right-2 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 sm:right-4"
              aria-label="Next"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2} />
            </button>
          )}
        </div>
        {hasMany && (
          <p className="mt-2 text-xs text-[var(--ms-text-muted)]">
            {index + 1} / {items.length}
          </p>
        )}
      </div>
    </div>
  );
}
