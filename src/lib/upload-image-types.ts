/**
 * Discord-aligned upload MIME rules (no Nitro / no Server Boost).
 *
 * GIF allowed: custom emojis, chat attachments / Tenor GIFs.
 * GIF not allowed (Nitro/Boost perks on Discord): profile avatar, profile
 * banner, server icon — and custom stickers use PNG/APNG, not GIF.
 */

/** Custom emoji upload cap (above Discord’s 256 KB so animated GIFs can be larger). */
export const SERVER_EMOJI_MAX_BYTES = 2 * 1024 * 1024;
export const SERVER_EMOJI_MAX_LABEL = "2 MB";

export const STATIC_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

export const EMOJI_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp";

/** Discord custom stickers: PNG / APNG (APNG is still image/png). */
export const STICKER_IMAGE_ACCEPT = "image/png,image/webp";

const STATIC_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const EMOJI_TYPES = new Set([
  ...STATIC_TYPES,
  "image/gif",
]);

const STICKER_TYPES = new Set(["image/png", "image/webp"]);

export function isGifUpload(file: File) {
  return file.type === "image/gif" || /\.gif$/i.test(file.name);
}

export function isAllowedStaticImage(file: File) {
  if (isGifUpload(file)) return false;
  if (file.type && STATIC_TYPES.has(file.type)) return true;
  // Some browsers leave type empty — allow by extension except .gif.
  if (!file.type) {
    return /\.(png|jpe?g|webp)$/i.test(file.name);
  }
  return false;
}

export function isAllowedEmojiImage(file: File) {
  if (file.type && EMOJI_TYPES.has(file.type)) return true;
  if (!file.type) {
    return /\.(png|jpe?g|gif|webp)$/i.test(file.name);
  }
  return false;
}

export function isAllowedStickerImage(file: File) {
  if (isGifUpload(file)) return false;
  if (file.type && STICKER_TYPES.has(file.type)) return true;
  if (!file.type) {
    return /\.(png|webp)$/i.test(file.name);
  }
  return false;
}

export const STATIC_IMAGE_HINT = "PNG, JPG, or WebP";
export const GIF_NOT_ALLOWED_HERE =
  "GIFs aren't allowed here. Use PNG, JPG, or WebP.";
export const STICKER_IMAGE_HINT = "PNG or WebP";
