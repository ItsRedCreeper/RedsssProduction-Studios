export type MessageAttachment = {
  url: string;
  type: string;
  name: string;
  size: number;
  width?: number | null;
  height?: number | null;
};

export const MAX_ATTACHMENTS_PER_MESSAGE = 8;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export function isImageMime(type: string | null | undefined, url?: string | null) {
  if (type?.startsWith("image/")) return true;
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

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[).,!?]+$/g, "")))];
}

/**
 * URLs that should generate a Discord-style link preview.
 * Skips `<https://...>` (no-embed), fenced/inline code, and masked-link-only
 * destinations that Discord still embeds — we embed any bare or masked URL
 * that isn't angle-bracket suppressed.
 */
export function extractEmbeddableUrls(text: string): string[] {
  // Strip fenced + inline code so URLs inside don't unfurl.
  const withoutCode = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ");

  // Collect <url> suppressions.
  const suppressed = new Set(
    [...withoutCode.matchAll(/<(https?:\/\/[^>\s]+)>/gi)].map((m) =>
      m[1].replace(/[).,!?]+$/g, ""),
    ),
  );

  const found: string[] = [];

  // Bare URLs
  for (const match of withoutCode.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const url = match[0].replace(/[).,!?]+$/g, "");
    if (!suppressed.has(url)) found.push(url);
  }

  // Masked links [label](url) — Discord still unfurls these.
  for (const match of withoutCode.matchAll(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi,
  )) {
    const url = match[2].replace(/[).,!?]+$/g, "");
    if (!suppressed.has(url)) found.push(url);
  }

  return [...new Set(found)];
}

