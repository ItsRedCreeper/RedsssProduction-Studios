"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  recallServerChannel,
  rememberMessengerPath,
  rememberServerChannel,
} from "@/lib/messenger-routes";
import { CreateServerModal } from "@/components/messenger/CreateServerModal";
import { CreateChannelModal } from "@/components/messenger/CreateChannelModal";
import { CreateCategoryModal } from "@/components/messenger/CreateCategoryModal";
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
} from "@/components/messenger/MessageComposer";
import type { TypingPerson } from "@/components/messenger/TypingIndicator";
import { MemberList } from "@/components/messenger/MemberList";
import { VoicePane } from "@/components/messenger/VoicePane";
import { VoiceConnectionBar } from "@/components/messenger/VoiceConnectionBar";
import { ResizableSidebar } from "@/components/messenger/ResizableSidebar";
import { ServerHeaderMenu } from "@/components/messenger/ServerHeaderMenu";
import { ServerSettingsModal } from "@/components/messenger/ServerSettingsModal";
import {
  useVoiceSession,
  VOICE_STALE_AFTER_MS,
} from "@/components/messenger/voice/VoiceSessionProvider";
import { useMessengerSidebarWidth } from "@/hooks/useMessengerSidebarWidth";
import {
  dmRowsToMessages,
  fetchLastMessageMap,
  groupReactions,
  hydrateMessages,
  loadChannelMessages,
  loadProfiles,
  loadSingleMessage,
  saveChannelRead,
  uploadAttachment,
  upsertReaction,
} from "@/components/messenger/data";
import { can, mergeRolePermissions, PERMISSIONS } from "@/lib/permissions";
import { encodeMentions, type MentionMaps } from "@/lib/mentions";
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

