"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  formatTimestamp,
  isPresenceOnline,
  statusDotClass,
  statusLabel,
} from "@/components/messenger/data";
import type { MemberView } from "@/components/messenger/types";

type MemberListProps = {
  members: MemberView[];
  ownerId: string | null;
  currentUserId: string | null;
  onMessage: (userId: string) => void;
  className?: string;
};

function MemberButton({
  member,
  owner,
  onClick,
}: {
  member: MemberView;
  owner: boolean;
  onClick: (element: HTMLButtonElement) => void;
}) {
  const name = member.nickname || member.username;
  return (
    <button
      type="button"
      onClick={(event) => onClick(event.currentTarget)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5"
    >
      <span className="relative shrink-0">
        <UserAvatar
          username={name}
          avatarUrl={member.avatar_url}
          size="sm"
          className="!h-8 !w-8"
        />
        <span
          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[#2b2d31] ${statusDotClass(member.status)}`}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm text-[#dbdee1]">{name}</span>
          {owner && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Owner
            </span>
          )}
        </span>
        <span className="block truncate text-[11px] text-[#6d6f78]">
          {statusLabel(member.status)}
        </span>
      </span>
    </button>
  );
}

export function MemberList({
  members,
  ownerId,
  currentUserId,
  onMessage,
  className = "",
}: MemberListProps) {
  const [popover, setPopover] = useState<{
    member: MemberView;
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!popover) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-profile-popover]")) return;
      setPopover(null);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [popover]);

  const { online, offline } = useMemo(() => {
    const sorted = [...members].sort((a, b) =>
      (a.nickname || a.username).localeCompare(b.nickname || b.username),
    );
    return {
      online: sorted.filter((member) => isPresenceOnline(member.status)),
      offline: sorted.filter((member) => !isPresenceOnline(member.status)),
    };
  }, [members]);

  function openPopover(member: MemberView, element: HTMLButtonElement) {
    if (popover?.member.user_id === member.user_id) {
      setPopover(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    const width = 260;
    let left = rect.left - width - 10;
    if (left < 8) left = Math.min(rect.right + 10, window.innerWidth - width - 8);
    let top = rect.top;
    if (top + 230 > window.innerHeight) top = Math.max(8, window.innerHeight - 238);
    setPopover({ member, top, left });
  }

  function renderGroup(title: string, rows: MemberView[]) {
    if (rows.length === 0) return null;
    return (
      <section className="mb-3">
        <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
          {title} — {rows.length}
        </p>
        <ul>
          {rows.map((member) => (
            <li key={member.user_id}>
              <MemberButton
                member={member}
                owner={member.user_id === ownerId}
                onClick={(element) => openPopover(member, element)}
              />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const selected = popover?.member;
  const selectedName = selected
    ? selected.nickname || selected.username
    : "";

  return (
    <aside className={`w-60 shrink-0 flex-col bg-[#2b2d31] ${className}`}>
      <div className="flex h-12 shrink-0 items-center border-b border-black/30 px-4 text-sm font-semibold text-white">
        Members
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {members.length === 0 ? (
          <p className="px-2 text-xs text-muted">No members loaded.</p>
        ) : (
          <>
            {renderGroup("Online", online)}
            {renderGroup("Offline", offline)}
          </>
        )}
      </div>

      {popover && selected && (
        <div
          data-profile-popover
          className="fixed z-40 w-[260px] rounded-md border border-[#1e1f22] bg-[#111214] p-3 shadow-xl shadow-black/50"
          style={{ top: popover.top, left: popover.left }}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="relative">
                <UserAvatar
                  username={selectedName}
                  avatarUrl={selected.avatar_url}
                  size="lg"
                />
                <span
                  className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-[#111214] ${statusDotClass(selected.status)}`}
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {selectedName}
                </p>
                <p className="truncate text-xs text-[#949ba4]">
                  {statusLabel(selected.status)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPopover(null)}
              className="rounded-md p-1 text-muted hover:bg-white/10 hover:text-white"
              aria-label="Close profile"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          {selected.status_text && (
            <p className="mb-2 text-sm text-[#dbdee1]">{selected.status_text}</p>
          )}
          <p className="mb-3 text-[11px] text-[#6d6f78]">
            Joined {formatTimestamp(selected.joined_at)}
          </p>
          {selected.user_id === currentUserId ? (
            <p className="text-xs text-muted">This is you.</p>
          ) : (
            <button
              type="button"
              onClick={() => {
                onMessage(selected.user_id);
                setPopover(null);
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
              Message
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
