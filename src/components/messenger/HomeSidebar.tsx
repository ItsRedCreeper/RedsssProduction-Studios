"use client";

import type { ReactNode } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { statusDotClass } from "@/components/messenger/data";
import type { DmThread } from "@/components/messenger/types";

type HomeSidebarProps = {
  threads: DmThread[];
  activeThreadId: string | null;
  loadingThreads: boolean;
  onSelectThread: (threadId: string) => void;
  footer?: ReactNode;
};

export function HomeSidebar({
  threads,
  activeThreadId,
  loadingThreads,
  onSelectThread,
  footer,
}: HomeSidebarProps) {
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
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => onSelectThread(thread.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${
                      active
                        ? "bg-[#404249] text-white"
                        : "text-[#949ba4] hover:bg-white/5 hover:text-[#dbdee1]"
                    }`}
                  >
                    <span className="relative shrink-0">
                      <UserAvatar
                        username={thread.username}
                        avatarUrl={thread.avatar_url}
                        size="sm"
                        className="!h-8 !w-8"
                      />
                      <span
                        className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[#2b2d31] ${statusDotClass(thread.status)}`}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {thread.username}
                      </span>
                      <span className="block truncate text-[11px] text-[#6d6f78]">
                        {thread.preview || "No messages yet"}
                      </span>
                    </span>
                  </button>
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
