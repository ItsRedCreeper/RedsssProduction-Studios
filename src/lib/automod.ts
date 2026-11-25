export type AutomodRule = {
  id: string;
  enabled: boolean;
  keywords: string[];
  action: string;
};

/** Returns matching keyword if content should be blocked. */
export function findAutomodHit(
  content: string,
  rules: AutomodRule[],
): string | null {
  const lower = content.toLowerCase();
  for (const rule of rules) {
    if (!rule.enabled || rule.action !== "block") continue;
    for (const raw of rule.keywords) {
      const keyword = raw.trim().toLowerCase();
      if (!keyword) continue;
      if (lower.includes(keyword)) return keyword;
    }
  }
  return null;
}
