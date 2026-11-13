"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Hash,
  MicOff,
  Pencil,
  Plus,
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

type ChannelSidebarProps = {
  serverId: string;
  serverName: string;
  categories: Category[];
  channels: Channel[];
  activeChannelId: string | null;
  unreadChannelIds: Set<string>;
  voiceStates: VoiceState[];
  membersById: Map<string, MemberView>;
  /** Speaking rings only apply when the viewer is connected to that voice channel. */
  speakingUserIds: ReadonlySet<string>;
  loading: boolean;
  canLeave: boolean;
  canManageChannels?: boolean;
  connectedVoiceChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onInvite: () => void;
  onSettings: () => void;
  onCreateChannel: (options?: {
    type?: "text" | "voice";
    categoryId?: string | null;
  }) => void;
  onCreateCategory?: () => void;
  onRenameCategory?: (categoryId: string, name: string) => Promise<boolean>;
  onLeave?: () => void;
  footer?: ReactNode;
};

function ChannelButton({
  channel,
  active,
  unread,
  onClick,
}: {
  channel: Channel;
  active: boolean;
  unread: boolean;
  onClick: () => void;
}) {
  const voice = channel.type === "voice";
  return (
    <button
      type="button"
      onClick={onClick}
      title={channel.topic ?? channel.name}
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[15px] transition-colors ${
        active
          ? "bg-[#404249] text-white"
          : unread
            ? "font-semibold text-white hover:bg-white/5"
            : "text-[#949ba4] hover:bg-white/5 hover:text-[#dbdee1]"
      }`}
    >
      {voice ? (
        <Volume2
          className={`h-4 w-4 shrink-0 ${active ? "text-accent" : "opacity-70"}`}
          strokeWidth={2}
        />
      ) : (
        <Hash className="h-4 w-4 shrink-0 opacity-70" strokeWidth={2.25} />
      )}
      <span className="min-w-0 flex-1 truncate">{channel.name}</span>
      {unread && !active && (
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
      )}
    </button>
  );
}

export function ChannelSidebar({
  serverId,
  serverName,
  categories,
  channels,
  activeChannelId,
  unreadChannelIds,
  voiceStates,
  membersById,
  speakingUserIds,
  loading,
  canLeave,
  canManageChannels = false,
  connectedVoiceChannelId,
  onSelectChannel,
  onInvite,
  onSettings,
  onCreateChannel,
  onCreateCategory,
  onRenameCategory,
  onLeave,
  footer,
}: ChannelSidebarProps) {
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
    return voiceStates
      .filter((state) => state.channel_id === channelId)
      .map((state) => {
        const member = membersById.get(state.user_id);
        return {
          user_id: state.user_id,
          username: member?.nickname || member?.username || "Unknown",
          avatar_url: member?.avatar_url ?? null,
          muted: state.muted || state.deafened,
        };
      });
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
          unread={channel.type === "text" && unreadChannelIds.has(channel.id)}
          onClick={() => onSelectChannel(channel.id)}
        />
        {people.length > 0 && (
          <ul className="mb-1 ml-4 space-y-0.5">
            {people.slice(0, 8).map((person) => {
              // Green speaking ring only if YOU are in this same voice channel.
              const speaking =
                connectedHere && speakingUserIds.has(person.user_id);
              return (
                <li
                  key={person.user_id}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-[#949ba4]"
                >
                  <UserAvatar
                    username={person.username}
                    avatarUrl={person.avatar_url}
                    size="sm"
                    speaking={speaking}
                    className="!h-6 !w-6 !text-[10px]"
                  />
                  <span className="min-w-0 flex-1 truncate">{person.username}</span>
                  {person.muted && <MicOff className="h-3 w-3 shrink-0" strokeWidth={2} />}
                </li>
              );
            })}
            {people.length > 8 && (
              <li className="px-2 text-[11px] text-muted">+{people.length - 8} more</li>
            )}
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
    <aside className="flex h-full w-full flex-col bg-[#2b2d31]">
      <ServerHeaderMenu
        serverName={serverName}
        onInvite={onInvite}
        onSettings={onSettings}
        onCreateChannel={() => onCreateChannel()}
        onCreateCategory={
          canManageChannels && onCreateCategory ? onCreateCategory : undefined
        }
        onLeave={canLeave ? onLeave : undefined}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {loading ? (
          <p className="px-2 text-xs text-muted">Loading channels…</p>
        ) : sections.length === 0 ? (
          <div className="px-2">
            <p className="mb-3 text-xs text-muted">No channels yet.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onCreateChannel({ type: "text" })}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Create Channel
              </button>
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
                        className="min-w-0 flex-1 rounded-md border border-accent/40 bg-[#1e1f22] px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white outline-none"
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggle(section.id)}
                      onDoubleClick={() => {
                        if (!section.real || !canManageChannels || !onRenameCategory) return;
                        setEditingCategoryId(section.id);
                        setEditName(section.name);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-0.5 rounded-md px-0.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-[#949ba4] hover:text-[#dbdee1]"
                      aria-expanded={!isCollapsed}
                      title={
                        section.real && canManageChannels
                          ? "Double-click to rename"
                          : undefined
                      }
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                      ) : (
                        <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                      )}
                      <span className="truncate">{section.name}</span>
                    </button>
                  )}
                  {section.real && canManageChannels && onRenameCategory && !editing && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategoryId(section.id);
                        setEditName(section.name);
                      }}
                      className="rounded-md p-1 text-[#949ba4] opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover/category:opacity-100 focus:opacity-100"
                      aria-label={`Rename ${section.name}`}
                      title="Edit Category"
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onCreateChannel({
                        type: preferredType,
                        categoryId:
                          section.id === "uncategorized" ? null : section.id,
                      })
                    }
                    className="rounded-md p-1 text-[#949ba4] opacity-0 transition-opacity hover:bg-white/10 hover:text-white group-hover/category:opacity-100 focus:opacity-100"
                    aria-label={`Create channel in ${section.name}`}
                    title="Create Channel"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                </div>
                {!isCollapsed && (
                  <ul className="mt-0.5 space-y-0.5">
                    {section.channels.length === 0 ? (
                      <li className="px-2 py-1 text-xs text-[#6d6f78]">No channels</li>
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
