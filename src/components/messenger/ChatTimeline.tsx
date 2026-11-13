"use client";

import { useEffect, useRef } from "react";
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
  currentUserId: string | null;
  currentUsername?: string | null;
  roleNames?: string[];
  channelNames?: string[];
  mentionMaps?: MentionMaps;
  canDeleteOthers?: boolean;
  reactionMap: Record<string, ReactionGroup[]>;
  onReply: (message: ChatMessage) => void;
  onEdit: (messageId: string, content: string) => Promise<boolean>;
  onDelete: (messageId: string) => Promise<void>;
  onJumpToReply: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onTogglePin?: (message: ChatMessage) => void;
};

export function ChatTimeline({
  messages,
  loading,
  emptyTitle,
  emptyBody,
  emptyIcon,
  currentUserId,
  currentUsername,
  roleNames,
  channelNames,
  mentionMaps,
  canDeleteOthers,
  reactionMap,
  onReply,
  onEdit,
  onDelete,
  onJumpToReply,
  onReact,
  onTogglePin,
}: ChatTimelineProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-4 pt-4">
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
        messages.map((message) => (
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
            onReact={onReact ? (emoji) => onReact(message.id, emoji) : undefined}
            onTogglePin={onTogglePin ? () => onTogglePin(message) : undefined}
          />
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
