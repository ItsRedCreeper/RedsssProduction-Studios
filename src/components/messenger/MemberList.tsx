"use client";

import { useEffect, useMemo, useState } from "react";
import { Crown } from "lucide-react";
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
  memberListHoistRole,
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
  /** People currently listed under this header. */
  members: MemberView[];
  /** Header count (online people in this section). */
  count: number;
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
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
    >
      <span className="relative shrink-0 overflow-visible">
        <UserAvatar
          username={displayName || "?"}
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
      <span className={`min-w-0 flex-1 ${online ? "" : "opacity-50"}`}>
        <span className="flex items-center gap-1.5">
          <span
            className="truncate text-sm"
            style={{ color: nameColor ?? "#dbdee1" }}
          >
            {displayName || "…"}
          </span>
          {owner && (
            <Crown
              className="h-3.5 w-3.5 shrink-0 text-[#f0b232]"
              strokeWidth={2}
              fill="currentColor"
              aria-label="Server owner"
            />
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
  // 30s is enough for stale dots and avoids regroup thrash on large servers.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 30_000);
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

    // Discord: only hoisted roles ("Display separately") get member-list
    // sections. A member appears under their highest hoisted role. Everyone
    // else is Online or Offline. Empty / all-offline hoist sections are hidden.
    const result: MemberGroup[] = [];
    const hoistedRoles = [...roles]
      .filter((role) => role.hoist)
      .sort(compareRolePositionDesc);
    const inHoistSection = new Set<string>();

    for (const role of hoistedRoles) {
      const belonging = members.filter((member) => {
        if (!isOnline(member)) return false;
        return memberListHoistRole(roles, member.roleIds)?.id === role.id;
      });
      if (belonging.length === 0) continue;
      for (const row of belonging) inHoistSection.add(row.user_id);
      const onlineInRole = sortMembers(belonging);
      result.push({
        key: role.id,
        title: role.name,
        members: onlineInRole,
        count: onlineInRole.length,
      });
    }

    const online = sortMembers(
      members.filter(
        (member) => isOnline(member) && !inHoistSection.has(member.user_id),
      ),
    );
    const offline = sortMembers(members.filter((member) => !isOnline(member)));
    if (online.length > 0) {
      result.push({
        key: "online",
        title: "Online",
        members: online,
        count: online.length,
      });
    }
    if (offline.length > 0) {
      result.push({
        key: "offline",
        title: "Offline",
        members: offline,
        count: offline.length,
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
        <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
          {group.title} — {group.count}
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
    <aside className={`flex w-60 shrink-0 flex-col bg-[var(--ms-sidebar)] ${className}`}>
      <div className="messenger-header flex h-11 shrink-0 items-center bg-[var(--ms-sidebar)] px-3 text-sm font-semibold text-white">
        Members
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {members.length === 0 ? (
          <p className="px-2 text-xs text-[var(--ms-text-faint)]">No members yet.</p>
        ) : (
          groups.map(renderGroup)
        )}
      </div>
    </aside>
  );
}
