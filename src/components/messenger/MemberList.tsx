"use client";

import { useMemo } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  isPresenceOnline,
  statusDotClass,
  statusLabel,
} from "@/components/messenger/data";
import type { MemberView } from "@/components/messenger/types";
import { useOptionalProfileUi } from "@/components/profile/ProfileProvider";

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
  currentUserId: _currentUserId,
  onMessage: _onMessage,
  className = "",
}: MemberListProps) {
  const profileUi = useOptionalProfileUi();

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
    void profileUi?.openSmallProfile(member.user_id, element);
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
    </aside>
  );
}
