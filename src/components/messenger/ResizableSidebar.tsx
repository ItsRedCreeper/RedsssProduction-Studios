"use client";

import {
  useEffect,
  useRef,
  type PointerEvent,
  type ReactNode,
} from "react";

type ResizableSidebarProps = {
  width: number;
  onResizeStart: (event: PointerEvent<HTMLElement>) => void;
  children: ReactNode;
  className?: string;
  /** Which side of the main content this panel sits on (resize handle faces inward). */
  side?: "left" | "right";
  minWidth?: number;
  maxWidth?: number;
  label?: string;
  /** Phone sheet. Desktop sidebar stays hidden below `sm`. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export function ResizableSidebar({
  width,
  onResizeStart,
  children,
  className = "",
  side = "left",
  minWidth = 180,
  maxWidth = 420,
  label = "Resize sidebar",
  mobileOpen = false,
  onMobileClose,
}: ResizableSidebarProps) {
  const handleSide = side === "left" ? "right" : "left";
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!mobileOpen || !onMobileClose) return;
    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const sheet = sheetRef.current;
    const focusable = () =>
      sheet
        ? [
            ...sheet.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ]
        : [];

    const nodes = focusable();
    nodes[0]?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onMobileClose?.();
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const list = focusable();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus();
    };
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      <div
        className={`relative hidden h-full shrink-0 sm:block ${className}`}
        style={{ width }}
      >
        <div className="flex h-full w-full flex-col overflow-hidden border-r border-[var(--ms-border,#1e1f22)] bg-[var(--ms-sidebar,#2b2d31)]">
          {children}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={label}
          aria-valuemin={minWidth}
          aria-valuemax={maxWidth}
          aria-valuenow={width}
          onPointerDown={onResizeStart}
          className={`group absolute inset-y-0 z-30 w-2 cursor-ew-resize touch-none ${
            handleSide === "right" ? "-right-1" : "-left-1"
          }`}
        >
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-accent group-active:bg-accent" />
        </div>
      </div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 sm:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
            aria-label="Close channel list"
            onClick={onMobileClose}
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Channel list"
            className="absolute bottom-0 left-0 top-0 flex w-[min(100%,19rem)] flex-col overflow-hidden rounded-r-2xl border-r border-white/[0.06] bg-[var(--ms-sidebar,#2b2d31)] shadow-2xl shadow-black/60"
          >
            <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-accent/50 via-transparent to-transparent" />
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}
