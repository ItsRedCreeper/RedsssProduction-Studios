"use client";

import { useEffect, useMemo, useState } from "react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { isPresenceOnline } from "@/components/messenger/data";
import { StatusPresenceBadge } from "@/components/messenger/StatusPresenceBadge";
import type { MemberView, Role } from "@/components/messenger/types";
import { useOptionalProfileUi } from "@/components/profile/ProfileProvider";
import { PresenceCaption } from "@/components/presence/PresenceCaption";
import { useOptionalPresenceFeed } from "@/components/presence/PresenceFeed";
import { resolveDisplayStatus } from "@/lib/presence";
import {
  compareRolePositionDesc,
  memberListGroupRole,
  roleColorForMember,
} from "@/lib/roles";

type MemberListProps = {
  members: MemberView[];
  roles: Role[];
  ownerId: string | null;
  currentUserId: string | null;
  /** Users typing in the open channel — status badge becomes animated dots. */
  typingUserIds?: Set<string>;
  /** Forces re-render when typing membership changes. */
  typingUserIdsKey?: string;
  onMessage: (userId: string) => void;
  className?: string;
};

type MemberGroup = {
  key: string;
  title: string;
  members: MemberView[];
};

function MemberButton({
  member,
  owner,
  displayName,
  nameColor,
  online,
  typing,
  onClick,
}: {
  member: MemberView;
  owner: boolean;
  displayName: string;
  nameColor: string | null;
  online: boolean;
  typing: boolean;
  onClick: (element: HTMLButtonElement) => void;
}) {
  const feed = useOptionalPresenceFeed();
  const live = feed?.get(member.user_id);
  void feed?.version;
  return (
    <button
      type="button"
      onClick={(event) => onClick(event.currentTarget)}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5 ${
        online ? "" : "opacity-50"
      }`}
    >
      <span className="relative shrink-0 overflow-visible">
        <UserAvatar
          username={displayName}
          avatarUrl={member.avatar_url}
          size="sm"
          className="!h-8 !w-8"
        />
        <StatusPresenceBadge
          status={live?.status ?? member.status}
          lastSeenAt={live?.lastSeenAt ?? member.last_seen_at}
          typing={typing}
          ringClassName="ring-[#2b2d31]"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className="truncate text-sm"
            style={{ color: nameColor ?? "#dbdee1" }}
          >
            {displayName}
          </span>
          {owner && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-accent">
              Owner
            </span>
          )}
        </span>
        <PresenceCaption
          userId={member.user_id}
          status={member.status}
          lastSeenAt={member.last_seen_at}
          customStatus={member.status_text}
        />
      </span>
    </button>
  );
}

export function MemberList({
  members,
  roles,
  ownerId,
  currentUserId: _currentUserId,
  typingUserIds,
  typingUserIdsKey = "",
  onMessage: _onMessage,
  className = "",
}: MemberListProps) {
  void typingUserIdsKey;
  const profileUi = useOptionalProfileUi();
  const feed = useOptionalPresenceFeed();
  const feedVersion = feed?.version ?? 0;
  // Recompute online/offline as heartbeats go stale without a new render.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    feed?.watchMany(members.map((member) => member.user_id));
  }, [feed, members]);

  // Discord: friend nicknames do NOT appear in server member lists — only
  // server nicknames (or username / display name).
  const displayNameOf = (member: MemberView) =>
    member.nickname?.trim() || member.username;

  const groups = useMemo(() => {
    const now = Date.now();
    const statusOf = (member: MemberView) => {
      const live = feed?.get(member.user_id);
      return resolveDisplayStatus(
        live?.status ?? member.status,
        live?.lastSeenAt ?? member.last_seen_at,
        now,
      );
    };
    const isOnline = (member: MemberView) =>
      isPresenceOnline(statusOf(member));

    const sortMembers = (rows: MemberView[]) =>
      [...rows].sort((a, b) => {
        const aOnline = isOnline(a) ? 0 : 1;
        const bOnline = isOnline(b) ? 0 : 1;
        if (aOnline !== bOnline) return aOnline - bOnline;
        return displayNameOf(a).localeCompare(displayNameOf(b));
      });

    // Every role (including default Member) gets its own section when someone
    // has it as their highest role — no separate hoist flag.
    const result: MemberGroup[] = [];
    const orderedRoles = [...roles].sort(compareRolePositionDesc);
    const assigned = new Set<string>();

    for (const role of orderedRoles) {
      const rows = members.filter((member) => {
        const group = memberListGroupRole(roles, member.roleIds);
        return group?.id === role.id;
      });
      if (rows.length === 0) continue;
      for (const row of rows) assigned.add(row.user_id);
      result.push({
        key: role.id,
        title: role.name,
        members: sortMembers(rows),
      });
    }

    // Anyone somehow without a role still lands in Online / Offline.
    const remainder = members.filter((member) => !assigned.has(member.user_id));
    const online = sortMembers(remainder.filter(isOnline));
    const offline = sortMembers(remainder.filter((m) => !isOnline(m)));
    if (online.length > 0) {
      result.push({
        key: "online",
        title: "Online",
        members: online,
      });
    }
    if (offline.length > 0) {
      result.push({
        key: "offline",
        title: "Offline",
        members: offline,
      });
    }
    return result;
    // feedVersion/nowTick intentionally included for live + stale flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, roles, nowTick, feedVersion, feed]);

  function openPopover(member: MemberView, element: HTMLButtonElement) {
    void profileUi?.openSmallProfile(member.user_id, element);
  }

  function renderGroup(group: MemberGroup) {
    return (
      <section key={group.key} className="mb-3">
        <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
          {group.title} — {group.members.length}
        </p>
        <ul>
          {group.members.map((member) => {
            const now = Date.now();
            const live = feed?.get(member.user_id);
            const online = isPresenceOnline(
              resolveDisplayStatus(
                live?.status ?? member.status,
                live?.lastSeenAt ?? member.last_seen_at,
                now,
              ),
            );
            return (
              <li key={member.user_id}>
                <MemberButton
                  member={member}
                  displayName={displayNameOf(member)}
                  nameColor={roleColorForMember(roles, member.roleIds)}
                  owner={member.user_id === ownerId}
                  online={online}
                  typing={Boolean(typingUserIds?.has(member.user_id))}
                  onClick={(el) => openPopover(member, el)}
                />
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <aside className={`flex w-60 shrink-0 flex-col bg-[#2b2d31] ${className}`}>
      <div className="flex h-12 shrink-0 items-center border-b border-black/30 px-4 text-sm font-semibold text-white">
        Members
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {members.length === 0 ? (
          <p className="px-2 text-xs text-muted">No members loaded.</p>
        ) : (
          groups.map(renderGroup)
        )}
      </div>
    </aside>
  );
}
