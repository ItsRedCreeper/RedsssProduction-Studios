"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Hash,
  Lock,
  MicOff,
  MonitorUp,
  Pencil,
  Plus,
  Video,
  Volume2,
} from "lucide-react";
import { ServerHeaderMenu } from "@/components/messenger/ServerHeaderMenu";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { byPosition } from "@/components/messenger/data";
import type {
  Category,
  Channel,
  MemberView,
  VoiceState,
} from "@/components/messenger/types";
import { useOptionalProfileUi } from "@/components/profile/ProfileProvider";
import { HoverTip } from "@/components/ui/HoverTip";
import { UnreadBadge } from "@/components/ui/UnreadBadge";
import { isPrivateChannel } from "@/lib/permissions";

type ChannelSidebarProps = {
  serverId: string;
  serverName: string;
  categories: Category[];
  channels: Channel[];
  activeChannelId: string | null;
  unreadChannelIds: Set<string>;
  unreadChannelCounts?: Record<string, number>;
  voiceStates: VoiceState[];
  membersById: Map<string, MemberView>;
  /** Speaking rings only apply when the viewer is connected to that voice channel. */
  speakingUserIds: ReadonlySet<string>;
  loading: boolean;
  canLeave: boolean;
  canManageChannels?: boolean;
  /** Discover preview: browse channels only. */
  previewMode?: boolean;
  connectedVoiceChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  /** Omit to hide invite UI (no Create Invites permission). */
  onInvite?: () => void;
  /** Omit to hide Server Settings (no management permission). */
  onSettings?: () => void;
  /** Omit to hide channel create controls (no Manage Channels). */
  onCreateChannel?: (options?: {
    type?: "text" | "voice";
    categoryId?: string | null;
  }) => void;
  onCreateCategory?: () => void;
  onRenameCategory?: (categoryId: string, name: string) => Promise<boolean>;
  /** Discord: Edit Channel (Manage Channels). */
  onEditChannel?: (channelId: string) => void;
  /** Discord: View Server As Role (Manage Roles / Admin). */
  viewAsRoles?: { id: string; name: string; color: string | null }[];
  onViewAsRole?: (roleId: string) => void;
  onLeave?: () => void;
  footer?: ReactNode;
};

function ChannelButton({
  channel,
  active,
  unread,
  unreadCount = 0,
  onClick,
  onEdit,
}: {
  channel: Channel;
  active: boolean;
  unread: boolean;
  unreadCount?: number;
  onClick: () => void;
  onEdit?: () => void;
}) {
  const voice = channel.type === "voice";
  const privateChannel = isPrivateChannel(channel.permission_overrides);
  const tip = channel.topic?.trim() || channel.name;
  return (
    <HoverTip
      label={tip}
      onlyIfTruncated
      side="right"
      delayMs={60}
      className="block w-full"
    >
      <button
        type="button"
        onClick={onClick}
        onContextMenu={
          onEdit
            ? (event) => {
                event.preventDefault();
                onEdit();
              }
            : undefined
        }
        className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[15px] transition-colors ${
          active
            ? "messenger-row-active text-white"
            : unread
              ? "font-semibold text-white hover:bg-white/5"
              : "text-[var(--ms-text-muted)] hover:bg-white/5 hover:text-[var(--ms-text)]"
        }`}
      >
        {voice ? (
          <Volume2
            className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-[var(--ms-text-muted)]"}`}
            strokeWidth={2}
          />
        ) : (
          <Hash
            className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-[var(--ms-text-muted)]"}`}
            strokeWidth={2.25}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{channel.name}</span>
        {privateChannel ? (
          <Lock
            className="h-3.5 w-3.5 shrink-0 opacity-60"
            strokeWidth={2}
            aria-label="Private"
          />
        ) : null}
        {unreadCount > 0 && !active ? (
          <UnreadBadge count={unreadCount} />
        ) : unread && !active ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: "#ed4245" }}
            aria-label="Unread"
          />
        ) : null}
      </button>
    </HoverTip>
  );
}

