"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Hash, MessagesSquare } from "lucide-react";
import { MessageItem } from "@/components/messenger/MessageItem";
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
  /** More history exists above the loaded window. */
  hasMore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (messageId: string, content: string) => Promise<boolean>;
  onDelete: (messageId: string) => Promise<void>;
  onJumpToReply: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onTogglePin?: (message: ChatMessage) => void;
};

function distanceFromBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
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
  hasMore = false,
  loadingOlder = false,
  onLoadOlder,
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

  // New channel/DM → always pin to latest until the user scrolls up.
  if (lastKeyRef.current !== scrollKey) {
    lastKeyRef.current = scrollKey;
    stickToBottomRef.current = true;
    prevScrollHeightRef.current = null;
    prevMessageCountRef.current = 0;
    loadOlderLockRef.current = false;
  }

  function jumpToLatest() {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }

  // Unlock after an older-page fetch finishes (even if nothing new came back).
  useEffect(() => {
    if (!loadingOlder) {
      loadOlderLockRef.current = false;
    }
  }, [loadingOlder]);

  // After prepending older messages, keep the same viewport anchor.
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
    jumpToLatest();
    const frame = requestAnimationFrame(() => {
      jumpToLatest();
      requestAnimationFrame(jumpToLatest);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollKey, loading, messages]);

  // Keep pinned to bottom while content height grows (images, wrap, etc.).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current || loading) return;
      jumpToLatest();
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

  return (
    <div
      ref={scrollerRef}
      onScroll={() => {
        const el = scrollerRef.current;
        if (!el) return;
        stickToBottomRef.current = distanceFromBottom(el) < 80;
        maybeLoadOlder();
      }}
      className="min-h-0 flex-1 overflow-y-auto pb-4 pt-4"
    >
      {loading ? (
        <p className="px-4 text-sm text-muted">Loading messages…</p>
      ) : messages.length === 0 ? (
        <div className="flex h-full min-h-[12rem] flex-col items-start justify-end px-4 pb-6">
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
      ) : (
        <div className="space-y-0.5">
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
              reactions={reactionMap[message.id] ?? []}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onJumpToReply={onJumpToReply}
              onReact={
                onReact ? (emoji) => onReact(message.id, emoji) : undefined
              }
              onTogglePin={
                onTogglePin ? () => onTogglePin(message) : undefined
              }
            />
          ))}
          <div ref={bottomRef} aria-hidden className="h-px w-full" />
        </div>
      )}
    </div>
  );
}
