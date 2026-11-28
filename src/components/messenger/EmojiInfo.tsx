"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CustomEmoji, ReactionEmoji } from "@/components/messenger/CustomEmoji";
import {
  emojiDisplayName,
  parseCustomEmojiToken,
  UNICODE_EMOJI_GROUPS,
  type ServerEmoji,
} from "@/lib/emoji";
import type { ReactionGroup } from "@/components/messenger/types";

type TipPos = { top: number; left: number };

const EDGE = 8;
const GAP = 10;

function clampTip(
  anchor: DOMRect,
  tipW: number,
  tipH: number,
  preferAbove = true,
): TipPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = preferAbove
    ? anchor.top - GAP - tipH
    : anchor.bottom + GAP;
  if (preferAbove && top < EDGE) top = anchor.bottom + GAP;
  if (!preferAbove && top + tipH > vh - EDGE) top = anchor.top - GAP - tipH;
  top = Math.min(Math.max(top, EDGE), vh - EDGE - tipH);
  let left = anchor.left + anchor.width / 2 - tipW / 2;
  left = Math.min(Math.max(left, EDGE), vw - EDGE - tipW);
  return { top, left };
}

function unicodeName(char: string) {
  for (const group of UNICODE_EMOJI_GROUPS) {
    const hit = group.emojis.find((item) => item.char === char);
    if (hit) return hit.name;
  }
  return null;
}

function PreviewGlyph({
  token,
  catalog,
  size,
}: {
  token: string;
  catalog?: Map<string, ServerEmoji>;
  size: number;
}) {
  if (parseCustomEmojiToken(token)) {
    return <CustomEmoji token={token} catalog={catalog} size={size} />;
  }
  return (
    <span className="leading-none" style={{ fontSize: size }}>
      {token}
    </span>
  );
}

type HoverShellProps = {
  delayMs?: number;
  disabled?: boolean;
  content: ReactNode;
  children: ReactElement;
};

/** Rich Discord-style hover card (portal). */
function EmojiHoverShell({
  delayMs = 60,
  disabled = false,
  content,
  children,
}: HoverShellProps) {
  const tipId = useId();
  const tipRef = useRef<HTMLDivElement | null>(null);
  const anchorRectRef = useRef<DOMRect | null>(null);
  const timerRef = useRef<number | null>(null);
  const [pos, setPos] = useState<TipPos | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    function onScroll() {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setVisible(false);
      setPos(null);
      anchorRectRef.current = null;
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible || !tipRef.current || !anchorRectRef.current) return;
    const tip = tipRef.current;
    const next = clampTip(
      anchorRectRef.current,
      tip.offsetWidth,
      tip.offsetHeight,
      true,
    );
    setPos(next);
  }, [visible, content]);

  function hide() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
    setPos(null);
    anchorRectRef.current = null;
  }

  function show(el: HTMLElement) {
    if (disabled) return;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    anchorRectRef.current = el.getBoundingClientRect();
    timerRef.current = window.setTimeout(() => setVisible(true), delayMs);
  }

  if (!isValidElement(children)) return null;

  const child = cloneElement(children as ReactElement<Record<string, unknown>>, {
    "aria-describedby": visible ? tipId : undefined,
    onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
      const prev = (children as ReactElement<Record<string, unknown>>).props
        .onPointerEnter as
        | ((event: ReactPointerEvent<HTMLElement>) => void)
        | undefined;
      prev?.(event);
      show(event.currentTarget);
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
      const prev = (children as ReactElement<Record<string, unknown>>).props
        .onPointerLeave as
        | ((event: ReactPointerEvent<HTMLElement>) => void)
        | undefined;
      prev?.(event);
      hide();
    },
  });

  const portal =
    visible && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={tipRef}
            id={tipId}
            role="tooltip"
            style={
              pos
                ? { top: pos.top, left: pos.left }
                : { top: -9999, left: -9999, visibility: "hidden" }
            }
            className="pointer-events-none fixed z-[90] w-max max-w-[min(18rem,calc(100vw-1rem))] rounded-lg border border-[var(--ms-border)] bg-[#111214] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
          >
            {content}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {child}
      {portal}
    </>
  );
}

export function ReactionInfoTip({
  reaction,
  catalog,
  reactorNamesById,
  currentUserId,
  children,
}: {
  reaction: ReactionGroup;
  catalog?: Map<string, ServerEmoji>;
  reactorNamesById: Record<string, string>;
  currentUserId?: string | null;
  children: ReactElement;
}) {
  const short = emojiDisplayName(reaction.emoji, catalog).replace(/\s·\s.*$/, "");
  const names = reaction.userIds.map((id) => {
    if (id === currentUserId) return "You";
    return reactorNamesById[id] || "Unknown";
  });
  const shown = names.slice(0, 3);
  const extra = Math.max(0, names.length - shown.length);
  const who =
    shown.length === 0
      ? `${reaction.count} reaction${reaction.count === 1 ? "" : "s"}`
      : extra > 0
        ? `${shown.join(", ")} and ${extra} other${extra === 1 ? "" : "s"}`
        : shown.length === 1
          ? shown[0]
          : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;

  return (
    <EmojiHoverShell
      delayMs={40}
      content={
        <div className="flex flex-col items-center gap-2 text-center">
          <PreviewGlyph token={reaction.emoji} catalog={catalog} size={56} />
          <p className="text-sm font-semibold text-white">{short}</p>
          <p className="text-xs leading-snug text-[#b5bac1]">
            {who} reacted with {short}
          </p>
        </div>
      }
    >
      {children}
    </EmojiHoverShell>
  );
}