export function ChannelSidebar({
  serverId,
  serverName,
  categories,
  channels,
  activeChannelId,
  unreadChannelIds,
  unreadChannelCounts = {},
  voiceStates,
  membersById,
  speakingUserIds,
  loading,
  canLeave,
  canManageChannels = false,
  previewMode = false,
  connectedVoiceChannelId,
  onSelectChannel,
  onInvite,
  onSettings,
  onCreateChannel,
  onCreateCategory,
  onRenameCategory,
  onEditChannel,
  viewAsRoles,
  onViewAsRole,
  onLeave,
  footer,
}: ChannelSidebarProps) {
  const profileUi = useOptionalProfileUi();
  const storageKey = `redsss-collapsed-categories:${serverId}`;
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      setCollapsed(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
    } catch {
      setCollapsed([]);
    }
    setReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(storageKey, JSON.stringify(collapsed));
  }, [collapsed, ready, storageKey]);

  const categoryIds = useMemo(
    () => new Set(categories.map((category) => category.id)),
    [categories],
  );

  const grouped = useMemo(() => {
    const sortedCategories = [...categories].sort(byPosition);
    const groups = sortedCategories.map((category) => ({
      id: category.id,
      name: category.name,
      channels: channels
        .filter((channel) => channel.category_id === category.id)
        .sort(byPosition),
    }));
    const uncategorized = channels
      .filter(
        (channel) =>
          !channel.category_id || !categoryIds.has(channel.category_id),
      )
      .sort(byPosition);
    return { groups, uncategorized };
  }, [categories, categoryIds, channels]);

  function toggle(id: string) {
    setCollapsed((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function occupants(channelId: string) {
    // Discord: alphabetical by display name, stable (not join/speak order).
    return voiceStates
      .filter((state) => state.channel_id === channelId)
      .map((state) => {
        const member = membersById.get(state.user_id);
        return {
          user_id: state.user_id,
          username: member?.nickname || member?.username || "Unknown",
          avatar_url: member?.avatar_url ?? null,
          muted: state.muted || state.deafened,
          cameraOn: !!state.camera_on,
          screenOn: !!state.screen_on,
        };
      })
      .sort((a, b) =>
        a.username.localeCompare(b.username, undefined, { sensitivity: "base" }),
      );
  }

  async function commitRename(categoryId: string) {
    if (!onRenameCategory) {
      setEditingCategoryId(null);
      return;
    }
    const trimmed = editName.trim();
    const current = categories.find((category) => category.id === categoryId);
    if (!trimmed || !current || trimmed === current.name) {
      setEditingCategoryId(null);
      return;
    }
    setSavingRename(true);
    const ok = await onRenameCategory(categoryId, trimmed);
    setSavingRename(false);
    if (ok) setEditingCategoryId(null);
  }

  function renderChannel(channel: Channel) {
    const people = channel.type === "voice" ? occupants(channel.id) : [];
    const connectedHere = channel.id === connectedVoiceChannelId;
    return (
      <li key={channel.id}>
        <ChannelButton
          channel={channel}
          active={channel.id === activeChannelId || connectedHere}
          unread={
            channel.type === "text" &&
            ((unreadChannelCounts[channel.id] ?? 0) > 0 ||
              unreadChannelIds.has(channel.id))
          }
          unreadCount={
            channel.type === "text" ? unreadChannelCounts[channel.id] ?? 0 : 0
          }
          onClick={() => onSelectChannel(channel.id)}
          onEdit={
            onEditChannel ? () => onEditChannel(channel.id) : undefined
          }
        />
        {people.length > 0 && (
          <ul className="mb-1 ml-4 space-y-0.5">
            {people.map((person) => {
              // Green ring whenever someone is speaking — even if you are not connected.
              const speaking = speakingUserIds.has(person.user_id);
              return (
                <li key={person.user_id}>
                  <button
                    type="button"
                    onClick={(event) =>
                      void profileUi?.openSmallProfile(
                        person.user_id,
                        event.currentTarget,
                      )
                    }
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] text-[var(--ms-text-muted)] hover:bg-white/5 hover:text-[var(--ms-text)]"
                  >
                    <UserAvatar
                      username={person.username}
                      avatarUrl={person.avatar_url}
                      size="sm"
                      speaking={speaking}
                      className="!h-6 !w-6 !text-[10px]"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {person.username}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[var(--ms-text-muted)]">
                      {person.cameraOn && (
                        <Video className="h-3 w-3" strokeWidth={2} aria-label="Camera on" />
                      )}
                      {person.screenOn && (
                        <MonitorUp
                          className="h-3 w-3"
                          strokeWidth={2}
                          aria-label="Sharing screen"
                        />
                      )}
                      {person.muted && (
                        <MicOff className="h-3 w-3" strokeWidth={2} aria-label="Muted" />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  }

  const sections = [
    ...grouped.groups.map((group) => ({
      id: group.id,
      name: group.name,
      channels: group.channels,
      real: true as const,
    })),
    ...(grouped.uncategorized.length > 0
      ? [
          {
            id: "uncategorized",
            name: grouped.groups.length > 0 ? "Uncategorized" : "Channels",
            channels: grouped.uncategorized,
            real: false as const,
          },
        ]
      : []),
  ];

  return (
    <aside className="flex h-full w-full flex-col bg-[var(--ms-sidebar)]">
      <ServerHeaderMenu
        serverName={serverName}
        interactive={!previewMode}
        onInvite={previewMode ? undefined : onInvite}
        onSettings={previewMode ? undefined : onSettings}
        onCreateChannel={
          !previewMode && onCreateChannel
            ? () => onCreateChannel()
            : undefined
        }
        onCreateCategory={
          !previewMode && canManageChannels && onCreateCategory
            ? onCreateCategory
            : undefined
        }
        roles={viewAsRoles}
        onViewAsRole={
          !previewMode && onViewAsRole ? onViewAsRole : undefined
        }
        onLeave={!previewMode && canLeave ? onLeave : undefined}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <p className="px-2 text-xs text-[var(--ms-text-muted)]">Loading channels…</p>
        ) : sections.length === 0 ? (
          <div className="px-2">
            <p className="mb-3 text-xs text-[var(--ms-text-muted)]">No channels yet.</p>
            {!previewMode && (onCreateChannel || onCreateCategory) && (
              <div className="flex flex-wrap gap-2">
                {onCreateChannel && (
                  <button
                    type="button"
                    onClick={() => onCreateChannel({ type: "text" })}
                    className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    Create Channel
                  </button>
                )}
                {canManageChannels && onCreateCategory && (
                  <button
                    type="button"
                    onClick={onCreateCategory}
                    className="inline-flex items-center gap-1 rounded-md bg-[#3f4147] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#4e5058]"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    Create Category
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          sections.map((section) => {
            const isCollapsed = collapsed.includes(section.id);
            const preferredType = /voice/i.test(section.name) ? "voice" : "text";
            const editing = editingCategoryId === section.id;
            return (
              <section key={section.id} className="mb-3">
                <div className="group/category flex items-center gap-0.5">
                  {editing && section.real ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-1 px-0.5"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void commitRename(section.id);
                      }}
                    >
                      <input
                        autoFocus
                        value={editName}
                        disabled={savingRename}
                        onChange={(event) => setEditName(event.target.value)}
                        onBlur={() => void commitRename(section.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setEditingCategoryId(null);
                          }
                        }}
                        maxLength={40}
                        minLength={2}
                        className="min-w-0 flex-1 rounded-md border border-accent/40 bg-[var(--ms-border)] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white outline-none"
                      />
                    </form>
                  ) : (
                    <HoverTip
                      label={section.name}
                      onlyIfTruncated
                      delayMs={60}
                      className="min-w-0 flex-1"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(section.id)}
                        onDoubleClick={() => {
                          if (!section.real || !canManageChannels || !onRenameCategory) return;
                          setEditingCategoryId(section.id);
                          setEditName(section.name);
                        }}
                        className="flex w-full min-w-0 items-center gap-0.5 rounded-md px-0.5 py-1 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ms-text-muted)] hover:text-[var(--ms-text)]"
                        aria-expanded={!isCollapsed}
                      >
                        <ChevronDown
                          className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
                            isCollapsed ? "-rotate-90" : "rotate-0"
                          }`}
                          strokeWidth={2.5}
                        />
                        <span className="truncate">{section.name}</span>
                      </button>
                    </HoverTip>
                  )}
                  {section.real && canManageChannels && onRenameCategory && !editing && (
                    <HoverTip label="Edit Category" delayMs={40}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategoryId(section.id);
                          setEditName(section.name);
                        }}
                        className="rounded-md p-1 text-[var(--ms-text-muted)] opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover/category:opacity-100 focus:opacity-100"
                        aria-label={`Rename ${section.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </HoverTip>
                  )}
                  {!previewMode && onCreateChannel && (
                    <HoverTip label="Create Channel" delayMs={40}>
                      <button
                        type="button"
                        onClick={() =>
                          onCreateChannel({
                            type: preferredType,
                            categoryId:
                              section.id === "uncategorized" ? null : section.id,
                          })
                        }
                        className="rounded-md p-1 text-[var(--ms-text-muted)] opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover/category:opacity-100 focus:opacity-100"
                        aria-label={`Create channel in ${section.name}`}
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                      </button>
                    </HoverTip>
                  )}
                </div>
                {!isCollapsed && (
                  <ul className="mt-0.5 space-y-0.5">
                    {section.channels.length === 0 ? (
                      <li className="px-2 py-1 text-xs text-[var(--ms-text-faint)]">No channels</li>
                    ) : (
                      section.channels.map(renderChannel)
                    )}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>
      {footer}
    </aside>
  );
}
