export type MessageAttachment = {
  url: string;
  type: string;
  name: string;
  size: number;
  width?: number | null;
  height?: number | null;
  /** Discord-style: blurred until the viewer clicks. */
  spoiler?: boolean;
};

export type EmbeddableUrl = {
  url: string;
  /** True when the URL was wrapped in ||...|| spoilers. */
  spoiler: boolean;
};

export const MAX_ATTACHMENTS_PER_MESSAGE = 8;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const INLINE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

/** Raster images safe to show inline. SVG and exotic image/* go to the file chip. */
export function isImageMime(type: string | null | undefined, url?: string | null) {
  if (type) {
    const normalized = type.split(";")[0]?.trim().toLowerCase() ?? "";
    if (INLINE_IMAGE_TYPES.has(normalized)) return true;
    // Reject svg / bmp / heic / etc. even when labeled image/*
    if (normalized.startsWith("image/")) return false;
  }
  return !!url && /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url);
}

export function isVideoMime(type: string | null | undefined, url?: string | null) {
  if (type?.startsWith("video/")) return true;
  return !!url && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeAttachments(input: unknown): MessageAttachment[] {
  if (!Array.isArray(input)) return [];
  const out: MessageAttachment[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = typeof row.url === "string" ? row.url : "";
    if (!url) continue;
    out.push({
      url,
      type: typeof row.type === "string" ? row.type : "application/octet-stream",
      name: typeof row.name === "string" ? row.name : "file",
      size: typeof row.size === "number" ? row.size : 0,
      width: typeof row.width === "number" ? row.width : null,
      height: typeof row.height === "number" ? row.height : null,
      spoiler: row.spoiler === true,
    });
  }
  return out;
}

/** Prefer JSON attachments; fall back to legacy single attachment fields. */
export function attachmentsFromMessage(message: {
  attachments?: unknown;
  attachment_url?: string | null;
  attachment_type?: string | null;
}): MessageAttachment[] {
  const fromJson = normalizeAttachments(message.attachments);
  if (fromJson.length > 0) return fromJson;
  if (!message.attachment_url) return [];
  return [
    {
      url: message.attachment_url,
      type: message.attachment_type || "application/octet-stream",
      name: "attachment",
      size: 0,
    },
  ];
}

export function measureImage(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    // Still try for gif dimensions via Image().
  }
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

const YT_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:[^#\s]*&)?v=([\w-]{6,})/i,
  /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([\w-]{6,})/i,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([\w-]{6,})/i,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([\w-]{6,})/i,
];

export function extractYoutubeId(text: string): string | null {
  for (const pattern of YT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Strip trailing punctuation / spoiler bars from a matched URL. */
export function cleanMatchedUrl(url: string): string {
  return url.replace(/[).,!?;:|]+$/g, "");
}

export function extractUrls(text: string): string[] {
  // Exclude | so ||https://…|| spoilers don't glue bars onto the URL.
  const matches = text.match(/https?:\/\/[^\s<>"'|]+/gi) ?? [];
  return [...new Set(matches.map(cleanMatchedUrl))];
}

/**
 * URLs that should generate a Discord-style link preview.
 * Skips `<https://...>` (no-embed), fenced/inline code.
 * URLs inside `||...||` are marked `spoiler: true` so LinkEmbeds skips them;
 * SpoilerText owns the single reveal that shows the URL + preview together.
 */
export function extractEmbeddableUrlInfos(text: string): EmbeddableUrl[] {
  // Strip fenced + inline code so URLs inside don't unfurl.
  const withoutCode = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ");

  // Collect <url> suppressions.
  const suppressed = new Set(
    [...withoutCode.matchAll(/<(https?:\/\/[^>\s|]+)>/gi)].map((m) =>
      cleanMatchedUrl(m[1]),
    ),
  );

  // Ranges covered by ||spoiler|| blocks (for marking embeds as spoilered).
  const spoilerRanges: Array<{ start: number; end: number }> = [];
  {
    let i = 0;
    while (i < withoutCode.length) {
      const open = withoutCode.indexOf("||", i);
      if (open < 0) break;
      const close = withoutCode.indexOf("||", open + 2);
      if (close < 0) break;
      spoilerRanges.push({ start: open, end: close + 2 });
      i = close + 2;
    }
  }

  function inSpoiler(index: number) {
    return spoilerRanges.some((r) => index >= r.start && index < r.end);
  }

  const found: EmbeddableUrl[] = [];
  const seen = new Set<string>();

  function push(url: string, index: number) {
    const cleaned = cleanMatchedUrl(url);
    if (!cleaned || suppressed.has(cleaned) || seen.has(cleaned)) return;
    // Require a plausible absolute URL so broken spoiler matches don't unfurl.
    try {
      // eslint-disable-next-line no-new
      new URL(cleaned);
    } catch {
      return;
    }
    seen.add(cleaned);
    found.push({ url: cleaned, spoiler: inSpoiler(index) });
  }

  // Bare URLs — stop at | so trailing || spoilers stay off the href.
  for (const match of withoutCode.matchAll(/https?:\/\/[^\s<>"'|]+/gi)) {
    push(match[0], match.index ?? 0);
  }

  // Masked links [label](url) — Discord still unfurls these.
  for (const match of withoutCode.matchAll(
    /\[([^\]]+)\]\((https?:\/\/[^\s)|]+)\)/gi,
  )) {
    push(match[2], match.index ?? 0);
  }

  return found;
}

/** @deprecated Prefer extractEmbeddableUrlInfos when spoiler state matters. */
export function extractEmbeddableUrls(text: string): string[] {
  return extractEmbeddableUrlInfos(text).map((item) => item.url);
}