type MessageEmojiProps = {
  token?: string;
  emoji?: Pick<ServerEmoji, "id" | "name" | "url" | "animated" | "server_id">;
  catalog?: Map<string, ServerEmoji>;
  serverNamesById?: Record<string, string>;
  size?: number;
  className?: string;
};

/** Inline message emoji with Discord hover preview + click-to-learn-more card. */
export function MessageEmoji({
  token,
  emoji,
  catalog,
  serverNamesById = {},
  size = 22,
  className = "",
}: MessageEmojiProps) {
  const tipId = useId();
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<TipPos | null>(null);

  let resolved: Pick<
    ServerEmoji,
    "id" | "name" | "url" | "animated" | "server_id"
  > | null = emoji
    ? {
        id: emoji.id,
        name: emoji.name,
        url: emoji.url,
        animated: emoji.animated,
        server_id: "server_id" in emoji ? emoji.server_id : "",
      }
    : null;

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
            server_id: "",
          };
    } else {
      // Unicode glyph used as message "emoji" short path — rare in our renderer.
      resolved = null;
    }
  }

  const isCustom = !!resolved;
  const shortName = resolved
    ? `:${resolved.name}:`
    : token
      ? unicodeName(token)
        ? `:${unicodeName(token)}:`
        : token
      : "";
  const serverName =
    resolved?.server_id && serverNamesById[resolved.server_id]
      ? serverNamesById[resolved.server_id]
      : null;

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (btnRef.current?.contains(target) || cardRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current || !cardRef.current) return;
    const next = clampTip(
      btnRef.current.getBoundingClientRect(),
      cardRef.current.offsetWidth,
      cardRef.current.offsetHeight,
      true,
    );
    setPos(next);
  }, [open]);

  const hoverContent = (
    <div className="flex flex-col items-center gap-2 text-center">
      {isCustom && resolved ? (
        <CustomEmoji emoji={resolved} catalog={catalog} size={64} />
      ) : (
        <PreviewGlyph token={token ?? ""} catalog={catalog} size={64} />
      )}
      <p className="text-sm font-semibold text-white">{shortName}</p>
      {serverName && (
        <p className="text-xs text-[#b5bac1]">This emoji is from {serverName}</p>
      )}
      {isCustom && (
        <p className="text-[11px] font-medium text-[var(--ms-text-muted)]">
          Click to learn more
        </p>
      )}
    </div>
  );

  const detailsPortal =
    open && isCustom && resolved && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={cardRef}
            role="dialog"
            aria-label={`Emoji ${shortName}`}
            style={
              pos
                ? { top: pos.top, left: pos.left }
                : { top: -9999, left: -9999, visibility: "hidden" }
            }
            className="fixed z-[95] w-[16.5rem] rounded-xl border border-[var(--ms-border)] bg-[#111214] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.65)]"
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-[var(--ms-border)]">
                <CustomEmoji emoji={resolved} catalog={catalog} size={72} />
              </div>
              <div>
                <p className="text-base font-semibold text-white">{shortName}</p>
                {serverName ? (
                  <p className="mt-1 text-sm text-[#b5bac1]">
                    This emoji is from{" "}
                    <span className="font-medium text-[var(--ms-text)]">{serverName}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-[#b5bac1]">Custom emoji</p>
                )}
                <p className="mt-2 text-xs leading-relaxed text-[var(--ms-text-muted)]">
                  Type{" "}
                  <span className="rounded bg-black/40 px-1 py-0.5 font-mono text-[var(--ms-text)]">
                    {shortName}
                  </span>{" "}
                  in chat to use it. If another server has the same name, this
                  channel&apos;s version is preferred.
                </p>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const button = (
    <button
      ref={btnRef}
      type="button"
      id={tipId}
      onClick={(event) => {
        if (!isCustom) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen((value) => !value);
      }}
      className={`inline-flex align-middle ${
        isCustom ? "cursor-pointer rounded-sm hover:bg-white/5" : "cursor-default"
      } ${className}`}
      aria-label={shortName}
    >
      {isCustom && resolved ? (
        <CustomEmoji
          emoji={resolved}
          catalog={catalog}
          size={size}
          title=""
        />
      ) : (
        <ReactionEmoji token={token ?? ""} catalog={catalog} size={size} />
      )}
    </button>
  );

  return (
    <>
      <EmojiHoverShell delayMs={50} content={hoverContent} disabled={open}>
        {button}
      </EmojiHoverShell>
      {detailsPortal}
    </>
  );
}
