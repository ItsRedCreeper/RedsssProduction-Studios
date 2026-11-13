/** First letter of every word in the server name (Discord/Sharkord style). */
export function serverInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export function serverInitialsClass(name: string) {
  const length = serverInitials(name).length;
  if (length <= 2) return "text-sm";
  if (length === 3) return "text-xs";
  return "text-[10px] leading-none";
}
