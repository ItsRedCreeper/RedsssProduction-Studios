/** Server / channel permission keys (roles.permissions jsonb + channel overrides). */
export const PERMISSIONS = {
  ADMINISTRATOR: "ADMINISTRATOR",
  MANAGE_SERVER: "MANAGE_SERVER",
  VIEW_CHANNEL: "VIEW_CHANNEL",
  SEND_MESSAGES: "SEND_MESSAGES",
  MANAGE_MESSAGES: "MANAGE_MESSAGES",
  MANAGE_CHANNELS: "MANAGE_CHANNELS",
  MANAGE_ROLES: "MANAGE_ROLES",
  MANAGE_EMOJIS: "MANAGE_EMOJIS",
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

/** Discord @everyone override key (our default Member role). */
export const EVERYONE_OVERRIDE_KEY = "@everyone";

export function asChannelOverrides(value: unknown): ChannelOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ChannelOverrides = {};
  for (const [target, raw] of Object.entries(value as Record<string, unknown>)) {
    const map = asPermMap(raw);
    if (Object.keys(map).length > 0) out[target] = map;
  }
  return out;
}

/** Discord “Private Channel”: @everyone cannot View Channel. */
export function isPrivateChannel(overrides: unknown): boolean {
  return asChannelOverrides(overrides)[EVERYONE_OVERRIDE_KEY]?.VIEW_CHANNEL === false;
}

export function setChannelPrivate(
  overrides: unknown,
  privateChannel: boolean,
): ChannelOverrides {
  const next = asChannelOverrides(overrides);
  const everyone = { ...(next[EVERYONE_OVERRIDE_KEY] ?? {}) };
  if (privateChannel) {
    everyone.VIEW_CHANNEL = false;
    next[EVERYONE_OVERRIDE_KEY] = everyone;
  } else if (EVERYONE_OVERRIDE_KEY in next) {
    delete everyone.VIEW_CHANNEL;
    if (Object.keys(everyone).length === 0) delete next[EVERYONE_OVERRIDE_KEY];
    else next[EVERYONE_OVERRIDE_KEY] = everyone;
  }
  return next;
}

export function setRoleChannelView(
  overrides: unknown,
  roleId: string,
  canView: boolean,
): ChannelOverrides {
  const next = asChannelOverrides(overrides);
  const role = { ...(next[roleId] ?? {}) };
  if (canView) {
    role.VIEW_CHANNEL = true;
    next[roleId] = role;
  } else {
    delete role.VIEW_CHANNEL;
    if (Object.keys(role).length === 0) delete next[roleId];
    else next[roleId] = role;
  }
  return next;
}

export function roleCanViewChannel(
  overrides: unknown,
  roleId: string,
): boolean {
  return asChannelOverrides(overrides)[roleId]?.VIEW_CHANNEL === true;
}

/** Safe baseline for the default Member role (no management powers). */
export const DEFAULT_MEMBER_PERMISSIONS: PermissionMap = {
  [PERMISSIONS.VIEW_CHANNEL]: true,
  [PERMISSIONS.SEND_MESSAGES]: true,
  [PERMISSIONS.CONNECT]: true,
  [PERMISSIONS.SPEAK]: true,
  [PERMISSIONS.CREATE_INVITES]: true,
};

const DEFAULT_MEMBER_PERMS = Object.keys(
  DEFAULT_MEMBER_PERMISSIONS,
) as Permission[];

function asPermMap(value: unknown): PermissionMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: PermissionMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "boolean") out[key as Permission] = raw;
  }
  return out;
}

/**
 * Merge role permission maps (OR). Administrator grants everything.
 * When the member has no roles yet (legacy), fill safe Member defaults.
 * Once roles are assigned, permissions come only from those roles.
 */
export function mergeRolePermissions(rolePermissionList: unknown[]): PermissionMap {
  const merged: PermissionMap = {};
  let sawRole = false;
  for (const perms of rolePermissionList) {
    sawRole = true;
    const map = asPermMap(perms);
    if (map.ADMINISTRATOR) {
      for (const key of Object.values(PERMISSIONS)) merged[key] = true;
      return merged;
    }
    for (const [key, value] of Object.entries(map)) {
      if (value) merged[key as Permission] = true;
    }
  }
  if (!sawRole) {
    for (const key of DEFAULT_MEMBER_PERMS) merged[key] = true;
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

/** Show Server Settings entry when the user can manage anything inside it. */
export function canAccessServerSettings(
  base: PermissionMap,
  opts?: { isOwner?: boolean },
) {
  if (opts?.isOwner || base.ADMINISTRATOR) return true;
  return Boolean(
    base.MANAGE_SERVER ||
      base.MANAGE_CHANNELS ||
      base.MANAGE_ROLES ||
      base.MANAGE_EMOJIS ||
      base.KICK_MEMBERS ||
      base.BAN_MEMBERS,
  );
}
