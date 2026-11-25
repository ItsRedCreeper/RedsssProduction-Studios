import type { Role } from "@/components/messenger/types";

/** Stock default role color — treated as “no color” for username tinting. */
export const NEUTRAL_ROLE_COLOR = "#99aab5";

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

/** Highest role position, or -1 when the member has no roles. */
export function highestRolePosition(
  roles: Role[],
  roleIds: string[],
): number {
  return highestRole(roles, roleIds)?.position ?? -1;
}

/**
 * Discord hierarchy: you can only kick/moderate members whose highest role
 * sits below yours. Owners bypass this.
 */
export function canModerateMember(
  roles: Role[],
  actorRoleIds: string[],
  targetRoleIds: string[],
  opts?: { isOwner?: boolean },
): boolean {
  if (opts?.isOwner) return true;
  return (
    highestRolePosition(roles, actorRoleIds) >
    highestRolePosition(roles, targetRoleIds)
  );
}

/**
 * Discord Manage Roles: only edit roles strictly below your highest role.
 * Owners can edit any non-default constraints separately.
 */
export function canManageRoleTarget(
  roles: Role[],
  actorRoleIds: string[],
  target: Role,
  opts?: { isOwner?: boolean },
): boolean {
  if (opts?.isOwner) return true;
  return highestRolePosition(roles, actorRoleIds) > target.position;
}

/** True when the role has a custom (non-stock) color. */
export function hasCustomRoleColor(role: Pick<Role, "color">): boolean {
  const color = role.color?.trim();
  if (!color) return false;
  const normalized = normalizeHex(color);
  if (!normalized) return true;
  return normalized.toLowerCase() !== NEUTRAL_ROLE_COLOR;
}

/**
 * Color for usernames: highest role (by position) with a custom color.
 * Includes the default Member role when its color was customized.
 * Stock `#99aab5` / empty → null (use default username color).
 */
export function roleColorForMember(
  roles: Role[],
  roleIds: string[],
): string | null {
  for (const role of rolesForMember(roles, roleIds)) {
    if (!hasCustomRoleColor(role)) continue;
    // Use the exact role color — do not mix toward white.
    return normalizeHex(role.color.trim()) ?? role.color.trim();
  }
  return null;
}

/**
 * Role used for member-list grouping: highest role by position.
 * Every role counts the same (including the default Member role).
 * If the member has no role ids, fall back to the server default role.
 */
export function memberListGroupRole(
  roles: Role[],
  roleIds: string[],
): Role | null {
  const highest = highestRole(roles, roleIds);
  if (highest) return highest;
  return roles.find((role) => role.is_default) ?? null;
}

/**
 * Roles to show as pills on profiles (highest first).
 * Like Discord: hide the default Member / @everyone pill when the person has
 * any other role — they still *have* Member for permissions, it just isn't
 * shown as a badge. If they only have Member, show it when its color was
 * customized so recoloring Member is visible.
 */
export function displayRolesForMember(
  roles: Role[],
  roleIds: string[],
): Role[] {
  const owned = rolesForMember(roles, roleIds);
  const custom = owned.filter((role) => !role.is_default);
  if (custom.length > 0) return custom;
  return owned.filter((role) => hasCustomRoleColor(role));
}

/** Normalize a role hex for display — exact chosen color, no lightening. */
export function ensureReadableRoleColor(hex: string): string {
  return normalizeHex(hex) ?? hex.trim();
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
