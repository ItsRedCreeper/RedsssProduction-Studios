"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Hash, MessagesSquare } from "lucide-react";
import { MessageItem } from "@/components/messenger/MessageItem";
import {
  formatDayDivider,
  localDayKey,
  shouldGroupWithPrevious,
} from "@/components/messenger/data";
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
  /** Highest-role username colors for channel message authors. */
  roleColorByUserId?: Record<string, string>;
  readOnly?: boolean;
  /** When false, hide the Discord-style channel/DM start header (e.g. search). */
  showChannelStart?: boolean;
  onReply: (message: ChatMessage) => void;
  onEdit: (messageId: string, content: string) => Promise<boolean>;
  onDelete: (messageId: string) => Promise<void>;
  onJumpToReply: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onTogglePin?: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
  onMarkUnread?: (message: ChatMessage) => void;
  onCreateThread?: (message: ChatMessage) => void;
  onCopyLink?: (message: ChatMessage) => void;
  pollVotesByMessage?: Record<
    string,
    { user_id: string; option_index: number }[]
  >;
  onPollVote?: (messageId: string, optionIndex: number) => void;
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
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3a3c43] ring-2 ring-accent/40">
        {emptyIcon === "hash" ? (
          <Hash className="h-7 w-7 text-white" strokeWidth={2} />
        ) : (
          <MessagesSquare className="h-7 w-7 text-white" strokeWidth={2} />
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
        {emptyTitle}
      </p>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#949ba4]">
        {emptyBody}
      </p>
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
  roleColorByUserId,
  readOnly = false,
  showChannelStart = true,
  onReply,
  onEdit,
  onDelete,
  onJumpToReply,
  onReact,
  onTogglePin,
  onForward,
  onMarkUnread,
  onCreateThread,
  onCopyLink,
  pollVotesByMessage,
  onPollVote,
}: ChatTimelineProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const lastKeyRef = useRef(scrollKey);
  const prevScrollHeightRef = useRef<number | null>(null);
  const prevMessageCountRef = useRef(messages.length);
  const loadOlderLockRef = useRef(false);
  /** Ignore scroll events caused by programmatic jumps / layout resize. */
  const ignoreScrollRef = useRef(false);
  const ignoreScrollClearRef = useRef<number | null>(null);
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

  useEffect(() => {
    return () => {
      if (ignoreScrollClearRef.current != null) {
        cancelAnimationFrame(ignoreScrollClearRef.current);
      }
    };
  }, []);

  function beginIgnoreScroll() {
    ignoreScrollRef.current = true;
    if (ignoreScrollClearRef.current != null) {
      cancelAnimationFrame(ignoreScrollClearRef.current);
    }
    // Two frames: resize/scroll events from layout often land after the jump.
    ignoreScrollClearRef.current = requestAnimationFrame(() => {
      ignoreScrollClearRef.current = requestAnimationFrame(() => {
        ignoreScrollRef.current = false;
        ignoreScrollClearRef.current = null;
      });
    });
  }

  function syncAwayFromBottom(el: HTMLElement) {
    if (ignoreScrollRef.current) return;
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
    beginIgnoreScroll();
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      // Smooth scroll keeps firing scroll events — hold ignore until it settles.
      window.setTimeout(() => {
        ignoreScrollRef.current = false;
        if (scrollerRef.current) {
          const dist = distanceFromBottom(scrollerRef.current);
          stickToBottomRef.current = dist < NEAR_BOTTOM_PX;
        }
      }, 320);
      return;
    }
    el.scrollTop = el.scrollHeight;
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
      beginIgnoreScroll();
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
    // Layout often settles a beat after paint when the window/messenger is scaled.
    const settle = window.setTimeout(() => {
      if (stickToBottomRef.current) jumpToLatest(false);
    }, 100);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [scrollKey, loading, messages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    let frame = 0;
    const pinIfStuck = () => {
      if (!stickToBottomRef.current || loading) return;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        jumpToLatest(false);
      });
    };

    const observer = new ResizeObserver(pinIfStuck);
    observer.observe(el);
    const content = el.firstElementChild;
    if (content) observer.observe(content);

    // Window / zoom / sidebar drag: clientHeight can change without content resize
    // alone being enough, and browsers often fire scroll mid-resize that would
    // falsely clear stick-to-bottom without ignoreScroll.
    const onViewportChange = () => {
      if (!stickToBottomRef.current || loading) return;
      beginIgnoreScroll();
      pinIfStuck();
    };
    window.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("resize", onViewportChange);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
    };
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
          <div className="space-y-3 px-4 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <span className="mt-0.5 h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/5" />
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <span className="block h-3 w-28 animate-pulse rounded bg-white/5" />
                  <span className="block h-3 w-full max-w-md animate-pulse rounded bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className={
              messages.length === 0 ? "flex h-full min-h-0 flex-col" : undefined
            }
          >
            {(hasMore || loadingOlder) && (
              <div className="flex justify-center px-4 py-2">
                {loadingOlder ? (
                  <p className="text-xs text-[#949ba4]">Loading older messages…</p>
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
                <p className="mt-1 max-w-lg text-sm text-[#949ba4]">{emptyBody}</p>
              </div>
            )}

            {messages.map((message, index) => {
              const previous = index > 0 ? messages[index - 1] : null;
              const dayChanged =
                !!previous &&
                localDayKey(previous.created_at) !==
                  localDayKey(message.created_at);
              const compact =
                !dayChanged && shouldGroupWithPrevious(previous, message);
              const dayLabel = dayChanged
                ? formatDayDivider(message.created_at)
                : index === 0
                  ? formatDayDivider(message.created_at)
                  : "";
              const showDayDivider = Boolean(dayLabel) && (index === 0 || dayChanged);

              return (
                <div
                  key={message.id}
                  className={
                    !compact && index > 0 && !showDayDivider ? "mt-4" : undefined
                  }
                >
                  {showDayDivider ? (
                    <div
                      className={`relative mx-4 flex items-center ${
                        index === 0 ? "mb-2 mt-1" : "mb-2 mt-4"
                      }`}
                      role="separator"
                      aria-label={dayLabel}
                    >
                      <div className="h-px flex-1 bg-[#3f4147]" />
                      <span className="px-2 text-[12px] font-semibold text-[#949ba4]">
                        {dayLabel}
                      </span>
                      <div className="h-px flex-1 bg-[#3f4147]" />
                    </div>
                  ) : null}
                  <MessageItem
                    message={message}
                    compact={compact}
                    isOwn={
                      !!currentUserId && message.user_id === currentUserId
                    }
                    currentUserId={currentUserId}
                    currentUsername={currentUsername}
                    roleNames={roleNames}
                    channelNames={channelNames}
                    mentionMaps={mentionMaps}
                    canDeleteOthers={canDeleteOthers}
                    preferFriendNickname={preferFriendNickname}
                    serverNickByUserId={serverNickByUserId}
                    roleColorByUserId={roleColorByUserId}
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
                    onForward={
                      readOnly || !onForward
                        ? undefined
                        : () => onForward(message)
                    }
                    onMarkUnread={
                      readOnly || !onMarkUnread
                        ? undefined
                        : () => onMarkUnread(message)
                    }
                    onCreateThread={
                      readOnly || !onCreateThread
                        ? undefined
                        : () => onCreateThread(message)
                    }
                    onCopyLink={
                      readOnly || !onCopyLink
                        ? undefined
                        : () => onCopyLink(message)
                    }
                    pollVotes={pollVotesByMessage?.[message.id] ?? []}
                    onPollVote={readOnly ? undefined : onPollVote}
                  />
                </div>
              );
            })}
            <div ref={bottomRef} aria-hidden className="h-px w-full shrink-0" />
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
