/** Discord-style solid banner presets when no banner image is set. */
export const BANNER_COLOR_PRESETS = [
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
  "#2c2f33",
  "#23272a",
] as const;

export const DEFAULT_BANNER_COLOR = "#e11d48";

export function normalizeBannerColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

export function resolveBannerColor(value: string | null | undefined): string {
  return normalizeBannerColor(value) ?? DEFAULT_BANNER_COLOR;
}
