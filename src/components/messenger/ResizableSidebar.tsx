"use client";

import type { PointerEvent, ReactNode } from "react";

type ResizableSidebarProps = {
  width: number;
  onResizeStart: (event: PointerEvent<HTMLElement>) => void;
  children: ReactNode;
  className?: string;
};

export function ResizableSidebar({
  width,
  onResizeStart,
  children,
  className = "",
}: ResizableSidebarProps) {
  return (
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
        aria-label="Resize channel sidebar"
        aria-valuemin={180}
        aria-valuemax={420}
        aria-valuenow={width}
        onPointerDown={onResizeStart}
        className="group absolute inset-y-0 -right-1 z-30 w-2 cursor-ew-resize touch-none"
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-accent group-active:bg-accent" />
      </div>
    </div>
  );
}
