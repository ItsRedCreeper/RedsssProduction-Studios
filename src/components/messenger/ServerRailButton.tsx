"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

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
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);

  function showTip(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    setTip({
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  }

  return (
    <div className="group/server relative flex h-12 w-full items-center justify-center px-3">
      <span
        className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full transition-all duration-200 ${
          active
            ? "h-10 bg-accent opacity-100"
            : unread
              ? "h-2 bg-accent opacity-100"
              : "h-0 bg-white opacity-0 group-hover/server:h-5 group-hover/server:opacity-100"
        }`}
        aria-hidden
      />
      <button
        type="button"
        aria-label={unread && !active ? `${label} (unread)` : label}
        aria-pressed={active || undefined}
        onClick={onClick}
        onPointerEnter={(event) => showTip(event.currentTarget)}
        onPointerLeave={() => setTip(null)}
        onFocus={(event) => showTip(event.currentTarget)}
        onBlur={() => setTip(null)}
        className="relative z-[1] flex h-12 w-12 items-center justify-center"
      >
        {children}
        {unread && !active && tone !== "action" && (
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-[#1e1f22]"
            aria-hidden
          />
        )}
      </button>

      {tip &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: tip.top, left: tip.left }}
            className="pointer-events-none fixed z-[80] -translate-y-1/2 whitespace-nowrap rounded-md border border-accent/45 bg-[#111214] px-3 py-1.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
          >
            <span
              className="absolute left-[-5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-b border-l border-accent/45 bg-[#111214]"
              aria-hidden
            />
            {label}
          </span>,
          document.body,
        )}
    </div>
  );
}