const MAX_FILE_BYTES = 10 * 1024 * 1024;

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
  const { user, profile } = useCurrentProfile();
  const voice = useVoiceSession();

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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState<"text" | "voice">("text");
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | null>(null);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);
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
  const [loadingChannelMessages, setLoadingChannelMessages] = useState(false);
  const [loadingDmMessages, setLoadingDmMessages] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
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

  paneRef.current = pane;
  routeServerRef.current = routeServerId;
  activeChannelRef.current = activeChannelId;
  conversationRef.current = activeConversationId;
  userIdRef.current = user?.id ?? null;
  channelIdsRef.current = new Set(channels.map((channel) => channel.id));
  messageIdsRef.current = new Set(messages.map((message) => message.id));

  const activeServer = servers.find((server) => server.id === activeServerId) ?? null;
  const activeChannel = channels.find((channel) => channel.id === activeChannelId) ?? null;
  const activeThread =
    threads.find((thread) => thread.id === activeConversationId) ?? null;
  const textMode = pane === "server" && activeChannel?.type === "text";
  const voiceMode = pane === "server" && activeChannel?.type === "voice";
  const dmMode = pane === "home" && !!activeConversationId;
  const homeEmpty = pane === "home" && !activeConversationId;
  const discoverMode = discover || pane === "discover";
  const channelPending =
    pane === "server" &&
    !!activeServerId &&
    (loadingChannels || loadedServerId !== activeServerId);
  const connection = voice.connection;
  const muted = voice.muted;
  const deafened = voice.deafened;
  const displayName = profile?.username ?? "You";
  const { width: sidebarWidth, beginResize } = useMessengerSidebarWidth();
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
    const withoutSelf = fresh.filter((state) => state.user_id !== user.id);
    return [...withoutSelf, selfRow];
  }, [voiceStates, user, connection, activeServerId, muted, deafened]);

  const scope = `${pane}:${activeChannelId ?? ""}:${activeConversationId ?? ""}`;
  const scopeRef = useRef(scope);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    rememberMessengerPath(pathname);
  }, [pathname]);

  useEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    setDraft("");
    setReplyTo(null);
    setPendingFile(null);
    setSearchQuery("");
    setPinsOpen(false);
  }, [scope]);

  const loadServers = useCallback(async () => {
    if (!user) return;
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
    if (serverIds.length === 0) {
      setServers([]);
      setLoadingServers(false);
      if (paneRef.current === "server") router.replace(messengerHomePath());
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
        !next.some((server) => server.id === routeServerRef.current)
      ) {
        router.replace(messengerHomePath());
      }
    }
    setLoadingServers(false);
  }, [user, router]);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const refreshThreads = useCallback(async () => {
    if (!user) return;
    setLoadingThreads(true);
    const supabase = createClient();
    const { data: mine, error: mineError } = await supabase
      .from("dm_participants")
      .select("conversation_id")
      .eq("user_id", user.id);
    if (mineError) {
      setError(mineError.message);
      setThreads([]);
      setLoadingThreads(false);
      return;
    }
    const ids = (mine ?? []).map((row) => row.conversation_id);
    if (ids.length === 0) {
      setThreads([]);
      setLoadingThreads(false);
      return;
    }
    const { data: parts, error: partsError } = await supabase
      .from("dm_participants")
      .select("*")
      .in("conversation_id", ids);
    if (partsError || !parts) {
      if (partsError) setError(partsError.message);
      setLoadingThreads(false);
      return;
    }
    const others = parts.filter((row) => row.user_id !== user.id);
    const profiles = await loadProfiles(others.map((row) => row.user_id));
    const profileMap = new Map(profiles.map((item) => [item.id, item]));
    const next = await Promise.all(
      others.map(async (part) => {
        const { data: last } = await supabase
          .from("dm_messages")
          .select("content, created_at")
          .eq("conversation_id", part.conversation_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const other = profileMap.get(part.user_id);
        return {
          id: part.conversation_id,
          otherUserId: part.user_id,
          username: other?.username ?? "Unknown",
          avatar_url: other?.avatar_url ?? null,
          status: other?.status ?? "offline",
          preview: last?.content ?? null,
          previewAt: last?.created_at ?? null,
        } satisfies DmThread;
      }),
    );
    next.sort((a, b) => {
      const left = a.previewAt ? Date.parse(a.previewAt) : 0;
      const right = b.previewAt ? Date.parse(b.previewAt) : 0;
      return right - left || a.username.localeCompare(b.username);
    });
    setThreads(next);
    setLoadingThreads(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void refreshThreads();
  }, [user, refreshThreads]);

  const openDm = useCallback(
    async (otherUserId: string) => {
      if (!user || otherUserId === user.id) return null;
      const existing = dmLocks.current.get(otherUserId);
      if (existing) return existing;

      const promise = (async () => {
        const supabase = createClient();
        const { data: mine, error: mineError } = await supabase
          .from("dm_participants")
          .select("conversation_id")
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
          await refreshThreads();
          return match.conversation_id;
        }

        const { data: convo, error: convoError } = await supabase
          .from("dm_conversations")
          .insert({})
          .select("*")
          .single();
        if (convoError || !convo) {
          setError(convoError?.message ?? "Could not start a conversation.");
          return null;
        }
        const { error: selfPartError } = await supabase.from("dm_participants").insert({
          conversation_id: convo.id,
          user_id: user.id,
        });
        if (selfPartError) {
          setError(selfPartError.message);
          return null;
        }
        const { error: otherPartError } = await supabase.from("dm_participants").insert({
          conversation_id: convo.id,
          user_id: otherUserId,
        });
        if (otherPartError) {
          setError(otherPartError.message);
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
    [user, refreshThreads],
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

  useEffect(() => {
    if (!activeServerId) {
      setChannels([]);
      setCategories([]);
      setMembers([]);
      setLoadedServerId(null);
      setLoadingChannels(false);
      return;
    }
    const serverId = activeServerId;
    const supabase = createClient();
    let cancelled = false;
    setChannels([]);
    setCategories([]);
    setServerRoles([]);
    setMembers([]);
    setMessages([]);
    setReactions([]);
    setLoadedServerId(null);
    setLoadingChannels(true);

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
      setChannels(nextChannels);
      setCategories(categoryResult.data ?? []);
      setServerRoles((rolesTable.data as Role[] | null) ?? []);
      setChannelServerMap((prev) => {
        const next = { ...prev };
        for (const channel of nextChannels) next[channel.id] = serverId;
        return next;
      });
      const profiles = await loadProfiles(
        (memberResult.data ?? []).map((row) => row.user_id),
      );
      if (cancelled) return;
      const profileMap = new Map(profiles.map((item) => [item.id, item]));
      const rolesByUser = new Map<string, string[]>();
      for (const row of roleResult.data ?? []) {
        const list = rolesByUser.get(row.user_id) ?? [];
        list.push(row.role_id);
        rolesByUser.set(row.user_id, list);
      }
      setMembers(
        (memberResult.data ?? []).map((row) => {
          const memberProfile = profileMap.get(row.user_id);
          const fromJunction = rolesByUser.get(row.user_id) ?? [];
          const roleIds =
            fromJunction.length > 0
              ? fromJunction
              : row.role_id
                ? [row.role_id]
                : [];
          return {
            user_id: row.user_id,
            nickname: row.nickname,
            joined_at: row.joined_at,
            username: memberProfile?.username ?? "Unknown",
            avatar_url: memberProfile?.avatar_url ?? null,
            status: memberProfile?.status ?? "offline",
            status_text: memberProfile?.status_text ?? null,
            roleIds,
          };
        }),
      );
      setLoadedServerId(serverId);
      setLoadingChannels(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeServerId]);

  useEffect(() => {
    if (pane !== "server" || !routeServerId) return;
    if (loadingChannels || loadedServerId !== routeServerId) return;

    const channelValid =
      !!routeChannelId && channels.some((channel) => channel.id === routeChannelId);
    if (channelValid && routeChannelId) {
      const current = channels.find((channel) => channel.id === routeChannelId);
      // Only remember text channels so returning to a server doesn't auto-open voice.
      if (current?.type === "text") {
        rememberServerChannel(routeServerId, routeChannelId);
      }
      rememberMessengerPath(pathname);
      return;
    }
    if (channels.length === 0) return;

    const target = pickFallbackChannel(channels, routeServerId);
    if (!target || target.id === routeChannelId) return;
    router.replace(messengerChannelPath(routeServerId, target.id));
  }, [
    pane,
    routeServerId,
    routeChannelId,
    channels,
    loadingChannels,
    loadedServerId,
    pathname,
    router,
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

  useEffect(() => {
    if (!activeServerId) {
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
  }, [activeServerId]);

  useEffect(() => {
    if (!activeChannelId || !activeChannel || activeChannel.type === "voice") {
      if (activeChannel?.type === "voice") {
        setMessages([]);
        setReactions([]);
      }
      return;
    }
    const channelId = activeChannelId;
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      setLoadingChannelMessages(true);
      const result = await loadChannelMessages(channelId);
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
        setMessages([]);
      } else {
        setMessages(result.messages);
        const newest = result.messages[result.messages.length - 1]?.created_at;
        if (newest) {
          setLastMessageAt((prev) => ({ ...prev, [channelId]: newest }));
        }
      }
      const ids = (result.messages ?? [])
        .map((message) => message.id)
        .filter((id) => !id.startsWith("temp-"));
      if (ids.length > 0) {
        const { data } = await supabase
          .from("message_reactions")
          .select("*")
          .in("message_id", ids);
        if (!cancelled) setReactions(data ?? []);
      } else if (!cancelled) {
        setReactions([]);
      }
      setLoadingChannelMessages(false);
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
          if (cancelled) return;
          const row = payload.new as Tables<"messages">;
          const full = await loadSingleMessage(row.id);
          if (cancelled) return;
          const nextMessage =
            full ??
            ({
              ...row,
              profiles: null,
              reply_to: null,
            } as ChatMessage);
          setMessages((prev) => mergeIncoming(prev, nextMessage));
          setLastMessageAt((prev) => ({ ...prev, [channelId]: nextMessage.created_at }));
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
  }, [activeChannelId, activeChannel?.type]);

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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      setDmMessages([]);
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
        .order("created_at", { ascending: true })
        .limit(100);
      if (cancelled) return;
      if (dmError || !data) {
        setError(dmError?.message ?? "Failed to load direct messages");
        setDmMessages([]);
        setLoadingDmMessages(false);
        return;
      }
      const rows = dmRowsToMessages(data);
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
      if (cancelled) return;
      setDmMessages(hydrateMessages(rows, profiles, parents));
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

  useEffect(() => {
    if (!activeChannelId || activeChannel?.type !== "text" || !user) {
      setTypingUsers({});
      typingChannelRef.current = null;
      return;
    }
    const channelId = activeChannelId;
    const selfId = user.id;
    const supabase = createClient();
    const channel = supabase
      .channel(`typing:${channelId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const data = payload as {
          userId?: string;
          username?: string;
          avatarUrl?: string | null;
        };
        const userId = data.userId;
        if (!userId || userId === selfId) return;
        setTypingUsers((prev) => ({
          ...prev,
          [userId]: {
            until: Date.now() + 3500,
            username: data.username || prev[userId]?.username || "Someone",
            avatarUrl:
              data.avatarUrl ?? prev[userId]?.avatarUrl ?? null,
          },
        }));
      })
      .subscribe();
    typingChannelRef.current = channel;
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
    }, 1000);
    return () => {
      window.clearInterval(tick);
      typingChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [activeChannelId, activeChannel?.type, user]);

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

  const mentionSuggestions = useMemo<MentionSuggestion[]>(() => {
    const users = members.map((member) => ({
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
  }, [members, serverRoles, channels]);

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

  const typingPeople = useMemo<TypingPerson[]>(() => {
    const now = Date.now();
    return Object.entries(typingUsers)
      .filter(([, info]) => info.until > now)
      .map(([userId, info]) => {
        const member = membersById.get(userId);
        return {
          userId,
          username: member?.username || info.username || "Someone",
          avatarUrl: member?.avatar_url ?? info.avatarUrl ?? null,
        };
      })
      // Stable order so avatar stacks don't jump while people keep typing.
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [typingUsers, membersById]);

  const typingChannelRef = useRef<ReturnType<
    ReturnType<typeof createClient>["channel"]
  > | null>(null);
  const lastTypingSentRef = useRef(0);

  const publishTyping = useCallback(() => {
    const userId = user?.id;
    const channel = typingChannelRef.current;
    if (!userId || !channel) return;
    const now = Date.now();
    // Throttle so multi-user typing stays responsive without flooding Realtime.
    if (now - lastTypingSentRef.current < 1200) return;
    lastTypingSentRef.current = now;
    void channel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId,
        username: profile?.username ?? "Someone",
        avatarUrl: profile?.avatar_url ?? null,
      },
    });
  }, [user?.id, profile?.username, profile?.avatar_url]);

  const unreadChannelIds = useMemo(() => {
    const unread = new Set<string>();
    for (const channel of channels) {
      if (channel.type !== "text") continue;
      if (pane === "server" && channel.id === activeChannelId) continue;
      const last = lastMessageAt[channel.id];
      if (!last) continue;
      const read = readAt[channel.id];
      if (!read || Date.parse(last) > Date.parse(read)) unread.add(channel.id);
    }
    return unread;
  }, [channels, pane, activeChannelId, lastMessageAt, readAt]);

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

  const pinList = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const message of pinnedExtra) {
      if (message.pinned) map.set(message.id, message);
    }
    for (const message of messages) {
      if (message.pinned) map.set(message.id, message);
    }
    return [...map.values()].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  }, [messages, pinnedExtra]);

  const searchNeedle = searchQuery.trim().toLowerCase();
  const visibleMessages = searchNeedle
    ? messages.filter((message) =>
        `${message.content} ${message.profiles?.username ?? ""}`
          .toLowerCase()
          .includes(searchNeedle),
      )
    : messages;
  const visibleDmMessages = searchNeedle
    ? dmMessages.filter((message) =>
        `${message.content} ${message.profiles?.username ?? ""}`
          .toLowerCase()
          .includes(searchNeedle),
      )
    : dmMessages;

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
    if (serverId === activeServerId) return;
    router.push(messengerServerPath(serverId));
  }

  function selectChannel(channelId: string) {
    if (!activeServerId) return;
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
    if (pane === "home" && dmParam === otherUserId) {
      void openDm(otherUserId).then((id) => {
        if (id) router.replace(messengerDmPath(id));
      });
      return;
    }
    router.push(`${messengerHomePath()}?dm=${otherUserId}`);
  }

  function selectThread(threadId: string) {
    if (threadId === activeConversationId) return;
    router.push(messengerDmPath(threadId));
  }

  function jumpToMessage(messageId: string) {
    const element = document.getElementById(`message-${messageId}`);
    if (!element) {
      setToast("That message isn't in the loaded history.");
      return;
    }
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("bg-accent-muted");
    window.setTimeout(() => element.classList.remove("bg-accent-muted"), 1200);
    setPinsOpen(false);
  }

  async function sendChannel() {
    if (!user || !activeChannelId || activeChannel?.type !== "text" || sending) return;
    if (!canSendMessages) {
      setError("You don't have permission to send messages.");
      return;
    }
    const channelId = activeChannelId;
    const content = draft.trim();
    const file = pendingFile;
    if (!content && !file) return;
    if (file && file.size > MAX_FILE_BYTES) {
      setError("Files must be 10MB or smaller.");
      return;
    }
    // Discord-style: store <@id> tokens so display names (incl. spaces) resolve correctly.
    const encoded = content
      ? encodeMentions(content, {
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
    const text = encoded || file?.name || "";
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
      edited_at: null,
      attachment_url: null,
      attachment_type: file?.type || null,
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
    setPendingFile(null);
    setError(null);
    setSending(true);
    setMessages((prev) => [...prev, optimistic]);

    let attachmentUrl: string | null = null;
    let attachmentType: string | null = null;
    if (file) {
      const uploaded = await uploadAttachment(user.id, file);
      if (uploaded.error || !uploaded.url) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === tempId ? { ...message, failed: true } : message,
          ),
        );
        setError(uploaded.error ?? "Upload failed");
        setDraft(content);
        setPendingFile(file);
        if (replySnapshot) setReplyTo(replySnapshot);
        setSending(false);
        return;
      }
      attachmentUrl = uploaded.url;
      attachmentType = file.type || "application/octet-stream";
    }

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({
        channel_id: channelId,
        user_id: user.id,
        content: text,
        reply_to_id: replySnapshot?.id ?? null,
        attachment_url: attachmentUrl,
        attachment_type: attachmentType,
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
      if (replySnapshot) setReplyTo(replySnapshot);
      setSending(false);
      return;
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
    if (text.includes("<@") || content.includes("@")) {
      void supabase.rpc("notify_message_mentions", {
        p_message_id: saved.id,
        p_channel_id: channelId,
        p_author_id: user.id,
        p_content: text,
      });
    }
    setSending(false);
  }

  async function sendDm() {
    if (!user || !activeConversationId || sending) return;
    const conversationId = activeConversationId;
    const content = draft.trim();
    if (!content) return;
    const tempId = `temp-${crypto.randomUUID()}`;
    const replySnapshot = replyTo;
    const optimistic: ChatMessage = {
      id: tempId,
      channel_id: conversationId,
      user_id: user.id,
      content,
      created_at: new Date().toISOString(),
      reply_to_id: replySnapshot?.id ?? null,
      pinned: false,
      edited_at: null,
      attachment_url: null,
      attachment_type: null,
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
    setError(null);
    setSending(true);
    setDmMessages((prev) => [...prev, optimistic]);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("dm_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        content,
        reply_to_id: replySnapshot?.id ?? null,
      })
      .select("*")
      .single();

    if (insertError || !data) {
      setDmMessages((prev) =>
        prev.map((message) =>
          message.id === tempId ? { ...message, failed: true } : message,
        ),
      );
      setError(insertError?.message ?? "Failed to send message");
      setDraft(content);
      if (replySnapshot) setReplyTo(replySnapshot);
      setSending(false);
      return;
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
            ? { ...thread, preview: content, previewAt: data.created_at }
            : thread,
        )
        .sort((a, b) => {
          const left = a.previewAt ? Date.parse(a.previewAt) : 0;
          const right = b.previewAt ? Date.parse(b.previewAt) : 0;
          return right - left;
        }),
    );
    setSending(false);
  }

  async function editChannel(messageId: string, content: string) {
    const previous = messages.find((message) => message.id === messageId);
    const editedAt = new Date().toISOString();
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? { ...message, content, edited_at: editedAt } : message,
      ),
    );
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("messages")
      .update({ content, edited_at: editedAt })
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
    const editedAt = new Date().toISOString();
    setDmMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? { ...message, content, edited_at: editedAt } : message,
      ),
    );
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("dm_messages")
      .update({ content, edited_at: editedAt })
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
      const { error: deleteError } = await supabase
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
    const { data, error: insertError } = await supabase
      .from("message_reactions")
      .insert({ message_id: messageId, user_id: user.id, emoji })
      .select("*")
      .single();
    if (insertError || !data) {
      setReactions((prev) => prev.filter((reaction) => reaction.id !== temp.id));
      setError(insertError?.message ?? "Could not add reaction");
      return;
    }
    setReactions((prev) => upsertReaction(prev.filter((reaction) => reaction.id !== temp.id), data));
  }

  async function togglePin(message: ChatMessage) {
    if (message.id.startsWith("temp-")) return;
    const next = !message.pinned;
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
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("messages")
      .update({ pinned: next })
      .eq("id", message.id);
    if (updateError) {
      setMessages((prev) =>
        prev.map((item) =>
          item.id === message.id ? { ...item, pinned: message.pinned } : item,
        ),
      );
      setError(updateError.message);
    }
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

  function openSettings() {
    setSettingsTab("overview");
    setSettingsOpen(true);
  }

  function chooseFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setError("Files must be 10MB or smaller.");
      return;
    }
    setPendingFile(file);
    setError(null);
  }

  const waitingForChannel =
    channelPending || (pane === "server" && !activeChannel && channels.length > 0);
  const headerTitle = dmMode
    ? activeThread?.username ?? "Direct Message"
    : homeEmpty
      ? "Direct Messages"
      : activeChannel?.name ??
        (waitingForChannel || (pane === "server" && loadingServers) ? "Loading…" : "No channel");
  const headerIcon = dmMode || homeEmpty ? (
    <MessagesSquare className="h-5 w-5 text-accent" strokeWidth={1.75} />
  ) : activeChannel?.type === "voice" ? (
    <Volume2 className="h-5 w-5 text-accent" strokeWidth={1.75} />
  ) : (
    <Hash className="h-5 w-5" strokeWidth={2.25} />
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
  ) : null;

  return (
    <div className="flex h-[calc(100dvh-3.5rem-2.75rem)] min-h-[28rem] min-w-0 overflow-hidden border-t border-black/40 md:h-[calc(100dvh-3.5rem)]">
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

      {discoverMode ? (
        <DiscoverPane
          footer={voiceFooter}
          sidebarWidth={sidebarWidth}
          onSidebarResizeStart={beginResize}
          onJoined={(serverId) => {
            void loadServers();
            setToast("Joined server");
            router.push(messengerServerPath(serverId));
          }}
          onOpenServer={selectServer}
        />
      ) : (
      <>
      <ResizableSidebar width={sidebarWidth} onResizeStart={beginResize}>
        {pane === "home" ? (
          <HomeSidebar
            threads={threads}
            activeThreadId={activeConversationId}
            loadingThreads={loadingThreads}
            onSelectThread={selectThread}
            footer={voiceFooter}
          />
        ) : activeServer ? (
          <ChannelSidebar
            serverId={activeServer.id}
            serverName={activeServer.name}
            categories={categories}
            channels={channels}
            activeChannelId={activeChannelId}
            unreadChannelIds={unreadChannelIds}
            voiceStates={displayVoiceStates}
            membersById={membersById}
            speakingUserIds={speakingUserIds}
            loading={loadingChannels}
            canLeave={activeServer.owner_id !== user?.id}
            canManageChannels={canManageChannels || isServerOwner}
            connectedVoiceChannelId={connection?.channelId ?? null}
            onSelectChannel={selectChannel}
            onInvite={openInvite}
            onSettings={openSettings}
            onCreateChannel={openCreateChannel}
            onCreateCategory={openCreateCategory}
            onRenameCategory={renameCategory}
            onLeave={() => setLeaveOpen(true)}
            footer={voiceFooter}
          />
        ) : pane === "server" && (loadingServers || channelPending) ? (
          <aside className="flex h-full w-full flex-col bg-[#2b2d31]">
            <div className="flex h-12 items-center border-b border-black/30 px-4 text-sm font-semibold text-white">
              Loading…
            </div>
            <div className="flex-1" />
            {voiceFooter}
          </aside>
        ) : (
          <aside className="flex h-full w-full flex-col bg-[#2b2d31]">
            <div className="flex h-12 items-center border-b border-black/30 px-4 text-sm font-semibold text-white">
              No server
            </div>
            <p className="flex-1 px-4 py-4 text-sm text-[#949ba4]">
              Create a server or open Home for direct messages.
            </p>
            {voiceFooter}
          </aside>
        )}
      </ResizableSidebar>

      <div className="relative flex min-h-0 min-w-0 flex-1">
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#313338]">
          {pane === "server" && activeServer && (
            <div className="sm:hidden">
              <ServerHeaderMenu
                serverName={activeServer.name}
                onInvite={openInvite}
                onSettings={openSettings}
                onCreateChannel={() => openCreateChannel()}
                onLeave={
                  activeServer.owner_id !== user?.id ? () => setLeaveOpen(true) : undefined
                }
              />
            </div>
          )}

          <ChannelHeader
            icon={headerIcon}
            title={headerTitle}
            topic={textMode ? activeChannel?.topic : null}
            searchOpen={searchOpen}
            pinsOpen={pinsOpen}
            membersOpen={membersOpen}
            showPins={textMode}
            showMembers={pane === "server" && !!activeServer}
            pinCount={pinList.length}
            onToggleSearch={() => setSearchOpen((open) => !open)}
            onTogglePins={() => setPinsOpen((open) => !open)}
            onToggleMembers={() => setMembersOpen((open) => !open)}
          />

          {searchOpen && (
            <div className="border-b border-black/20 px-4 py-2">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search loaded messages"
                className="w-full rounded-md bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none ring-1 ring-[#3f4147] placeholder:text-[#6d6f78] focus:ring-accent"
              />
              <p className="mt-1 text-[11px] text-[#6d6f78]">
                Full history search is not available yet. This filters messages already loaded.
              </p>
            </div>
          )}

          {pane === "server" && (
            <div className="flex gap-1 overflow-x-auto border-b border-black/20 px-2 py-2 sm:hidden">
              {channels.map((channel) => {
                const active = channel.id === activeChannelId;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => selectChannel(channel.id)}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                      active ? "bg-[#404249] text-white" : "bg-[#2b2d31] text-muted"
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

          {pane === "home" && (
            <div className="flex gap-1 overflow-x-auto border-b border-black/20 px-2 py-2 sm:hidden">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => selectThread(thread.id)}
                  className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
                    thread.id === activeConversationId
                      ? "bg-[#404249] text-white"
                      : "bg-[#2b2d31] text-muted"
                  }`}
                >
                  {thread.username}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="border-b border-accent/30 bg-accent-muted px-4 py-2 text-xs text-accent">
              {error}
            </div>
          )}

          {pinsOpen && textMode && (
            <div className="absolute right-3 top-14 z-30 max-h-96 w-80 overflow-y-auto rounded-md border border-[#1e1f22] bg-[#2b2d31] p-2 shadow-xl shadow-black/50">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#949ba4]">
                Pinned messages
              </p>
              {pinList.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted">No pinned messages.</p>
              ) : (
                pinList.map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => jumpToMessage(message.id)}
                    className="block w-full rounded-md px-2 py-2 text-left hover:bg-white/5"
                  >
                    <p className="text-xs font-semibold text-accent">
                      {message.profiles?.username ?? "Unknown"}
                    </p>
                    <p className="truncate text-sm text-[#dbdee1]">
                      {message.content || "Attachment"}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}

          {homeEmpty && (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <MessagesSquare className="mb-3 h-12 w-12 text-[#4e5058]" strokeWidth={1.5} />
              <h2 className="text-xl font-semibold text-white">Your DMs</h2>
              <p className="mt-2 max-w-sm text-sm text-[#949ba4]">
                Pick a conversation from the sidebar, or message someone from a server member list.
              </p>
            </div>
          )}

          {dmMode && (
            <ChatTimeline
              messages={visibleDmMessages}
              loading={loadingDmMessages}
              emptyIcon="dm"
              emptyTitle={activeThread?.username ?? "Direct message"}
              emptyBody={
                searchNeedle
                  ? "No loaded messages match that search."
                  : `This is the beginning of your conversation with ${activeThread?.username ?? "this user"}.`
              }
              currentUserId={user?.id ?? null}
              reactionMap={{}}
              onReply={setReplyTo}
              onEdit={editDm}
              onDelete={deleteDm}
              onJumpToReply={jumpToMessage}
            />
          )}

          {textMode && (
            <ChatTimeline
              messages={visibleMessages}
              loading={loadingChannelMessages}
              emptyIcon="hash"
              emptyTitle={
                searchNeedle
                  ? "No matches"
                  : `Welcome to #${activeChannel?.name ?? "channel"}!`
              }
              emptyBody={
                searchNeedle
                  ? "Search only checks messages already loaded in this channel."
                  : `This is the start of the #${activeChannel?.name ?? "channel"} channel.`
              }
              currentUserId={user?.id ?? null}
              currentUsername={profile?.username ?? null}
              roleNames={roleNames}
              channelNames={channelNames}
              mentionMaps={mentionMaps}
              canDeleteOthers={canManageMessages}
              reactionMap={reactionMap}
              onReply={setReplyTo}
              onEdit={editChannel}
              onDelete={deleteChannel}
              onJumpToReply={jumpToMessage}
              onReact={(messageId, emoji) => void toggleReaction(messageId, emoji)}
              onTogglePin={(message) => void togglePin(message)}
            />
          )}

          {voiceMode && activeChannel && (
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
          )}

          {pane === "server" && !activeChannel && !channelPending && channels.length === 0 && (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
              This server has no channels yet.
            </div>
          )}

          {(textMode || dmMode) && (
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
              replyAuthor={replyTo ? replyTo.profiles?.username ?? "user" : null}
              replyContent={replyTo?.content ?? null}
              pendingFileName={textMode ? pendingFile?.name ?? null : null}
              sending={sending}
              allowAttach={textMode && canSendMessages}
              disabled={!user || (textMode && !canSendMessages)}
              mentionSuggestions={textMode ? mentionSuggestions : []}
              typingPeople={textMode ? typingPeople : []}
              onDraft={setDraft}
              onCancelReply={() => setReplyTo(null)}
              onFile={chooseFile}
              onClearFile={() => setPendingFile(null)}
              onTyping={textMode ? publishTyping : undefined}
              onSubmit={() => {
                if (dmMode) void sendDm();
                else void sendChannel();
              }}
            />
          )}
        </section>

        {pane === "server" && membersOpen && (
          <button
            type="button"
            className="absolute inset-0 z-10 bg-black/40 lg:hidden"
            aria-label="Close members"
            onClick={() => setMembersOpen(false)}
          />
        )}
        <MemberList
          members={members}
          ownerId={activeServer?.owner_id ?? null}
          currentUserId={user?.id ?? null}
          onMessage={startDm}
          className={`${
            pane === "server" && membersOpen ? "flex" : "hidden"
          } absolute inset-y-0 right-0 z-20 shadow-2xl shadow-black/40 lg:static lg:shadow-none`}
        />
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
        <InvitePeopleModal
          open={inviteOpen}
          server={activeServer}
          userId={user.id}
          memberUserIds={memberUserIds}
          onClose={() => setInviteOpen(false)}
        />
      )}

      {user && activeServer && (
        <ServerSettingsModal
          open={settingsOpen}
          server={activeServer}
          userId={user.id}
          members={members}
          channels={channels}
          categories={categories}
          initialTab={settingsTab}
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
          <div className="relative z-10 w-full max-w-sm rounded-md border border-[#1e1f22] bg-[#313338] p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Leave {activeServer.name}?</h2>
            <p className="mt-2 text-sm text-[#b5bac1]">
              You can rejoin later with an invite link.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLeaveOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-[#dbdee1] hover:bg-white/5"
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
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-md border border-border bg-surface-raised px-4 py-2.5 text-sm text-foreground shadow-lg shadow-black/40"
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
