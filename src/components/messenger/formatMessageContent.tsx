"use client";

import type { ReactNode } from "react";

const TOKEN =
  /(@[A-Za-z0-9_.-]+|#[A-Za-z0-9_-]+|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?:\/\/[^\s<]+)/g;

type FormatOpts = {
  currentUsername?: string | null;
  roleNames?: string[];
  channelNames?: string[];
};

export function formatMessageContent(content: string, opts: FormatOpts = {}): ReactNode[] {
  const roleSet = new Set((opts.roleNames ?? []).map((n) => n.toLowerCase()));
  const channelSet = new Set((opts.channelNames ?? []).map((n) => n.toLowerCase()));
  const self = opts.currentUsername?.toLowerCase() ?? "";

  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(TOKEN.source, "g");
  while ((match = re.exec(content)) !== null) {
    if (match.index > last) {
      parts.push(content.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith("@")) {
      const name = token.slice(1);
      const isSelf = name.toLowerCase() === self;
      const isRole = roleSet.has(name.toLowerCase());
      parts.push(
        <span
          key={`${match.index}-at`}
          className={`rounded px-0.5 font-medium ${
            isSelf || isRole
              ? "bg-accent/25 text-accent"
              : "bg-white/10 text-[#dee0e3]"
          }`}
        >
          {token}
        </span>,
      );
    } else if (token.startsWith("#")) {
      const name = token.slice(1);
      const known = channelSet.size === 0 || channelSet.has(name.toLowerCase());
      parts.push(
        <span
          key={`${match.index}-hash`}
          className={`rounded px-0.5 font-medium ${
            known ? "bg-accent/20 text-accent" : "text-[#dee0e3]"
          }`}
        >
          {token}
        </span>,
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={`${match.index}-b`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={`${match.index}-i`} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={`${match.index}-c`}
          className="rounded bg-black/40 px-1 py-0.5 font-mono text-[0.85em] text-[#f2f3f5]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("http")) {
      parts.push(
        <a
          key={`${match.index}-a`}
          href={token}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline-offset-2 hover:underline"
        >
          {token}
        </a>,
      );
    } else {
      parts.push(token);
    }
    last = match.index + token.length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return parts;
}
