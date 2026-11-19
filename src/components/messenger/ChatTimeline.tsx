"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Hash, MessagesSquare } from "lucide-react";
import { MessageItem } from "@/components/messenger/MessageItem";
import type { ServerEmoji } from "@/lib/emoji";
import type { MentionMaps } from "@/lib/mentions";
import type { ChatMessage, ReactionGroup } from "@/components/messenger/types";

type ChatTimelineProps = {
  messages: ChatMessage[];
  loading: boolean;
  emptyTitle: string;
  emptyBody: string;
  emptyIcon: "hash" | "dm";
  /** Changes when switching channel/DM — forces jump to latest. */
  scrollKey?: string;
  currentUserId: string | null;
  currentUsername?: string | null;
  roleNames?: string[];
  channelNames?: string[];
  mentionMaps?: MentionMaps;
  canDeleteOthers?: boolean;
  reactionMap: Record<string, ReactionGroup[]>;
  customEmojis?: ServerEmoji[];
  emojiCatalog?: Map<string, ServerEmoji>;
  serverNamesById?: Record<string, string>;
  preferredServerId?: string | null;
  reactorNamesById?: Record<string, string>;
  /** More history exists above the loaded window. */
  hasMore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  /** Discord: friend nicknames only in DM timelines. */
  preferFriendNickname?: boolean;
  /** Server nicknames for channel message authors. */
  serverNickByUserId?: Record<string, string>;
  readOnly?: boolean;
  /** When false, hide the Discord-style channel/DM start header (e.g. search). */
  showChannelStart?: boolean;
  onReply: (message: ChatMessage) => void;
  onEdit: (messageId: string, content: string) => Promise<boolean>;
  onDelete: (messageId: string) => Promise<void>;
  onJumpToReply: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onTogglePin?: (message: ChatMessage) => void;
};

/** Stay pinned to newest messages while within this of the bottom. */
const NEAR_BOTTOM_PX = 80;
/** Show "Jump to present" after scrolling up roughly ~15 message rows. */
const JUMP_TO_PRESENT_PX = 900;

function distanceFromBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

function ChannelStartHeader({
  emptyIcon,
  emptyTitle,
  emptyBody,
  spacious,
}: {
  emptyIcon: "hash" | "dm";
  emptyTitle: string;
  emptyBody: string;
  spacious: boolean;
}) {
  return (
    <div
      className={
        spacious
          ? "flex h-full min-h-[12rem] flex-col items-start justify-end px-4 pb-6"
          : "px-4 pb-4 pt-2"
      }
    >
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#41434a]">
        {emptyIcon === "hash" ? (
          <Hash className="h-8 w-8 text-white" strokeWidth={2} />
        ) : (
          <MessagesSquare className="h-8 w-8 text-white" strokeWidth={2} />
        )}
      </div>
      <p className="text-3xl font-bold text-white">{emptyTitle}</p>
      <p className="mt-2 max-w-lg text-sm text-muted">{emptyBody}</p>
    </div>
  );
}

