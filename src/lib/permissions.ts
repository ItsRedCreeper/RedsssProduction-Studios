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
  TIMEOUT_MEMBERS: "TIMEOUT_MEMBERS",
  CREATE_INVITES: "CREATE_INVITES",
  ADD_REACTIONS: "ADD_REACTIONS",
  ATTACH_FILES: "ATTACH_FILES",
  EMBED_LINKS: "EMBED_LINKS",
  MENTION_EVERYONE: "MENTION_EVERYONE",
  CHANGE_NICKNAME: "CHANGE_NICKNAME",
  MANAGE_NICKNAMES: "MANAGE_NICKNAMES",
  READ_MESSAGE_HISTORY: "READ_MESSAGE_HISTORY",
  CONNECT: "CONNECT",
  SPEAK: "SPEAK",
  MUTE_MEMBERS: "MUTE_MEMBERS",
  DEAFEN_MEMBERS: "DEAFEN_MEMBERS",
  MOVE_MEMBERS: "MOVE_MEMBERS",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type PermissionMap = Partial<Record<Permission, boolean>>;

/**
 * Channel override value: true = Allow, false = Deny, absent/null = Inherit.
 * Targets: `@everyone`, role id, `user:<uuid>`.
 */
export type ChannelOverrides = Record<string, PermissionMap>;

/** Discord @everyone override key (our default Member role). */
export const EVERYONE_OVERRIDE_KEY = "@everyone";

/** Tri-state for Advanced Permissions UI. */
export type OverrideState = "allow" | "deny" | "inherit";

export type PermissionOption = {
  key: Permission;
  label: string;
  description: string;
  group: string;
};

export const CHANNEL_PERMISSION_OPTIONS: PermissionOption[] = [
  {
    key: PERMISSIONS.VIEW_CHANNEL,
    label: "View Channel",
    description: "Lets members see this channel.",
    group: "general",
  },
  {
    key: PERMISSIONS.MANAGE_CHANNELS,
    label: "Manage Channel",
    description: "Lets members change this channel’s settings.",
    group: "general",
  },
  {
    key: PERMISSIONS.MANAGE_ROLES,
    label: "Manage Permissions",
    description: "Lets members change who can access this channel and what they can do here.",
    group: "general",
  },
  {
    key: PERMISSIONS.CREATE_INVITES,
    label: "Create Invite",
    description: "Lets members invite people to this channel.",
    group: "general",
  },
  {
    key: PERMISSIONS.SEND_MESSAGES,
    label: "Send Messages",
    description: "Lets members send messages in this channel.",
    group: "text",
  },
  {
    key: PERMISSIONS.EMBED_LINKS,
    label: "Embed Links",
    description: "Shows previews when members share links.",
    group: "text",
  },
  {
    key: PERMISSIONS.ATTACH_FILES,
    label: "Attach Files",
    description: "Lets members upload files and media.",
    group: "text",
  },
  {
    key: PERMISSIONS.ADD_REACTIONS,
    label: "Add Reactions",
    description: "Lets members add emoji reactions to messages.",
    group: "text",
  },
  {
    key: PERMISSIONS.MENTION_EVERYONE,
    label: "Mention @everyone",
    description: "Lets members notify everyone with @everyone and @here.",
    group: "text",
  },
  {
    key: PERMISSIONS.MANAGE_MESSAGES,
    label: "Manage Messages",
    description: "Lets members delete or pin other people’s messages.",
    group: "text",
  },
  {
    key: PERMISSIONS.READ_MESSAGE_HISTORY,
    label: "Read Message History",
    description: "Lets members read older messages in this channel.",
    group: "text",
  },
  {
    key: PERMISSIONS.CONNECT,
    label: "Join Voice",
    description: "Lets members join this voice channel.",
    group: "voice",
  },
  {
    key: PERMISSIONS.SPEAK,
    label: "Speak",
    description: "Lets members talk in this voice channel.",
    group: "voice",
  },
  {
    key: PERMISSIONS.MUTE_MEMBERS,
    label: "Mute Members",
    description: "Lets members mute others in this voice channel.",
    group: "voice",
  },
  {
    key: PERMISSIONS.DEAFEN_MEMBERS,
    label: "Deafen Members",
    description: "Lets members deafen others in this voice channel.",
    group: "voice",
  },
  {
    key: PERMISSIONS.MOVE_MEMBERS,
    label: "Move Members",
    description: "Lets members move others between voice channels.",
    group: "voice",
  },
];

