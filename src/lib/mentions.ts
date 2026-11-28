/**
 * Discord-style mentions: store IDs in message text, show display names in the UI.
 * Tokens:
 *   <@userId>   user
 *   <@&roleId>  role
 *   <#channelId> channel
 *
 * Plain `@Name` / `#channel` (including spaces) are accepted in the composer and
 * encoded to tokens on send via longest-name matching — same idea as Discord's
 * picker inserting an atomic mention instead of free-typed text.
 */

export type MentionUser = { id: string; username: string };
export type MentionRole = { id: string; name: string };
export type MentionChannel = { id: string; name: string };

export type MentionMaps = {
  usersById: Record<string, MentionUser>;
  rolesById: Record<string, MentionRole>;
  channelsById: Record<string, MentionChannel>;
};

const TOKEN_RE = /<@&([0-9a-f-]{36})>|<@([0-9a-f-]{36})>|<\#([0-9a-f-]{36})>/gi;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convert plain @names / #channels in composer text into Discord-like ID tokens. */
export function encodeMentions(
  content: string,
  opts: {
    users: MentionUser[];
    roles: MentionRole[];
    channels: MentionChannel[];
  },
): string {
  let next = content;

  const channels = [...opts.channels].sort((a, b) => b.name.length - a.name.length);
  for (const channel of channels) {
    if (!channel.name) continue;
    const re = new RegExp(`#${escapeRegExp(channel.name)}(?=$|[\\s.,!?;:])`, "gi");
    next = next.replace(re, `<#${channel.id}>`);
  }

  const roles = [...opts.roles].sort((a, b) => b.name.length - a.name.length);
  for (const role of roles) {
    if (!role.name) continue;
    const re = new RegExp(`@${escapeRegExp(role.name)}(?=$|[\\s.,!?;:])`, "gi");
    next = next.replace(re, `<@&${role.id}>`);
  }

  const users = [...opts.users].sort((a, b) => b.username.length - a.username.length);
  for (const user of users) {
    if (!user.username) continue;
    const re = new RegExp(`@${escapeRegExp(user.username)}(?=$|[\\s.,!?;:])`, "gi");
    next = next.replace(re, `<@${user.id}>`);
  }

  return next;
}

export function extractMentionUserIds(content: string): string[] {
  const ids = new Set<string>();
  const re = /<@(?!&)([0-9a-f-]{36})>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) ids.add(match[1]);
  return [...ids];
}

export function extractMentionRoleIds(content: string): string[] {
  const ids = new Set<string>();
  const re = /<@&([0-9a-f-]{36})>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) ids.add(match[1]);
  return [...ids];
}

/** Strip @everyone / @here and role mention tokens when the author lacks permission. */
export function stripUnauthorizedEveryoneMentions(content: string): string {
  return content
    .replace(/<@&[0-9a-f-]{36}>/gi, "")
    .replace(/(^|[\s])@(everyone|here)\b/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function contentHasMentionSignal(content: string): boolean {
  return (
    /<@[0-9a-f-]{36}>/i.test(content) ||
    /<@&[0-9a-f-]{36}>/i.test(content) ||
    /(^|[\s])@(everyone|here)\b/i.test(content) ||
    content.includes("@")
  );
}

/** Turn stored `<@id>` / `<@&id>` / `<#id>` tokens into readable @Name / #channel text. */
export function displayMentionText(content: string, maps?: MentionMaps | null): string {
  if (!content) return content;
  return content.replace(TOKEN_RE, (_match, roleId: string, userId: string, channelId: string) => {
    if (roleId) return `@${maps?.rolesById[roleId]?.name ?? "unknown-role"}`;
    if (userId) return `@${maps?.usersById[userId]?.username ?? "Unknown user"}`;
    if (channelId) return `#${maps?.channelsById[channelId]?.name ?? "unknown-channel"}`;
    return _match;
  });
}

export { TOKEN_RE as MENTION_TOKEN_RE };
