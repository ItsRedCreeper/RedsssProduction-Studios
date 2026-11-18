/** Matches Supabase bucket file_size_limit values. */
export const PROFILE_ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const MESSAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

const MIN_QUALITY = 0.48;
const QUALITY_STEP = 0.06;
const SCALE_STEP = 0.85;
const MIN_EDGE = 320;

type FitOptions = {
  /** Longest side cap before quality passes (avatar/banner/chat). */
  maxEdge?: number;
};

function isRasterImage(file: File) {
  return /^image\/(jpeg|jpg|png|webp|gif|bmp|avif)$/i.test(file.type);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function drawScaled(
  source: HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process that image.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function extensionFor(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  return "webp";
}

function renameFile(original: File, mime: string) {
  const base = original.name.replace(/\.[^.]+$/, "") || "image";
  return `${base}.${extensionFor(mime)}`;
}

/**
 * If an image is over `maxBytes`, downscale / re-encode to the highest quality
 * that still fits. Non-images are returned unchanged (or rejected if too large).
 */
export async function fitImageToMaxBytes(
  file: File,
  maxBytes: number,
  options: FitOptions = {},
): Promise<{ file: File; compressed: boolean; error: string | null }> {
  if (!isRasterImage(file)) {
    if (file.size > maxBytes) {
      return { file, compressed: false, error: "File is too large." };
    }
    return { file, compressed: false, error: null };
  }

  if (file.size <= maxBytes) {
    return { file, compressed: false, error: null };
  }

  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    return { file, compressed: false, error: "Could not read that image." };
  }

  const maxEdge = options.maxEdge ?? 4096;
  const mime = "image/webp";
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;

  if (width <= 0 || height <= 0) {
    return { file, compressed: false, error: "Could not read that image." };
  }

  const longest = Math.max(width, height);
  if (longest > maxEdge) {
    const scale = maxEdge / longest;
    width *= scale;
    height *= scale;
  }

  let bestUnder: Blob | null = null;

  for (let pass = 0; pass < 18; pass += 1) {
    const canvas = drawScaled(image, width, height);

    for (let quality = 0.92; quality >= MIN_QUALITY; quality -= QUALITY_STEP) {
      const blob = await canvasToBlob(canvas, mime, quality);
      if (!blob) continue;
      if (blob.size <= maxBytes) {
        bestUnder = blob;
        break;
      }
    }

    if (bestUnder) break;

    const nextLongest = Math.max(width, height) * SCALE_STEP;
    if (nextLongest < MIN_EDGE) break;
    width *= SCALE_STEP;
    height *= SCALE_STEP;
  }

  if (!bestUnder) {
    return {
      file,
      compressed: false,
      error: "Image is still too large after compressing.",
    };
  }

  const fitted = new File([bestUnder], renameFile(file, mime), {
    type: mime,
    lastModified: Date.now(),
  });

  return { file: fitted, compressed: true, error: null };
}