export const ROLE_PERMISSION_OPTIONS: PermissionOption[] = [
  {
    key: PERMISSIONS.ADMINISTRATOR,
    label: "Administrator",
    description:
      "Gives every permission and ignores channel access rules. Only give this to people you fully trust.",
    group: "General Server Permissions",
  },
  {
    key: PERMISSIONS.VIEW_CHANNEL,
    label: "View Channels",
    description: "Lets members see channels unless a channel is set to private.",
    group: "General Server Permissions",
  },
  {
    key: PERMISSIONS.MANAGE_SERVER,
    label: "Manage Server",
    description:
      "Lets members change the server name, description, icon, and other server settings.",
    group: "General Server Permissions",
  },
  {
    key: PERMISSIONS.MANAGE_ROLES,
    label: "Manage Roles",
    description:
      "Lets members create and edit roles below theirs, and edit channel permissions.",
    group: "General Server Permissions",
  },
  {
    key: PERMISSIONS.MANAGE_CHANNELS,
    label: "Manage Channels",
    description: "Lets members create, edit, or delete channels.",
    group: "General Server Permissions",
  },
  {
    key: PERMISSIONS.MANAGE_EMOJIS,
    label: "Manage Expressions",
    description: "Lets members manage server emojis and stickers.",
    group: "General Server Permissions",
  },
  {
    key: PERMISSIONS.KICK_MEMBERS,
    label: "Kick Members",
    description: "Lets members remove people from this server.",
    group: "Membership Permissions",
  },
  {
    key: PERMISSIONS.BAN_MEMBERS,
    label: "Ban Members",
    description: "Lets members permanently ban people from this server.",
    group: "Membership Permissions",
  },
  {
    key: PERMISSIONS.TIMEOUT_MEMBERS,
    label: "Timeout Members",
    description:
      "Lets members temporarily stop someone from chatting or speaking in voice.",
    group: "Membership Permissions",
  },
  {
    key: PERMISSIONS.CREATE_INVITES,
    label: "Create Invite",
    description: "Lets members invite people to this server.",
    group: "Membership Permissions",
  },
  {
    key: PERMISSIONS.CHANGE_NICKNAME,
    label: "Change Nickname",
    description: "Lets members change their own nickname.",
    group: "Membership Permissions",
  },
  {
    key: PERMISSIONS.MANAGE_NICKNAMES,
    label: "Manage Nicknames",
    description: "Lets members change other members’ nicknames.",
    group: "Membership Permissions",
  },
  {
    key: PERMISSIONS.SEND_MESSAGES,
    label: "Send Messages",
    description: "Lets members send messages in text channels.",
    group: "Text Channel Permissions",
  },
  {
    key: PERMISSIONS.EMBED_LINKS,
    label: "Embed Links",
    description: "Shows previews when members share links.",
    group: "Text Channel Permissions",
  },
  {
    key: PERMISSIONS.ATTACH_FILES,
    label: "Attach Files",
    description: "Lets members upload files and media in messages.",
    group: "Text Channel Permissions",
  },
  {
    key: PERMISSIONS.ADD_REACTIONS,
    label: "Add Reactions",
    description: "Lets members add emoji reactions to messages.",
    group: "Text Channel Permissions",
  },
  {
    key: PERMISSIONS.MENTION_EVERYONE,
    label: "Mention @everyone, @here, and All Roles",
    description:
      "Lets members notify everyone at once. Easy to overuse — grant carefully.",
    group: "Text Channel Permissions",
  },
  {
    key: PERMISSIONS.MANAGE_MESSAGES,
    label: "Manage Messages",
    description: "Lets members delete or pin messages from other people.",
    group: "Text Channel Permissions",
  },
  {
    key: PERMISSIONS.READ_MESSAGE_HISTORY,
    label: "Read Message History",
    description: "Lets members read messages sent before they joined the channel.",
    group: "Text Channel Permissions",
  },
  {
    key: PERMISSIONS.CONNECT,
    label: "Join Voice",
    description: "Lets members join voice channels.",
    group: "Voice Channel Permissions",
  },
  {
    key: PERMISSIONS.SPEAK,
    label: "Speak",
    description: "Lets members talk in voice channels.",
    group: "Voice Channel Permissions",
  },
  {
    key: PERMISSIONS.MUTE_MEMBERS,
    label: "Mute Members",
    description: "Lets members mute others in voice channels.",
    group: "Voice Channel Permissions",
  },
  {
    key: PERMISSIONS.DEAFEN_MEMBERS,
    label: "Deafen Members",
    description: "Lets members deafen others in voice channels.",
    group: "Voice Channel Permissions",
  },
  {
    key: PERMISSIONS.MOVE_MEMBERS,
    label: "Move Members",
    description: "Lets members move others between voice channels.",
    group: "Voice Channel Permissions",
  },
];

