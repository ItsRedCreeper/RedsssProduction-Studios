"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { DmThread } from "@/components/messenger/types";
import { StatusPresenceBadge } from "@/components/messenger/StatusPresenceBadge";
import { useOptionalProfileUi } from "@/components/profile/ProfileProvider";
import { PresenceCaption } from "@/components/presence/PresenceCaption";
import { useOptionalPresenceFeed } from "@/components/presence/PresenceFeed";

type HomeSidebarProps = {
  threads: DmThread[];
  activeThreadId: string | null;
  loadingThreads: boolean;
  /** Users currently typing in the open DM (status badge → animated dots). */
  typingUserIds?: Set<string>;
  onSelectThread: (threadId: string) => void;
  onCloseThread?: (threadId: string) => void;
  footer?: ReactNode;
};

export function HomeSidebar({
  threads,
  activeThreadId,
  loadingThreads,
  typingUserIds,
  onSelectThread,
  onCloseThread,
  footer,
}: HomeSidebarProps) {
  const profileUi = useOptionalProfileUi();
  const feed = useOptionalPresenceFeed();
  void feed?.version;

  const watchKey = threads.map((thread) => thread.otherUserId).join(",");
  useEffect(() => {
    if (!feed || !watchKey) return;
    feed.watchMany(watchKey.split(",").filter(Boolean));
  }, [feed, watchKey]);

  return (
    <aside className="flex h-full w-full flex-col bg-[#2b2d31]">
      <div className="flex h-12 shrink-0 items-center border-b border-black/30 px-4 text-[15px] font-semibold text-white shadow-sm shadow-black/20">
        Direct Messages
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {loadingThreads ? (
          <p className="px-2 py-1 text-xs text-muted">Loading…</p>
        ) : threads.length === 0 ? (
          <p className="px-2 py-2 text-xs leading-relaxed text-[#6d6f78]">
            No conversations yet. Message someone from a server member list to start a DM.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {threads.map((thread) => {
              const active = thread.id === activeThreadId;
              const name =
                profileUi?.nicknameFor(thread.otherUserId) || thread.username;
              const live = feed?.get(thread.otherUserId);
              const typing = typingUserIds?.has(thread.otherUserId) ?? false;
              return (
                <li key={thread.id} className="group/thread relative">
                  <button
                    type="button"
                    onClick={() => onSelectThread(thread.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 pr-8 text-left ${
                      active
                        ? "bg-[#404249] text-white"
                        : "text-[#949ba4] hover:bg-white/5 hover:text-[#dbdee1]"
                    }`}
                  >
                    <span className="relative shrink-0">
                      <UserAvatar
                        username={name}
                        avatarUrl={thread.avatar_url}
                        size="sm"
                        className="!h-8 !w-8"
                      />
                      <StatusPresenceBadge
                        status={live?.status ?? thread.status}
                        lastSeenAt={live?.lastSeenAt ?? thread.last_seen_at}
                        typing={typing}
                        ringClassName="ring-[#2b2d31]"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {name}
                      </span>
                      <PresenceCaption
                        userId={thread.otherUserId}
                        status={thread.status}
                        lastSeenAt={thread.last_seen_at}
                        customStatus={thread.status_text}
                      />
                    </span>
                  </button>
                  {onCloseThread && (
                    <button
                      type="button"
                      title="Close DM"
                      aria-label={`Close DM with ${name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onCloseThread(thread.id);
                      }}
                      className={`absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#949ba4] hover:bg-black/30 hover:text-white ${
                        active
                          ? "opacity-100"
                          : "opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100"
                      }`}
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {footer}
    </aside>
  );
}
