"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Hash, MessagesSquare, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import {
  isMessengerHomeId,
  messengerChannelPath,
  messengerDiscoverPath,
  messengerDmPath,
  messengerHomePath,
  messengerServerPath,
  messengerServerPreviewPath,
  recallServerChannel,
  rememberMessengerPath,
  rememberServerChannel,
  withPreviewQuery,
} from "@/lib/messenger-routes";
import { CreateServerModal } from "@/components/messenger/CreateServerModal";
import { CreateChannelModal } from "@/components/messenger/CreateChannelModal";
import { EditChannelModal } from "@/components/messenger/EditChannelModal";
import { ForwardMessageModal } from "@/components/messenger/ForwardMessageModal";
import { CreateGroupDmModal } from "@/components/messenger/CreateGroupDmModal";
import { CreatePollModal } from "@/components/messenger/CreatePollModal";
import { CreateCategoryModal } from "@/components/messenger/CreateCategoryModal";
import { expandSlashCommand } from "@/lib/slash-commands";
import { findAutomodHit, type AutomodRule } from "@/lib/automod";
import { InvitePeopleModal } from "@/components/messenger/InvitePeopleModal";
import { ServerRail } from "@/components/messenger/ServerRail";
import { ChannelSidebar } from "@/components/messenger/ChannelSidebar";
import { HomeSidebar } from "@/components/messenger/HomeSidebar";
import { DiscoverPane } from "@/components/messenger/DiscoverPane";
import { ChannelHeader } from "@/components/messenger/ChannelHeader";
import { ChatTimeline } from "@/components/messenger/ChatTimeline";
import {
  MessageComposer,
  type MentionSuggestion,
  type PendingAttachment,
} from "@/components/messenger/MessageComposer";
import type { GifResult } from "@/components/messenger/GifPicker";
import type { TypingPerson } from "@/components/messenger/TypingIndicator";
import { MemberList } from "@/components/messenger/MemberList";
import { VoicePane } from "@/components/messenger/VoicePane";
import { VoiceConnectionBar } from "@/components/messenger/VoiceConnectionBar";
import { CallOverlay } from "@/components/messenger/CallOverlay";
import { ResizableSidebar } from "@/components/messenger/ResizableSidebar";
import { ServerHeaderMenu } from "@/components/messenger/ServerHeaderMenu";
import { ServerSettingsModal } from "@/components/messenger/ServerSettingsModal";
import {
  useVoiceSession,
  VOICE_STALE_AFTER_MS,
} from "@/components/messenger/voice/VoiceSessionProvider";
import { useCallSession } from "@/components/messenger/voice/CallSessionProvider";
import { useMessengerSidebarWidth } from "@/hooks/useMessengerSidebarWidth";
import {
  useVoiceChatSidebarWidth,
  VOICE_CHAT_MAX,
  VOICE_CHAT_MIN,
} from "@/hooks/useVoiceChatSidebarWidth";
import { useOptionalProfileUi } from "@/components/profile/ProfileProvider";
import { ActivityTracker } from "@/components/messenger/ActivityTracker";
import {
  CHANNEL_MESSAGE_PAGE_SIZE,
  dmRowsToMessages,
  fetchLastMessageMap,
  groupReactions,
  hydrateMessages,
  loadChannelMessages,
  loadOlderChannelMessages,
  loadOlderDmMessages,
  loadProfiles,
  loadPublicChannelMessages,
  loadPublicServerPreview,
  loadSingleMessage,
  saveChannelRead,
  uploadAttachment,
  upsertReaction,
} from "@/components/messenger/data";
import {
  fitImageToMaxBytes,
  MESSAGE_ATTACHMENT_MAX_BYTES,
} from "@/lib/compress-image";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type MessageAttachment,
} from "@/lib/message-media";
import { resolveEmojiShortcodes, type ServerEmoji } from "@/lib/emoji";
import { MESSAGE_MAX, MESSAGE_MAX_REACHED } from "@/lib/field-limits";
import {
  can,
  canAccessServerSettings,
  mergeRolePermissions,
  PERMISSIONS,
} from "@/lib/permissions";
import { roleColorForMember } from "@/lib/roles";
import {
  displayMentionText,
  encodeMentions,
  type MentionMaps,
} from "@/lib/mentions";
import {
  friendlyBlockDmMessage,
  loadIsBlockedBy,
} from "@/lib/blocking";
import {
  loadFriendEdges,
  splitFriendEdges,
  subscribeDmInboxChanged,
} from "@/lib/friends";
import type { Tables } from "@/lib/supabase/database.types";
import type {
  Category,
  Channel,
  ChatMessage,
  DmThread,
  MemberView,
  Reaction,
  Role,
  Server,
  SettingsTab,
  VoiceState,
} from "@/components/messenger/types";

const EMPTY_BLOCKED_IDS: string[] = [];

function mergeIncoming(prev: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  if (prev.some((message) => message.id === incoming.id)) {
    return prev.map((message) =>
      message.id === incoming.id
        ? { ...incoming, optimistic: false, failed: false }
        : message,
    );
  }
  const optimisticIndex = prev.findIndex(
    (message) =>
      message.optimistic &&
      message.user_id === incoming.user_id &&
      message.content === incoming.content,
  );
  if (optimisticIndex >= 0) {
    const copy = [...prev];
    copy[optimisticIndex] = { ...incoming, optimistic: false, failed: false };
    return copy;
  }
  return [...prev, incoming];
}

/** Most recent activity first. Active typers float above everyone else. */
function compareDmThreads(
  a: DmThread,
  b: DmThread,
  typingUserIds?: Set<string>,
): number {
  const aTyping = typingUserIds?.has(a.otherUserId) ? 1 : 0;
  const bTyping = typingUserIds?.has(b.otherUserId) ? 1 : 0;
  if (aTyping !== bTyping) return bTyping - aTyping;
  const left = a.previewAt ? Date.parse(a.previewAt) : 0;
  const right = b.previewAt ? Date.parse(b.previewAt) : 0;
  return right - left || a.username.localeCompare(b.username);
}

function routeParam(value: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function messengerIdsFromPath(pathname: string): {
  serverId: string | null;
  channelId: string | null;
} {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "messenger" || parts[1] !== "channels") {
    return { serverId: null, channelId: null };
  }
  return {
    serverId: routeParam(parts[2]),
    channelId: routeParam(parts[3]),
  };
}

function pickFallbackChannel(channels: Channel[], serverId: string): Channel | null {
  const recalledId = recallServerChannel(serverId);
  const recalled = recalledId
    ? channels.find((channel) => channel.id === recalledId)
    : undefined;
  // Prefer text so opening a server does not auto-drop you into voice.
  if (recalled?.type === "text") return recalled;
  return (
    channels.find((channel) => channel.type === "text") ??
    recalled ??
    channels[0] ??
    null
  );
}

