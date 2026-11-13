/** Single-letter fallback when a user has no avatar image. */
export function avatarLetter(name: string) {
  const trimmed = name.trim();
  return (trimmed[0] ?? "?").toUpperCase();
}
