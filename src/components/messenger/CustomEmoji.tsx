"use client";

import type { ServerEmoji } from "@/lib/emoji";
import { parseCustomEmojiToken } from "@/lib/emoji";

type CustomEmojiProps = {
  token?: string;
  emoji?: Pick<ServerEmoji, "id" | "name" | "url" | "animated">;
  catalog?: Map<string, ServerEmoji>;
  size?: number;
  className?: string;
  title?: string;
};

export function CustomEmoji({
  token,
  emoji,
  catalog,
  size = 20,
  className = "",
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
    return <span className={className}>{token}</span>;
  }

  if (!resolved.url) {
    return (
      <span className={`text-[#949ba4] ${className}`} title={title ?? `:${resolved.name}:`}>
        :{resolved.name}:
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved.url}
      alt={`:${resolved.name}:`}
      title={title ?? `:${resolved.name}:`}
      width={size}
      height={size}
      className={`inline-block align-middle object-contain ${className}`}
      style={{ width: size, height: size }}
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
