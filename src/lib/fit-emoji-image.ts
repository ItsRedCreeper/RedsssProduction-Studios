"use client";

import { fitImageToMaxBytes } from "@/lib/compress-image";
import { isGifUpload } from "@/lib/upload-image-types";

/** Discord-style emoji box used when downscaling oversized uploads. */
const EMOJI_MAX_EDGE = 128;

type GifSicle = {
  run: (opts: {
    input: { file: File | Blob | ArrayBuffer | string; name: string }[];
    command: string[];
  }) => Promise<unknown>;
};

function toGifFile(raw: unknown, fallbackName: string): File | null {
  if (!raw) return null;
  if (raw instanceof File) {
    return raw.type === "image/gif"
      ? raw
      : new File([raw], fallbackName, { type: "image/gif" });
  }
  if (raw instanceof Blob) {
    return new File([raw], fallbackName, { type: "image/gif" });
  }
  if (raw instanceof Uint8Array || ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return new File([new Blob([copy])], fallbackName, { type: "image/gif" });
  }
  if (typeof raw === "object" && raw !== null && "file" in raw) {
    return toGifFile((raw as { file: unknown }).file, fallbackName);
  }
  return null;
}

async function loadGifsicle(): Promise<GifSicle> {
  const mod = (await import("gifsicle-wasm-browser")) as unknown as {
    default?: GifSicle;
  } & GifSicle;
  const gifsicle = mod.default ?? mod;
  if (!gifsicle?.run) {
    throw new Error("GIF compressor failed to load.");
  }
  return gifsicle;
}

async function runGifPass(
  gifsicle: GifSicle,
  file: File,
  edge: number,
  lossy: number,
  colors: number,
): Promise<File | null> {
  const outName = "emoji.gif";
  const result = await gifsicle.run({
    input: [{ file, name: "in.gif" }],
    command: [
      `-O1 --lossy=${lossy} --colors ${colors} --resize-fit ${edge}x${edge} in.gif -o /out/${outName}`,
    ],
  });
  const first = Array.isArray(result) ? result[0] : null;
  return toGifFile(first, outName);
}

/**
 * Shrink an emoji image/GIF to fit under `maxBytes`, preserving animation for GIFs.
 */
export async function fitEmojiImageToMaxBytes(
  file: File,
  maxBytes: number,
): Promise<{ file: File; compressed: boolean; error: string | null }> {
  if (!isGifUpload(file)) {
    if (file.size <= maxBytes) {
      return { file, compressed: false, error: null };
    }
    return fitImageToMaxBytes(file, maxBytes, { maxEdge: EMOJI_MAX_EDGE });
  }

  if (file.size <= maxBytes) {
    return { file, compressed: false, error: null };
  }

  let gifsicle: GifSicle;
  try {
    gifsicle = await loadGifsicle();
  } catch {
    return {
      file,
      compressed: false,
      error: "Could not load GIF compressor. Try a smaller GIF.",
    };
  }

  const passes: { edge: number; lossy: number; colors: number }[] = [
    { edge: 128, lossy: 40, colors: 256 },
    { edge: 128, lossy: 70, colors: 128 },
    { edge: 96, lossy: 80, colors: 128 },
    { edge: 72, lossy: 100, colors: 64 },
    { edge: 64, lossy: 120, colors: 64 },
    { edge: 48, lossy: 140, colors: 48 },
  ];

  let best: File | null = null;

  for (const pass of passes) {
    try {
      const next = await runGifPass(
        gifsicle,
        file,
        pass.edge,
        pass.lossy,
        pass.colors,
      );
      if (!next) continue;
      if (!best || next.size < best.size) best = next;
      if (next.size <= maxBytes) {
        return { file: next, compressed: true, error: null };
      }
    } catch {
      // Try a more aggressive pass.
    }
  }

  return {
    file: best ?? file,
    compressed: !!best,
    error: best
      ? "That GIF is still too large after shrinking. Try fewer frames or a simpler animation."
      : "Could not shrink that GIF. Try a smaller file.",
  };
}
