"use client";

import { HoverTip } from "@/components/ui/HoverTip";
import { UnreadBadge } from "@/components/ui/UnreadBadge";

type ServerRailButtonProps = {
  label: string;
  active?: boolean;
  unread?: boolean;
  unreadCount?: number;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "action";
};

export function ServerRailButton({
  label,
  active = false,
  unread = false,
  unreadCount = 0,
  onClick,
  children,
  tone = "default",
}: ServerRailButtonProps) {
  const showBadge = unreadCount > 0 || (unread && !active && tone !== "action");
  return (
    <div className="group/server relative flex h-10 w-full items-center justify-center px-2">
      <span
        className={`absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-all duration-200 ${
          active
            ? "h-8 opacity-100"
            : unreadCount > 0 || unread
              ? "h-2 opacity-100"
              : "h-0 opacity-0 group-hover/server:h-4 group-hover/server:opacity-70"
        }`}
        aria-hidden
      />
      <HoverTip label={label} side="right" delayMs={60}>
        <button
          type="button"
          aria-label={
            unreadCount > 0 && !active
              ? `${label} (${unreadCount} unread)`
              : unread && !active
                ? `${label} (unread)`
                : label
          }
          aria-pressed={active || undefined}
          onClick={onClick}
          className="relative z-[1] flex h-10 w-10 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1b1e]"
        >
          {children}
          {showBadge && tone !== "action" ? (
            unreadCount > 0 ? (
              <UnreadBadge
                count={unreadCount}
                size="md"
                className="absolute -bottom-1 -right-1 ring-[#1a1b1e]"
              />
            ) : !active ? (
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#1a1b1e]"
                style={{ backgroundColor: "#ed4245" }}
                aria-hidden
              />
            ) : null
          ) : null}
        </button>
      </HoverTip>
    </div>
  );
}
