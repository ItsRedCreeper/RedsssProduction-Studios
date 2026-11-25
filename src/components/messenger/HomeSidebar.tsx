"use client";

import { useEffect, type ReactNode } from "react";
import { Users, X } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { HoverTip } from "@/components/ui/HoverTip";
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
  /** Forces re-render when typing membership changes. */
  typingUserIdsKey?: string;
  /** Conversation ids with an open joinable call. */
  openCallIds?: Set<string>;
  onSelectThread: (threadId: string) => void;
  onJoinCall?: (threadId: string) => void;
  onCloseThread?: (threadId: string) => void;
  onCreateGroup?: () => void;
  footer?: ReactNode;
};

export function HomeSidebar({
  threads,
  activeThreadId,
  loadingThreads,
  typingUserIds,
  typingUserIdsKey = "",
  openCallIds,
  onSelectThread,
  onJoinCall,
  onCloseThread,
  onCreateGroup,
  footer,
}: HomeSidebarProps) {
  void typingUserIdsKey;
  const profileUi = useOptionalProfileUi();
  const feed = useOptionalPresenceFeed();
  void feed?.version;

  const watchKey = threads
    .flatMap((thread) =>
      thread.isGroup ? thread.participantIds ?? [] : [thread.otherUserId],
    )
    .join(",");
  useEffect(() => {
    if (!feed || !watchKey) return;
    feed.watchMany(watchKey.split(",").filter(Boolean));
  }, [feed, watchKey]);

  return (
    <aside className="flex h-full w-full flex-col bg-[var(--ms-sidebar)]">
      <div className="messenger-header flex h-11 shrink-0 items-center gap-2 bg-[var(--ms-sidebar)] px-3">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-white">
          Direct Messages
        </span>
        {onCreateGroup ? (
          <HoverTip label="New Group DM" delayMs={40}>
            <button
              type="button"
              onClick={onCreateGroup}
              aria-label="New Group DM"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#b5bac1] hover:bg-white/10 hover:text-white"
            >
              <Users className="h-4 w-4" strokeWidth={2} />
            </button>
          </HoverTip>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {profileUi ? (
          <button
            type="button"
            onClick={() => profileUi.openFriends("online")}
            className="mb-1.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[var(--ms-text-muted)] transition-colors hover:bg-white/5 hover:text-white hover:shadow-[inset_2px_0_0_0_var(--accent)]"
          >
            <Users className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="min-w-0 flex-1 truncate font-medium">Friends</span>
          </button>
        ) : null}
        {loadingThreads && threads.length === 0 ? (
          <div className="space-y-1 px-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-white/5" />
                <span className="h-3 flex-1 animate-pulse rounded bg-white/5" />
              </div>
            ))}
          </div>
        ) : threads.length === 0 ? (
          <p className="px-2 py-2 text-xs leading-relaxed text-[var(--ms-text-faint)]">
            No conversations yet. Message someone from a server member list to start a DM.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {threads.map((thread) => {
              const active = thread.id === activeThreadId;
              const name = thread.isGroup
                ? thread.groupName?.trim() || thread.username
                : profileUi?.nicknameFor(thread.otherUserId) || thread.username;
              const live = thread.isGroup
                ? null
                : feed?.get(thread.otherUserId);
              const typing = thread.isGroup
                ? false
                : (typingUserIds?.has(thread.otherUserId) ?? false);
              return (
                <li key={thread.id} className="group/thread relative">
                  <button
                    type="button"
                    onClick={() => onSelectThread(thread.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-8 text-left ${
                      active
                        ? "messenger-row-active text-white"
                        : "text-[var(--ms-text-muted)] hover:bg-white/5 hover:text-[var(--ms-text)]"
                    }`}
                  >
                    <span className="relative shrink-0 overflow-visible">
                      <UserAvatar
                        username={name}
                        avatarUrl={thread.avatar_url}
                        size="sm"
                        className="!h-8 !w-8"
                      />
                      {!thread.isGroup ? (
                        <StatusPresenceBadge
                          status={live?.status ?? thread.status}
                          lastSeenAt={live?.lastSeenAt ?? thread.last_seen_at}
                          typing={typing}
                          ringClassName="ring-[#2b2d31]"
                        />
                      ) : (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--ms-sidebar)] ring-2 ring-[#2b2d31]">
                          <Users className="h-2.5 w-2.5 text-[var(--ms-text-muted)]" strokeWidth={2.5} />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <HoverTip
                        label={name}
                        onlyIfTruncated
                        delayMs={40}
                        className="block min-w-0"
                      >
                        <span className="block truncate text-sm font-medium">
                          {name}
                        </span>
                      </HoverTip>
                      {openCallIds?.has(thread.id) ? (
                        <span
                          role="button"
                          tabIndex={0}
                          className="block truncate text-left text-[11px] font-medium text-[var(--ms-connected)] hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            onJoinCall?.(thread.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.stopPropagation();
                            onJoinCall?.(thread.id);
                          }}
                        >
                          Call in progress — Join
                        </span>
                      ) : thread.isGroup ? (
                        <span className="block truncate text-[11px] text-[var(--ms-text-faint)]">
                          {(thread.participantIds?.length ?? 0) + 1} members
                        </span>
                      ) : (
                        <PresenceCaption
                          userId={thread.otherUserId}
                          status={thread.status}
                          lastSeenAt={thread.last_seen_at}
                          customStatus={thread.status_text}
                        />
                      )}
                    </span>
                  </button>
                  {onCloseThread && (
                    <HoverTip
                      label="Close DM"
                      delayMs={40}
                      className={`absolute right-1 top-1/2 z-10 -translate-y-1/2 ${
                        active
                          ? "opacity-100"
                          : "opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100"
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={`Close DM with ${name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onCloseThread(thread.id);
                        }}
                        className="rounded-md p-1 text-[var(--ms-text-muted)] hover:bg-black/30 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </HoverTip>
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
