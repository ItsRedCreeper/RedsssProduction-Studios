"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  Eye,
  FolderPlus,
  Hash,
  LogOut,
  Settings,
  UserPlus,
} from "lucide-react";
import { HoverTip } from "@/components/ui/HoverTip";

type ServerHeaderMenuProps = {
  serverName: string;
  /** When false, invite / settings / create / leave are hidden (Discover preview). */
  interactive?: boolean;
  roles?: { id: string; name: string; color: string | null }[];
  onInvite?: () => void;
  onSettings?: () => void;
  onCreateChannel?: () => void;
  onCreateCategory?: () => void;
  onViewAsRole?: (roleId: string) => void;
  onLeave?: () => void;
};

export function ServerHeaderMenu({
  serverName,
  interactive = true,
  roles = [],
  onInvite,
  onSettings,
  onCreateChannel,
  onCreateCategory,
  onViewAsRole,
  onLeave,
}: ServerHeaderMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(false);
    setViewAsOpen(false);
  }, [serverName, pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setViewAsOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setViewAsOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="messenger-header relative shrink-0 bg-[#2b2d31]">
      <div className="flex h-12 items-center gap-1 px-2">
        <HoverTip
          label={serverName}
          onlyIfTruncated
          delayMs={40}
          className="min-w-0 flex-1"
        >
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-black/20"
            aria-expanded={open}
            aria-haspopup="menu"
          >
            <span className="truncate text-[15px] font-semibold text-white">
              {serverName}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[#b5bac1] transition-transform duration-200 ${
                open ? "rotate-180" : "rotate-0"
              }`}
              strokeWidth={2}
            />
          </button>
        </HoverTip>
        {interactive && onInvite && (
          <HoverTip label="Invite People" delayMs={40}>
            <button
              type="button"
              onClick={onInvite}
              aria-label="Invite People"
              className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#b5bac1] transition-colors hover:bg-accent/15 hover:text-accent"
            >
              <UserPlus className="h-4 w-4" strokeWidth={2} />
            </button>
          </HoverTip>
        )}
      </div>

      {open && interactive && (
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
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#dbdee1] hover:bg-[#3a3c43] hover:text-white"
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
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#dbdee1] hover:bg-[#3a3c43] hover:text-white"
            >
              <FolderPlus className="h-4 w-4" strokeWidth={1.75} />
              Create Category
            </button>
          )}
          {onSettings && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSettings();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#dbdee1] hover:bg-[#3a3c43] hover:text-white"
            >
              <Settings className="h-4 w-4" strokeWidth={1.75} />
              Server Settings
            </button>
          )}
          {onViewAsRole && roles.length > 0 && (
            <div className="relative">
              <button
                type="button"
                role="menuitem"
                onClick={() => setViewAsOpen((value) => !value)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#dbdee1] hover:bg-[#3a3c43] hover:text-white"
              >
                <Eye className="h-4 w-4" strokeWidth={1.75} />
                View Server As Role
              </button>
              {viewAsOpen ? (
                <ul className="mx-2 mb-1 max-h-40 overflow-y-auto rounded-md border border-[#2b2d31] bg-[#1e1f22] py-1">
                  {roles.map((role) => (
                    <li key={role.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setViewAsOpen(false);
                          onViewAsRole(role.id);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#dbdee1] hover:bg-white/10"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: role.color || "#99aab5" }}
                        />
                        {role.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
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
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#ed4245] hover:bg-[#ed4245] hover:text-white"
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
