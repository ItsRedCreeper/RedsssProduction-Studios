"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, FolderPlus, Hash, LogOut, Settings, UserPlus } from "lucide-react";

type ServerHeaderMenuProps = {
  serverName: string;
  onInvite: () => void;
  onSettings: () => void;
  onCreateChannel?: () => void;
  onCreateCategory?: () => void;
  onLeave?: () => void;
};

export function ServerHeaderMenu({
  serverName,
  onInvite,
  onSettings,
  onCreateChannel,
  onCreateCategory,
  onLeave,
}: ServerHeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0 border-b border-black/30">
      <div className="flex h-12 items-center gap-1 px-2 shadow-sm shadow-black/20">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-black/20"
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <span className="truncate text-[15px] font-semibold text-white">
            {serverName}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[#b5bac1] transition-transform ${
              open ? "rotate-180" : ""
            }`}
            strokeWidth={2}
          />
        </button>
        <button
          type="button"
          onClick={onInvite}
          title="Invite People"
          aria-label="Invite People"
          className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#b5bac1] transition-colors hover:bg-accent/15 hover:text-accent"
        >
          <UserPlus className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute left-2 right-2 top-[calc(100%-4px)] z-30 overflow-hidden rounded-md border border-[#1e1f22] bg-[#111214] py-1.5 shadow-xl shadow-black/50"
        >
          {onCreateChannel && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onCreateChannel();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#dbdee1] hover:bg-accent hover:text-white"
            >
              <Hash className="h-4 w-4" strokeWidth={1.75} />
              Create Channel
            </button>
          )}
          {onCreateCategory && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onCreateCategory();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#dbdee1] hover:bg-accent hover:text-white"
            >
              <FolderPlus className="h-4 w-4" strokeWidth={1.75} />
              Create Category
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#dbdee1] hover:bg-accent hover:text-white"
          >
            <Settings className="h-4 w-4" strokeWidth={1.75} />
            Server Settings
          </button>
          {onLeave && (
            <>
              <div className="my-1 border-t border-[#2b2d31]" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLeave();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-accent hover:bg-accent hover:text-white"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} />
                Leave Server
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