export function MessengerShell({ discover = false }: { discover?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ serverId?: string; channelId?: string }>();
  const searchParams = useSearchParams();
  const dmParam = searchParams.get("dm");
  const wantsPreview = searchParams.get("preview") === "1";
  const { user, profile, loading: authLoading } = useCurrentProfile();
  const profileUi = useOptionalProfileUi();
  const blockedIds = profileUi?.blockedIds ?? EMPTY_BLOCKED_IDS;
  const ignoredIds = profileUi?.ignoredIds ?? EMPTY_BLOCKED_IDS;
  const isBlocked = useCallback(
    (userId: string | null | undefined) =>
      !!userId && blockedIds.includes(userId),
    [blockedIds],
  );
  const isIgnored = useCallback(
    (userId: string | null | undefined) =>
      !!userId && ignoredIds.includes(userId),
    [ignoredIds],
  );
  /** Block or ignore — hide messages / typing / notifications content. */
  const isMessageHidden = useCallback(
    (userId: string | null | undefined) =>
      isBlocked(userId) || isIgnored(userId),
    [isBlocked, isIgnored],
  );
  const voice = useVoiceSession();
  const call = useCallSession();
  const watchConversation = call.watchConversation;

  const pathIds = discover
    ? { serverId: null, channelId: null }
    : messengerIdsFromPath(pathname);
  const routeServerId = discover
    ? null
    : (routeParam(params.serverId) ?? pathIds.serverId);
  const routeChannelId = discover
    ? null
    : (routeParam(params.channelId) ?? pathIds.channelId);
  const pane = discover
    ? "discover"
    : isMessengerHomeId(routeServerId) || !routeServerId
      ? "home"
      : "server";
  const activeServerId = pane === "server" ? routeServerId : null;
  const activeChannelId = pane === "server" ? routeChannelId : null;
  const activeConversationId = pane === "home" ? routeChannelId : null;

  const [servers, setServers] = useState<Server[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [serverRoles, setServerRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<MemberView[]>([]);
  const [typingUsers, setTypingUsers] = useState<
    Record<string, { until: number; username: string; avatarUrl: string | null }>
  >({});
  /** Typing across all DM threads for the sidebar (even when that DM isn't open). */
  const [inboxTypingUsers, setInboxTypingUsers] = useState<
    Record<string, { until: number; username: string; avatarUrl: string | null }>
  >({});
  /** Discord shows your own typing dots on the server member list. */
  const [selfTyping, setSelfTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dmMessages, setDmMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [threads, setThreads] = useState<DmThread[]>([]);
  const [voiceStates, setVoiceStates] = useState<VoiceState[]>([]);
  const [readAt, setReadAt] = useState<Record<string, string>>({});
  const [lastMessageAt, setLastMessageAt] = useState<Record<string, string>>({});
  const [channelServerMap, setChannelServerMap] = useState<Record<string, string>>({});
  const [pinnedExtra, setPinnedExtra] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [replyPing, setReplyPing] = useState(true);
  const lastChannelSendAt = useRef<Record<string, number>>({});
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);
  const [groupDmOpen, setGroupDmOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [channelThreads, setChannelThreads] = useState<
    import("@/components/messenger/types").ChannelThread[]
  >([]);
  const [viewAsRoleId, setViewAsRoleId] = useState<string | null>(null);
  const [automodRules, setAutomodRules] = useState<AutomodRule[]>([]);
  const [pollVotesByMessage, setPollVotesByMessage] = useState<
    Record<string, { user_id: string; option_index: number }[]>
  >({});
  const [friendsForGroup, setFriendsForGroup] = useState<
    import("@/components/messenger/types").FriendEntry[]
  >([]);
  const [serverStickers, setServerStickers] = useState<
    { id: string; name: string; url: string }[]
  >([]);
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const [customEmojis, setCustomEmojis] = useState<ServerEmoji[]>([]);
  const [sending, setSending] = useState(false);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState<"text" | "voice">("text");
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | null>(null);
  const [editChannelId, setEditChannelId] = useState<string | null>(null);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : true,
  );
  /** Discord-style voice channel chat; closed by default. */
  const [voiceChatOpen, setVoiceChatOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pinsOpen, setPinsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("overview");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [loadingServers, setLoadingServers] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadedServerId, setLoadedServerId] = useState<string | null>(null);
  /** Public server chrome while Discover preview (?preview=1) is active. */
  const [previewServer, setPreviewServer] = useState<Server | null>(null);
  const [joiningPreview, setJoiningPreview] = useState(false);
  const [loadingChannelMessages, setLoadingChannelMessages] = useState(false);
  const [loadingDmMessages, setLoadingDmMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [channelHasMore, setChannelHasMore] = useState(false);
  const [dmHasMore, setDmHasMore] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const pinsButtonRef = useRef<HTMLButtonElement>(null);
  const pinsPanelRef = useRef<HTMLDivElement>(null);
  const [pinsAnchor, setPinsAnchor] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const paneRef = useRef(pane);
  const routeServerRef = useRef(routeServerId);
  const activeChannelRef = useRef(activeChannelId);
  const conversationRef = useRef(activeConversationId);
  const userIdRef = useRef<string | null>(user?.id ?? null);
  const channelIdsRef = useRef<Set<string>>(new Set());
  const messageIdsRef = useRef<Set<string>>(new Set());
  const dmLocks = useRef(new Map<string, Promise<string | null>>());
  const serversRequest = useRef(0);
  const messagesRequest = useRef(0);
  const messagesChannelRef = useRef<string | null>(null);
  const typingChannelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingWantedRef = useRef(false);
  const blockedIdsRef = useRef(blockedIds);
  const ignoredIdsRef = useRef(ignoredIds);
  blockedIdsRef.current = blockedIds;
  ignoredIdsRef.current = ignoredIds;

  paneRef.current = pane;
  routeServerRef.current = routeServerId;
  activeChannelRef.current = activeChannelId;
  conversationRef.current = activeConversationId;
  userIdRef.current = user?.id ?? null;
  channelIdsRef.current = new Set(channels.map((channel) => channel.id));
  messageIdsRef.current = new Set([
    ...messages.map((message) => message.id),
    ...dmMessages.map((message) => message.id),
  ]);

  const isMemberOfActiveServer =
    !!activeServerId && servers.some((server) => server.id === activeServerId);
  /**
   * Look-only mode for public servers you haven't joined yet.
   * While membership is still loading, treat ?preview=1 as preview so we don't
   * kick non-members home or hit member-only RLS loads.
   */
  const previewMode =
    wantsPreview &&
    pane === "server" &&
    !!activeServerId &&
    (loadingServers || !isMemberOfActiveServer);
  const previewModeRef = useRef(previewMode);
  previewModeRef.current = previewMode;
  /** Ready to fetch preview chrome (auth + membership known, not a member). */
  const previewLoadReady =
    !!user &&
    wantsPreview &&
    pane === "server" &&
    !!activeServerId &&
    !loadingServers &&
    !isMemberOfActiveServer;
  const activeServer =
    servers.find((server) => server.id === activeServerId) ??
    (previewMode && previewServer?.id === activeServerId ? previewServer : null);
  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? null;
  const activeThread =
    threads.find((thread) => thread.id === activeConversationId) ?? null;
  const dmBlocked =
    !!activeThread && isBlocked(activeThread.otherUserId);
  const [dmBlockedByThem, setDmBlockedByThem] = useState(false);
  const dmOtherId = activeThread?.otherUserId ?? null;
  const textMode = pane === "server" && activeChannel?.type === "text";
  const voiceMode = pane === "server" && activeChannel?.type === "voice";
  const dmMode = pane === "home" && !!activeConversationId;

  // Voice channels use chat (not the member list); close chat when leaving voice.
  useEffect(() => {
    if (!voiceMode) setVoiceChatOpen(false);
  }, [voiceMode, activeChannelId]);
  const homeEmpty = pane === "home" && !activeConversationId;
  const discoverMode = discover || pane === "discover";
  const needsSignIn = !user && (!authLoading || authTimedOut);
  const channelPending =
    pane === "server" &&
    !!user &&
    !!activeServerId &&
    (loadingChannels || loadedServerId !== activeServerId);
  const connection = voice.connection;
  const muted = voice.muted;
  const deafened = voice.deafened;
  const displayName = profile?.username ?? "You";

  useEffect(() => {
    watchConversation(dmMode ? activeConversationId : null);
  }, [dmMode, activeConversationId, watchConversation]);

  const refreshOpenCalls = call.refreshOpenCalls;
  useEffect(() => {
    const ids = threads.map((thread) => thread.id);
    void refreshOpenCalls(ids);
  }, [threads, refreshOpenCalls]);
  const { width: sidebarWidth, beginResize } = useMessengerSidebarWidth();
  const {
    width: voiceChatWidth,
    beginResize: beginVoiceChatResize,
  } = useVoiceChatSidebarWidth();
  const connectedHere =
    !!connection &&
    !!activeChannel &&
    connection.channelId === activeChannel.id;
  const displayVoiceStates = useMemo(() => {
    const now = Date.now();
    const fresh = voiceStates.filter((state) => {
      // Keep your own seat while connected even between heartbeats.
      if (user && connection && state.user_id === user.id) return true;
      const age = now - new Date(state.updated_at).getTime();
      return !Number.isFinite(age) || age <= VOICE_STALE_AFTER_MS;
    });
    if (!user || !connection || connection.serverId !== activeServerId) {
      return fresh;
    }
    const selfRow: VoiceState = {
      user_id: user.id,
      channel_id: connection.channelId,
      server_id: connection.serverId,
      muted,
      deafened,
      updated_at: new Date().toISOString(),
    };
    // Update mute/deafen in place — don't shove self to the end (that caused list jumping).
    const hasSelf = fresh.some((state) => state.user_id === user.id);
    if (hasSelf) {
      return fresh.map((state) =>
        state.user_id === user.id ? selfRow : state,
      );
    }
    return [...fresh, selfRow];
  }, [voiceStates, user, connection, activeServerId, muted, deafened]);

  const scope = `${pane}:${activeChannelId ?? ""}:${activeConversationId ?? ""}`;
  const scopeRef = useRef(scope);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!dmMode || !dmOtherId || dmBlocked) {
      setDmBlockedByThem(false);
      return;
    }
    let cancelled = false;
    void loadIsBlockedBy(dmOtherId).then(({ blockedByThem }) => {
      if (!cancelled) setDmBlockedByThem(blockedByThem);
    });
    return () => {
      cancelled = true;
    };
  }, [dmMode, dmOtherId, dmBlocked]);

  useEffect(() => {
    rememberMessengerPath(pathname);
  }, [pathname]);

  useEffect(() => {
    setMobileListOpen(false);
  }, [pathname, activeChannelId, activeConversationId]);

  useEffect(() => {
    if (!authLoading) {
      setAuthTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setAuthTimedOut(true), 4000);
    return () => window.clearTimeout(timer);
  }, [authLoading]);

  useEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    setDraft("");
    setReplyTo(null);
    setPendingFiles((prev) => {
      for (const item of prev) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      return [];
    });
    setSearchQuery("");
    setPinsOpen(false);
    setPinnedExtra([]);
  }, [scope]);

  const loadServers = useCallback(async () => {
    if (!user) {
      setServers([]);
      setLoadingServers(false);
      return;
    }
    const request = ++serversRequest.current;
    setLoadingServers(true);
    const supabase = createClient();
    const { data: memberships, error: memberError } = await supabase
      .from("server_members")
      .select("server_id")
      .eq("user_id", user.id);

    if (serversRequest.current !== request) return;
    if (memberError) {
      setError(memberError.message);
      setServers([]);
      setLoadingServers(false);
      return;
    }

    const serverIds = (memberships ?? []).map((row) => row.server_id);
    const previewInUrl =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("preview") === "1";
    if (serverIds.length === 0) {
      setServers([]);
      setLoadingServers(false);
      // Discover preview uses the real server URL without membership.
      if (
        paneRef.current === "server" &&
        !previewModeRef.current &&
        !previewInUrl
      ) {
        router.replace(messengerHomePath());
      }
      return;
    }

    const { data, error: serversError } = await supabase
      .from("servers")
      .select("*")
      .in("id", serverIds)
      .order("created_at", { ascending: true });

    if (serversRequest.current !== request) return;
    if (serversError) {
      setError(serversError.message);
      setServers([]);
    } else {
      const next = data ?? [];
      setServers(next);
      if (
        paneRef.current === "server" &&
        routeServerRef.current &&
        !next.some((server) => server.id === routeServerRef.current) &&
        !previewModeRef.current &&
        !previewInUrl
      ) {
        router.replace(messengerHomePath());
      }
    }
    setLoadingServers(false);
  }, [user, router]);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const loadCustomEmojis = useCallback(async () => {
    if (!user) {
      setCustomEmojis([]);
      return;
    }
    const supabase = createClient();
    const { data: memberships } = await supabase
      .from("server_members")
      .select("server_id")
      .eq("user_id", user.id);
    const serverIds = (memberships ?? []).map((row) => row.server_id);
    if (serverIds.length === 0) {
      setCustomEmojis([]);
      return;
    }
    const { data, error: emojiError } = await supabase
      .from("server_emojis")
      .select("*")
      .in("server_id", serverIds)
      .order("name", { ascending: true });
    if (emojiError) {
      setCustomEmojis([]);
      return;
    }
    setCustomEmojis((data as ServerEmoji[]) ?? []);
  }, [user]);

  useEffect(() => {
    void loadCustomEmojis();
  }, [loadCustomEmojis, servers]);

  const refreshThreads = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user) {
      setThreads([]);
      setLoadingThreads(false);
      return;
    }
    const silent = opts?.silent === true;
    // Only flash "Loading…" on the first/empty load — never when updating previews.
    if (!silent) setLoadingThreads(true);
    try {
      const supabase = createClient();
      const { data: mine, error: mineError } = await supabase
        .from("dm_participants")
        .select("conversation_id, hidden")
        .eq("user_id", user.id)
        .eq("hidden", false);
      if (mineError) {
        setError(mineError.message);
        if (!silent) setThreads([]);
        return;
      }
      const ids = (mine ?? []).map((row) => row.conversation_id);
      if (ids.length === 0) {
        setThreads([]);
        return;
      }
      const { data: parts, error: partsError } = await supabase
        .from("dm_participants")
        .select("*")
        .in("conversation_id", ids);
      if (partsError || !parts) {
        if (partsError) setError(partsError.message);
        return;
      }
      const { data: convos } = await supabase
        .from("dm_conversations")
        .select("id, name, is_group")
        .in("id", ids);
      const convoById = new Map((convos ?? []).map((row) => [row.id, row]));
      const others = parts.filter((row) => row.user_id !== user.id);
      const profiles = await loadProfiles(others.map((row) => row.user_id));
      const profileMap = new Map(profiles.map((item) => [item.id, item]));
      const byConvo = new Map<string, typeof others>();
      for (const part of others) {
        const list = byConvo.get(part.conversation_id) ?? [];
        list.push(part);
        byConvo.set(part.conversation_id, list);
      }
      const lastRows = await Promise.all(
        ids.map(async (conversationId) => {
          const { data: last } = await supabase
            .from("dm_messages")
            .select("content, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return [conversationId, last] as const;
        }),
      );
      const lastByConvo = new Map(lastRows);
      const fetched = ids.map((conversationId) => {
        const convo = convoById.get(conversationId);
        const participants = byConvo.get(conversationId) ?? [];
        const last = lastByConvo.get(conversationId) ?? null;
        if (convo?.is_group) {
          const names = participants
            .map((part) => profileMap.get(part.user_id)?.username ?? "Unknown")
            .filter(Boolean);
          const label =
            convo.name?.trim() ||
            names.slice(0, 3).join(", ") ||
            "Group DM";
          const first = participants[0];
          const firstProfile = first ? profileMap.get(first.user_id) : null;
          return {
            id: conversationId,
            otherUserId: first?.user_id ?? conversationId,
            username: label,
            avatar_url: firstProfile?.avatar_url ?? null,
            status: "offline",
            last_seen_at: null,
            status_text: null,
            preview: last?.content ?? null,
            previewAt: last?.created_at ?? null,
            isGroup: true,
            groupName: convo.name,
            participantIds: participants.map((part) => part.user_id),
          } satisfies DmThread;
        }
        const part = participants[0];
        const other = part ? profileMap.get(part.user_id) : null;
        return {
          id: conversationId,
          otherUserId: part?.user_id ?? conversationId,
          username: other?.username ?? "Unknown",
          avatar_url: other?.avatar_url ?? null,
          status: other?.status ?? "offline",
          last_seen_at: other?.last_seen_at ?? null,
          status_text: other?.status_text ?? null,
          preview: last?.content ?? null,
          previewAt: last?.created_at ?? null,
          isGroup: false,
        } satisfies DmThread;
      });
      fetched.sort((a, b) => compareDmThreads(a, b));
      // Reuse prior thread objects when unchanged so the sidebar doesn't remount rows.
      setThreads((prev) => {
        const prevById = new Map(prev.map((thread) => [thread.id, thread]));
        return fetched.map((thread) => {
          const old = prevById.get(thread.id);
          if (
            old &&
            old.otherUserId === thread.otherUserId &&
            old.username === thread.username &&
            old.avatar_url === thread.avatar_url &&
            old.preview === thread.preview &&
            old.previewAt === thread.previewAt &&
            old.status === thread.status &&
            old.last_seen_at === thread.last_seen_at &&
            old.status_text === thread.status_text &&
            old.isGroup === thread.isGroup &&
            old.groupName === thread.groupName
          ) {
            return old;
          }
          // Keep live presence fields from the existing row when only preview changed.
          if (old && old.otherUserId === thread.otherUserId && !thread.isGroup) {
            return {
              ...thread,
              status: old.status,
              last_seen_at: old.last_seen_at,
              status_text: old.status_text,
              username: old.username || thread.username,
              avatar_url: old.avatar_url ?? thread.avatar_url,
            };
          }
          return thread;
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load DMs");
    } finally {
      if (!silent) setLoadingThreads(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setThreads([]);
      setLoadingThreads(false);
      return;
    }
    void refreshThreads();
  }, [user, refreshThreads]);

  // Keep the DM list live without remounting people on every message.
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();

    function patchThreadPreview(row: {
      conversation_id?: string;
      content?: string | null;
      created_at?: string | null;
    }) {
      const conversationId = row.conversation_id;
      if (!conversationId) return;
      let known = false;
      setThreads((prev) => {
        known = prev.some((thread) => thread.id === conversationId);
        if (!known) return prev;
        const nextPreview = row.content ?? null;
        const nextAt = row.created_at ?? null;
        // Skip if this insert is already reflected (e.g. local send patched first).
        const current = prev.find((thread) => thread.id === conversationId);
        if (
          current &&
          current.preview === nextPreview &&
          current.previewAt === nextAt
        ) {
          return prev;
        }
        return prev
          .map((thread) =>
            thread.id === conversationId
              ? {
                  ...thread,
                  preview: nextPreview ?? thread.preview,
                  previewAt: nextAt ?? thread.previewAt,
                }
              : thread,
          )
          .sort((a, b) => compareDmThreads(a, b));
      });
      // Hidden / new conversation: pull the full inbox quietly.
      if (!known) {
        void refreshThreads({ silent: true });
      }
    }

    const channel = supabase
      .channel(`dm-inbox:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_messages" },
        (payload) => {
          patchThreadPreview(
            payload.new as {
              conversation_id?: string;
              content?: string | null;
              created_at?: string | null;
            },
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dm_participants",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void refreshThreads({ silent: true });
        },
      )
      .subscribe();
    const unsubLocal = subscribeDmInboxChanged(() => {
      void refreshThreads({ silent: true });
    });
    return () => {
      unsubLocal();
      void supabase.removeChannel(channel);
    };
  }, [user, refreshThreads]);

  const openDm = useCallback(
    async (otherUserId: string) => {
      if (!user || otherUserId === user.id) return null;
      if (isBlocked(otherUserId)) {
        setError("You blocked this user. Unblock them to send messages.");
        return null;
      }
      const { blockedByThem } = await loadIsBlockedBy(otherUserId);
      if (blockedByThem) {
        setError("This user has blocked you.");
        return null;
      }
      const existing = dmLocks.current.get(otherUserId);
      if (existing) return existing;

      const promise = (async () => {
        const supabase = createClient();
        const { data: mine, error: mineError } = await supabase
          .from("dm_participants")
          .select("conversation_id, hidden")
          .eq("user_id", user.id);
        if (mineError) {
          setError(mineError.message);
          return null;
        }
        const mineIds = new Set((mine ?? []).map((row) => row.conversation_id));
        const { data: theirs, error: theirsError } = await supabase
          .from("dm_participants")
          .select("conversation_id")
          .eq("user_id", otherUserId);
        if (theirsError) {
          setError(theirsError.message);
          return null;
        }
        const match = (theirs ?? []).find((row) => mineIds.has(row.conversation_id));
        if (match) {
          // Re-open if this DM was closed (hidden) on our side.
          await supabase
            .from("dm_participants")
            .update({ hidden: false })
            .eq("conversation_id", match.conversation_id)
            .eq("user_id", user.id);
          await refreshThreads();
          return match.conversation_id;
        }

        const { data: convo, error: convoError } = await supabase
          .from("dm_conversations")
          .insert({})
          .select("*")
          .single();
        if (convoError || !convo) {
          setError(
            friendlyBlockDmMessage(convoError?.message) ??
              convoError?.message ??
              "Could not start a conversation.",
          );
          return null;
        }
        const { error: selfPartError } = await supabase.from("dm_participants").insert({
          conversation_id: convo.id,
          user_id: user.id,
        });
        if (selfPartError) {
          setError(
            friendlyBlockDmMessage(selfPartError.message) ?? selfPartError.message,
          );
          return null;
        }
        const { error: otherPartError } = await supabase.from("dm_participants").insert({
          conversation_id: convo.id,
          user_id: otherUserId,
        });
        if (otherPartError) {
          setError(
            friendlyBlockDmMessage(otherPartError.message) ??
              otherPartError.message,
          );
          return null;
        }
        await refreshThreads();
        return convo.id;
      })().finally(() => {
        dmLocks.current.delete(otherUserId);
      });

      dmLocks.current.set(otherUserId, promise);
      return promise;
    },
    [user, refreshThreads, isBlocked],
  );

  useEffect(() => {
    if (!user || !dmParam || pane !== "home") return;
    let cancelled = false;
    void openDm(dmParam).then((id) => {
      if (!cancelled && id) router.replace(messengerDmPath(id));
    });
    return () => {
      cancelled = true;
    };
  }, [user, dmParam, pane, openDm, router]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    void supabase
      .from("user_channel_reads")
      .select("*")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const row of data ?? []) map[row.channel_id] = row.last_read_at;
        setReadAt((prev) => ({ ...map, ...prev }));
      });
  }, [user]);

  // Members who open a preview URL get upgraded to the live server view.
  useEffect(() => {
    if (!wantsPreview || loadingServers || !routeServerId || pane !== "server") {
      return;
    }
    if (!servers.some((server) => server.id === routeServerId)) return;
    const path = routeChannelId
      ? messengerChannelPath(routeServerId, routeChannelId)
      : messengerServerPath(routeServerId);
    router.replace(path);
  }, [
    wantsPreview,
    loadingServers,
    routeServerId,
    routeChannelId,
    servers,
    pane,
    router,
  ]);

  useEffect(() => {
    if (!activeServerId) {
      setChannels([]);
      setCategories([]);
      setMembers([]);
      setPreviewServer(null);
      setLoadedServerId(null);
      setLoadingChannels(false);
      setMessages([]);
      setReactions([]);
      messagesChannelRef.current = null;
      return;
    }

    // Discover → Preview remounts the shell; wait for auth + membership before
    // choosing preview RPC vs member RLS loads (avoids false "can't preview").
    if (!user) {
      setLoadingChannels(false);
      return;
    }
    if (wantsPreview && loadingServers) {
      setLoadingChannels(true);
      return;
    }

    const serverId = activeServerId;
    const supabase = createClient();
    let cancelled = false;
    // Keep previous server chrome visible until the new one is fully ready,
    // then swap channels + members + roles in one paint.
    // Soft-refresh of the same server must not blank the chat to "Loading…".
    if (loadedServerId !== serverId) {
      setLoadingChannels(true);
    }

    async function loadPreview() {
      setError(null);
      const { preview, error: previewError } =
        await loadPublicServerPreview(serverId);
      if (cancelled) return;
      if (previewError || !preview) {
        setError(previewError ?? "This server is not available for preview.");
        setPreviewServer(null);
        setChannels([]);
        setCategories([]);
        setMembers([]);
        setServerRoles([]);
        setLoadedServerId(null);
        setLoadingChannels(false);
        // Stay on the preview URL so a transient miss isn't a hard bounce;
        // user can leave via Discover / server rail.
        return;
      }
      setError(null);
      setPreviewServer(preview.server);
      setChannels(preview.channels);
      setCategories(preview.categories);
      setServerRoles([]);
      setMembers(
        preview.members.map((row) => ({
          user_id: row.user_id,
          nickname: row.nickname,
          joined_at: row.joined_at,
          username: row.username,
          avatar_url: row.avatar_url,
          status: row.status,
          status_text: row.status_text,
          last_seen_at: row.last_seen_at,
          bio: row.bio,
          banner_url: row.banner_url,
          banner_color: row.banner_color,
          roleIds: [] as string[],
        })),
      );
      setChannelServerMap((prev) => {
        const next = { ...prev };
        for (const channel of preview.channels) next[channel.id] = serverId;
        return next;
      });
      setLoadedServerId(serverId);
      setLoadingChannels(false);
    }

    async function load() {
      const [channelResult, categoryResult, memberResult, roleResult, rolesTable] =
        await Promise.all([
          supabase.from("channels").select("*").eq("server_id", serverId),
          supabase.from("channel_categories").select("*").eq("server_id", serverId),
          supabase.from("server_members").select("*").eq("server_id", serverId),
          supabase.from("member_roles").select("*").eq("server_id", serverId),
          supabase.from("roles").select("*").eq("server_id", serverId),
        ]);
      if (cancelled) return;
      if (channelResult.error) setError(channelResult.error.message);
      const nextChannels = channelResult.data ?? [];
      const rolesByUser = new Map<string, string[]>();
      for (const row of roleResult.data ?? []) {
        const list = rolesByUser.get(row.user_id) ?? [];
        list.push(row.role_id);
        rolesByUser.set(row.user_id, list);
      }

      // Unlock the chat pane as soon as channel chrome is ready — don't wait
      // on member profile hydration (that was a major open-channel delay).
      setPreviewServer(null);
      setChannels(nextChannels);
      setCategories(categoryResult.data ?? []);
      setServerRoles((rolesTable.data as Role[] | null) ?? []);
      setChannelServerMap((prev) => {
        const next = { ...prev };
        for (const channel of nextChannels) next[channel.id] = serverId;
        return next;
      });
      setLoadedServerId(serverId);
      setLoadingChannels(false);
      setViewAsRoleId(null);
      setActiveThreadId(null);
      void supabase
        .from("server_automod_rules")
        .select("id, enabled, keywords, action")
        .eq("server_id", serverId)
        .then(({ data }) => {
          if (!cancelled) setAutomodRules((data as AutomodRule[]) ?? []);
        });
      void supabase
        .from("channel_threads")
        .select("*")
        .eq("server_id", serverId)
        .eq("archived", false)
        .then(({ data }) => {
          if (!cancelled) setChannelThreads(data ?? []);
        });
      void supabase
        .from("server_stickers")
        .select("id, name, url")
        .eq("server_id", serverId)
        .then(({ data }) => {
          if (!cancelled) setServerStickers(data ?? []);
        });

      const memberRows = memberResult.data ?? [];
      const stubMembers = memberRows.map((row) => {
        const fromJunction = rolesByUser.get(row.user_id) ?? [];
        const roleIds = [
          ...new Set([
            ...fromJunction,
            ...(row.role_id ? [row.role_id] : []),
          ]),
        ];
        return {
          user_id: row.user_id,
          nickname: row.nickname,
          joined_at: row.joined_at,
          timed_out_until: row.timed_out_until ?? null,
          username: "",
          avatar_url: null as string | null,
          status: "offline",
          status_text: null as string | null,
          last_seen_at: null as string | null,
          bio: null as string | null,
          banner_url: null as string | null,
          banner_color: null as string | null,
          roleIds,
        };
      });
      setMembers(stubMembers);

      const profiles = await loadProfiles(memberRows.map((row) => row.user_id));
      if (cancelled) return;
      const profileMap = new Map(profiles.map((item) => [item.id, item]));
      setMembers(
        stubMembers.map((row) => {
          const memberProfile = profileMap.get(row.user_id);
          return {
            ...row,
            username: memberProfile?.username ?? "Unknown",
            avatar_url: memberProfile?.avatar_url ?? null,
            status: memberProfile?.status ?? "offline",
            status_text: memberProfile?.status_text ?? null,
            last_seen_at: memberProfile?.last_seen_at ?? null,
            bio: memberProfile?.bio ?? null,
            banner_url: memberProfile?.banner_url ?? null,
            banner_color: memberProfile?.banner_color ?? null,
          };
        }),
      );
    }

    if (previewLoadReady) {
      void loadPreview();
    } else if (!wantsPreview || isMemberOfActiveServer) {
      void load();
    } else {
      setLoadingChannels(true);
    }
    return () => {
      cancelled = true;
    };
  }, [
    activeServerId,
    previewLoadReady,
    wantsPreview,
    loadingServers,
    isMemberOfActiveServer,
    user,
    router,
  ]);

  // Live presence for members + DM partners (profiles must be in supabase_realtime).
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const applyPresenceRow = (row: {
      id?: string;
      status?: string;
      status_text?: string | null;
      last_seen_at?: string | null;
      avatar_url?: string | null;
      username?: string;
    }) => {
      if (!row?.id) return;
      setMembers((prev) => {
        if (!prev.some((m) => m.user_id === row.id)) return prev;
        return prev.map((m) =>
          m.user_id === row.id
            ? {
                ...m,
                status: row.status ?? m.status,
                status_text:
                  row.status_text !== undefined
                    ? row.status_text
                    : m.status_text,
                last_seen_at:
                  row.last_seen_at !== undefined
                    ? row.last_seen_at
                    : m.last_seen_at,
                avatar_url:
                  row.avatar_url !== undefined ? row.avatar_url : m.avatar_url,
                username: row.username ?? m.username,
              }
            : m,
        );
      });
      setThreads((prev) =>
        prev.map((thread) =>
          thread.otherUserId === row.id
            ? {
                ...thread,
                status: row.status ?? thread.status,
                last_seen_at:
                  row.last_seen_at !== undefined
                    ? row.last_seen_at
                    : thread.last_seen_at,
                status_text:
                  row.status_text !== undefined
                    ? row.status_text
                    : thread.status_text,
                avatar_url:
                  row.avatar_url !== undefined
                    ? row.avatar_url
                    : thread.avatar_url,
                username: row.username ?? thread.username,
              }
            : thread,
        ),
      );
    };

    const channel = supabase
      .channel(`presence-live:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload) => {
          applyPresenceRow(
            (payload.new ?? payload.old) as {
              id?: string;
              status?: string;
              status_text?: string | null;
              last_seen_at?: string | null;
              avatar_url?: string | null;
              username?: string;
            },
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (pane !== "server" || !routeServerId) return;
    if (loadingChannels || loadedServerId !== routeServerId) return;

    const channelValid =
      !!routeChannelId && channels.some((channel) => channel.id === routeChannelId);
    if (channelValid && routeChannelId) {
      if (!previewMode) {
        const current = channels.find((channel) => channel.id === routeChannelId);
        // Only remember text channels so returning to a server doesn't auto-open voice.
        if (current?.type === "text") {
          rememberServerChannel(routeServerId, routeChannelId);
        }
        rememberMessengerPath(pathname);
      }
      return;
    }
    if (channels.length === 0) return;

    const target = pickFallbackChannel(channels, routeServerId);
    if (!target || target.id === routeChannelId) return;
    router.replace(
      withPreviewQuery(
        messengerChannelPath(routeServerId, target.id),
        previewMode,
      ),
    );
  }, [
    pane,
    routeServerId,
    routeChannelId,
    channels,
    loadingChannels,
    loadedServerId,
    pathname,
    router,
    previewMode,
  ]);

  useEffect(() => {
    const ids = channels.filter((channel) => channel.type === "text").map((channel) => channel.id);
    if (ids.length === 0) return;
    let cancelled = false;
    void fetchLastMessageMap(ids).then((map) => {
      if (cancelled) return;
      setLastMessageAt((prev) => ({ ...prev, ...map }));
    });
    return () => {
      cancelled = true;
    };
  }, [channels]);

  useEffect(() => {
    if (servers.length === 0) return;
    const supabase = createClient();
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("channels")
        .select("id, server_id, type")
        .in(
          "server_id",
          servers.map((server) => server.id),
        );
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      const textIds: string[] = [];
      for (const row of data) {
        map[row.id] = row.server_id;
        if (row.type === "text") textIds.push(row.id);
      }
      setChannelServerMap((prev) => ({ ...prev, ...map }));
      const lastMap = await fetchLastMessageMap(textIds);
      if (!cancelled) setLastMessageAt((prev) => ({ ...prev, ...lastMap }));
    })();
    return () => {
      cancelled = true;
    };
  }, [servers]);

  useEffect(() => {
    if (!activeServerId) return;
    const serverId = activeServerId;
    const supabase = createClient();
    const channel = supabase
      .channel(`server-activity:${serverId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Tables<"messages">;
          if (!channelIdsRef.current.has(row.channel_id)) return;
          setLastMessageAt((prev) =>
            prev[row.channel_id] === row.created_at
              ? prev
              : { ...prev, [row.channel_id]: row.created_at },
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeServerId]);

  // Live role / member_role updates for member list colors + grouping.
  useEffect(() => {
    if (!activeServerId || previewMode) return;
    const serverId = activeServerId;
    const supabase = createClient();
    let cancelled = false;

    async function reloadRoles() {
      const [roleResult, rolesTable, memberResult] = await Promise.all([
        supabase.from("member_roles").select("*").eq("server_id", serverId),
        supabase.from("roles").select("*").eq("server_id", serverId),
        supabase
          .from("server_members")
          .select("user_id, role_id")
          .eq("server_id", serverId),
      ]);
      if (cancelled) return;
      const nextRoles = (rolesTable.data as Role[] | null) ?? [];
      setServerRoles(nextRoles);
      const rolesByUser = new Map<string, string[]>();
      for (const row of roleResult.data ?? []) {
        const list = rolesByUser.get(row.user_id) ?? [];
        list.push(row.role_id);
        rolesByUser.set(row.user_id, list);
      }
      const legacyRoleByUser = new Map<string, string | null>();
      for (const row of memberResult.data ?? []) {
        legacyRoleByUser.set(row.user_id, row.role_id);
      }
      setMembers((prev) =>
        prev.map((member) => {
          const fromJunction = rolesByUser.get(member.user_id) ?? [];
          const legacy = legacyRoleByUser.get(member.user_id);
          const roleIds = [
            ...new Set([
              ...fromJunction,
              ...(legacy ? [legacy] : []),
            ]),
          ];
          return { ...member, roleIds };
        }),
      );
    }

    const channel = supabase
      .channel(`server-roles:${serverId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "roles",
          filter: `server_id=eq.${serverId}`,
        },
        () => {
          void reloadRoles();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "member_roles",
          filter: `server_id=eq.${serverId}`,
        },
        () => {
          void reloadRoles();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [activeServerId, previewMode]);

  // Keep profile cards aware of the active server's roles.
  const setServerMemberRoles = profileUi?.setServerMemberRoles;
  useEffect(() => {
    if (!setServerMemberRoles) return;
    if (pane !== "server" || !activeServerId || previewMode) {
      setServerMemberRoles(null);
      return;
    }
    const roleIdsByUserId: Record<string, string[]> = {};
    for (const member of members) {
      roleIdsByUserId[member.user_id] = member.roleIds;
    }
    setServerMemberRoles({
      serverId: activeServerId,
      roles: serverRoles,
      roleIdsByUserId,
    });
  }, [
    setServerMemberRoles,
    pane,
    activeServerId,
    previewMode,
    members,
    serverRoles,
  ]);

  useEffect(() => {
    if (!activeServerId || previewMode) {
      setVoiceStates([]);
      return;
    }
    const serverId = activeServerId;
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { data, error: voiceError } = await supabase
        .from("voice_states")
        .select("*")
        .eq("server_id", serverId);
      if (cancelled) return;
      if (voiceError) {
        setError(voiceError.message);
        return;
      }
      setVoiceStates(data ?? []);
    }

    void load();
    const channel = supabase
      .channel(`voice:${serverId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voice_states" },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [activeServerId, previewMode]);

  useEffect(() => {
    if (!activeChannelId) return;
    // Don't block on server chrome — messages load in parallel with members/roles.
    // Skip only when we already know this isn't a text/voice chat channel.
    if (
      activeChannel &&
      activeChannel.type !== "text" &&
      activeChannel.type !== "voice"
    ) {
      return;
    }

    const channelId = activeChannelId;
    const supabase = createClient();
    const requestId = ++messagesRequest.current;
    let cancelled = false;
    const channelChanged = messagesChannelRef.current !== channelId;
    if (channelChanged) {
      messagesChannelRef.current = channelId;
      setMessages([]);
      setReactions([]);
      setChannelHasMore(false);
      setActiveThreadId(null);
      setPollVotesByMessage({});
    }
    // Sync: show loading before first paint of the new channel so scroll-to-bottom
    // waits for the real message list instead of locking onto stale content.
    setLoadingChannelMessages(true);

    function stillCurrent() {
      return !cancelled && requestId === messagesRequest.current;
    }

    async function applyMessages(
      nextMessages: ChatMessage[],
      reactionRows: Tables<"message_reactions">[] | null,
      hasMore: boolean,
    ) {
      if (!stillCurrent()) return;
      setMessages(nextMessages);
      setReactions(reactionRows ?? []);
      setChannelHasMore(hasMore);
      const newest = nextMessages[nextMessages.length - 1]?.created_at;
      if (newest) {
        setLastMessageAt((prev) => ({ ...prev, [channelId]: newest }));
      }
      setLoadingChannelMessages(false);
    }

    async function loadPreviewMessages() {
      const result = await loadPublicChannelMessages(channelId);
      if (!stillCurrent()) return;
      if (result.error) {
        setError(result.error);
        if (channelChanged) {
          setMessages([]);
          setReactions([]);
          setChannelHasMore(false);
        }
        setLoadingChannelMessages(false);
        return;
      }
      await applyMessages(result.messages, [], result.hasMore);
    }

    async function load() {
      const result = await loadChannelMessages(channelId);
      if (!stillCurrent()) return;
      if (result.error) {
        setError(result.error);
        if (channelChanged) {
          setMessages([]);
          setReactions([]);
          setChannelHasMore(false);
        }
        setLoadingChannelMessages(false);
        return;
      }
      await applyMessages(
        result.messages,
        result.reactions ?? [],
        result.hasMore,
      );
      const pollIds = result.messages
        .filter((message) => message.message_kind === "poll")
        .map((message) => message.id);
      if (pollIds.length > 0) {
        const { data: votes } = await supabase
          .from("poll_votes")
          .select("message_id, user_id, option_index")
          .in("message_id", pollIds);
        if (!stillCurrent()) return;
        const map: Record<string, { user_id: string; option_index: number }[]> =
          {};
        for (const vote of votes ?? []) {
          const list = map[vote.message_id] ?? [];
          list.push({
            user_id: vote.user_id,
            option_index: vote.option_index,
          });
          map[vote.message_id] = list;
        }
        setPollVotesByMessage((prev) => ({ ...prev, ...map }));
      }
    }

    if (previewMode) {
      void loadPreviewMessages();
      return () => {
        cancelled = true;
      };
    }

    void load();

    const channel = supabase
      .channel(`messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          if (!stillCurrent()) return;
          const row = payload.new as Tables<"messages">;
          const full = await loadSingleMessage(row.id);
          if (!stillCurrent()) return;
          const nextMessage =
            full ??
            ({
              ...row,
              profiles: null,
              reply_to: null,
            } as ChatMessage);
          setMessages((prev) => mergeIncoming(prev, nextMessage));
          setLastMessageAt((prev) => ({ ...prev, [channelId]: nextMessage.created_at }));
          // Message sent → drop that user's typing indicator immediately.
          if (nextMessage.user_id && nextMessage.user_id !== userIdRef.current) {
            setTypingUsers((prev) => {
              if (!prev[nextMessage.user_id]) return prev;
              const next = { ...prev };
              delete next[nextMessage.user_id];
              return next;
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          if (!stillCurrent()) return;
          const row = payload.new as Tables<"messages">;
          setMessages((prev) =>
            prev.map((message) =>
              message.id === row.id
                ? {
                    ...message,
                    content: row.content,
                    edited_at: row.edited_at,
                    pinned: row.pinned,
                    reply_to_id: row.reply_to_id,
                    attachment_url: row.attachment_url,
                    attachment_type: row.attachment_type,
                    attachments: row.attachments ?? [],
                  }
                : message,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          if (!stillCurrent()) return;
          const row = payload.old as { id?: string };
          if (!row.id) return;
          setMessages((prev) => prev.filter((message) => message.id !== row.id));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [activeChannelId, activeChannel?.type, previewMode]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("messenger-reactions")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const row = payload.new as Reaction;
          if (!messageIdsRef.current.has(row.message_id)) return;
          setReactions((prev) => upsertReaction(prev, row));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          const row = payload.old as Partial<Reaction>;
          if (!row.id) return;
          setReactions((prev) => prev.filter((reaction) => reaction.id !== row.id));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dm_message_reactions" },
        (payload) => {
          const row = payload.new as Reaction;
          if (!messageIdsRef.current.has(row.message_id)) return;
          setReactions((prev) => upsertReaction(prev, row));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "dm_message_reactions" },
        (payload) => {
          const row = payload.old as Partial<Reaction>;
          if (!row.id) return;
          setReactions((prev) => prev.filter((reaction) => reaction.id !== row.id));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      setDmMessages([]);
      setReactions([]);
      return;
    }
    const conversationId = activeConversationId;
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      setLoadingDmMessages(true);
      const { data, error: dmError } = await supabase
        .from("dm_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(CHANNEL_MESSAGE_PAGE_SIZE);
      if (cancelled) return;
      if (dmError || !data) {
        setError(dmError?.message ?? "Failed to load direct messages");
        setDmMessages([]);
        setReactions([]);
        setDmHasMore(false);
        setLoadingDmMessages(false);
        return;
      }
      const rows = dmRowsToMessages([...data].reverse());
      const present = new Set(rows.map((row) => row.id));
      const missing = [
        ...new Set(
          rows
            .map((row) => row.reply_to_id)
            .filter((id): id is string => !!id && !present.has(id)),
        ),
      ];
      let parents: Tables<"messages">[] = [];
      if (missing.length > 0) {
        const parentResult = await supabase.from("dm_messages").select("*").in("id", missing);
        parents = dmRowsToMessages(parentResult.data ?? []);
      }
      const profiles = await loadProfiles(
        [...rows, ...parents].map((row) => row.user_id),
      );
      const ids = rows.map((row) => row.id).filter((id) => !id.startsWith("temp-"));
      const { data: reactionRows } =
        ids.length > 0
          ? await supabase
              .from("dm_message_reactions")
              .select("*")
              .in("message_id", ids)
          : { data: [] as Tables<"dm_message_reactions">[] };
      if (cancelled) return;
      setDmMessages(hydrateMessages(rows, profiles, parents));
      setReactions((reactionRows as Reaction[]) ?? []);
      setDmHasMore(data.length >= CHANNEL_MESSAGE_PAGE_SIZE);
      setLoadingDmMessages(false);
    }

    void load();

    const channel = supabase
      .channel(`dm:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if (cancelled) return;
          const row = payload.new as Tables<"dm_messages">;
          const { data } = await supabase
            .from("dm_messages")
            .select("*")
            .eq("id", row.id)
            .maybeSingle();
          if (cancelled || !data) return;
          const [hydrated] = hydrateMessages(
            dmRowsToMessages([data]),
            await loadProfiles([data.user_id]),
          );
          if (!hydrated || cancelled) return;
          setDmMessages((prev) => mergeIncoming(prev, hydrated));
          // Message sent → drop that user's typing indicator immediately.
          if (hydrated.user_id && hydrated.user_id !== userIdRef.current) {
            const clearId = hydrated.user_id;
            setTypingUsers((prev) => {
              if (!prev[clearId]) return prev;
              const next = { ...prev };
              delete next[clearId];
              return next;
            });
            setInboxTypingUsers((prev) => {
              if (!prev[clearId]) return prev;
              const next = { ...prev };
              delete next[clearId];
              return next;
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as Tables<"dm_messages">;
          setDmMessages((prev) =>
            prev.map((message) =>
              message.id === row.id
                ? {
                    ...message,
                    content: row.content,
                    edited_at: row.edited_at,
                    reply_to_id: row.reply_to_id,
                    attachment_url: row.attachment_url ?? null,
                    attachment_type: row.attachment_type ?? null,
                    attachments: row.attachments ?? [],
                  }
                : message,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "dm_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.old as { id?: string };
          if (!row.id) return;
          setDmMessages((prev) => prev.filter((message) => message.id !== row.id));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [activeConversationId]);

  const activeLast = activeChannelId ? lastMessageAt[activeChannelId] : undefined;
  useEffect(() => {
    if (!user || pane !== "server" || !activeChannelId || activeChannel?.type !== "text") {
      return;
    }
    const at = activeLast ?? new Date().toISOString();
    setReadAt((prev) => {
      const current = prev[activeChannelId];
      if (current && Date.parse(current) >= Date.parse(at)) return prev;
      return { ...prev, [activeChannelId]: at };
    });
    void saveChannelRead(user.id, activeChannelId, at);
  }, [user, pane, activeChannelId, activeChannel?.type, activeLast]);

  function applyTypingBroadcast(
    message: unknown,
    selfId: string,
    setter: typeof setTypingUsers,
  ) {
    const raw = message as {
      payload?: {
        userId?: string;
        username?: string;
        avatarUrl?: string | null;
        stop?: boolean;
      };
      userId?: string;
      username?: string;
      avatarUrl?: string | null;
      stop?: boolean;
    };
    const data = raw.payload ?? raw;
    const userId = data.userId;
    // Self is tracked locally for member-list dots; ignore echo.
    if (!userId || userId === selfId) return;
    if (
      blockedIdsRef.current.includes(userId) ||
      ignoredIdsRef.current.includes(userId)
    ) {
      return;
    }
    if (data.stop) {
      setter((prev) => {
        if (!prev[userId]) return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      return;
    }
    setter((prev) => ({
      ...prev,
      [userId]: {
        until: Date.now() + 10_000,
        username: data.username || prev[userId]?.username || "Someone",
        avatarUrl: data.avatarUrl ?? prev[userId]?.avatarUrl ?? null,
      },
    }));
  }

  // Live typing for the open text/voice channel OR the open DM (composer + member list).
  useEffect(() => {
    const typingKey =
      pane === "home" && activeConversationId
        ? `dm:${activeConversationId}`
        : activeChannelId &&
            (activeChannel?.type === "text" || activeChannel?.type === "voice")
          ? `channel:${activeChannelId}`
          : null;

    if (!user || !typingKey) {
      setTypingUsers({});
      setSelfTyping(false);
      typingChannelRef.current = null;
      return;
    }

    const selfId = user.id;
    setSelfTyping(false);
    setTypingUsers({});
    const supabase = createClient();
    const channel = supabase
      .channel(`typing:${typingKey}`, {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "typing" }, (message) => {
        applyTypingBroadcast(message, selfId, setTypingUsers);
        // Keep inbox sidebar in sync when this is the open DM.
        if (pane === "home") {
          applyTypingBroadcast(message, selfId, setInboxTypingUsers);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          typingChannelRef.current = channel;
          if (typingWantedRef.current && user?.id) {
            lastTypingSentRef.current = 0;
            if (pane === "server") setSelfTyping(true);
            void channel.send({
              type: "broadcast",
              event: "typing",
              payload: {
                userId: user.id,
                username: profile?.username ?? "Someone",
                avatarUrl: profile?.avatar_url ?? null,
                stop: false,
              },
            });
            lastTypingSentRef.current = Date.now();
          }
        }
      });
    const tick = window.setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        const next: typeof prev = {};
        let changed = false;
        for (const [id, info] of Object.entries(prev)) {
          if (info.until > now) next[id] = info;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 400);
    return () => {
      window.clearInterval(tick);
      typingWantedRef.current = false;
      setSelfTyping(false);
      if (typingChannelRef.current === channel) {
        typingChannelRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [
    pane,
    activeConversationId,
    activeChannelId,
    activeChannel?.type,
    user,
    profile?.username,
    profile?.avatar_url,
  ]);

  // Watch ALL DM threads for typing so the sidebar shows who is typing even
  // when that conversation isn't the open one.
  const dmThreadWatchKey = useMemo(
    () =>
      threads
        .map((thread) => thread.id)
        .sort()
        .join(","),
    [threads],
  );

  useEffect(() => {
    if (!user || pane !== "home" || !dmThreadWatchKey) {
      setInboxTypingUsers({});
      return;
    }
    const selfId = user.id;
    const supabase = createClient();
    const ids = dmThreadWatchKey.split(",").filter(Boolean);
    // Skip the open DM — already covered by the active typing channel above
    // (avoids double-subscribe on the same Realtime topic).
    const watchIds = ids.filter((id) => id !== activeConversationId);
    const channels = watchIds.map((conversationId) =>
      supabase
        .channel(`typing:dm:${conversationId}`, {
          config: { broadcast: { self: false } },
        })
        .on("broadcast", { event: "typing" }, (message) => {
          applyTypingBroadcast(message, selfId, setInboxTypingUsers);
        })
        .subscribe(),
    );
    const tick = window.setInterval(() => {
      const now = Date.now();
      setInboxTypingUsers((prev) => {
        const next: typeof prev = {};
        let changed = false;
        for (const [id, info] of Object.entries(prev)) {
          if (info.until > now) next[id] = info;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 400);
    return () => {
      window.clearInterval(tick);
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [user, pane, dmThreadWatchKey, activeConversationId]);

  useEffect(() => {
    if (!pinsOpen || !activeChannelId || activeChannel?.type !== "text") return;
    const channelId = activeChannelId;
    const supabase = createClient();
    let cancelled = false;
    void (async () => {
      const { data, error: pinError } = await supabase
        .from("messages")
        .select("*")
        .eq("channel_id", channelId)
        .eq("pinned", true)
        .order("created_at", { ascending: false });
      if (cancelled || pinError || !data) return;
      const profiles = await loadProfiles(data.map((row) => row.user_id));
      if (!cancelled) setPinnedExtra(hydrateMessages(data, profiles));
    })();
    return () => {
      cancelled = true;
    };
  }, [pinsOpen, activeChannelId, activeChannel?.type]);

  useEffect(() => {
    if (!pinsOpen || !dmMode || !activeConversationId) return;
    const conversationId = activeConversationId;
    const supabase = createClient();
    let cancelled = false;
    void (async () => {
      const { data, error: pinError } = await supabase
        .from("dm_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("pinned", true)
        .order("created_at", { ascending: false });
      if (cancelled || pinError || !data) return;
      const profiles = await loadProfiles(data.map((row) => row.user_id));
      if (!cancelled) {
        setPinnedExtra(hydrateMessages(dmRowsToMessages(data), profiles));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pinsOpen, dmMode, activeConversationId]);

  useLayoutEffect(() => {
    if (!pinsOpen) {
      setPinsAnchor(null);
      return;
    }
    function place() {
      const rect = pinsButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPinsAnchor({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [pinsOpen]);

  useEffect(() => {
    if (!pinsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPinsOpen(false);
        pinsButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = pinsPanelRef.current;
      if (!panel) return;
      const nodes = [...panel.querySelectorAll<HTMLElement>("button, a, input")];
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (pinsPanelRef.current?.contains(target)) return;
      if (pinsButtonRef.current?.contains(target)) return;
      setPinsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    const first = pinsPanelRef.current?.querySelector<HTMLElement>("button");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [pinsOpen]);

  const membersById = useMemo(
    () => new Map(members.map((member) => [member.user_id, member])),
    [members],
  );

  const reactionMap = useMemo(
    () => groupReactions(reactions, user?.id ?? null),
    [reactions, user?.id],
  );

  const isServerOwner = !!user && !!activeServer && activeServer.owner_id === user.id;
  const myRoleIds = useMemo(() => {
    const mine = members.find((member) => member.user_id === user?.id);
    return mine?.roleIds ?? [];
  }, [members, user?.id]);

  const myPerms = useMemo(() => {
    if (isServerOwner) {
      return Object.fromEntries(
        Object.values(PERMISSIONS).map((key) => [key, true]),
      ) as ReturnType<typeof mergeRolePermissions>;
    }
    const rolePerms = serverRoles
      .filter((role) => myRoleIds.includes(role.id))
      .map((role) => role.permissions);
    return mergeRolePermissions(rolePerms);
  }, [isServerOwner, serverRoles, myRoleIds]);

  const canSendMessages = can(myPerms, PERMISSIONS.SEND_MESSAGES, {
    isOwner: isServerOwner,
    overrides: activeChannel?.permission_overrides,
    roleIds: myRoleIds,
    userId: user?.id,
  });
  const canManageMessages = can(myPerms, PERMISSIONS.MANAGE_MESSAGES, {
    isOwner: isServerOwner,
    overrides: activeChannel?.permission_overrides,
    roleIds: myRoleIds,
    userId: user?.id,
  });
  const canConnectVoice = can(myPerms, PERMISSIONS.CONNECT, {
    isOwner: isServerOwner,
    overrides: activeChannel?.permission_overrides,
    roleIds: myRoleIds,
    userId: user?.id,
  });
  const canCreateInvites = can(myPerms, PERMISSIONS.CREATE_INVITES, {
    isOwner: isServerOwner,
  });
  const canManageChannels = can(myPerms, PERMISSIONS.MANAGE_CHANNELS, {
    isOwner: isServerOwner,
  });
  const canManageRoles = can(myPerms, PERMISSIONS.MANAGE_ROLES, {
    isOwner: isServerOwner,
  });
  const canManageEmojis = can(myPerms, PERMISSIONS.MANAGE_EMOJIS, {
    isOwner: isServerOwner,
  });
  const canKickMembers = can(myPerms, PERMISSIONS.KICK_MEMBERS, {
    isOwner: isServerOwner,
  });
  const canBanMembers = can(myPerms, PERMISSIONS.BAN_MEMBERS, {
    isOwner: isServerOwner,
  });
  const canManageServer = can(myPerms, PERMISSIONS.MANAGE_SERVER, {
    isOwner: isServerOwner,
  });
  const canOpenServerSettings = canAccessServerSettings(myPerms, {
    isOwner: isServerOwner,
  });

  /** Discord: hide channels where View Channel is denied (private / role-gated). */
  const visibleChannels = useMemo(() => {
    if (previewMode) return channels;
    if (!viewAsRoleId && (isServerOwner || myPerms.ADMINISTRATOR)) return channels;
    const viewRole = viewAsRoleId
      ? serverRoles.find((role) => role.id === viewAsRoleId)
      : null;
    const base = viewRole
      ? mergeRolePermissions([viewRole.permissions])
      : myPerms;
    const roleIds = viewAsRoleId ? [viewAsRoleId] : myRoleIds;
    return channels.filter((channel) =>
      can(base, PERMISSIONS.VIEW_CHANNEL, {
        isOwner: viewAsRoleId ? false : isServerOwner,
        overrides: channel.permission_overrides,
        roleIds,
        userId: viewAsRoleId ? null : user?.id,
      }),
    );
  }, [
    channels,
    previewMode,
    isServerOwner,
    myPerms,
    myRoleIds,
    user?.id,
    viewAsRoleId,
    serverRoles,
  ]);

  const channelsByServerForForward = useMemo(() => {
    const map: Record<string, Channel[]> = {};
    if (activeServerId && channels.length) {
      map[activeServerId] = channels.filter((channel) => channel.type === "text");
    }
    return map;
  }, [activeServerId, channels]);

  const canViewActiveChannel =
    !activeChannel ||
    previewMode ||
    isServerOwner ||
    !!myPerms.ADMINISTRATOR ||
    can(myPerms, PERMISSIONS.VIEW_CHANNEL, {
      isOwner: isServerOwner,
      overrides: activeChannel.permission_overrides,
      roleIds: myRoleIds,
      userId: user?.id,
    });

  useEffect(() => {
    if (pane !== "server" || !routeServerId || previewMode) return;
    if (loadingChannels || loadedServerId !== routeServerId) return;
    if (!activeChannelId || canViewActiveChannel) return;
    const target = pickFallbackChannel(visibleChannels, routeServerId);
    if (!target) {
      router.replace(messengerServerPath(routeServerId));
      return;
    }
    if (target.id === activeChannelId) return;
    router.replace(messengerChannelPath(routeServerId, target.id));
  }, [
    pane,
    routeServerId,
    activeChannelId,
    canViewActiveChannel,
    visibleChannels,
    loadingChannels,
    loadedServerId,
    previewMode,
    router,
  ]);

  const emojiCatalog = useMemo(() => {
    const map = new Map<string, ServerEmoji>();
    for (const emoji of customEmojis) map.set(emoji.id, emoji);
    return map;
  }, [customEmojis]);

  const serverNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const server of servers) map[server.id] = server.name;
    return map;
  }, [servers]);

  const reactorNamesById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const member of members) {
      map[member.user_id] = member.nickname?.trim() || member.username;
    }
    for (const thread of threads) {
      if (!map[thread.otherUserId]) map[thread.otherUserId] = thread.username;
    }
    if (user?.id && profile?.username) {
      map[user.id] = profile.username;
    }
    return map;
  }, [members, threads, user?.id, profile?.username]);

  const visibleMembers = useMemo(
    () => members.filter((member) => !isBlocked(member.user_id)),
    [members, isBlocked],
  );

  const mentionSuggestions = useMemo<MentionSuggestion[]>(() => {
    const users = visibleMembers.map((member) => ({
      id: member.user_id,
      label: member.nickname?.trim() || member.username,
      kind: "user" as const,
    }));
    const roles = serverRoles.map((role) => ({
      id: role.id,
      label: role.name,
      kind: "role" as const,
    }));
    const channelItems = channels
      .filter((channel) => channel.type === "text")
      .map((channel) => ({
        id: channel.id,
        label: channel.name,
        kind: "channel" as const,
      }));
    return [...users, ...roles, ...channelItems];
  }, [visibleMembers, serverRoles, channels]);

  const mentionMaps = useMemo<MentionMaps>(() => {
    const usersById: MentionMaps["usersById"] = {};
    for (const member of members) {
      usersById[member.user_id] = {
        id: member.user_id,
        username: member.nickname?.trim() || member.username,
      };
    }
    const rolesById: MentionMaps["rolesById"] = {};
    for (const role of serverRoles) {
      rolesById[role.id] = { id: role.id, name: role.name };
    }
    const channelsById: MentionMaps["channelsById"] = {};
    for (const channel of channels) {
      channelsById[channel.id] = { id: channel.id, name: channel.name };
    }
    return { usersById, rolesById, channelsById };
  }, [members, serverRoles, channels]);

  const roleNames = useMemo(
    () => serverRoles.map((role) => role.name),
    [serverRoles],
  );
  const channelNames = useMemo(
    () => channels.map((channel) => channel.name),
    [channels],
  );

  // Drop live typing from people you just blocked or ignored.
  useEffect(() => {
    setTypingUsers((prev) => {
      let changed = false;
      const next: typeof prev = {};
      for (const [userId, info] of Object.entries(prev)) {
        if (isMessageHidden(userId)) {
          changed = true;
          continue;
        }
        next[userId] = info;
      }
      return changed ? next : prev;
    });
  }, [blockedIds, ignoredIds, isMessageHidden]);

  const typingPeople = useMemo<TypingPerson[]>(() => {
    const now = Date.now();
    return Object.entries(typingUsers)
      .filter(
        ([userId, info]) => info.until > now && !isMessageHidden(userId),
      )
      .map(([userId, info]) => {
        const member = membersById.get(userId);
        const dmName =
          activeThread?.otherUserId === userId ? activeThread.username : null;
        return {
          userId,
          username:
            member?.username || dmName || info.username || "Someone",
          avatarUrl:
            member?.avatar_url ??
            (activeThread?.otherUserId === userId
              ? activeThread.avatar_url
              : null) ??
            info.avatarUrl ??
            null,
        };
      })
      // Stable order so avatar stacks don't jump while people keep typing.
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [typingUsers, membersById, isMessageHidden, activeThread]);

  const typingUserIds = useMemo(() => {
    const now = Date.now();
    const ids = new Set(
      Object.entries(typingUsers)
        .filter(([userId, info]) => info.until > now && !isMessageHidden(userId))
        .map(([userId]) => userId),
    );
    // Discord: your own dots appear on the server member list while you type.
    // Not on the DM list — you aren't listed there as the other person.
    if (
      selfTyping &&
      user?.id &&
      pane === "server" &&
      (activeChannel?.type === "text" || activeChannel?.type === "voice")
    ) {
      ids.add(user.id);
    }
    return ids;
  }, [
    typingUsers,
    isMessageHidden,
    selfTyping,
    user?.id,
    pane,
    activeChannel?.type,
  ]);

  /** DM sidebar: anyone typing in any watched conversation. */
  const dmSidebarTypingIds = useMemo(() => {
    const now = Date.now();
    const ids = new Set(
      Object.entries(inboxTypingUsers)
        .filter(([userId, info]) => info.until > now && !isMessageHidden(userId))
        .map(([userId]) => userId),
    );
    // Also include the open DM's typers from the active subscription.
    if (pane === "home") {
      for (const id of typingUserIds) ids.add(id);
    }
    return ids;
  }, [inboxTypingUsers, isMessageHidden, pane, typingUserIds]);

  // Newest message first; friends who are typing jump to the top while active.
  const visibleThreads = useMemo(
    () =>
      threads
        .filter((thread) => !isBlocked(thread.otherUserId))
        .slice()
        .sort((a, b) => compareDmThreads(a, b, dmSidebarTypingIds)),
    [threads, isBlocked, dmSidebarTypingIds],
  );

  const typingUserIdsKey = useMemo(
    () =>
      pane === "home"
        ? [...dmSidebarTypingIds].sort().join(",")
        : [...typingUserIds].sort().join(","),
    [pane, dmSidebarTypingIds, typingUserIds],
  );

  const serverNickByUserId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const member of members) {
      const nick = member.nickname?.trim();
      if (nick) map[member.user_id] = nick;
    }
    return map;
  }, [members]);

  const roleColorByUserId = useMemo(() => {
    const map: Record<string, string> = {};
    if (pane !== "server" || previewMode) return map;
    for (const member of members) {
      const color = roleColorForMember(serverRoles, member.roleIds);
      if (color) map[member.user_id] = color;
    }
    return map;
  }, [members, serverRoles, pane, previewMode]);

  const loadOlderChannel = useCallback(async () => {
    if (!activeChannelId || loadingOlderMessages || !channelHasMore) return;
    const oldest = messages[0]?.created_at;
    if (!oldest) return;
    setLoadingOlderMessages(true);
    if (previewMode) {
      const result = await loadPublicChannelMessages(activeChannelId, {
        before: oldest,
      });
      if (result.error) {
        setError(result.error);
        setLoadingOlderMessages(false);
        return;
      }
      setMessages((prev) => {
        const seen = new Set(prev.map((message) => message.id));
        const older = result.messages.filter((message) => !seen.has(message.id));
        return [...older, ...prev];
      });
      setChannelHasMore(result.hasMore);
      setLoadingOlderMessages(false);
      return;
    }
    const result = await loadOlderChannelMessages(activeChannelId, oldest);
    if (result.error) {
      setError(result.error);
      setLoadingOlderMessages(false);
      return;
    }
    setMessages((prev) => {
      const seen = new Set(prev.map((message) => message.id));
      const older = result.messages.filter((message) => !seen.has(message.id));
      return [...older, ...prev];
    });
    if (result.reactions?.length) {
      setReactions((prev) => {
        let next = prev;
        for (const row of result.reactions) {
          next = upsertReaction(next, row);
        }
        return next;
      });
    }
    setChannelHasMore(result.hasMore);
    setLoadingOlderMessages(false);
  }, [
    activeChannelId,
    loadingOlderMessages,
    channelHasMore,
    messages,
    previewMode,
  ]);

  const loadOlderDm = useCallback(async () => {
    if (!activeConversationId || loadingOlderMessages || !dmHasMore) return;
    const oldest = dmMessages[0]?.created_at;
    if (!oldest) return;
    setLoadingOlderMessages(true);
    const result = await loadOlderDmMessages(activeConversationId, oldest);
    if (result.error) {
      setError(result.error);
      setLoadingOlderMessages(false);
      return;
    }
    const ids = result.messages
      .map((message) => message.id)
      .filter((id) => !id.startsWith("temp-"));
    const supabase = createClient();
    const { data: reactionRows } =
      ids.length > 0
        ? await supabase
            .from("dm_message_reactions")
            .select("*")
            .in("message_id", ids)
        : { data: [] as Tables<"dm_message_reactions">[] };
    setDmMessages((prev) => {
      const seen = new Set(prev.map((message) => message.id));
      const older = result.messages.filter((message) => !seen.has(message.id));
      return [...older, ...prev];
    });
    if (reactionRows?.length) {
      setReactions((prev) => {
        let next = prev;
        for (const row of reactionRows) {
          next = upsertReaction(next, row as Reaction);
        }
        return next;
      });
    }
    setDmHasMore(result.hasMore);
    setLoadingOlderMessages(false);
  }, [
    activeConversationId,
    loadingOlderMessages,
    dmHasMore,
    dmMessages,
  ]);

  const publishTyping = useCallback(() => {
    const userId = user?.id;
    typingWantedRef.current = true;
    // Local self dots for member list (Discord) — don't wait on Realtime round-trip.
    if (pane === "server") setSelfTyping(true);
    const channel = typingChannelRef.current;
    if (!userId || !channel) return;
    const now = Date.now();
    // Throttle so multi-user typing stays responsive without flooding Realtime.
    if (now - lastTypingSentRef.current < 900) return;
    lastTypingSentRef.current = now;
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId,
        username: profile?.username ?? "Someone",
        avatarUrl: profile?.avatar_url ?? null,
        stop: false,
      },
    });
  }, [user?.id, profile?.username, profile?.avatar_url, pane]);

  const publishTypingStop = useCallback(() => {
    const userId = user?.id;
    typingWantedRef.current = false;
    setSelfTyping(false);
    const channel = typingChannelRef.current;
    if (!userId || !channel) return;
    lastTypingSentRef.current = 0;
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId,
        username: profile?.username ?? "Someone",
        avatarUrl: profile?.avatar_url ?? null,
        stop: true,
      },
    });
  }, [user?.id, profile?.username, profile?.avatar_url]);

  const unreadChannelIds = useMemo(() => {
    const unread = new Set<string>();
    for (const channel of visibleChannels) {
      if (channel.type !== "text") continue;
      if (pane === "server" && channel.id === activeChannelId) continue;
      const last = lastMessageAt[channel.id];
      if (!last) continue;
      const read = readAt[channel.id];
      if (!read || Date.parse(last) > Date.parse(read)) unread.add(channel.id);
    }
    return unread;
  }, [visibleChannels, pane, activeChannelId, lastMessageAt, readAt]);

  const unreadServerIds = useMemo(() => {
    const unread = new Set<string>();
    for (const [channelId, last] of Object.entries(lastMessageAt)) {
      if (pane === "server" && channelId === activeChannelId) continue;
      const serverId = channelServerMap[channelId];
      if (!serverId) continue;
      if (pane === "server" && serverId === activeServerId) {
        if (!unreadChannelIds.has(channelId)) continue;
      } else {
        const read = readAt[channelId];
        if (read && Date.parse(last) <= Date.parse(read)) continue;
      }
      unread.add(serverId);
    }
    return unread;
  }, [
    lastMessageAt,
    channelServerMap,
    pane,
    activeChannelId,
    activeServerId,
    unreadChannelIds,
    readAt,
  ]);

  const unblockedMessages = useMemo(
    () => messages.filter((message) => !isMessageHidden(message.user_id)),
    [messages, isMessageHidden],
  );
  const unblockedDmMessages = useMemo(
    () => dmMessages.filter((message) => !isMessageHidden(message.user_id)),
    [dmMessages, isMessageHidden],
  );

  const pinList = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    const source = dmMode ? unblockedDmMessages : unblockedMessages;
    for (const message of pinnedExtra) {
      if (message.pinned && !isMessageHidden(message.user_id)) {
        map.set(message.id, message);
      }
    }
    for (const message of source) {
      if (message.pinned) map.set(message.id, message);
    }
    return [...map.values()].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  }, [dmMode, unblockedDmMessages, unblockedMessages, pinnedExtra, isMessageHidden]);

  const searchNeedle = searchQuery.trim().toLowerCase();
  const threadScopedMessages = activeThreadId
    ? unblockedMessages.filter((message) => message.thread_id === activeThreadId)
    : unblockedMessages.filter((message) => !message.thread_id);
  const visibleMessages = searchNeedle
    ? threadScopedMessages.filter((message) =>
        `${message.content} ${message.profiles?.username ?? ""}`
          .toLowerCase()
          .includes(searchNeedle),
      )
    : threadScopedMessages;
  const visibleDmMessages = searchNeedle
    ? unblockedDmMessages.filter((message) =>
        `${message.content} ${message.profiles?.username ?? ""}`
          .toLowerCase()
          .includes(searchNeedle),
      )
    : unblockedDmMessages;

  function selectHome() {
    setLeaveOpen(false);
    router.push(messengerHomePath());
  }

  function selectDiscover() {
    setLeaveOpen(false);
    router.push(messengerDiscoverPath());
  }

  function selectServer(serverId: string) {
    setLeaveOpen(false);
    if (serverId === activeServerId && !previewMode) return;
    router.push(messengerServerPath(serverId));
  }

  function selectPreviewServer(serverId: string) {
    setLeaveOpen(false);
    router.push(messengerServerPreviewPath(serverId));
  }

  async function joinPreviewServer() {
    if (!user || !activeServerId || joiningPreview) return;
    setJoiningPreview(true);
    setError(null);
    const supabase = createClient();
    const { joinServerWithDefaultRole } = await import(
      "@/lib/server-membership"
    );
    const { error: joinError } = await joinServerWithDefaultRole(
      supabase,
      activeServerId,
      user.id,
    );
    if (joinError) {
      setJoiningPreview(false);
      setError(joinError);
      return;
    }
    const channelId = activeChannelId;
    const serverId = activeServerId;
    await loadServers();
    setPreviewServer(null);
    setJoiningPreview(false);
    setToast("Joined server");
    router.replace(
      channelId
        ? messengerChannelPath(serverId, channelId)
        : messengerServerPath(serverId),
    );
  }

  function selectChannel(channelId: string) {
    if (!activeServerId) return;
    if (previewMode) {
      if (channelId === activeChannelId) return;
      router.push(messengerServerPreviewPath(activeServerId, channelId));
      return;
    }
    const target = channels.find((channel) => channel.id === channelId);
    if (target?.type === "voice" && activeServer) {
      const allowed = can(myPerms, PERMISSIONS.CONNECT, {
        isOwner: isServerOwner,
        overrides: target.permission_overrides,
        roleIds: myRoleIds,
        userId: user?.id,
      });
      if (!allowed) {
        setError("You don't have permission to connect to voice.");
        router.push(messengerChannelPath(activeServerId, channelId));
        return;
      }
      // Explicit click joins / switches voice; clear any prior leave skip.
      voice.clearSkipAutoJoin(channelId);
      void voice.joinVoice({
        channelId: target.id,
        serverId: activeServer.id,
        channelName: target.name,
        serverName: activeServer.name,
      });
    }
    if (channelId === activeChannelId) return;
    router.push(messengerChannelPath(activeServerId, channelId));
  }

  function openCreateChannel(options?: {
    type?: "text" | "voice";
    categoryId?: string | null;
  }) {
    if (!canManageChannels && !isServerOwner) {
      setError("You don't have permission to manage channels.");
      return;
    }
    setCreateChannelType(options?.type ?? "text");
    setCreateChannelCategoryId(options?.categoryId ?? null);
    setCreateChannelOpen(true);
  }

  function openCreateCategory() {
    if (!canManageChannels && !isServerOwner) {
      setError("You don't have permission to manage channels.");
      return;
    }
    setCreateCategoryOpen(true);
  }

  async function renameCategory(categoryId: string, name: string) {
    if (!canManageChannels && !isServerOwner) {
      setError("You don't have permission to manage channels.");
      return false;
    }
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("channel_categories")
      .update({ name })
      .eq("id", categoryId)
      .select("*")
      .single();
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not rename category.");
      return false;
    }
    setCategories((prev) =>
      prev.map((category) => (category.id === categoryId ? data : category)),
    );
    return true;
  }

  function startDm(otherUserId: string) {
    if (isBlocked(otherUserId)) {
      setError("You blocked this user. Unblock them to send messages.");
      return;
    }
    void (async () => {
      const { blockedByThem } = await loadIsBlockedBy(otherUserId);
      if (blockedByThem) {
        setError("This user has blocked you.");
        return;
      }
      const id = await openDm(otherUserId);
      if (id) {
        router.push(messengerDmPath(id));
        return;
      }
      // openDm already set a friendly error when blocked; don't fall through.
    })();
  }

  function selectThread(threadId: string) {
    if (threadId === activeConversationId) return;
    router.push(messengerDmPath(threadId));
  }

  async function closeThread(threadId: string) {
    if (!user) return;
    const supabase = createClient();
    const { error: hideError } = await supabase
      .from("dm_participants")
      .update({ hidden: true })
      .eq("conversation_id", threadId)
      .eq("user_id", user.id);
    if (hideError) {
      setError(hideError.message);
      return;
    }
    setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
    if (activeConversationId === threadId) {
      router.push(messengerHomePath());
    }
  }

  function jumpToMessage(messageId: string) {
    const nodes = document.querySelectorAll<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`,
    );
    // Prefer a visible node (voice chat had duplicate mobile/desktop trees).
    const element =
      [...nodes].find((node) => node.getClientRects().length > 0) ??
      nodes[0] ??
      null;
    if (!element) {
      setToast("That message isn't in the loaded history.");
      return;
    }
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("bg-accent/15");
    window.setTimeout(() => element.classList.remove("bg-accent/15"), 1200);
    setPinsOpen(false);
  }

  async function sendChannel(contentOverride?: string) {
    if (
      !user ||
      !activeChannelId ||
      !activeChannel ||
      (activeChannel.type !== "text" && activeChannel.type !== "voice") ||
      sending
    ) {
      return;
    }
    if (!canSendMessages) {
      setError("You don't have permission to send messages.");
      return;
    }
    if (viewAsRoleId) {
      setError("Exit View Server As Role to send messages.");
      return;
    }
    const me = members.find((member) => member.user_id === user.id);
    if (
      me?.timed_out_until &&
      Date.parse(me.timed_out_until) > Date.now() &&
      !isServerOwner &&
      !myPerms.ADMINISTRATOR
    ) {
      setError(
        `You are timed out until ${new Date(me.timed_out_until).toLocaleString()}.`,
      );
      return;
    }
    if (
      activeServer &&
      !isServerOwner &&
      !myPerms.ADMINISTRATOR &&
      (activeServer.verification_level ?? 0) > 0
    ) {
      const level = activeServer.verification_level ?? 0;
      const accountAgeMs = profile?.created_at
        ? Date.now() - Date.parse(profile.created_at)
        : 0;
      const memberAgeMs = me?.joined_at
        ? Date.now() - Date.parse(me.joined_at)
        : 0;
      if (level >= 1 && accountAgeMs < 60_000) {
        setError("This server requires a verified account age to chat.");
        return;
      }
      if (level >= 2 && accountAgeMs < 5 * 60_000) {
        setError(
          "This server requires your account to be at least 5 minutes old.",
        );
        return;
      }
      if (level >= 3 && memberAgeMs < 10 * 60_000) {
        setError(
          "This server requires you to be a member for at least 10 minutes.",
        );
        return;
      }
    }
    const slowmode = activeChannel.slowmode_seconds ?? 0;
    if (
      slowmode > 0 &&
      !isServerOwner &&
      !myPerms.ADMINISTRATOR &&
      !myPerms.MANAGE_CHANNELS &&
      !myPerms.MANAGE_MESSAGES
    ) {
      const last = lastChannelSendAt.current[activeChannelId] ?? 0;
      const waitMs = slowmode * 1000 - (Date.now() - last);
      if (waitMs > 0) {
        setError(
          `Slowmode is on — wait ${Math.ceil(waitMs / 1000)}s before sending again.`,
        );
        return;
      }
    }
    const channelId = activeChannelId;
    let content = (contentOverride ?? draft).trim();
    if (content.trimStart().toLowerCase().startsWith("/poll")) {
      setPollOpen(true);
      setDraft("");
      return;
    }
    const slashExpanded = content ? expandSlashCommand(content) : null;
    if (slashExpanded !== null) content = slashExpanded;
    const filesSnapshot = pendingFiles;
    if (!content && filesSnapshot.length === 0) return;
    if (content.length > MESSAGE_MAX) {
      setError(MESSAGE_MAX_REACHED);
      return;
    }
    const automodHit = findAutomodHit(content, automodRules);
    if (automodHit && !isServerOwner && !myPerms.ADMINISTRATOR) {
      setError(`Message blocked by AutoMod (matched “${automodHit}”).`);
      return;
    }
    if (filesSnapshot.some((item) => item.file.size > MAX_ATTACHMENT_BYTES)) {
      setError("One or more files are too large.");
      return;
    }
    // Discord-style: resolve :name: → <:name:id>, then store <@id> mention tokens.
    const withEmojis = content
      ? resolveEmojiShortcodes(content, customEmojis, activeServer?.id)
      : "";
    const encoded = withEmojis
      ? encodeMentions(withEmojis, {
          users: members.map((member) => ({
            id: member.user_id,
            username: member.nickname?.trim() || member.username,
          })),
          roles: serverRoles.map((role) => ({ id: role.id, name: role.name })),
          channels: channels.map((channel) => ({
            id: channel.id,
            name: channel.name,
          })),
        })
      : "";
    const text = encoded;
    const tempId = `temp-${crypto.randomUUID()}`;
    const replySnapshot = replyTo;
    const optimistic: ChatMessage = {
      id: tempId,
      channel_id: channelId,
      user_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      reply_to_id: replySnapshot?.id ?? null,
      pinned: false,
      is_system: false,
      thread_id: activeThreadId,
      message_kind: "default",
      poll: null,
      forwarded_from: null,
      edited_at: null,
      attachment_url: null,
      attachment_type: filesSnapshot[0]?.file.type || null,
      attachments: [],
      profiles: {
        username: profile?.username ?? "You",
        avatar_url: profile?.avatar_url ?? null,
      },
      reply_to: replySnapshot
        ? {
            id: replySnapshot.id,
            content: replySnapshot.content,
            user_id: replySnapshot.user_id,
            profiles: replySnapshot.profiles,
          }
        : null,
      optimistic: true,
    };

    const pingReply = replyPing;
    setDraft("");
    setReplyTo(null);
    setReplyPing(true);
    setPendingFiles([]);
    setError(null);
    publishTypingStop();
    setSending(true);
    setMessages((prev) => [...prev, optimistic]);

    const uploadedAttachments: MessageAttachment[] = [];
    for (const item of filesSnapshot) {
      const uploaded = await uploadAttachment(user.id, item.file);
      if (uploaded.error || !uploaded.attachment) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === tempId ? { ...message, failed: true } : message,
          ),
        );
        setError(uploaded.error ?? "Upload failed");
        setDraft(content);
        setPendingFiles(filesSnapshot);
        if (replySnapshot) setReplyTo(replySnapshot);
        setReplyPing(pingReply);
        setSending(false);
        return;
      }
      uploadedAttachments.push({
        ...uploaded.attachment,
        spoiler: Boolean(item.spoiler),
      });
    }

    const first = uploadedAttachments[0] ?? null;
    const supabase = createClient();
    const notifyContent =
      pingReply && replySnapshot && !text.includes(`<@${replySnapshot.user_id}>`)
        ? `${text} <@${replySnapshot.user_id}>`.trim()
        : text;
    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({
        channel_id: channelId,
        user_id: user.id,
        content: text,
        reply_to_id: replySnapshot?.id ?? null,
        thread_id: activeThreadId,
        attachment_url: first?.url ?? null,
        attachment_type: first?.type ?? null,
        attachments: uploadedAttachments,
      })
      .select("*")
      .single();

    if (insertError || !data) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === tempId ? { ...message, failed: true } : message,
        ),
      );
      setError(insertError?.message ?? "Failed to send message");
      setDraft(content);
      setPendingFiles(filesSnapshot);
      if (replySnapshot) setReplyTo(replySnapshot);
      setSending(false);
      return;
    }

    for (const item of filesSnapshot) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }

    const saved: ChatMessage = {
      ...data,
      profiles: {
        username: profile?.username ?? "You",
        avatar_url: profile?.avatar_url ?? null,
      },
      reply_to: replySnapshot
        ? {
            id: replySnapshot.id,
            content: replySnapshot.content,
            user_id: replySnapshot.user_id,
            profiles: replySnapshot.profiles,
          }
        : null,
    };
    setMessages((prev) => {
      if (activeChannelRef.current !== channelId) {
        return prev.filter((message) => message.id !== tempId);
      }
      const withoutTemp = prev.filter((message) => message.id !== tempId);
      if (withoutTemp.some((message) => message.id === saved.id)) return withoutTemp;
      return [...withoutTemp, saved];
    });
    setLastMessageAt((prev) => ({ ...prev, [channelId]: saved.created_at }));
    lastChannelSendAt.current[channelId] = Date.now();
    if (
      notifyContent.includes("<@") ||
      content.includes("@") ||
      (pingReply && replySnapshot)
    ) {
      void supabase.rpc("notify_message_mentions", {
        p_message_id: saved.id,
        p_channel_id: channelId,
        p_author_id: user.id,
        p_content: pingReply ? notifyContent : text,
      });
    }
    setSending(false);
  }

  async function sendDm(contentOverride?: string) {
    if (!user || !activeConversationId || sending) return;
    const otherId =
      threads.find((thread) => thread.id === activeConversationId)?.otherUserId ??
      activeThread?.otherUserId ??
      null;
    if (otherId && isBlocked(otherId)) {
      setError("You blocked this user. Unblock them to send messages.");
      return;
    }
    if (otherId) {
      const { blockedByThem } = await loadIsBlockedBy(otherId);
      if (blockedByThem) {
        setDmBlockedByThem(true);
        setError("This user has blocked you.");
        return;
      }
    }
    const conversationId = activeConversationId;
    const content = (contentOverride ?? draft).trim();
    const filesSnapshot = pendingFiles;
    if (!content && filesSnapshot.length === 0) return;
    if (content.length > MESSAGE_MAX) {
      setError(MESSAGE_MAX_REACHED);
      return;
    }
    if (filesSnapshot.some((item) => item.file.size > MAX_ATTACHMENT_BYTES)) {
      setError("One or more files are too large.");
      return;
    }
    const text = content
      ? resolveEmojiShortcodes(content, customEmojis, null)
      : "";
    const tempId = `temp-${crypto.randomUUID()}`;
    const replySnapshot = replyTo;
    const optimistic: ChatMessage = {
      id: tempId,
      channel_id: conversationId,
      user_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      reply_to_id: replySnapshot?.id ?? null,
      pinned: false,
      is_system: false,
      thread_id: null,
      message_kind: "default",
      poll: null,
      forwarded_from: null,
      edited_at: null,
      attachment_url: null,
      attachment_type: filesSnapshot[0]?.file.type || null,
      attachments: [],
      profiles: {
        username: profile?.username ?? "You",
        avatar_url: profile?.avatar_url ?? null,
      },
      reply_to: replySnapshot
        ? {
            id: replySnapshot.id,
            content: replySnapshot.content,
            user_id: replySnapshot.user_id,
            profiles: replySnapshot.profiles,
          }
        : null,
      optimistic: true,
    };
    setDraft("");
    setReplyTo(null);
    setPendingFiles([]);
    setError(null);
    publishTypingStop();
    setSending(true);
    setDmMessages((prev) => [...prev, optimistic]);

    const uploadedAttachments: MessageAttachment[] = [];
    for (const item of filesSnapshot) {
      const uploaded = await uploadAttachment(user.id, item.file);
      if (uploaded.error || !uploaded.attachment) {
        setDmMessages((prev) =>
          prev.map((message) =>
            message.id === tempId ? { ...message, failed: true } : message,
          ),
        );
        setError(uploaded.error ?? "Upload failed");
        setDraft(content);
        setPendingFiles(filesSnapshot);
        if (replySnapshot) setReplyTo(replySnapshot);
        setSending(false);
        return;
      }
      uploadedAttachments.push({
        ...uploaded.attachment,
        spoiler: Boolean(item.spoiler),
      });
    }

    const first = uploadedAttachments[0] ?? null;
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("dm_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        content: text,
        reply_to_id: replySnapshot?.id ?? null,
        attachment_url: first?.url ?? null,
        attachment_type: first?.type ?? null,
        attachments: uploadedAttachments,
      })
      .select("*")
      .single();

    if (insertError || !data) {
      setDmMessages((prev) =>
        prev.map((message) =>
          message.id === tempId ? { ...message, failed: true } : message,
        ),
      );
      const blockedMsg = friendlyBlockDmMessage(insertError?.message);
      if (blockedMsg) setDmBlockedByThem(true);
      setError(blockedMsg ?? insertError?.message ?? "Failed to send message");
      setDraft(content);
      setPendingFiles(filesSnapshot);
      if (replySnapshot) setReplyTo(replySnapshot);
      setSending(false);
      return;
    }

    for (const item of filesSnapshot) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }

    const [saved] = hydrateMessages(
      dmRowsToMessages([data]),
      [
        {
          id: user.id,
          username: profile?.username ?? "You",
          avatar_url: profile?.avatar_url ?? null,
          status: profile?.status ?? "online",
          status_text: profile?.status_text ?? null,
        },
      ],
    );
    const withReply: ChatMessage = {
      ...(saved ?? optimistic),
      id: data.id,
      optimistic: false,
      failed: false,
      reply_to: replySnapshot
        ? {
            id: replySnapshot.id,
            content: replySnapshot.content,
            user_id: replySnapshot.user_id,
            profiles: replySnapshot.profiles,
          }
        : null,
    };
    setDmMessages((prev) => {
      if (conversationRef.current !== conversationId) {
        return prev.filter((message) => message.id !== tempId);
      }
      const withoutTemp = prev.filter((message) => message.id !== tempId);
      if (withoutTemp.some((message) => message.id === withReply.id)) return withoutTemp;
      return [...withoutTemp, withReply];
    });
    setThreads((prev) =>
      prev
        .map((thread) =>
          thread.id === conversationId
            ? {
                ...thread,
                preview: text.slice(0, 120),
                previewAt: data.created_at,
              }
            : thread,
        )
        .sort((a, b) => compareDmThreads(a, b)),
    );

    if (otherId) {
      void supabase.rpc("create_notification", {
        p_user_id: otherId,
        p_type: "dm_message",
        p_title: profile?.username
          ? `Message from ${profile.username}`
          : "New direct message",
        p_body: text.slice(0, 120),
        p_link: messengerDmPath(conversationId),
      });
    }
    setSending(false);
  }

  async function editChannel(messageId: string, content: string) {
    const previous = messages.find((message) => message.id === messageId);
    const nextContent = resolveEmojiShortcodes(
      content,
      customEmojis,
      activeServer?.id,
    );
    const editedAt = new Date().toISOString();
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? { ...message, content: nextContent, edited_at: editedAt }
          : message,
      ),
    );
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("messages")
      .update({ content: nextContent, edited_at: editedAt })
      .eq("id", messageId);
    if (updateError) {
      if (previous) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === messageId
              ? { ...message, content: previous.content, edited_at: previous.edited_at }
              : message,
          ),
        );
      }
      setError(updateError.message);
      return false;
    }
    return true;
  }

  async function editDm(messageId: string, content: string) {
    const previous = dmMessages.find((message) => message.id === messageId);
    const nextContent = resolveEmojiShortcodes(content, customEmojis, null);
    const editedAt = new Date().toISOString();
    setDmMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? { ...message, content: nextContent, edited_at: editedAt }
          : message,
      ),
    );
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("dm_messages")
      .update({ content: nextContent, edited_at: editedAt })
      .eq("id", messageId);
    if (updateError) {
      if (previous) {
        setDmMessages((prev) =>
          prev.map((message) =>
            message.id === messageId
              ? { ...message, content: previous.content, edited_at: previous.edited_at }
              : message,
          ),
        );
      }
      setError(updateError.message);
      return false;
    }
    return true;
  }

  async function deleteChannel(messageId: string) {
    const snapshot = messages;
    setMessages((prev) => prev.filter((message) => message.id !== messageId));
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("messages")
      .delete()
      .eq("id", messageId);
    if (deleteError) {
      setMessages(snapshot);
      setError(deleteError.message);
    }
  }

  async function deleteDm(messageId: string) {
    const snapshot = dmMessages;
    setDmMessages((prev) => prev.filter((message) => message.id !== messageId));
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("dm_messages")
      .delete()
      .eq("id", messageId);
    if (deleteError) {
      setDmMessages(snapshot);
      setError(deleteError.message);
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!user || messageId.startsWith("temp-")) return;
    const existing = reactions.find(
      (reaction) =>
        reaction.message_id === messageId &&
        reaction.user_id === user.id &&
        reaction.emoji === emoji,
    );
    const supabase = createClient();
    if (existing && !existing.id.startsWith("temp-")) {
      setReactions((prev) => prev.filter((reaction) => reaction.id !== existing.id));
      const { error: deleteError } = dmMode
        ? await supabase
            .from("dm_message_reactions")
            .delete()
            .eq("id", existing.id)
        : await supabase
            .from("message_reactions")
            .delete()
            .eq("id", existing.id);
      if (deleteError) {
        setReactions((prev) => upsertReaction(prev, existing));
        setError(deleteError.message);
      }
      return;
    }
    const temp: Reaction = {
      id: `temp-${crypto.randomUUID()}`,
      message_id: messageId,
      user_id: user.id,
      emoji,
      created_at: new Date().toISOString(),
    };
    setReactions((prev) => [...prev, temp]);
    const insertResult = dmMode
      ? await supabase
          .from("dm_message_reactions")
          .insert({ message_id: messageId, user_id: user.id, emoji })
          .select("*")
          .single()
      : await supabase
          .from("message_reactions")
          .insert({ message_id: messageId, user_id: user.id, emoji })
          .select("*")
          .single();
    const { data, error: insertError } = insertResult;
    if (insertError || !data) {
      setReactions((prev) => prev.filter((reaction) => reaction.id !== temp.id));
      setError(insertError?.message ?? "Could not add reaction");
      return;
    }
    setReactions((prev) =>
      upsertReaction(
        prev.filter((reaction) => reaction.id !== temp.id),
        data as Reaction,
      ),
    );
  }

  async function togglePin(message: ChatMessage) {
    if (message.id.startsWith("temp-")) return;
    if (message.is_system) return;
    const next = !message.pinned;
    const isDm = pane === "home" || dmMode;
    if (next && pane === "server" && activeChannelId) {
      const pinnedCount = [
        ...messages.filter((item) => item.pinned && item.channel_id === activeChannelId),
        ...pinnedExtra.filter((item) => item.pinned),
      ].filter(
        (item, index, list) =>
          list.findIndex((other) => other.id === item.id) === index,
      ).length;
      if (pinnedCount >= 250) {
        setError("This channel already has 250 pinned messages.");
        return;
      }
    }
    if (isDm) {
      setDmMessages((prev) =>
        prev.map((item) => (item.id === message.id ? { ...item, pinned: next } : item)),
      );
    } else {
      setMessages((prev) =>
        prev.map((item) => (item.id === message.id ? { ...item, pinned: next } : item)),
      );
      setPinnedExtra((prev) => {
        const updated = prev.map((item) =>
          item.id === message.id ? { ...item, pinned: next } : item,
        );
        if (next && !updated.some((item) => item.id === message.id)) {
          return [{ ...message, pinned: true }, ...updated];
        }
        return updated.filter((item) => item.pinned);
      });
    }
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from(isDm ? "dm_messages" : "messages")
      .update({ pinned: next })
      .eq("id", message.id);
    if (updateError) {
      if (isDm) {
        setDmMessages((prev) =>
          prev.map((item) =>
            item.id === message.id ? { ...item, pinned: message.pinned } : item,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.map((item) =>
            item.id === message.id ? { ...item, pinned: message.pinned } : item,
          ),
        );
      }
      setError(updateError.message);
      return;
    }
    // Discord: system notice when pinning (not itself pinnable).
    if (next && pane === "server" && activeChannelId && user) {
      const notice = `${profile?.username ?? "Someone"} pinned a message to this channel.`;
      const { data: systemRow } = await supabase
        .from("messages")
        .insert({
          channel_id: activeChannelId,
          user_id: user.id,
          content: notice,
          is_system: true,
          pinned: false,
        })
        .select("*")
        .single();
      if (systemRow) {
        setMessages((prev) => [
          ...prev,
          {
            ...systemRow,
            profiles: {
              username: profile?.username ?? "System",
              avatar_url: profile?.avatar_url ?? null,
            },
            reply_to: null,
          },
        ]);
      }
    }
  }

  async function markMessageUnread(message: ChatMessage) {
    if (!user || pane !== "server" || !activeChannelId) return;
    const at = new Date(Date.parse(message.created_at) - 1).toISOString();
    setReadAt((prev) => ({ ...prev, [activeChannelId]: at }));
    await saveChannelRead(user.id, activeChannelId, at);
    setToast("Marked as unread");
  }

  function copyMessageLink(message: ChatMessage) {
    if (!activeServerId) return;
    const url = `${window.location.origin}${messengerChannelPath(activeServerId, message.channel_id)}?msg=${message.id}`;
    void navigator.clipboard.writeText(url);
    setToast("Message link copied");
  }

  async function createThreadFromMessage(message: ChatMessage) {
    if (!user || !activeServer || !activeChannelId) return;
    const name =
      message.content.trim().slice(0, 80) ||
      `thread-${message.id.slice(0, 6)}`;
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("channel_threads")
      .insert({
        channel_id: activeChannelId,
        server_id: activeServer.id,
        starter_message_id: message.id,
        name,
        creator_id: user.id,
      })
      .select("*")
      .single();
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create thread.");
      return;
    }
    setChannelThreads((prev) => [data, ...prev]);
    setActiveThreadId(data.id);
    setToast(`Thread “${name}” created`);
  }

  async function forwardToTarget(target: {
    kind: "channel" | "dm";
    id: string;
    serverId?: string;
  }) {
    if (!user || !forwardMessage) return;
    const supabase = createClient();
    const content = forwardMessage.content || "(forwarded attachment)";
    const forwardedFrom = {
      from: forwardMessage.profiles?.username ?? "unknown",
      messageId: forwardMessage.id,
    };
    if (target.kind === "channel") {
      const { error: insertError } = await supabase.from("messages").insert({
        channel_id: target.id,
        user_id: user.id,
        content,
        message_kind: "default",
        forwarded_from: forwardedFrom,
        attachments: forwardMessage.attachments ?? [],
      });
      if (insertError) {
        setError(insertError.message);
        return;
      }
      setToast("Message forwarded");
      setForwardMessage(null);
      if (target.serverId) {
        router.push(messengerChannelPath(target.serverId, target.id));
      }
      return;
    }
    const { error: insertError } = await supabase.from("dm_messages").insert({
      conversation_id: target.id,
      user_id: user.id,
      content,
      attachments: forwardMessage.attachments ?? [],
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setToast("Message forwarded");
    setForwardMessage(null);
    router.push(messengerDmPath(target.id));
  }

  async function postPoll(poll: {
    question: string;
    options: string[];
    allowMultiple: boolean;
  }) {
    if (!user || !activeChannelId || !canSendMessages) return;
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({
        channel_id: activeChannelId,
        user_id: user.id,
        content: poll.question,
        message_kind: "poll",
        poll,
        thread_id: activeThreadId,
      })
      .select("*")
      .single();
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create poll.");
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        ...data,
        profiles: {
          username: profile?.username ?? "You",
          avatar_url: profile?.avatar_url ?? null,
        },
        reply_to: null,
      },
    ]);
  }

  async function votePoll(messageId: string, optionIndex: number) {
    if (!user) return;
    const supabase = createClient();
    const existing = pollVotesByMessage[messageId] ?? [];
    const mine = existing.find((vote) => vote.user_id === user.id);
    if (mine?.option_index === optionIndex) {
      await supabase
        .from("poll_votes")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id);
      setPollVotesByMessage((prev) => ({
        ...prev,
        [messageId]: existing.filter((vote) => vote.user_id !== user.id),
      }));
      return;
    }
    await supabase.from("poll_votes").upsert({
      message_id: messageId,
      user_id: user.id,
      option_index: optionIndex,
    });
    setPollVotesByMessage((prev) => {
      const without = (prev[messageId] ?? []).filter(
        (vote) => vote.user_id !== user.id,
      );
      return {
        ...prev,
        [messageId]: [
          ...without,
          { user_id: user.id, option_index: optionIndex },
        ],
      };
    });
  }

  async function leaveServer() {
    if (!user || !activeServer) return;
    if (activeServer.owner_id === user.id) {
      setError("Owners can't leave their server yet.");
      setLeaveOpen(false);
      return;
    }
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("server_members")
      .delete()
      .eq("server_id", activeServer.id)
      .eq("user_id", user.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await supabase
      .from("voice_states")
      .delete()
      .eq("user_id", user.id)
      .eq("server_id", activeServer.id);
    setLeaveOpen(false);
    setToast(`Left ${activeServer.name}`);
    router.push(messengerHomePath());
    void loadServers();
  }

  function openInvite() {
    if (!canCreateInvites) {
      setError("You don't have permission to create invites.");
      return;
    }
    setInviteOpen(true);
  }

  function openSettings(tab: SettingsTab = "overview") {
    if (!canOpenServerSettings) {
      setError("You don't have permission to open server settings.");
      return;
    }
    // Land on a tab the viewer can actually use.
    let next = tab;
    if (tab === "overview" && !(isServerOwner || canManageServer || myPerms.ADMINISTRATOR)) {
      if (canManageChannels) next = "channels";
      else if (canManageRoles) next = "roles";
      else if (canKickMembers || canManageRoles) next = "members";
      else if (canManageEmojis) next = "emojis";
      else if (canCreateInvites) next = "invites";
    }
    setSettingsTab(next);
    setSettingsOpen(true);
  }

  async function chooseFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    const remaining = MAX_ATTACHMENTS_PER_MESSAGE - pendingFiles.length;
    if (remaining <= 0) {
      setError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files.`);
      return;
    }
    const selected = files.slice(0, remaining);
    if (files.length > remaining) {
      setError(`Only ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
    }
    const next: PendingAttachment[] = [];
    for (const file of selected) {
      if (file.size > MAX_ATTACHMENT_BYTES && !file.type.startsWith("image/")) {
        setError(`"${file.name}" is too large (max 25 MB).`);
        continue;
      }
      const fitted = await fitImageToMaxBytes(file, MESSAGE_ATTACHMENT_MAX_BYTES, {
        maxEdge: 4096,
      });
      if (fitted.error) {
        setError(fitted.error);
        continue;
      }
      const ready = fitted.file;
      if (ready.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${file.name}" is too large (max 25 MB).`);
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file: ready,
        previewUrl: ready.type.startsWith("image/")
          ? URL.createObjectURL(ready)
          : null,
        spoiler: false,
      });
    }
    if (next.length > 0) {
      setPendingFiles((prev) => [...prev, ...next]);
    }
  }

  function removePendingFile(id: string) {
    setPendingFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  function togglePendingFileSpoiler(id: string) {
    setPendingFiles((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, spoiler: !item.spoiler } : item,
      ),
    );
  }

  async function pickGif(gif: GifResult) {
    setError(null);
    if (pendingFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
      setError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files.`);
      return;
    }
    try {
      // gif.url is already a first-party /api/m/:id proxy (no giphy host in browser).
      const res = await fetch(gif.url, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Could not download GIF");
      const blob = await res.blob();
      const safeTitle = (gif.title || "gif")
        .replace(/[^\w\-]+/g, "_")
        .slice(0, 40);
      const mime = blob.type.startsWith("image/") ? blob.type : "image/gif";
      const ext = mime.includes("webp") ? "webp" : "gif";
      const file = new File([blob], `${safeTitle || "gif"}.${ext}`, {
        type: mime,
      });
      await chooseFiles([file]);
    } catch {
      setError("Could not add that GIF.");
    }
  }

  async function pickSticker(sticker: { id: string; name: string; url: string }) {
    setError(null);
    if (pendingFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
      setError(`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files.`);
      return;
    }
    try {
      const res = await fetch(sticker.url);
      if (!res.ok) throw new Error("Could not download sticker");
      const blob = await res.blob();
      const mime = blob.type.startsWith("image/") ? blob.type : "image/png";
      const ext = mime.includes("gif")
        ? "gif"
        : mime.includes("webp")
          ? "webp"
          : "png";
      const file = new File([blob], `${sticker.name || "sticker"}.${ext}`, {
        type: mime,
      });
      await chooseFiles([file]);
    } catch {
      setError("Could not add that sticker.");
    }
  }

  const waitingForChannel =
    !needsSignIn &&
    (channelPending || (pane === "server" && !activeChannel && channels.length > 0));
  const headerTitle = dmMode
    ? (activeThread
        ? profileUi?.nicknameFor(activeThread.otherUserId) ||
          activeThread.username
        : "Direct Message")
    : homeEmpty
      ? "Direct Messages"
      : activeChannel?.name ??
        (waitingForChannel || (pane === "server" && loadingServers) ? "Loading…" : "No channel");
  const headerIcon = dmMode || homeEmpty ? (
    <MessagesSquare className="h-5 w-5 text-[var(--ms-text-muted)]" strokeWidth={1.75} />
  ) : activeChannel?.type === "voice" ? (
    <Volume2 className="h-5 w-5 text-[var(--ms-text-muted)]" strokeWidth={1.75} />
  ) : (
    <Hash className="h-5 w-5 text-[var(--ms-text-muted)]" strokeWidth={2.25} />
  );

  const speakingUserIds = useMemo(() => {
    if (!user || !voice.selfSpeaking) return voice.speakingUserIds;
    if (voice.speakingUserIds.has(user.id)) return voice.speakingUserIds;
    const next = new Set(voice.speakingUserIds);
    next.add(user.id);
    return next;
  }, [user, voice.selfSpeaking, voice.speakingUserIds]);

  const memberUserIds = useMemo(
    () => members.map((member) => member.user_id),
    [members],
  );

  const deviceProps = {
    inputDeviceId: voice.inputDeviceId,
    outputDeviceId: voice.outputDeviceId,
    inputs: voice.inputs,
    outputs: voice.outputs,
    onInputDeviceChange: voice.setInputDeviceId,
    onOutputDeviceChange: voice.setOutputDeviceId,
    inputVolume: voice.inputVolume,
    outputVolume: voice.outputVolume,
    onInputVolumeChange: voice.setInputVolume,
    onOutputVolumeChange: voice.setOutputVolume,
    onOpenDeviceMenus: voice.refreshDevices,
    micLevel: voice.micLevel,
    micError: voice.micError,
    cameraOn: voice.cameraOn,
    screenSharing: voice.screenSharing,
    onToggleCamera: () => void voice.toggleCamera(),
    onToggleScreenShare: () => void voice.toggleScreenShare(),
  };

  const voiceFooter = connection ? (
    <VoiceConnectionBar
      channelName={connection.channelName}
      serverName={connection.serverName}
      muted={muted}
      deafened={deafened}
      quality={voice.quality}
      onOpenChannel={() => {
        if (
          connection.serverId === activeServerId &&
          connection.channelId === activeChannelId
        ) {
          return;
        }
        router.push(messengerChannelPath(connection.serverId, connection.channelId));
      }}
      onToggleMute={voice.toggleMute}
      onToggleDeafen={voice.toggleDeafen}
      onLeave={() => void voice.leaveVoice()}
      {...deviceProps}
    />
  ) : call.connection ? (
    <VoiceConnectionBar
      direct
      channelName={call.connection.label}
      serverName={null}
      muted={call.muted}
      deafened={call.deafened}
      quality={call.quality}
      onToggleMute={call.toggleMute}
      onToggleDeafen={call.toggleDeafen}
      onLeave={() => void call.leaveCall()}
      micLevel={call.micLevel}
      micError={call.micError}
      cameraOn={call.cameraOn}
      screenSharing={call.screenSharing}
      onToggleCamera={() => void call.toggleCamera()}
      onToggleScreenShare={() => void call.toggleScreenShare()}
    />
  ) : null;

  const sidebarFooter = voiceFooter;

  return (
    <div className="messenger-shell flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <CallOverlay />
      <ServerRail
        servers={servers}
        activeServerId={activeServerId}
        unreadServerIds={unreadServerIds}
        homeActive={pane === "home"}
        discoverActive={discoverMode}
        loading={loadingServers}
        onHome={selectHome}
        onSelectServer={selectServer}
        onCreate={() => {
          if (!user) return;
          setCreateOpen(true);
        }}
        onDiscover={selectDiscover}
      />

      <ActivityTracker
        pane={pane}
        discoverMode={discoverMode}
        activeServer={activeServer}
        activeChannel={activeChannel}
        activeThread={activeThread}
        inVoice={!!connection}
        voiceServerName={connection?.serverName ?? null}
        voiceServerId={connection?.serverId ?? null}
        voiceServerPublic={
          connection
            ? (servers.find((s) => s.id === connection.serverId)?.is_public ??
              false)
            : false
        }
      />

      {discoverMode ? (
        <DiscoverPane
          footer={sidebarFooter}
          sidebarWidth={sidebarWidth}
          onSidebarResizeStart={beginResize}
          onJoined={(serverId) => {
            void loadServers();
            setToast("Joined server");
            router.push(messengerServerPath(serverId));
          }}
          onOpenServer={selectServer}
          onPreviewServer={selectPreviewServer}
        />
      ) : (
      <>
      <ResizableSidebar
        width={sidebarWidth}
        onResizeStart={beginResize}
        label="Resize channel sidebar"
        mobileOpen={mobileListOpen}
        onMobileClose={() => setMobileListOpen(false)}
      >
        {pane === "home" ? (
          <HomeSidebar
            threads={visibleThreads}
            activeThreadId={activeConversationId}
            loadingThreads={loadingThreads}
            typingUserIds={dmSidebarTypingIds}
            typingUserIdsKey={typingUserIdsKey}
            openCallIds={
              new Set(
                Object.keys(call.openCalls).filter(
                  (id) => call.connection?.conversationId !== id,
                ),
              )
            }
            onSelectThread={selectThread}
            onJoinCall={(threadId) => {
              const thread = threads.find((item) => item.id === threadId);
              if (!thread) return;
              const name =
                profileUi?.nicknameFor(thread.otherUserId) || thread.username;
              void call.joinCall({
                conversationId: thread.id,
                label: thread.groupName || thread.username || "Direct Call",
                peerUserIds: thread.isGroup
                  ? thread.participantIds ?? []
                  : [thread.otherUserId],
                peerNames:
                  !thread.isGroup && name
                    ? { [thread.otherUserId]: name }
                    : {},
                isGroup: !!thread.isGroup,
              });
            }}
            onCloseThread={(threadId) => void closeThread(threadId)}
            onCreateGroup={() => {
              if (!user) return;
              void (async () => {
                const { edges } = await loadFriendEdges(user.id);
                const { friends } = splitFriendEdges(user.id, edges);
                setFriendsForGroup(
                  friends.map((edge) => ({
                    id: edge.other.id,
                    username: edge.other.username,
                    avatar_url: edge.other.avatar_url,
                    status: edge.other.status,
                    status_text: edge.other.status_text,
                  })),
                );
                setGroupDmOpen(true);
              })();
            }}
            footer={sidebarFooter}
          />
        ) : activeServer && !channelPending ? (
          <ChannelSidebar
            serverId={activeServer.id}
            serverName={activeServer.name}
            categories={categories}
            channels={visibleChannels}
            activeChannelId={activeChannelId}
            unreadChannelIds={previewMode ? new Set() : unreadChannelIds}
            voiceStates={displayVoiceStates}
            membersById={membersById}
            speakingUserIds={speakingUserIds}
            loading={false}
            previewMode={previewMode}
            canLeave={!previewMode && activeServer.owner_id !== user?.id}
            canManageChannels={!previewMode && canManageChannels}
            connectedVoiceChannelId={
              previewMode ? null : connection?.channelId ?? null
            }
            onSelectChannel={selectChannel}
            onInvite={
              !previewMode && canCreateInvites ? openInvite : undefined
            }
            onSettings={
              !previewMode && canOpenServerSettings
                ? () => openSettings()
                : undefined
            }
            onCreateChannel={
              !previewMode && canManageChannels ? openCreateChannel : undefined
            }
            onCreateCategory={
              !previewMode && canManageChannels ? openCreateCategory : undefined
            }
            onRenameCategory={
              !previewMode && canManageChannels ? renameCategory : undefined
            }
            onEditChannel={
              !previewMode && canManageChannels
                ? (channelId) => setEditChannelId(channelId)
                : undefined
            }
            viewAsRoles={
              !previewMode &&
              (isServerOwner || canManageRoles || !!myPerms.ADMINISTRATOR)
                ? serverRoles.map((role) => ({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                  }))
                : undefined
            }
            onViewAsRole={
              !previewMode &&
              (isServerOwner || canManageRoles || !!myPerms.ADMINISTRATOR)
                ? (roleId) => setViewAsRoleId(roleId)
                : undefined
            }
            onLeave={() => setLeaveOpen(true)}
            footer={sidebarFooter}
          />
        ) : pane === "server" &&
          !!user &&
          (loadingServers || channelPending) ? (
          <aside className="flex h-full w-full flex-col bg-[var(--ms-sidebar)]">
            <div className="messenger-header flex h-12 items-center bg-[var(--ms-sidebar)] px-4 text-sm font-semibold text-white">
              Loading…
            </div>
            <div className="flex-1" />
            {sidebarFooter}
          </aside>
        ) : (
          <aside className="flex h-full w-full flex-col bg-[var(--ms-sidebar)]">
            <div className="messenger-header flex h-12 items-center bg-[var(--ms-sidebar)] px-4 text-sm font-semibold text-white">
              No server
            </div>
            <p className="flex-1 px-4 py-4 text-sm text-[var(--ms-text-muted)]">
              Create a server or open Home for direct messages.
            </p>
            {sidebarFooter}
          </aside>
        )}
      </ResizableSidebar>

      <div className="relative flex min-h-0 min-w-0 flex-1">
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--ms-chat)]">
          {pane === "server" && activeServer && (
            <div className="sm:hidden">
              <ServerHeaderMenu
                serverName={activeServer.name}
                interactive={!previewMode}
                roles={
                  !previewMode &&
                  (isServerOwner || canManageRoles || !!myPerms.ADMINISTRATOR)
                    ? serverRoles.map((role) => ({
                        id: role.id,
                        name: role.name,
                        color: role.color,
                      }))
                    : []
                }
                onInvite={
                  !previewMode && canCreateInvites ? openInvite : undefined
                }
                onSettings={
                  !previewMode && canOpenServerSettings
                    ? () => openSettings()
                    : undefined
                }
                onCreateChannel={
                  !previewMode && canManageChannels
                    ? () => openCreateChannel()
                    : undefined
                }
                onCreateCategory={
                  !previewMode && canManageChannels
                    ? openCreateCategory
                    : undefined
                }
                onViewAsRole={
                  !previewMode &&
                  (isServerOwner || canManageRoles || !!myPerms.ADMINISTRATOR)
                    ? (roleId) => setViewAsRoleId(roleId)
                    : undefined
                }
                onLeave={
                  !previewMode && activeServer.owner_id !== user?.id
                    ? () => setLeaveOpen(true)
                    : undefined
                }
              />
            </div>
          )}

          {viewAsRoleId && activeServer && !previewMode && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2">
              <p className="text-xs font-medium text-amber-100 sm:text-sm">
                Viewing as{" "}
                <span className="text-white">
                  {serverRoles.find((role) => role.id === viewAsRoleId)?.name ??
                    "role"}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setViewAsRoleId(null)}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-[var(--ms-text)] hover:bg-white/5"
              >
                Exit
              </button>
            </div>
          )}

          {previewMode && activeServer && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-accent/30 bg-accent/10 px-4 py-2">
              <p className="text-xs font-medium text-accent sm:text-sm">
                Previewing <span className="text-white">{activeServer.name}</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={selectDiscover}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--ms-text)] hover:bg-white/5"
                >
                  Back to Discover
                </button>
                <button
                  type="button"
                  disabled={joiningPreview}
                  onClick={() => void joinPreviewServer()}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                >
                  {joiningPreview ? "Joining…" : "Join Server"}
                </button>
              </div>
            </div>
          )}

          <ChannelHeader
            icon={headerIcon}
            title={headerTitle}
            topic={textMode && !channelPending ? activeChannel?.topic : null}
            searchOpen={searchOpen}
            pinsOpen={pinsOpen}
            membersOpen={membersOpen}
            chatOpen={voiceChatOpen}
            showSearch={(textMode || dmMode) && !channelPending}
            showPins={(textMode || dmMode) && !channelPending && !previewMode}
            showMembers={textMode && !!activeServer && !channelPending}
            showChat={voiceMode && !channelPending && !previewMode}
            showCall={
              dmMode &&
              !channelPending &&
              !!activeThread &&
              call.connection?.conversationId !== activeConversationId
            }
            joinCallAvailable={
              !!activeConversationId &&
              !!call.openCalls[activeConversationId] &&
              call.connection?.conversationId !== activeConversationId
            }
            pinCount={pinList.length}
            pinsButtonRef={pinsButtonRef}
            showInCall={!!call.connection && !call.stageExpanded}
            onExpandCall={() => call.setStageExpanded(true)}
            onToggleSearch={() => setSearchOpen((open) => !open)}
            onTogglePins={() => setPinsOpen((open) => !open)}
            onToggleMembers={() => setMembersOpen((open) => !open)}
            onToggleChat={() => setVoiceChatOpen((open) => !open)}
            onOpenList={() => setMobileListOpen(true)}
            onJoinCall={
              dmMode && activeThread && activeConversationId
                ? () =>
                    void call.joinCall({
                      conversationId: activeConversationId,
                      label:
                        activeThread.groupName ||
                        activeThread.username ||
                        "Direct Call",
                      peerUserIds: activeThread.isGroup
                        ? activeThread.participantIds ?? []
                        : [activeThread.otherUserId],
                      peerNames: activeThread.isGroup
                        ? {}
                        : {
                            [activeThread.otherUserId]:
                              profileUi?.nicknameFor(activeThread.otherUserId) ||
                              activeThread.username,
                          },
                      isGroup: !!activeThread.isGroup,
                    })
                : undefined
            }
            onStartCall={
              dmMode && activeThread && activeConversationId
                ? () =>
                    void call.startCall({
                      conversationId: activeConversationId,
                      label:
                        activeThread.groupName ||
                        activeThread.username ||
                        "Direct Call",
                      peerUserIds: activeThread.isGroup
                        ? activeThread.participantIds ?? []
                        : [activeThread.otherUserId],
                      peerNames: activeThread.isGroup
                        ? {}
                        : {
                            [activeThread.otherUserId]:
                              profileUi?.nicknameFor(activeThread.otherUserId) ||
                              activeThread.username,
                          },
                      isGroup: !!activeThread.isGroup,
                      withVideo: false,
                    })
                : undefined
            }
            onStartVideoCall={
              dmMode && activeThread && activeConversationId
                ? () =>
                    void call.startCall({
                      conversationId: activeConversationId,
                      label:
                        activeThread.groupName ||
                        activeThread.username ||
                        "Direct Call",
                      peerUserIds: activeThread.isGroup
                        ? activeThread.participantIds ?? []
                        : [activeThread.otherUserId],
                      peerNames: activeThread.isGroup
                        ? {}
                        : {
                            [activeThread.otherUserId]:
                              profileUi?.nicknameFor(activeThread.otherUserId) ||
                              activeThread.username,
                          },
                      isGroup: !!activeThread.isGroup,
                      withVideo: true,
                    })
                : undefined
            }
          />

          {needsSignIn ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-[var(--ms-text-muted)]">
                Sign in to open your servers and direct messages.
              </p>
              <Link
                href={`/login?next=${encodeURIComponent(pathname || "/messenger")}`}
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-[#dbdee1]"
              >
                Sign in
              </Link>
            </div>
          ) : null}

          {channelPending && !needsSignIn ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-sm text-[var(--ms-text-muted)]">
              Loading…
            </div>
          ) : null}

          {searchOpen && !channelPending && (
            <div className="border-b border-black/20 px-4 py-2">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search messages"
                className="w-full rounded-xl bg-[var(--ms-border)] px-3 py-2 text-sm text-white outline-none ring-1 ring-[#3f4147] placeholder:text-[var(--ms-text-faint)] focus:ring-2 focus:ring-accent/40"
              />
            </div>
          )}

          {pane === "server" && !channelPending && !needsSignIn && (
            <div className="flex gap-1 overflow-x-auto border-b border-black/20 px-2 py-2 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
              {channels.map((channel) => {
                const active = channel.id === activeChannelId;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => selectChannel(channel.id)}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${
                      active
                        ? "bg-accent/20 text-white ring-1 ring-accent/40"
                        : "bg-[var(--ms-sidebar)] text-[var(--ms-text-muted)] hover:bg-[#35373c] hover:text-[var(--ms-text)]"
                    }`}
                  >
                    {channel.type === "text" ? (
                      <Hash className="h-3 w-3" strokeWidth={2} />
                    ) : (
                      <Volume2 className="h-3 w-3" strokeWidth={2} />
                    )}
                    {channel.name}
                  </button>
                );
              })}
            </div>
          )}

          {pane === "home" && !needsSignIn && (
            <div className="flex gap-1 overflow-x-auto border-b border-black/20 px-2 py-2 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
              {visibleThreads.map((thread) => {
                const chipName = thread.isGroup
                  ? thread.groupName?.trim() ||
                    thread.username ||
                    "Group DM"
                  : profileUi?.nicknameFor(thread.otherUserId) || thread.username;
                return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => selectThread(thread.id)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium ${
                    thread.id === activeConversationId
                      ? "bg-accent/20 text-white ring-1 ring-accent/40"
                      : "bg-[var(--ms-sidebar)] text-[var(--ms-text-muted)] hover:bg-[#35373c] hover:text-[var(--ms-text)]"
                  }`}
                >
                  {chipName}
                </button>
                );
              })}
            </div>
          )}

          {error && (
            <div className="border-b border-[var(--ms-danger)]/40 bg-[#ed4245]/10 px-4 py-2 text-xs text-[var(--ms-danger)]">
              {error}
            </div>
          )}

          {pinsOpen && (textMode || dmMode) && pinsAnchor && typeof document !== "undefined"
            ? createPortal(
                <div
                  ref={pinsPanelRef}
                  role="dialog"
                  aria-label="Pinned messages"
                  style={{ top: pinsAnchor.top, right: pinsAnchor.right }}
                  className="fixed z-[70] max-h-96 w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-md border border-[var(--ms-border)] bg-[var(--ms-sidebar)] p-2 shadow-xl shadow-black/50"
                >
                  <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                    Pinned messages
                  </p>
                  {pinList.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-[var(--ms-text-muted)]">No pinned messages.</p>
                  ) : (
                    pinList.map((message) => (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => {
                          jumpToMessage(message.id);
                          setPinsOpen(false);
                        }}
                        className="block w-full rounded-md px-2 py-2 text-left hover:bg-[#404249]"
                      >
                        <p className="text-xs font-semibold text-[var(--ms-text)]">
                          {message.profiles?.username ?? "Unknown"}
                        </p>
                        <p className="truncate text-sm text-[var(--ms-text)]">
                          {message.content || "Attachment"}
                        </p>
                      </button>
                    ))
                  )}
                </div>,
                document.body,
              )
            : null}

          {homeEmpty && !needsSignIn && (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <MessagesSquare className="mb-3 h-12 w-12 text-[#4e5058]" strokeWidth={1.5} />
              <h2 className="text-xl font-semibold text-white">Your DMs</h2>
              <p className="mt-2 max-w-sm text-sm text-[var(--ms-text-muted)]">
                Pick a conversation from the sidebar, or message someone from a server member list.
              </p>
            </div>
          )}

          {dmMode && !channelPending && !needsSignIn && (
            <ChatTimeline
              messages={visibleDmMessages}
              loading={loadingDmMessages}
              emptyIcon="dm"
              emptyTitle={
                searchNeedle
                  ? "No matches"
                  : (activeThread?.groupName ||
                      activeThread?.username ||
                      "Direct message")
              }
              emptyBody={
                searchNeedle
                  ? "No messages match that search."
                  : activeThread?.isGroup
                    ? "This is the beginning of the group DM."
                    : `This is the beginning of your direct message history with ${activeThread?.username ?? "this user"}.`
              }
              scrollKey={activeConversationId ?? ""}
              currentUserId={user?.id ?? null}
              reactionMap={reactionMap}
              customEmojis={customEmojis}
              emojiCatalog={emojiCatalog}
              serverNamesById={serverNamesById}
              preferredServerId={null}
              reactorNamesById={reactorNamesById}
              hasMore={!searchNeedle && dmHasMore}
              loadingOlder={loadingOlderMessages}
              onLoadOlder={() => void loadOlderDm()}
              preferFriendNickname
              showChannelStart={!searchNeedle}
              onReply={setReplyTo}
              onEdit={editDm}
              onDelete={deleteDm}
              onJumpToReply={jumpToMessage}
              onReact={(messageId, emoji) =>
                void toggleReaction(messageId, emoji)
              }
              onTogglePin={(message) => void togglePin(message)}
              onForward={(message) => setForwardMessage(message)}
              onMarkUnread={undefined}
              onCopyLink={undefined}
            />
          )}

          {textMode && !channelPending && !needsSignIn && (
            <>
              {activeThreadId ? (
                <div className="messenger-header flex shrink-0 items-center gap-2 bg-[var(--ms-sidebar)] px-4 py-2">
                  <MessagesSquare className="h-4 w-4 text-[var(--ms-text-muted)]" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                    {channelThreads.find((thread) => thread.id === activeThreadId)?.name ??
                      "Thread"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveThreadId(null)}
                    className="rounded-md px-2 py-1 text-xs text-[var(--ms-text)] hover:bg-white/10"
                  >
                    Close
                  </button>
                </div>
              ) : null}
              <ChatTimeline
                messages={visibleMessages}
                loading={loadingChannelMessages}
                emptyIcon="hash"
                emptyTitle={
                  searchNeedle
                    ? "No matches"
                    : activeThreadId
                      ? "No messages in this thread yet"
                      : `Welcome to #${activeChannel?.name ?? "channel"}!`
                }
                emptyBody={
                  searchNeedle
                    ? "No messages match that search."
                    : activeThreadId
                      ? "Send a message to start the discussion."
                      : `This is the start of the #${activeChannel?.name ?? "channel"} channel.`
                }
                scrollKey={`${activeChannelId ?? ""}:${activeThreadId ?? "main"}`}
                currentUserId={user?.id ?? null}
                currentUsername={profile?.username ?? null}
                roleNames={roleNames}
                channelNames={channelNames}
                mentionMaps={mentionMaps}
                canDeleteOthers={!previewMode && canManageMessages}
                reactionMap={reactionMap}
                customEmojis={customEmojis}
                emojiCatalog={emojiCatalog}
                serverNamesById={serverNamesById}
                preferredServerId={activeServer?.id ?? null}
                reactorNamesById={reactorNamesById}
                serverNickByUserId={serverNickByUserId}
                roleColorByUserId={roleColorByUserId}
                hasMore={!searchNeedle && channelHasMore}
                loadingOlder={loadingOlderMessages}
                onLoadOlder={() => void loadOlderChannel()}
                readOnly={previewMode}
                showChannelStart={!searchNeedle && !activeThreadId}
                pollVotesByMessage={pollVotesByMessage}
                onReply={setReplyTo}
                onEdit={editChannel}
                onDelete={deleteChannel}
                onJumpToReply={jumpToMessage}
                onReact={
                  previewMode
                    ? undefined
                    : (messageId, emoji) => void toggleReaction(messageId, emoji)
                }
                onTogglePin={
                  previewMode || !canManageMessages
                    ? undefined
                    : (message) => void togglePin(message)
                }
                onForward={
                  previewMode
                    ? undefined
                    : (message) => setForwardMessage(message)
                }
                onMarkUnread={
                  previewMode
                    ? undefined
                    : (message) => void markMessageUnread(message)
                }
                onCreateThread={
                  previewMode || activeThreadId
                    ? undefined
                    : (message) => void createThreadFromMessage(message)
                }
                onCopyLink={
                  previewMode
                    ? undefined
                    : (message) => copyMessageLink(message)
                }
                onPollVote={
                  previewMode
                    ? undefined
                    : (messageId, optionIndex) =>
                        void votePoll(messageId, optionIndex)
                }
              />
            </>
          )}

          {voiceMode && !channelPending && !needsSignIn && activeChannel && (
            previewMode ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <Volume2 className="h-10 w-10 text-[#4e5058]" strokeWidth={1.5} />
                <p className="text-sm font-medium text-[var(--ms-text)]">
                  #{activeChannel.name}
                </p>
                <button
                  type="button"
                  disabled={joiningPreview}
                  onClick={() => void joinPreviewServer()}
                  className="mt-1 rounded-md bg-[var(--ms-connected)] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
                >
                  {joiningPreview ? "Joining…" : "Join Server"}
                </button>
              </div>
            ) : (
              <VoicePane
                channelName={activeChannel.name}
                joined={connectedHere}
                muted={muted}
                deafened={deafened}
                quality={voice.quality}
                currentUserId={user?.id ?? null}
                participants={displayVoiceStates.filter(
                  (state) => state.channel_id === activeChannel.id,
                )}
                membersById={membersById}
                speakingUserIds={speakingUserIds}
                onToggleMute={voice.toggleMute}
                onToggleDeafen={voice.toggleDeafen}
                onLeave={() => void voice.leaveVoice()}
                onRejoin={() => {
                  if (!activeServer) return;
                  if (!canConnectVoice) {
                    setError("You don't have permission to connect to voice.");
                    return;
                  }
                  voice.clearSkipAutoJoin(activeChannel.id);
                  void voice.joinVoice({
                    channelId: activeChannel.id,
                    serverId: activeServer.id,
                    channelName: activeChannel.name,
                    serverName: activeServer.name,
                  });
                }}
                {...deviceProps}
              />
            )
          )}

          {pane === "server" &&
            !needsSignIn &&
            !activeChannel &&
            !channelPending &&
            channels.length === 0 && (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--ms-text-muted)]">
              This server has no channels yet.
            </div>
          )}

          {previewMode && textMode && !channelPending && !needsSignIn && (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--ms-border)] bg-[var(--ms-sidebar)] px-4 py-3">
              <p className="min-w-0 text-sm text-[#b5bac1]">
                You&apos;re previewing this server. Join to chat in #
                {activeChannel?.name ?? "channel"}.
              </p>
              <button
                type="button"
                disabled={joiningPreview}
                onClick={() => void joinPreviewServer()}
                className="shrink-0 rounded-md bg-[var(--ms-connected)] px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
              >
                {joiningPreview ? "Joining…" : "Join Server"}
              </button>
            </div>
          )}

          {(textMode || dmMode) &&
            !needsSignIn &&
            !channelPending &&
            !previewMode &&
            (dmMode && dmBlocked ? (
              <div className="border-t border-[var(--ms-border)] bg-[var(--ms-sidebar)] px-4 py-3 text-sm text-[#f23f43]">
                You blocked this user. Unblock them from Friends → Blocked to
                message again.
              </div>
            ) : dmMode && dmBlockedByThem ? (
              <div className="border-t border-[var(--ms-border)] bg-[var(--ms-sidebar)] px-4 py-3 text-sm text-[#b5bac1]">
                This user has blocked you. You can&apos;t send them messages.
              </div>
            ) : (
              <MessageComposer
                placeholder={
                  textMode && !canSendMessages
                    ? "You don't have permission to send messages"
                    : replyTo
                      ? `Reply to @${replyTo.profiles?.username ?? "user"}`
                      : dmMode
                        ? `Message @${activeThread?.username ?? "user"}`
                        : `Message #${activeChannel?.name ?? "channel"}`
                }
                draft={draft}
                replyAuthor={
                  replyTo
                    ? isMessageHidden(replyTo.user_id)
                      ? "Blocked message"
                      : (replyTo.profiles?.username ?? "user")
                    : null
                }
                replyContent={
                  replyTo
                    ? isMessageHidden(replyTo.user_id)
                      ? "Blocked message"
                      : displayMentionText(replyTo.content, mentionMaps)
                    : null
                }
                replyPing={replyPing}
                onReplyPingChange={setReplyPing}
                pendingFiles={pendingFiles}
                sending={sending}
                allowAttach={
                  dmMode || (textMode && canSendMessages)
                }
                disabled={!user || (textMode && !canSendMessages)}
                mentionSuggestions={textMode ? mentionSuggestions : []}
                typingPeople={typingPeople}
                customEmojis={customEmojis}
                serverNamesById={serverNamesById}
                preferredServerId={dmMode ? null : (activeServer?.id ?? null)}
                onDraft={setDraft}
                onCancelReply={() => {
                  setReplyTo(null);
                  setReplyPing(true);
                }}
                onFiles={(files) => void chooseFiles(files)}
                onRemoveFile={removePendingFile}
                onToggleFileSpoiler={togglePendingFileSpoiler}
                onPickGif={(gif) => void pickGif(gif)}
                stickers={textMode ? serverStickers : []}
                onPickSticker={
                  textMode ? (sticker) => void pickSticker(sticker) : undefined
                }
                onOpenPoll={
                  textMode && canSendMessages
                    ? () => setPollOpen(true)
                    : undefined
                }
                onTyping={publishTyping}
                onTypingStop={publishTypingStop}
                onLimitReached={setError}
                onSubmit={(content) => {
                  if (dmMode) void sendDm(content);
                  else void sendChannel(content);
                }}
              />
            ))}
        </section>

        {textMode && !channelPending && membersOpen && (
          <button
            type="button"
            className="absolute inset-0 z-10 bg-black/40 lg:hidden"
            aria-label="Close members"
            onClick={() => setMembersOpen(false)}
          />
        )}
        {voiceMode && !channelPending && voiceChatOpen && (
          <button
            type="button"
            className="absolute inset-0 z-10 bg-black/40 lg:hidden"
            aria-label="Close voice chat"
            onClick={() => setVoiceChatOpen(false)}
          />
        )}
        {textMode && membersOpen ? (
          <MemberList
            members={visibleMembers}
            roles={serverRoles}
            ownerId={activeServer?.owner_id ?? null}
            currentUserId={user?.id ?? null}
            typingUserIds={typingUserIds}
            typingUserIdsKey={typingUserIdsKey}
            onMessage={startDm}
            className="absolute inset-y-0 right-0 z-20 flex shadow-2xl shadow-black/40 lg:static lg:shadow-none"
          />
        ) : null}
        {voiceMode && !channelPending && voiceChatOpen && (
          <aside
            className="absolute inset-y-0 right-0 z-20 flex flex-col border-l border-black/30 bg-[var(--ms-sidebar)] shadow-2xl shadow-black/40 sm:relative sm:z-auto sm:shadow-none"
            style={{ width: `min(100%, ${voiceChatWidth}px)` }}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize voice chat"
              aria-valuemin={VOICE_CHAT_MIN}
              aria-valuemax={VOICE_CHAT_MAX}
              aria-valuenow={voiceChatWidth}
              onPointerDown={beginVoiceChatResize}
              className="group absolute inset-y-0 -left-1 z-30 hidden w-2 cursor-ew-resize touch-none sm:block"
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-accent group-active:bg-accent" />
            </div>
            <div className="messenger-header flex h-12 shrink-0 items-center bg-[var(--ms-sidebar)] px-4 text-sm font-semibold text-white">
              Voice Chat
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <ChatTimeline
                messages={visibleMessages}
                loading={loadingChannelMessages}
                emptyIcon="hash"
                emptyTitle={`Welcome to ${activeChannel?.name ?? "voice"} chat`}
                emptyBody="This chat is for people in this voice channel. Messages stay with the channel."
                scrollKey={`voice:${activeChannelId ?? ""}`}
                currentUserId={user?.id ?? null}
                currentUsername={profile?.username ?? null}
                roleNames={roleNames}
                channelNames={channelNames}
                mentionMaps={mentionMaps}
                canDeleteOthers={canManageMessages}
                reactionMap={reactionMap}
                customEmojis={customEmojis}
                emojiCatalog={emojiCatalog}
                serverNamesById={serverNamesById}
                preferredServerId={activeServer?.id ?? null}
                reactorNamesById={reactorNamesById}
                serverNickByUserId={serverNickByUserId}
                roleColorByUserId={roleColorByUserId}
                hasMore={channelHasMore}
                loadingOlder={loadingOlderMessages}
                onLoadOlder={() => void loadOlderChannel()}
                onReply={setReplyTo}
                onEdit={editChannel}
                onDelete={deleteChannel}
                onJumpToReply={jumpToMessage}
                onReact={(messageId, emoji) =>
                  void toggleReaction(messageId, emoji)
                }
                onTogglePin={
                  canManageMessages
                    ? (message) => void togglePin(message)
                    : undefined
                }
                onForward={(message) => setForwardMessage(message)}
                onMarkUnread={(message) => void markMessageUnread(message)}
                onCreateThread={
                  activeThreadId
                    ? undefined
                    : (message) => void createThreadFromMessage(message)
                }
                onCopyLink={(message) => copyMessageLink(message)}
                pollVotesByMessage={pollVotesByMessage}
                onPollVote={(messageId, optionIndex) =>
                  void votePoll(messageId, optionIndex)
                }
              />
              <MessageComposer
                placeholder={
                  !canSendMessages
                    ? "You don't have permission to send messages"
                    : replyTo
                      ? `Reply to @${replyTo.profiles?.username ?? "user"}`
                      : `Message ${activeChannel?.name ?? "voice"}`
                }
                draft={draft}
                replyAuthor={
                  replyTo
                    ? isMessageHidden(replyTo.user_id)
                      ? "Blocked message"
                      : (replyTo.profiles?.username ?? "user")
                    : null
                }
                replyContent={
                  replyTo
                    ? isMessageHidden(replyTo.user_id)
                      ? "Blocked message"
                      : displayMentionText(replyTo.content, mentionMaps)
                    : null
                }
                replyPing={replyPing}
                onReplyPingChange={setReplyPing}
                pendingFiles={pendingFiles}
                sending={sending}
                allowAttach={canSendMessages}
                disabled={!user || !canSendMessages}
                mentionSuggestions={mentionSuggestions}
                typingPeople={typingPeople}
                customEmojis={customEmojis}
                serverNamesById={serverNamesById}
                preferredServerId={activeServer?.id ?? null}
                onDraft={setDraft}
                onCancelReply={() => {
                  setReplyTo(null);
                  setReplyPing(true);
                }}
                onFiles={(files) => void chooseFiles(files)}
                onRemoveFile={removePendingFile}
                onToggleFileSpoiler={togglePendingFileSpoiler}
                onPickGif={(gif) => void pickGif(gif)}
                stickers={serverStickers}
                onPickSticker={(sticker) => void pickSticker(sticker)}
                onOpenPoll={
                  canSendMessages ? () => setPollOpen(true) : undefined
                }
                onTyping={publishTyping}
                onTypingStop={publishTypingStop}
                onLimitReached={setError}
                onSubmit={(content) => void sendChannel(content)}
              />
            </div>
          </aside>
        )}
      </div>
      </>
      )}

      {user && (
        <CreateServerModal
          open={createOpen}
          userId={user.id}
          onClose={() => setCreateOpen(false)}
          onCreated={(serverId) => {
            void loadServers();
            router.push(messengerServerPath(serverId));
          }}
        />
      )}

      {user && activeServer && (
        <CreateCategoryModal
          open={createCategoryOpen}
          serverId={activeServer.id}
          categoryCount={categories.length}
          onClose={() => setCreateCategoryOpen(false)}
          onCreated={(category) => {
            setCategories((prev) =>
              [...prev, category].sort((a, b) => a.position - b.position),
            );
          }}
        />
      )}

      {user && activeServer && (
        <CreateChannelModal
          open={createChannelOpen}
          serverId={activeServer.id}
          categories={categories}
          channelCount={channels.length}
          initialType={createChannelType}
          initialCategoryId={createChannelCategoryId}
          onClose={() => setCreateChannelOpen(false)}
          onCreated={(channel, nextCategories) => {
            setCategories(nextCategories);
            setChannels((prev) => {
              if (prev.some((item) => item.id === channel.id)) return prev;
              return [...prev, channel];
            });
            setChannelServerMap((prev) => ({
              ...prev,
              [channel.id]: activeServer.id,
            }));
            router.push(messengerChannelPath(activeServer.id, channel.id));
          }}
        />
      )}

      {user && activeServer && (
        <EditChannelModal
          open={!!editChannelId}
          channel={
            channels.find((channel) => channel.id === editChannelId) ?? null
          }
          roles={serverRoles}
          onClose={() => setEditChannelId(null)}
          onSaved={(next) => {
            setChannels((prev) =>
              prev.map((channel) => (channel.id === next.id ? next : channel)),
            );
          }}
          onDuplicated={(next) => {
            setChannels((prev) => [...prev, next].sort((a, b) => a.position - b.position));
            setChannelServerMap((prev) => ({
              ...prev,
              [next.id]: activeServer.id,
            }));
            setEditChannelId(next.id);
          }}
        />
      )}

      {user && activeServer && (
        <InvitePeopleModal
          open={inviteOpen}
          server={activeServer}
          userId={user.id}
          memberUserIds={memberUserIds}
          onClose={() => setInviteOpen(false)}
        />
      )}

      <ForwardMessageModal
        open={!!forwardMessage}
        preview={forwardMessage?.content ?? ""}
        servers={servers}
        channelsByServer={channelsByServerForForward}
        threads={threads}
        onClose={() => setForwardMessage(null)}
        onForward={(target) => void forwardToTarget(target)}
      />

      {user && (
        <CreateGroupDmModal
          open={groupDmOpen}
          userId={user.id}
          friends={friendsForGroup}
          onClose={() => setGroupDmOpen(false)}
          onCreated={(conversationId) => {
            setGroupDmOpen(false);
            void refreshThreads();
            router.push(messengerDmPath(conversationId));
          }}
        />
      )}

      <CreatePollModal
        open={pollOpen}
        onClose={() => setPollOpen(false)}
        onCreate={(poll) => void postPoll(poll)}
      />

      {user && activeServer && (
        <ServerSettingsModal
          open={settingsOpen && canOpenServerSettings}
          server={activeServer}
          userId={user.id}
          members={members}
          channels={channels}
          categories={categories}
          initialTab={settingsTab}
          isOwner={isServerOwner}
          canManageServer={canManageServer || !!myPerms.ADMINISTRATOR}
          canManageChannels={canManageChannels}
          canManageRoles={canManageRoles || !!myPerms.ADMINISTRATOR}
          canKickMembers={canKickMembers || !!myPerms.ADMINISTRATOR}
          canBanMembers={canBanMembers || !!myPerms.ADMINISTRATOR}
          canCreateInvites={canCreateInvites}
          canManageEmojis={canManageEmojis || !!myPerms.ADMINISTRATOR}
          actorRoleIds={myRoleIds}
          onClose={() => setSettingsOpen(false)}
          onServerUpdated={(next) => {
            setServers((prev) => prev.map((server) => (server.id === next.id ? next : server)));
          }}
          onChannelsChanged={(nextChannels, nextCategories) => {
            setChannels(nextChannels);
            setCategories(nextCategories);
            setChannelServerMap((prev) => {
              const next = { ...prev };
              for (const channel of nextChannels) next[channel.id] = activeServer.id;
              return next;
            });
          }}
          onMembersChanged={setMembers}
          onRolesChanged={setServerRoles}
          onEmojisChanged={() => {
            void loadCustomEmojis();
            if (!activeServer) return;
            const supabase = createClient();
            void supabase
              .from("server_stickers")
              .select("id, name, url")
              .eq("server_id", activeServer.id)
              .then(({ data }) => {
                setServerStickers(data ?? []);
              });
          }}
          onAutomodChanged={() => {
            if (!activeServer) return;
            const supabase = createClient();
            void supabase
              .from("server_automod_rules")
              .select("id, enabled, keywords, action")
              .eq("server_id", activeServer.id)
              .then(({ data }) => {
                setAutomodRules((data as AutomodRule[]) ?? []);
              });
          }}
        />
      )}

      {leaveOpen && activeServer && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Cancel leave"
            onClick={() => setLeaveOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-md border border-[var(--ms-border)] bg-[var(--ms-chat)] p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Leave {activeServer.name}?</h2>
            <p className="mt-2 text-sm text-[#b5bac1]">
              You can rejoin later with an invite link.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLeaveOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-[var(--ms-text)] hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void leaveServer()}
                className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
              >
                Leave server
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-md border border-[var(--ms-border)] bg-[#111214] px-4 py-2.5 text-sm text-white shadow-lg shadow-black/40"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
    {sidebarFooter ? (
      <div className="shrink-0 border-t border-[var(--ms-border)] bg-[var(--ms-sidebar)] sm:hidden">
        {sidebarFooter}
      </div>
    ) : null}
    </div>
  );
}
