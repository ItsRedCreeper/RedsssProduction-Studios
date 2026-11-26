"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { ServerEmoji } from "@/lib/emoji";
import { parseCustomEmojiToken } from "@/lib/emoji";
import {
  getCachedEmoji,
  resolveServerEmojiById,
} from "@/lib/emoji-resolve";

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
  const parsed = token ? parseCustomEmojiToken(token) : null;
  const id = emoji?.id ?? parsed?.id ?? null;
  const fromCatalog = id ? catalog?.get(id) : undefined;

  const [fetched, setFetched] = useState<ServerEmoji | null>(() => {
    if (!id) return null;
    const hit = getCachedEmoji(id);
    return hit?.url ? hit : null;
  });
  const [lookupDone, setLookupDone] = useState(() => {
    if (!id) return true;
    if (fromCatalog?.url || emoji?.url) return true;
    return getCachedEmoji(id) !== undefined;
  });

  useEffect(() => {
    if (!id) {
      setLookupDone(true);
      return;
    }
    if (fromCatalog?.url || emoji?.url) {
      setLookupDone(true);
      return;
    }
    const cached = getCachedEmoji(id);
    if (cached?.url) {
      setFetched(cached);
      setLookupDone(true);
      return;
    }
    if (cached === null) {
      setLookupDone(true);
      return;
    }
    let cancelled = false;
    setLookupDone(false);
    void resolveServerEmojiById(id).then((row) => {
      if (cancelled) return;
      if (row?.url) setFetched(row);
      setLookupDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, fromCatalog?.url, emoji?.url]);

  const resolved: Pick<
    ServerEmoji,
    "id" | "name" | "url" | "animated"
  > | null =
    (fromCatalog?.url ? fromCatalog : null) ??
    (emoji?.url ? emoji : null) ??
    (fetched?.url ? fetched : null) ??
    (parsed
      ? {
          id: parsed.id,
          name: parsed.name,
          url: "",
          animated: parsed.animated,
        }
      : emoji ?? null);

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
    // Keep layout while fetching; avoid flashing raw <:name:id> tokens.
    if (!lookupDone) {
      return (
        <span
          className={`inline-block align-middle ${className}`}
          style={{
            width: style?.width ?? size,
            height: style?.height ?? size,
            ...style,
          }}
          title={tip}
          aria-label={`:${resolved.name}:`}
        />
      );
    }
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
