/**
 * Site reward tags (not server roles / permissions).
 *
 * Values stored on `profiles.profile_tags`:
 *   - pioneer — funded before official release
 *   - funder  — funded the site
 *
 * Display order is always Pioneer, then Funder.
 *
 * To grant or revoke later (SQL):
 *   UPDATE profiles SET profile_tags = ARRAY['pioneer','funder'] WHERE username = '...';
 *   UPDATE profiles SET profile_tags = '{}' WHERE username = '...';
 *
 * Or from the client (service/admin path):
 *   await setProfileTagsByUsername('ItsRed Creeper', ['pioneer', 'funder']);
 */

import { createClient } from "@/lib/supabase/client";

export const PROFILE_TAG_PIONEER = "pioneer" as const;
export const PROFILE_TAG_FUNDER = "funder" as const;

export type ProfileTagId =
  | typeof PROFILE_TAG_PIONEER
  | typeof PROFILE_TAG_FUNDER;

export type ProfileTagMeta = {
  id: ProfileTagId;
  label: string;
  tip: string;
  /** Tailwind classes for the pill. */
  className: string;
};

const TAG_ORDER: ProfileTagId[] = [PROFILE_TAG_PIONEER, PROFILE_TAG_FUNDER];

export const PROFILE_TAG_META: Record<ProfileTagId, ProfileTagMeta> = {
  pioneer: {
    id: PROFILE_TAG_PIONEER,
    label: "Pioneer",
    tip: "Funded before official release",
    className:
      "bg-accent/20 text-[#fca5a5] ring-1 ring-accent/30",
  },
  funder: {
    id: PROFILE_TAG_FUNDER,
    label: "Funder",
    tip: "Funded RedsssProduction Studios",
    className:
      "bg-[#f0b232]/20 text-[#3d2e0a] ring-1 ring-[#f0b232]/35",
  },
};

/** Normalize raw DB / JSON values into ordered unique known tags. */
export function normalizeProfileTags(raw: unknown): ProfileTagId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ProfileTagId>();
  for (const item of raw) {
    if (item === PROFILE_TAG_PIONEER || item === PROFILE_TAG_FUNDER) {
      seen.add(item);
    }
  }
  return TAG_ORDER.filter((id) => seen.has(id));
}

export function profileTagsMeta(raw: unknown): ProfileTagMeta[] {
  return normalizeProfileTags(raw).map((id) => PROFILE_TAG_META[id]);
}

/**
 * Admin/ops helper — set tags for a username.
 * Requires an authenticated client that can UPDATE that profile row.
 */
export async function setProfileTagsByUsername(
  username: string,
  tags: ProfileTagId[],
) {
  const next = normalizeProfileTags(tags);
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ profile_tags: next })
    .eq("username", username);
  return { error: error?.message ?? null };
}
