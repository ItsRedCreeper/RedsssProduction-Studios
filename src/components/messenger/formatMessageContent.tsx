"use client";

import type { ReactNode } from "react";
import { MessageEmoji } from "@/components/messenger/EmojiInfo";
import { SpoilerText } from "@/components/messenger/SpoilerText";
import {
  findEmojiByName,
  isEmojiOnlyMessage,
  MESSAGE_EMOJI_INLINE_PX,
  MESSAGE_EMOJI_JUMBO_PX,
  type ServerEmoji,
} from "@/lib/emoji";
import { extractEmbeddableUrlInfos } from "@/lib/message-media";
import type { MentionMaps } from "@/lib/mentions";

type FormatOpts = {
  currentUserId?: string | null;
  currentUsername?: string | null;
  roleNames?: string[];
  channelNames?: string[];
  mentionMaps?: MentionMaps;
  emojiCatalog?: Map<string, ServerEmoji>;
  customEmojis?: ServerEmoji[];
  preferredServerId?: string | null;
  serverNamesById?: Record<string, string>;
};

type NamedPattern = {
  re: RegExp;
  kind: "user" | "role" | "channel";
  id?: string;
  label: string;
};

/**
 * Discord Markdown Text 101 — bold/italic/underline/strike/spoilers/code,
 * headers, subtext, quotes, lists, masked links — plus mentions & emojis.
 * @see https://support.discord.com/hc/en-us/articles/210298617
 */
