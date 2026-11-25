"use client";

import type { PointerEvent, ReactNode } from "react";

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

  return (
    <>
    <div
      className={`relative hidden h-full shrink-0 sm:block ${className}`}
      style={{ width }}
    >
      <div className="flex h-full w-full flex-col overflow-hidden bg-[#2b2d31]">
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
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-[#23a559] group-active:bg-[#23a559]" />
      </div>
    </div>
    {mobileOpen ? (
      <div className="fixed inset-0 z-40 sm:hidden">
        <button
          type="button"
          className="absolute inset-0 bg-black/60"
          aria-label="Close channel list"
          onClick={onMobileClose}
        />
        <div className="absolute bottom-0 left-0 top-0 flex w-[min(100%,18.5rem)] flex-col overflow-hidden bg-[#2b2d31] shadow-2xl shadow-black/50">
          {children}
        </div>
      </div>
    ) : null}
    </>
  );
}