export function asChannelOverrides(value: unknown): ChannelOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ChannelOverrides = {};
  for (const [target, raw] of Object.entries(value as Record<string, unknown>)) {
    const map = asPermMap(raw);
    if (Object.keys(map).length > 0) out[target] = map;
  }
  return out;
}

export function getOverrideState(
  overrides: unknown,
  target: string,
  permission: Permission,
): OverrideState {
  const value = asChannelOverrides(overrides)[target]?.[permission];
  if (value === true) return "allow";
  if (value === false) return "deny";
  return "inherit";
}

export function setOverrideState(
  overrides: unknown,
  target: string,
  permission: Permission,
  state: OverrideState,
): ChannelOverrides {
  const next = asChannelOverrides(overrides);
  const map = { ...(next[target] ?? {}) };
  if (state === "inherit") {
    delete map[permission];
  } else {
    map[permission] = state === "allow";
  }
  if (Object.keys(map).length === 0) delete next[target];
  else next[target] = map;
  return next;
}

/** Discord “Private Channel”: @everyone cannot View Channel. */
export function isPrivateChannel(overrides: unknown): boolean {
  return asChannelOverrides(overrides)[EVERYONE_OVERRIDE_KEY]?.VIEW_CHANNEL === false;
}

export function setChannelPrivate(
  overrides: unknown,
  privateChannel: boolean,
): ChannelOverrides {
  return setOverrideState(
    overrides,
    EVERYONE_OVERRIDE_KEY,
    PERMISSIONS.VIEW_CHANNEL,
    privateChannel ? "deny" : "inherit",
  );
}

export function setRoleChannelView(
  overrides: unknown,
  roleId: string,
  canView: boolean,
): ChannelOverrides {
  return setOverrideState(
    overrides,
    roleId,
    PERMISSIONS.VIEW_CHANNEL,
    canView ? "allow" : "inherit",
  );
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
  [PERMISSIONS.EMBED_LINKS]: true,
  [PERMISSIONS.ATTACH_FILES]: true,
  [PERMISSIONS.ADD_REACTIONS]: true,
  [PERMISSIONS.READ_MESSAGE_HISTORY]: true,
  [PERMISSIONS.CONNECT]: true,
  [PERMISSIONS.SPEAK]: true,
  [PERMISSIONS.CREATE_INVITES]: true,
  [PERMISSIONS.CHANGE_NICKNAME]: true,
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
 * Merge role permission maps (OR / additive allows). Administrator grants everything.
 * When the member has no roles yet (legacy), fill safe Member defaults.
 * Once roles are assigned, permissions come only from those roles (incl. default Member).
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

/**
 * Discord channel permission resolution:
 * start from server (role) perms, then
 * 1) @everyone deny  2) @everyone allow
 * 3) any of member's role denies  4) any of member's role allows
 * 5) member deny  6) member allow
 * Owner / Administrator bypass all channel overrides.
 * @see https://support.discord.com/hc/en-us/articles/206141927
 */
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
  const map = asChannelOverrides(overrides);
  const permission = opts.permission;

  const everyone = map[EVERYONE_OVERRIDE_KEY]?.[permission];
  if (everyone === false) result = false;
  if (everyone === true) result = true;

  const roleIds = opts.roleIds ?? [];
  let anyRoleDeny = false;
  let anyRoleAllow = false;
  for (const roleId of roleIds) {
    const value = map[roleId]?.[permission];
    if (value === false) anyRoleDeny = true;
    if (value === true) anyRoleAllow = true;
  }
  if (anyRoleDeny) result = false;
  if (anyRoleAllow) result = true;

  if (opts.userId) {
    const member = map[`user:${opts.userId}`]?.[permission];
    if (member === false) result = false;
    if (member === true) result = true;
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

/**
 * Channels with `permissions_synced` inherit the parent category's override map.
 * Unsynced channels keep their own map (category deny + channel allow works).
 */
export function effectiveChannelOverrides(
  channel: {
    category_id?: string | null;
    permission_overrides?: unknown;
    permissions_synced?: boolean | null;
  },
  categories: { id: string; permission_overrides?: unknown }[],
): unknown {
  if (channel.permissions_synced && channel.category_id) {
    const category = categories.find((item) => item.id === channel.category_id);
    if (category) return category.permission_overrides ?? {};
  }
  return channel.permission_overrides;
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
