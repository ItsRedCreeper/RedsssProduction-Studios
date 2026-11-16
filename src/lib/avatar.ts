/** Single-letter fallback when a user has no avatar image. */
export function avatarLetter(name: string) {
  const trimmed = name.trim();
  return (trimmed[0] ?? "?").toUpperCase();
}

/** Stable Discord-like accent from a name (used for voice tile washes). */
const VOICE_TILE_PALETTE = [
  "#e11d48",
  "#5865f2",
  "#57f287",
  "#fee75c",
  "#eb459e",
  "#ed4245",
  "#1abc9c",
  "#e67e22",
  "#9b59b6",
  "#3498db",
] as const;

export function avatarAccentColor(
  name: string,
  preferred?: string | null,
): string {
  const trimmed = preferred?.trim() ?? "";
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return VOICE_TILE_PALETTE[hash % VOICE_TILE_PALETTE.length]!;
}
