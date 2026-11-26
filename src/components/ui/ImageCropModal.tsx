"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";

export type ImageCropKind = "avatar" | "banner" | "icon";

type ImageCropModalProps = {
  open: boolean;
  file: File | null;
  kind: ImageCropKind;
  onCancel: () => void;
  onCropped: (file: File) => void;
};

/** Discord-ish output sizes. */
const OUTPUT = {
  avatar: { w: 512, h: 512, label: "Profile photo" },
  icon: { w: 512, h: 512, label: "Server icon" },
  banner: { w: 960, h: 340, label: "Banner" },
} as const;

function loadImageFromFile(
  file: File,
): Promise<{ img: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, objectUrl });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image."));
    };
    img.src = objectUrl;
  });
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Discord-style crop: pan + zoom inside a fixed aspect frame, then export.
 * Identity slots (avatar / banner / icon) only accept static images.
 */
export function ImageCropModal({
  open,
  file,
  kind,
  onCancel,
  onCropped,
}: ImageCropModalProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [frameSize, setFrameSize] = useState({ w: 320, h: 320 });

  const meta = OUTPUT[kind];
  const aspect = meta.w / meta.h;
  const roundMask = kind === "avatar" || kind === "icon";

  useEffect(() => {
    if (!open || !file) {
      setImg(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setError(null);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setError(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    void loadImageFromFile(file)
      .then(({ img: loaded, objectUrl }) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        createdUrl = objectUrl;
        setImg(loaded);
        setPreviewUrl(objectUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not read image.");
        }
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, file]);

  useEffect(() => {
    if (!open) return;
    function measure() {
      const el = frameRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = Math.round(w / aspect);
      setFrameSize({ w, h });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, aspect, img]);

  const coverScale = useMemo(() => {
    if (!img || frameSize.w <= 0) return 1;
    return Math.max(frameSize.w / img.naturalWidth, frameSize.h / img.naturalHeight);
  }, [img, frameSize]);

  const drawW = img ? img.naturalWidth * coverScale * zoom : 0;
  const drawH = img ? img.naturalHeight * coverScale * zoom : 0;

  const maxOffset = useMemo(() => {
    return {
      x: Math.max(0, (drawW - frameSize.w) / 2),
      y: Math.max(0, (drawH - frameSize.h) / 2),
    };
  }, [drawW, drawH, frameSize]);

  useEffect(() => {
    setOffset((prev) => ({
      x: clamp(prev.x, -maxOffset.x, maxOffset.x),
      y: clamp(prev.y, -maxOffset.y, maxOffset.y),
    }));
  }, [maxOffset.x, maxOffset.y]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        x: event.clientX,
        y: event.clientY,
        ox: offset.x,
        oy: offset.y,
      };
    },
    [offset.x, offset.y],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      setOffset({
        x: clamp(drag.ox + dx, -maxOffset.x, maxOffset.x),
        y: clamp(drag.oy + dy, -maxOffset.y, maxOffset.y),
      });
    },
    [maxOffset.x, maxOffset.y],
  );

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  async function applyCrop() {
    if (!img) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = meta.w;
      canvas.height = meta.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not crop that image.");

      // Map frame-space crop rect back into source image pixels.
      const scale = coverScale * zoom;
      const srcW = frameSize.w / scale;
      const srcH = frameSize.h / scale;
      const centerX = img.naturalWidth / 2 - offset.x / scale;
      const centerY = img.naturalHeight / 2 - offset.y / scale;
      const sx = centerX - srcW / 2;
      const sy = centerY - srcH / 2;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, meta.w, meta.h);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/webp", 0.92),
      );
      if (!blob) throw new Error("Could not export the crop.");
      const base =
        (file?.name || "image").replace(/\.[^.]+$/, "") || kind;
      onCropped(
        new File([blob], `${base}-crop.webp`, { type: "image/webp" }),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not crop.");
    } finally {
      setBusy(false);
    }
  }

  if (!open || !file) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Crop ${meta.label}`}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80"
        aria-label="Cancel crop"
        onClick={onCancel}
        disabled={busy}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111214] shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Crop {meta.label}
            </h2>
            <p className="text-[11px] text-[#949ba4]">
              Drag to reposition · scroll or slider to zoom
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md p-1.5 text-[#949ba4] hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div
            ref={frameRef}
            className={`relative mx-auto w-full max-w-md touch-none overflow-hidden bg-[#1e1f22] ${
              roundMask ? "rounded-full" : "rounded-xl"
            }`}
            style={{ aspectRatio: `${meta.w} / ${meta.h}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={(event) => {
              event.preventDefault();
              const delta = event.deltaY > 0 ? -0.08 : 0.08;
              setZoom((z) => clamp(z + delta, 1, 3));
            }}
          >
            {img && previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: drawW,
                  height: drawH,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[#949ba4]">
                {error ?? "Loading…"}
              </div>
            )}
            <div
              className={`pointer-events-none absolute inset-0 ring-1 ring-inset ${
                roundMask ? "rounded-full ring-white/20" : "rounded-xl ring-white/15"
              }`}
            />
          </div>

          <div className="flex items-center gap-3">
            <ZoomOut className="h-4 w-4 shrink-0 text-[#949ba4]" strokeWidth={2} />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              disabled={!img || busy}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="min-w-0 flex-1 accent-[var(--accent)]"
              aria-label="Zoom"
            />
            <ZoomIn className="h-4 w-4 shrink-0 text-[#949ba4]" strokeWidth={2} />
          </div>

          {error && <p className="text-sm text-accent">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-white/[0.06] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-2 text-sm text-[#dbdee1] hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!img || busy}
            onClick={() => void applyCrop()}
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
