import type { Role } from "@/components/messenger/types";

/** Higher `position` = higher in the hierarchy (Discord-style). */
export function compareRolePositionDesc(a: Role, b: Role) {
  if (a.position !== b.position) return b.position - a.position;
  return a.name.localeCompare(b.name);
}

export function compareRolePositionAsc(a: Role, b: Role) {
  if (a.position !== b.position) return a.position - b.position;
  return a.name.localeCompare(b.name);
}

export function rolesForMember(roles: Role[], roleIds: string[]): Role[] {
  if (roleIds.length === 0) return [];
  const idSet = new Set(roleIds);
  return roles
    .filter((role) => idSet.has(role.id))
    .sort(compareRolePositionDesc);
}

/** Highest role by position among the member's roles. */
export function highestRole(
  roles: Role[],
  roleIds: string[],
): Role | null {
  const owned = rolesForMember(roles, roleIds);
  return owned[0] ?? null;
}

/**
 * Color for usernames: highest non-default role that has a color.
 * Default/@everyone alone → null (use default username color).
 */
export function roleColorForMember(
  roles: Role[],
  roleIds: string[],
): string | null {
  for (const role of rolesForMember(roles, roleIds)) {
    if (role.is_default) continue;
    const color = role.color?.trim();
    if (color) return ensureReadableRoleColor(color);
  }
  return null;
}

/** Highest hoisted role (for member-list section). Default role never hoists. */
export function highestHoistedRole(
  roles: Role[],
  roleIds: string[],
): Role | null {
  for (const role of rolesForMember(roles, roleIds)) {
    if (role.is_default) continue;
    if (role.hoist) return role;
  }
  return null;
}

/** Roles to show as pills on profiles (highest first; skip default-only). */
export function displayRolesForMember(
  roles: Role[],
  roleIds: string[],
): Role[] {
  const owned = rolesForMember(roles, roleIds);
  const meaningful = owned.filter((role) => !role.is_default);
  return meaningful.length > 0 ? meaningful : [];
}

/** Lift very dark role colors so names stay readable on dark UI. */
export function ensureReadableRoleColor(hex: string): string {
  const parsed = parseHex(hex);
  if (!parsed) return hex;
  const { r, g, b } = parsed;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance >= 0.22) return normalizeHex(hex) ?? hex;
  // Mix toward white until readable.
  const mix = 0.45;
  const nr = Math.round(r + (255 - r) * mix);
  const ng = Math.round(g + (255 - g) * mix);
  const nb = Math.round(b + (255 - b) * mix);
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function normalizeHex(hex: string): string | null {
  const parsed = parseHex(hex);
  if (!parsed) return null;
  return `#${toHex(parsed.r)}${toHex(parsed.g)}${toHex(parsed.b)}`;
}

function toHex(n: number) {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
}
