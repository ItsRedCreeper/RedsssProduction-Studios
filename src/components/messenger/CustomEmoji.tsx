"use client";

import type { CSSProperties } from "react";
import type { ServerEmoji } from "@/lib/emoji";
import { parseCustomEmojiToken } from "@/lib/emoji";

type CustomEmojiProps = {
  token?: string;
  emoji?: Pick<ServerEmoji, "id" | "name" | "url" | "animated">;
  catalog?: Map<string, ServerEmoji>;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

export function CustomEmoji({
  token,
  emoji,
  catalog,
  size = 20,
  className = "",
  style,
  title,
}: CustomEmojiProps) {
  let resolved = emoji ?? null;
  if (!resolved && token) {
    const parsed = parseCustomEmojiToken(token);
    if (parsed) {
      const fromCatalog = catalog?.get(parsed.id);
      resolved = fromCatalog
        ? fromCatalog
        : {
            id: parsed.id,
            name: parsed.name,
            url: "",
            animated: parsed.animated,
          };
    }
  }

  if (!resolved) {
    return (
      <span className={className} style={style}>
        {token}
      </span>
    );
  }

  const tip =
    title === undefined ? `:${resolved.name}:` : title || undefined;

  if (!resolved.url) {
    return (
      <span
        className={`text-[var(--ms-text-muted)] ${className}`}
        style={style}
        title={tip}
      >
        :{resolved.name}:
      </span>
    );
  }

  // If className/style already sets width/height (composer chip), don't fight it.
  const sizedByClass = /\b(?:h-|w-|size-)/.test(className);
  const sizedByStyle = style?.width != null || style?.height != null;
  const sizedExternally = sizedByClass || sizedByStyle;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved.url}
      alt={`:${resolved.name}:`}
      title={tip}
      width={sizedExternally ? undefined : size}
      height={sizedExternally ? undefined : size}
      className={`inline-block align-middle object-contain ${className}`}
      style={
        sizedExternally
          ? style
          : { width: size, height: size, ...style }
      }
      draggable={false}
    />
  );
}

export function ReactionEmoji({
  token,
  catalog,
  size = 16,
}: {
  token: string;
  catalog?: Map<string, ServerEmoji>;
  size?: number;
}) {
  if (parseCustomEmojiToken(token)) {
    return <CustomEmoji token={token} catalog={catalog} size={size} />;
  }
  return (
    <span className="inline-block leading-none" style={{ fontSize: size }}>
      {token}
    </span>
  );
}
