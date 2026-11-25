"use client";

import type { ReactNode } from "react";
import { MessageSquare, Phone, Pin, Search, Users, Video } from "lucide-react";
import { HoverTip } from "@/components/ui/HoverTip";

type ChannelHeaderProps = {
  icon: ReactNode;
  title: string;
  topic?: string | null;
  searchOpen: boolean;
  pinsOpen: boolean;
  membersOpen: boolean;
  chatOpen?: boolean;
  showSearch?: boolean;
  showPins?: boolean;
  showMembers?: boolean;
  showChat?: boolean;
  showCall?: boolean;
  pinCount?: number;
  onToggleSearch: () => void;
  onTogglePins: () => void;
  onToggleMembers: () => void;
  onToggleChat?: () => void;
  onStartCall?: () => void;
  onStartVideoCall?: () => void;
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
  chatOpen = false,
  showSearch = true,
  showPins = true,
  showMembers = true,
  showChat = false,
  showCall = false,
  pinCount = 0,
  onToggleSearch,
  onTogglePins,
  onToggleMembers,
  onToggleChat,
  onStartCall,
  onStartVideoCall,
}: ChannelHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/30 px-4 shadow-sm shadow-black/20">
      <span className="shrink-0 text-[#949ba4]">{icon}</span>
      <HoverTip label={title} onlyIfTruncated delayMs={40} className="min-w-0 shrink">
        <h1 className="truncate text-base font-semibold text-white">{title}</h1>
      </HoverTip>
      {topic ? (
        <>
          <span className="hidden h-4 w-px shrink-0 bg-white/10 sm:block" />
          <HoverTip
            label={topic}
            onlyIfTruncated
            delayMs={40}
            className="hidden min-w-0 flex-1 sm:block"
          >
            <p className="truncate text-sm text-[#949ba4]">{topic}</p>
          </HoverTip>
        </>
      ) : (
        <span className="flex-1" />
      )}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {showCall && onStartCall && (
          <HoverTip label="Start Voice Call" delayMs={40}>
            <button
              type="button"
              className={toolClass(false)}
              aria-label="Start voice call"
              onClick={onStartCall}
            >
              <Phone className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </HoverTip>
        )}
        {showCall && onStartVideoCall && (
          <HoverTip label="Start Video Call" delayMs={40}>
            <button
              type="button"
              className={toolClass(false)}
              aria-label="Start video call"
              onClick={onStartVideoCall}
            >
              <Video className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </HoverTip>
        )}
        {showSearch && (
          <HoverTip label="Search" delayMs={40}>
            <button
              type="button"
              className={toolClass(searchOpen)}
              aria-label="Search"
              aria-pressed={searchOpen}
              onClick={onToggleSearch}
            >
              <Search className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </HoverTip>
        )}
        {showPins && (
          <HoverTip label="Pinned Messages" delayMs={40}>
            <button
              type="button"
              className={`relative ${toolClass(pinsOpen)}`}
              aria-label="Pinned messages"
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
          </HoverTip>
        )}
        {showChat && (
          <HoverTip label="Open Chat" delayMs={40}>
            <button
              type="button"
              className={toolClass(chatOpen)}
              aria-label="Voice chat"
              aria-pressed={chatOpen}
              onClick={onToggleChat}
            >
              <MessageSquare className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </HoverTip>
        )}
        {showMembers && (
          <HoverTip label="Show Member List" delayMs={40}>
            <button
              type="button"
              className={toolClass(membersOpen)}
              aria-label="Member list"
              aria-pressed={membersOpen}
              onClick={onToggleMembers}
            >
              <Users className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </HoverTip>
        )}
      </div>
    </header>
  );
}