export function ChatTimeline({
  messages,
  loading,
  emptyTitle,
  emptyBody,
  emptyIcon,
  scrollKey = "",
  currentUserId,
  currentUsername,
  roleNames,
  channelNames,
  mentionMaps,
  canDeleteOthers,
  reactionMap,
  customEmojis,
  emojiCatalog,
  serverNamesById,
  preferredServerId = null,
  reactorNamesById,
  hasMore = false,
  loadingOlder = false,
  onLoadOlder,
  preferFriendNickname = false,
  serverNickByUserId,
  readOnly = false,
  showChannelStart = true,
  onReply,
  onEdit,
  onDelete,
  onJumpToReply,
  onReact,
  onTogglePin,
}: ChatTimelineProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const lastKeyRef = useRef(scrollKey);
  const prevScrollHeightRef = useRef<number | null>(null);
  const prevMessageCountRef = useRef(messages.length);
  const loadOlderLockRef = useRef(false);
  const [awayFromBottom, setAwayFromBottom] = useState(false);

  // New channel/DM → always pin to latest until the user scrolls up.
  if (lastKeyRef.current !== scrollKey) {
    lastKeyRef.current = scrollKey;
    stickToBottomRef.current = true;
    prevScrollHeightRef.current = null;
    prevMessageCountRef.current = 0;
    loadOlderLockRef.current = false;
  }

  useEffect(() => {
    setAwayFromBottom(false);
    stickToBottomRef.current = true;
  }, [scrollKey]);

  function syncAwayFromBottom(el: HTMLElement) {
    const dist = distanceFromBottom(el);
    stickToBottomRef.current = dist < NEAR_BOTTOM_PX;
    setAwayFromBottom(
      dist >= JUMP_TO_PRESENT_PX && messages.length > 0 && !loading,
    );
  }

  function jumpToLatest(smooth = false) {
    const el = scrollerRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    setAwayFromBottom(false);
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      return;
    }
    el.scrollTop = el.scrollHeight;
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }

  useEffect(() => {
    if (!loadingOlder) {
      loadOlderLockRef.current = false;
    }
  }, [loadingOlder]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const prevHeight = prevScrollHeightRef.current;
    const grewUpward =
      prevHeight != null &&
      messages.length > prevMessageCountRef.current &&
      !stickToBottomRef.current;

    if (el && grewUpward) {
      el.scrollTop = el.scrollHeight - prevHeight;
      prevScrollHeightRef.current = null;
    }

    prevMessageCountRef.current = messages.length;

    if (loading) return;
    if (!stickToBottomRef.current) return;
    jumpToLatest(false);
    const frame = requestAnimationFrame(() => {
      jumpToLatest(false);
      requestAnimationFrame(() => jumpToLatest(false));
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollKey, loading, messages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current || loading) return;
      jumpToLatest(false);
    });
    observer.observe(el);
    const content = el.firstElementChild;
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [scrollKey, loading, messages.length]);

  function maybeLoadOlder() {
    const el = scrollerRef.current;
    if (!el || !onLoadOlder || !hasMore || loadingOlder || loading) return;
    if (loadOlderLockRef.current) return;
    if (el.scrollTop > 120) return;
    loadOlderLockRef.current = true;
    prevScrollHeightRef.current = el.scrollHeight;
    onLoadOlder();
  }

  const showJumpBar = awayFromBottom && messages.length > 0 && !loading;
  // Discord: channel/DM start header stays at the beginning once history is fully loaded.
  const showStartHeader = showChannelStart && !loading && !hasMore;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        onScroll={() => {
          const el = scrollerRef.current;
          if (!el) return;
          syncAwayFromBottom(el);
          maybeLoadOlder();
        }}
        className="min-h-0 flex-1 overflow-y-auto pb-4 pt-4"
      >
        {loading ? (
          <p className="px-4 text-sm text-muted">Loading messages…</p>
        ) : (
          <div
            className={
              messages.length === 0
                ? "flex h-full min-h-0 flex-col"
                : "space-y-0.5"
            }
          >
            {(hasMore || loadingOlder) && (
              <div className="flex justify-center px-4 py-2">
                {loadingOlder ? (
                  <p className="text-xs text-muted">Loading older messages…</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => maybeLoadOlder()}
                    className="text-xs font-medium text-[#949ba4] hover:text-white"
                  >
                    Load older messages
                  </button>
                )}
              </div>
            )}

            {showStartHeader && (
              <ChannelStartHeader
                emptyIcon={emptyIcon}
                emptyTitle={emptyTitle}
                emptyBody={emptyBody}
                spacious={messages.length === 0}
              />
            )}

            {!showStartHeader && messages.length === 0 && (
              <div className="flex h-full min-h-[12rem] flex-col items-start justify-center px-4">
                <p className="text-lg font-semibold text-white">{emptyTitle}</p>
                <p className="mt-1 max-w-lg text-sm text-muted">{emptyBody}</p>
              </div>
            )}

            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                isOwn={!!currentUserId && message.user_id === currentUserId}
                currentUserId={currentUserId}
                currentUsername={currentUsername}
                roleNames={roleNames}
                channelNames={channelNames}
                mentionMaps={mentionMaps}
                canDeleteOthers={canDeleteOthers}
                preferFriendNickname={preferFriendNickname}
                serverNickByUserId={serverNickByUserId}
                readOnly={readOnly}
                reactions={reactionMap[message.id] ?? []}
                customEmojis={customEmojis}
                emojiCatalog={emojiCatalog}
                serverNamesById={serverNamesById}
                preferredServerId={preferredServerId}
                reactorNamesById={reactorNamesById}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
                onJumpToReply={onJumpToReply}
                onReact={
                  readOnly || !onReact
                    ? undefined
                    : (emoji) => onReact(message.id, emoji)
                }
                onTogglePin={
                  readOnly || !onTogglePin
                    ? undefined
                    : () => onTogglePin(message)
                }
              />
            ))}
            <div ref={bottomRef} aria-hidden className="h-px w-full" />
          </div>
        )}
      </div>

      {showJumpBar && (
        <button
          type="button"
          onClick={() => jumpToLatest(true)}
          className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[#3f4147] bg-[#1e1f22]/95 px-3 py-1.5 text-xs font-semibold text-[#dbdee1] shadow-lg shadow-black/40 backdrop-blur-sm transition hover:border-accent/50 hover:text-white"
        >
          <span>Jump to present</span>
          <ArrowDown className="h-3.5 w-3.5 text-accent" strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}
