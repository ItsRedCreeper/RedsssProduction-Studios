"use client";

import type { ReactNode } from "react";
import type { MentionMaps } from "@/lib/mentions";

type FormatOpts = {
  currentUserId?: string | null;
  currentUsername?: string | null;
  roleNames?: string[];
  channelNames?: string[];
  mentionMaps?: MentionMaps;
};

/**
 * Tokenize message content. Prefer Discord-style ID mentions; also highlight
 * legacy plain @names / #channels (including spaces) via longest-name match.
 */
export function formatMessageContent(content: string, opts: FormatOpts = {}): ReactNode[] {
  const maps = opts.mentionMaps;
  const users = maps ? Object.values(maps.usersById) : [];
  const roles = maps ? Object.values(maps.rolesById) : [];
  const channels = maps ? Object.values(maps.channelsById) : [];

  const roleNameList =
    roles.length > 0 ? roles.map((r) => r.name) : (opts.roleNames ?? []);
  const channelNameList =
    channels.length > 0 ? channels.map((c) => c.name) : (opts.channelNames ?? []);

  const namedPatterns: { re: RegExp; kind: "user" | "role" | "channel"; id?: string; label: string }[] =
    [];

  for (const user of [...users].sort((a, b) => b.username.length - a.username.length)) {
    if (!user.username) continue;
    namedPatterns.push({
      re: new RegExp(`@${escapeRegExp(user.username)}(?=$|[\\s.,!?;:])`, "i"),
      kind: "user",
      id: user.id,
      label: user.username,
    });
  }
  for (const role of [...roles].sort((a, b) => b.name.length - a.name.length)) {
    if (!role.name) continue;
    namedPatterns.push({
      re: new RegExp(`@${escapeRegExp(role.name)}(?=$|[\\s.,!?;:])`, "i"),
      kind: "role",
      id: role.id,
      label: role.name,
    });
  }
  for (const channel of [...channels].sort((a, b) => b.name.length - a.name.length)) {
    if (!channel.name) continue;
    namedPatterns.push({
      re: new RegExp(`#${escapeRegExp(channel.name)}(?=$|[\\s.,!?;:])`, "i"),
      kind: "channel",
      id: channel.id,
      label: channel.name,
    });
  }

  // Fallback plain names when maps are empty (legacy).
  if (namedPatterns.length === 0) {
    for (const name of [...roleNameList].sort((a, b) => b.length - a.length)) {
      namedPatterns.push({
        re: new RegExp(`@${escapeRegExp(name)}(?=$|[\\s.,!?;:])`, "i"),
        kind: "role",
        label: name,
      });
    }
    for (const name of [...channelNameList].sort((a, b) => b.length - a.length)) {
      namedPatterns.push({
        re: new RegExp(`#${escapeRegExp(name)}(?=$|[\\s.,!?;:])`, "i"),
        kind: "channel",
        label: name,
      });
    }
  }

  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < content.length) {
    const slice = content.slice(i);

    const idUser = slice.match(/^<@(?!&)([0-9a-f-]{36})>/i);
    if (idUser) {
      const id = idUser[1];
      const user = maps?.usersById[id];
      const label = user?.username ?? "Unknown user";
      const isSelf = id === opts.currentUserId;
      parts.push(mentionChip(key++, `@${label}`, isSelf || false, "user"));
      i += idUser[0].length;
      continue;
    }

    const idRole = slice.match(/^<@&([0-9a-f-]{36})>/i);
    if (idRole) {
      const id = idRole[1];
      const role = maps?.rolesById[id];
      const label = role?.name ?? "unknown-role";
      parts.push(mentionChip(key++, `@${label}`, true, "role"));
      i += idRole[0].length;
      continue;
    }

    const idChannel = slice.match(/^<#([0-9a-f-]{36})>/i);
    if (idChannel) {
      const id = idChannel[1];
      const channel = maps?.channelsById[id];
      const label = channel?.name ?? "unknown-channel";
      parts.push(mentionChip(key++, `#${label}`, true, "channel"));
      i += idChannel[0].length;
      continue;
    }

    let namedHit: { length: number; kind: "user" | "role" | "channel"; label: string; id?: string } | null =
      null;
    for (const pattern of namedPatterns) {
      const m = slice.match(pattern.re);
      if (m && m.index === 0) {
        if (!namedHit || m[0].length > namedHit.length) {
          namedHit = { length: m[0].length, kind: pattern.kind, label: pattern.label, id: pattern.id };
        }
      }
    }
    if (namedHit) {
      const isSelf =
        namedHit.kind === "user" &&
        (namedHit.id === opts.currentUserId ||
          namedHit.label.toLowerCase() === (opts.currentUsername ?? "").toLowerCase());
      const prefix = namedHit.kind === "channel" ? "#" : "@";
      parts.push(
        mentionChip(
          key++,
          `${prefix}${namedHit.label}`,
          Boolean(isSelf || namedHit.kind === "role" || namedHit.kind === "channel"),
          namedHit.kind,
        ),
      );
      i += namedHit.length;
      continue;
    }

    if (slice.startsWith("**")) {
      const end = slice.indexOf("**", 2);
      if (end > 2) {
        parts.push(
          <strong key={key++} className="font-semibold text-white">
            {slice.slice(2, end)}
          </strong>,
        );
        i += end + 2;
        continue;
      }
    }

    if (slice.startsWith("*")) {
      const end = slice.indexOf("*", 1);
      if (end > 1) {
        parts.push(
          <em key={key++} className="italic">
            {slice.slice(1, end)}
          </em>,
        );
        i += end + 1;
        continue;
      }
    }

    if (slice.startsWith("`")) {
      const end = slice.indexOf("`", 1);
      if (end > 1) {
        parts.push(
          <code
            key={key++}
            className="rounded bg-black/40 px-1 py-0.5 font-mono text-[0.85em] text-[#f2f3f5]"
          >
            {slice.slice(1, end)}
          </code>,
        );
        i += end + 1;
        continue;
      }
    }

    const url = slice.match(/^https?:\/\/[^\s<]+/);
    if (url) {
      parts.push(
        <a
          key={key++}
          href={url[0]}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline-offset-2 hover:underline"
        >
          {url[0]}
        </a>,
      );
      i += url[0].length;
      continue;
    }

    // Consume plain text until next special marker.
    let next = i + 1;
    while (next < content.length) {
      const ch = content[next];
      if (
        ch === "@" ||
        ch === "#" ||
        ch === "*" ||
        ch === "`" ||
        ch === "<" ||
        (ch === "h" && content.slice(next, next + 4) === "http")
      ) {
        break;
      }
      next += 1;
    }
    parts.push(content.slice(i, next));
    i = next;
  }

  return parts;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionChip(
  key: number,
  text: string,
  highlight: boolean,
  _kind: "user" | "role" | "channel",
) {
  return (
    <span
      key={key}
      className={`rounded px-0.5 font-medium ${
        highlight ? "bg-accent/25 text-accent" : "bg-white/10 text-[#dee0e3]"
      }`}
    >
      {text}
    </span>
  );
}