export function formatMessageContent(
  content: string,
  opts: FormatOpts = {},
): ReactNode[] {
  const key = { n: 0 };
  const nextKey = () => key.n++;
  const emojiSize = isEmojiOnlyMessage(content)
    ? MESSAGE_EMOJI_JUMBO_PX
    : MESSAGE_EMOJI_INLINE_PX;
  const namedPatterns = buildNamedPatterns(opts);

  // Multiline quote (>>> ) consumes the rest of the message.
  const multiQuote = content.match(/^>>> ?([\s\S]*)$/);
  if (multiQuote) {
    return [
      <blockquote
        key={nextKey()}
        className="my-0.5 border-l-4 border-[#4e5058] pl-3 text-[var(--ms-text)]"
      >
        {parseInline(multiQuote[1], opts, namedPatterns, emojiSize, nextKey)}
      </blockquote>,
    ];
  }

  const lines = content.split("\n");
  const parts: ReactNode[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    const isLast = lineIndex === lines.length - 1;

    const header = line.match(/^(#{1,3}) (.+)$/);
    if (header) {
      const level = header[1].length;
      const className =
        level === 1
          ? "text-[1.5rem] font-bold leading-tight text-white"
          : level === 2
            ? "text-[1.25rem] font-bold leading-tight text-white"
            : "text-[1.05rem] font-bold leading-tight text-white";
      parts.push(
        <div key={nextKey()} className={className}>
          {parseInline(header[2], opts, namedPatterns, emojiSize, nextKey)}
        </div>,
      );
      if (!isLast) parts.push("\n");
      continue;
    }

    const subtext = line.match(/^-# (.+)$/);
    if (subtext) {
      parts.push(
        <div key={nextKey()} className="text-xs text-[var(--ms-text-muted)]">
          {parseInline(subtext[1], opts, namedPatterns, emojiSize, nextKey)}
        </div>,
      );
      if (!isLast) parts.push("\n");
      continue;
    }

    const quote = line.match(/^> (.+)$/);
    if (quote) {
      parts.push(
        <blockquote
          key={nextKey()}
          className="my-0.5 border-l-4 border-[#4e5058] pl-3 text-[var(--ms-text)]"
        >
          {parseInline(quote[1], opts, namedPatterns, emojiSize, nextKey)}
        </blockquote>,
      );
      if (!isLast) parts.push("\n");
      continue;
    }

    const list = line.match(/^( {0,2})([*-]|\d+\.) (.+)$/);
    if (list) {
      const indent = list[1].length >= 2;
      parts.push(
        <div
          key={nextKey()}
          className={`flex gap-2 ${indent ? "pl-5" : "pl-1"}`}
        >
          <span className="shrink-0 text-[#b5bac1]">
            {/^\d/.test(list[2]) ? list[2] : "•"}
          </span>
          <span className="min-w-0">
            {parseInline(list[3], opts, namedPatterns, emojiSize, nextKey)}
          </span>
        </div>,
      );
      if (!isLast) parts.push("\n");
      continue;
    }

    if (line.length === 0) {
      parts.push(<br key={nextKey()} />);
      continue;
    }

    parts.push(
      ...parseInline(line, opts, namedPatterns, emojiSize, nextKey),
    );
    if (!isLast) parts.push("\n");
  }

  return parts;
}

function buildNamedPatterns(opts: FormatOpts): NamedPattern[] {
  const maps = opts.mentionMaps;
  const users = maps ? Object.values(maps.usersById) : [];
  const roles = maps ? Object.values(maps.rolesById) : [];
  const channels = maps ? Object.values(maps.channelsById) : [];
  const roleNameList =
    roles.length > 0 ? roles.map((r) => r.name) : (opts.roleNames ?? []);
  const channelNameList =
    channels.length > 0
      ? channels.map((c) => c.name)
      : (opts.channelNames ?? []);

  const namedPatterns: NamedPattern[] = [];

  for (const user of [...users].sort(
    (a, b) => b.username.length - a.username.length,
  )) {
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
  for (const channel of [...channels].sort(
    (a, b) => b.name.length - a.name.length,
  )) {
    if (!channel.name) continue;
    namedPatterns.push({
      re: new RegExp(`#${escapeRegExp(channel.name)}(?=$|[\\s.,!?;:])`, "i"),
      kind: "channel",
      id: channel.id,
      label: channel.name,
    });
  }

  if (namedPatterns.length === 0) {
    for (const name of [...roleNameList].sort((a, b) => b.length - a.length)) {
      namedPatterns.push({
        re: new RegExp(`@${escapeRegExp(name)}(?=$|[\\s.,!?;:])`, "i"),
        kind: "role",
        label: name,
      });
    }
    for (const name of [...channelNameList].sort(
      (a, b) => b.length - a.length,
    )) {
      namedPatterns.push({
        re: new RegExp(`#${escapeRegExp(name)}(?=$|[\\s.,!?;:])`, "i"),
        kind: "channel",
        label: name,
      });
    }
  }

  return namedPatterns;
}

function parseInline(
  content: string,
  opts: FormatOpts,
  namedPatterns: NamedPattern[],
  emojiSize: number,
  nextKey: () => number,
): ReactNode[] {
  const parts: ReactNode[] = [];
  const maps = opts.mentionMaps;
  const customList = opts.customEmojis ?? [];
  let i = 0;

  while (i < content.length) {
    const slice = content.slice(i);

    // Fenced code block ```lang?\n...\n```
    if (slice.startsWith("```")) {
      const close = slice.indexOf("```", 3);
      if (close > 3) {
        let body = slice.slice(3, close);
        // Optional language on first line
        const langMatch = body.match(/^([a-zA-Z0-9_+-]+)\n([\s\S]*)$/);
        if (langMatch) body = langMatch[2];
        else if (body.startsWith("\n")) body = body.slice(1);
        if (body.endsWith("\n")) body = body.slice(0, -1);
        parts.push(
          <pre
            key={nextKey()}
            className="my-1 overflow-x-auto rounded-md bg-[var(--ms-border)] p-2 font-mono text-[0.85em] text-[#f2f3f5]"
          >
            <code>{body}</code>
          </pre>,
        );
        i += close + 3;
        continue;
      }
    }

    const customEmoji = slice.match(
      /^<(a?):([a-zA-Z0-9_]{2,32}):([0-9a-f-]{36})>/i,
    );
    if (customEmoji) {
      parts.push(
        <MessageEmoji
          key={nextKey()}
          token={customEmoji[0]}
          catalog={opts.emojiCatalog}
          serverNamesById={opts.serverNamesById}
          size={emojiSize}
          className="mx-0.5"
        />,
      );
      i += customEmoji[0].length;
      continue;
    }

    const shortcode = slice.match(/^:([a-zA-Z0-9_]{2,32}):/);
    if (shortcode) {
      const hit = findEmojiByName(
        shortcode[1],
        customList,
        opts.preferredServerId,
      );
      if (hit) {
        parts.push(
          <MessageEmoji
            key={nextKey()}
            emoji={hit}
            catalog={opts.emojiCatalog}
            serverNamesById={opts.serverNamesById}
            size={emojiSize}
            className="mx-0.5"
          />,
        );
        i += shortcode[0].length;
        continue;
      }
    }

    const idUser = slice.match(/^<@(?!&)([0-9a-f-]{36})>/i);
    if (idUser) {
      const id = idUser[1];
      const user = maps?.usersById[id];
      const label = user?.username ?? "Unknown user";
      parts.push(
        mentionChip(nextKey(), `@${label}`, id === opts.currentUserId, "user"),
      );
      i += idUser[0].length;
      continue;
    }

    const idRole = slice.match(/^<@&([0-9a-f-]{36})>/i);
    if (idRole) {
      const id = idRole[1];
      const role = maps?.rolesById[id];
      parts.push(
        mentionChip(
          nextKey(),
          `@${role?.name ?? "unknown-role"}`,
          true,
          "role",
        ),
      );
      i += idRole[0].length;
      continue;
    }

    const idChannel = slice.match(/^<#([0-9a-f-]{36})>/i);
    if (idChannel) {
      const id = idChannel[1];
      const channel = maps?.channelsById[id];
      parts.push(
        mentionChip(
          nextKey(),
          `#${channel?.name ?? "unknown-channel"}`,
          true,
          "channel",
        ),
      );
      i += idChannel[0].length;
      continue;
    }

    // <https://...> — link without triggering embed preference in Discord.
    const bracketUrl = slice.match(/^<(https?:\/\/[^>\s]+)>/i);
    if (bracketUrl) {
      parts.push(linkNode(nextKey(), bracketUrl[1], bracketUrl[1]));
      i += bracketUrl[0].length;
      continue;
    }

    // Masked link [label](url)
    const masked = slice.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i);
    if (masked) {
      parts.push(linkNode(nextKey(), masked[1], masked[2]));
      i += masked[0].length;
      continue;
    }

    let namedHit: {
      length: number;
      kind: "user" | "role" | "channel";
      label: string;
      id?: string;
    } | null = null;
    for (const pattern of namedPatterns) {
      const m = slice.match(pattern.re);
      if (m && m.index === 0) {
        if (!namedHit || m[0].length > namedHit.length) {
          namedHit = {
            length: m[0].length,
            kind: pattern.kind,
            label: pattern.label,
            id: pattern.id,
          };
        }
      }
    }
    if (namedHit) {
      const isSelf =
        namedHit.kind === "user" &&
        (namedHit.id === opts.currentUserId ||
          namedHit.label.toLowerCase() ===
            (opts.currentUsername ?? "").toLowerCase());
      const prefix = namedHit.kind === "channel" ? "#" : "@";
      parts.push(
        mentionChip(
          nextKey(),
          `${prefix}${namedHit.label}`,
          Boolean(
            isSelf ||
              namedHit.kind === "role" ||
              namedHit.kind === "channel",
          ),
          namedHit.kind,
        ),
      );
      i += namedHit.length;
      continue;
    }

    // Spoilers ||text|| — URLs inside share one reveal with their preview card.
    if (slice.startsWith("||")) {
      const end = slice.indexOf("||", 2);
      if (end > 2) {
        const inner = slice.slice(2, end);
        const urlsInBlock = extractEmbeddableUrlInfos(inner).map(
          (item) => item.url,
        );
        parts.push(
          <SpoilerText key={nextKey()} embedUrls={urlsInBlock}>
            {parseInline(inner, opts, namedPatterns, emojiSize, nextKey)}
          </SpoilerText>,
        );
        i += end + 2;
        continue;
      }
    }

    // Combined underline + bold/italic: __*** __** __* __
    const underlineWrap = matchWrapped(slice, "__");
    if (underlineWrap) {
      parts.push(
        <span key={nextKey()} className="underline">
          {parseInline(
            underlineWrap.inner,
            opts,
            namedPatterns,
            emojiSize,
            nextKey,
          )}
        </span>,
      );
      i += underlineWrap.total;
      continue;
    }

    // Strikethrough ~~text~~
    const strike = matchWrapped(slice, "~~");
    if (strike) {
      parts.push(
        <span key={nextKey()} className="line-through text-[var(--ms-text-muted)]">
          {parseInline(strike.inner, opts, namedPatterns, emojiSize, nextKey)}
        </span>,
      );
      i += strike.total;
      continue;
    }

    // ***bold italic***
    if (slice.startsWith("***")) {
      const end = slice.indexOf("***", 3);
      if (end > 3) {
        parts.push(
          <strong key={nextKey()} className="font-semibold italic text-white">
            {parseInline(
              slice.slice(3, end),
              opts,
              namedPatterns,
              emojiSize,
              nextKey,
            )}
          </strong>,
        );
        i += end + 3;
        continue;
      }
    }

    // **bold**
    if (slice.startsWith("**")) {
      const end = slice.indexOf("**", 2);
      if (end > 2) {
        parts.push(
          <strong key={nextKey()} className="font-semibold text-white">
            {parseInline(
              slice.slice(2, end),
              opts,
              namedPatterns,
              emojiSize,
              nextKey,
            )}
          </strong>,
        );
        i += end + 2;
        continue;
      }
    }

    // *italic* (not **)
    if (slice.startsWith("*") && !slice.startsWith("**")) {
      const end = findClosingSingle(slice, "*", 1);
      if (end > 1) {
        parts.push(
          <em key={nextKey()} className="italic">
            {parseInline(
              slice.slice(1, end),
              opts,
              namedPatterns,
              emojiSize,
              nextKey,
            )}
          </em>,
        );
        i += end + 1;
        continue;
      }
    }

    // _italic_ (single underscore, not __)
    if (slice.startsWith("_") && !slice.startsWith("__")) {
      const end = findClosingSingle(slice, "_", 1);
      if (end > 1) {
        parts.push(
          <em key={nextKey()} className="italic">
            {parseInline(
              slice.slice(1, end),
              opts,
              namedPatterns,
              emojiSize,
              nextKey,
            )}
          </em>,
        );
        i += end + 1;
        continue;
      }
    }

    // Inline `code`
    if (slice.startsWith("`") && !slice.startsWith("```")) {
      const end = slice.indexOf("`", 1);
      if (end > 1) {
        parts.push(
          <code
            key={nextKey()}
            className="rounded bg-black/40 px-1 py-0.5 font-mono text-[0.85em] text-[#f2f3f5]"
          >
            {slice.slice(1, end)}
          </code>,
        );
        i += end + 1;
        continue;
      }
    }

    // Stop at | so spoilers like ||https://…|| don't glue bars into the href.
    const url = slice.match(/^https?:\/\/[^\s<|]+/i);
    if (url) {
      const cleaned = url[0].replace(/[).,!?;:|]+$/g, "");
      parts.push(linkNode(nextKey(), cleaned, cleaned));
      i += cleaned.length;
      continue;
    }

    // Plain text until next special marker.
    let next = i + 1;
    while (next < content.length) {
      const ch = content[next]!;
      if (
        ch === "@" ||
        ch === "#" ||
        ch === "*" ||
        ch === "_" ||
        ch === "`" ||
        ch === "<" ||
        ch === ":" ||
        ch === "|" ||
        ch === "~" ||
        ch === "[" ||
        (ch === "h" && content.slice(next, next + 4).toLowerCase() === "http")
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

function matchWrapped(slice: string, marker: string) {
  if (!slice.startsWith(marker)) return null;
  const end = slice.indexOf(marker, marker.length);
  if (end <= marker.length) return null;
  return {
    inner: slice.slice(marker.length, end),
    total: end + marker.length,
  };
}

function findClosingSingle(slice: string, marker: string, from: number) {
  for (let i = from; i < slice.length; i++) {
    if (slice[i] !== marker) continue;
    // Don't treat ** or __ as single close.
    if (slice[i + 1] === marker) continue;
    if (i > from) return i;
  }
  return -1;
}

function linkNode(key: number, label: string, href: string) {
  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-all text-[var(--ms-link)] hover:underline"
    >
      {label}
    </a>
  );
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
