"use client";

import type { ReactNode, Ref } from "react";
import { Menu, MessageSquare, Phone, Pin, Search, Users, Video } from "lucide-react";
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
  joinCallAvailable?: boolean;
  pinCount?: number;
  onToggleSearch: () => void;
  onTogglePins: () => void;
  onToggleMembers: () => void;
  onToggleChat?: () => void;
  onStartCall?: () => void;
  onStartVideoCall?: () => void;
  onJoinCall?: () => void;
  onOpenList?: () => void;
  pinsButtonRef?: Ref<HTMLButtonElement>;
  showInCall?: boolean;
  onExpandCall?: () => void;
};

function toolClass(active: boolean) {
  return `rounded-lg p-1.5 transition-colors ${
    active
      ? "bg-white/10 text-white"
      : "text-[var(--ms-text-muted)] hover:bg-white/5 hover:text-white"
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
  joinCallAvailable = false,
  pinCount = 0,
  onToggleSearch,
  onTogglePins,
  onToggleMembers,
  onToggleChat,
  onStartCall,
  onStartVideoCall,
  onJoinCall,
  onOpenList,
  pinsButtonRef,
  showInCall = false,
  onExpandCall,
}: ChannelHeaderProps) {
  return (
    <header className="messenger-header flex h-11 shrink-0 items-center gap-2 bg-[var(--ms-chat)] px-3 sm:px-4">
      {onOpenList ? (
        <button
          type="button"
          onClick={onOpenList}
          className="rounded-lg p-1.5 text-[var(--ms-text-muted)] hover:bg-white/5 hover:text-white sm:hidden"
          aria-label="Open channel list"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>
      ) : null}
      <span className="shrink-0 text-[var(--ms-text-muted)]">{icon}</span>
      <HoverTip label={title} onlyIfTruncated delayMs={40} className="min-w-0 shrink">
        <h1 className="truncate text-[15px] font-semibold tracking-tight text-white">
          {title}
        </h1>
      </HoverTip>
      {topic ? (
        <>
          <span className="hidden h-3.5 w-px shrink-0 bg-white/10 sm:block" />
          <HoverTip
            label={topic}
            onlyIfTruncated
            delayMs={40}
            className="hidden min-w-0 flex-1 sm:block"
          >
            <p className="truncate text-sm text-[var(--ms-text-muted)]">{topic}</p>
          </HoverTip>
        </>
      ) : (
        <span className="flex-1" />
      )}
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {showInCall && onExpandCall ? (
          <button
            type="button"
            onClick={onExpandCall}
            className="mr-1 rounded-md bg-[var(--ms-connected)]/15 px-2 py-1 text-xs font-semibold text-[var(--ms-connected)] hover:bg-[var(--ms-connected)]/25"
          >
            In call
          </button>
        ) : null}
        {showCall && joinCallAvailable && onJoinCall ? (
          <HoverTip label="Join Call" delayMs={40}>
            <button
              type="button"
              className="rounded-md bg-[var(--ms-connected)]/20 px-2.5 py-1.5 text-xs font-semibold text-[var(--ms-connected)] hover:bg-[var(--ms-connected)]/30"
              aria-label="Join call"
              onClick={onJoinCall}
            >
              Join Call
            </button>
          </HoverTip>
        ) : null}
        {showCall && !joinCallAvailable && onStartCall && (
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
        {showCall && !joinCallAvailable && onStartVideoCall && (
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
              ref={pinsButtonRef}
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
