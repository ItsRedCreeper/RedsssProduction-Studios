"use client";

import { HoverTip } from "@/components/ui/HoverTip";

type ServerRailButtonProps = {
  label: string;
  active?: boolean;
  unread?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "action";
};

export function ServerRailButton({
  label,
  active = false,
  unread = false,
  onClick,
  children,
  tone = "default",
}: ServerRailButtonProps) {
  return (
    <div className="group/server relative flex h-11 w-full items-center justify-center px-3">
      <span
        className={`absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-all duration-200 ${
          active
            ? "h-8 opacity-100"
            : unread
              ? "h-2 opacity-100"
              : "h-0 opacity-0 group-hover/server:h-4 group-hover/server:opacity-70"
        }`}
        aria-hidden
      />
      <HoverTip label={label} side="right" delayMs={60}>
        <button
          type="button"
          aria-label={unread && !active ? `${label} (unread)` : label}
          aria-pressed={active || undefined}
          onClick={onClick}
          className="relative z-[1] flex h-11 w-11 items-center justify-center"
        >
          {children}
          {unread && !active && tone !== "action" && (
            <span
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-[#1a1b1e]"
              aria-hidden
            />
          )}
        </button>
      </HoverTip>
    </div>
  );
}
