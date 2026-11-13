"use client";

import type { ReactNode } from "react";
import { Pin, Search, Users } from "lucide-react";

type ChannelHeaderProps = {
  icon: ReactNode;
  title: string;
  topic?: string | null;
  searchOpen: boolean;
  pinsOpen: boolean;
  membersOpen: boolean;
  showSearch?: boolean;
  showPins?: boolean;
  showMembers?: boolean;
  pinCount?: number;
  onToggleSearch: () => void;
  onTogglePins: () => void;
  onToggleMembers: () => void;
};

function toolClass(active: boolean) {
  return `rounded-md p-1.5 transition-colors ${
    active
      ? "bg-accent-muted text-accent"
      : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
  }`;
}

export function ChannelHeader({
  icon,
  title,
  topic,
  searchOpen,
  pinsOpen,
  membersOpen,
  showSearch = true,
  showPins = true,
  showMembers = true,
  pinCount = 0,
  onToggleSearch,
  onTogglePins,
  onToggleMembers,
}: ChannelHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/30 px-4 shadow-sm shadow-black/20">
      <span className="shrink-0 text-[#949ba4]">{icon}</span>
      <h1 className="min-w-0 shrink truncate text-base font-semibold text-white">
        {title}
      </h1>
      {topic ? (
        <>
          <span className="hidden h-4 w-px shrink-0 bg-white/10 sm:block" />
          <p className="hidden min-w-0 flex-1 truncate text-sm text-[#949ba4] sm:block">
            {topic}
          </p>
        </>
      ) : (
        <span className="flex-1" />
      )}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {showSearch && (
          <button
            type="button"
            className={toolClass(searchOpen)}
            aria-label="Search"
            title="Search loaded messages"
            aria-pressed={searchOpen}
            onClick={onToggleSearch}
          >
            <Search className="h-5 w-5" strokeWidth={1.75} />
          </button>
        )}
        {showPins && (
          <button
            type="button"
            className={`relative ${toolClass(pinsOpen)}`}
            aria-label="Pinned messages"
            title="Pinned messages"
            aria-pressed={pinsOpen}
            onClick={onTogglePins}
          >
            <Pin className="h-5 w-5" strokeWidth={1.75} />
            {pinCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-bold text-white">
                {pinCount > 9 ? "9+" : pinCount}
              </span>
            )}
          </button>
        )}
        {showMembers && (
          <button
            type="button"
            className={toolClass(membersOpen)}
            aria-label="Member list"
            title="Member list"
            aria-pressed={membersOpen}
            onClick={onToggleMembers}
          >
            <Users className="h-5 w-5" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </header>
  );
}
