/** Server / channel permission keys (roles.permissions jsonb + channel overrides). */
export const PERMISSIONS = {
  ADMINISTRATOR: "ADMINISTRATOR",
  VIEW_CHANNEL: "VIEW_CHANNEL",
  SEND_MESSAGES: "SEND_MESSAGES",
  MANAGE_MESSAGES: "MANAGE_MESSAGES",
  MANAGE_CHANNELS: "MANAGE_CHANNELS",
  MANAGE_ROLES: "MANAGE_ROLES",
  KICK_MEMBERS: "KICK_MEMBERS",
  BAN_MEMBERS: "BAN_MEMBERS",
  CREATE_INVITES: "CREATE_INVITES",
  CONNECT: "CONNECT",
  SPEAK: "SPEAK",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type PermissionMap = Partial<Record<Permission, boolean>>;

/** Channel overrides: target → permission → allow/deny. Targets: `@everyone`, role id, `user:<uuid>`. */
export type ChannelOverrides = Record<string, PermissionMap>;

const DEFAULT_MEMBER_PERMS: Permission[] = [
  PERMISSIONS.VIEW_CHANNEL,
  PERMISSIONS.SEND_MESSAGES,
  PERMISSIONS.CONNECT,
  PERMISSIONS.SPEAK,
  PERMISSIONS.CREATE_INVITES,
];

function asPermMap(value: unknown): PermissionMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: PermissionMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "boolean") out[key as Permission] = raw;
  }
  return out;
}

export function mergeRolePermissions(rolePermissionList: unknown[]): PermissionMap {
  const merged: PermissionMap = {};
  for (const perms of rolePermissionList) {
    const map = asPermMap(perms);
    if (map.ADMINISTRATOR) {
      for (const key of Object.values(PERMISSIONS)) merged[key] = true;
      return merged;
    }
    for (const [key, value] of Object.entries(map)) {
      if (value) merged[key as Permission] = true;
    }
  }
  for (const key of DEFAULT_MEMBER_PERMS) {
    if (merged[key] === undefined) merged[key] = true;
  }
  return merged;
}

export function resolveChannelPermission(
  base: PermissionMap,
  overrides: unknown,
  opts: {
    isOwner?: boolean;
    roleIds?: string[];
    userId?: string | null;
    permission: Permission;
  },
): boolean {
  if (opts.isOwner || base.ADMINISTRATOR) return true;

  let result = Boolean(base[opts.permission]);
  const map = (overrides && typeof overrides === "object" && !Array.isArray(overrides)
    ? (overrides as ChannelOverrides)
    : {}) as ChannelOverrides;

  const everyone = map["@everyone"]?.[opts.permission];
  if (typeof everyone === "boolean") result = everyone;

  for (const roleId of opts.roleIds ?? []) {
    const value = map[roleId]?.[opts.permission];
    if (typeof value === "boolean") result = value;
  }

  if (opts.userId) {
    const value = map[`user:${opts.userId}`]?.[opts.permission];
    if (typeof value === "boolean") result = value;
  }

  return result;
}

export function can(
  base: PermissionMap,
  permission: Permission,
  opts?: {
    isOwner?: boolean;
    overrides?: unknown;
    roleIds?: string[];
    userId?: string | null;
  },
) {
  if (opts?.overrides) {
    return resolveChannelPermission(base, opts.overrides, {
      isOwner: opts.isOwner,
      roleIds: opts.roleIds,
      userId: opts.userId,
      permission,
    });
  }
  if (opts?.isOwner || base.ADMINISTRATOR) return true;
  return Boolean(base[permission]);
}
