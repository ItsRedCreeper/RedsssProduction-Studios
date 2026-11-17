"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { useBlockedUsers } from "@/hooks/useBlockedUsers";
import { useIgnoredUsers } from "@/hooks/useIgnoredUsers";
import { useFriendNicknames } from "@/hooks/useFriendNicknames";
import {
  friendlyBlockDmMessage,
  loadIsBlockedBy,
} from "@/lib/blocking";
import type { NicknameMap } from "@/lib/nicknames";
import {
  ensureDmConversation,
  loadFriendshipWith,
  loadMutualFriends,
  loadMutualServers,
  type FriendProfile,
  type MutualFriend,
  type MutualServer,
} from "@/lib/friends";
import { messengerDmPath, messengerHomePath } from "@/lib/messenger-routes";
import {
  SmallProfileCard,
  type MutualFocus,
  type SmallProfileReadyData,
} from "@/components/profile/SmallProfileCard";
import { BigProfileModal } from "@/components/profile/BigProfileModal";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

export type FriendsTab = "friends" | "pending" | "add" | "blocked" | "ignored";

type Anchor = { top: number; left: number };

type ProfileContextValue = {
  openSmallProfile: (userId: string, anchorEl?: HTMLElement | null) => void;
  openBigProfile: (userId: string, focus?: MutualFocus | null) => void;
  openEditProfile: () => void;
  openFriends: (tab?: FriendsTab) => void;
  closeFriends: () => void;
  friendsOpen: boolean;
  friendsTab: FriendsTab;
  setFriendsTab: (tab: FriendsTab) => void;
  messageUser: (userId: string) => Promise<{ error: string | null }>;
  isBlocked: (userId: string | null | undefined) => boolean;
  blockedIds: string[];
  requestBlock: (userId: string, username: string) => void;
  unblockUser: (userId: string) => Promise<{ error: string | null }>;
  isIgnored: (userId: string | null | undefined) => boolean;
  ignoredIds: string[];
  requestIgnore: (userId: string, username: string) => void;
  unignoreUser: (userId: string) => Promise<{ error: string | null }>;
  nicknames: NicknameMap;
  nicknameFor: (userId: string | null | undefined) => string | null;
  setNickname: (
    friendId: string,
    nickname: string,
  ) => Promise<{ error: string | null }>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function clampCardPosition(anchor?: DOMRect | null): Anchor {
  const width = 300;
  // Prefer a taller estimate so the first paint stays on-screen before ResizeObserver runs.
  const height = 420;
  if (!anchor) {
    return {
      top: Math.max(24, window.innerHeight / 2 - height / 2),
      left: Math.max(24, window.innerWidth / 2 - width / 2),
    };
  }
  let left = anchor.right + 10;
  if (left + width > window.innerWidth - 8) left = anchor.left - width - 10;
  if (left < 8) left = 8;
  let top = anchor.top;
  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - height - 8);
  }
  return { top, left };
}

async function fetchProfile(userId: string): Promise<FriendProfile | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, username, avatar_url, status, status_text, last_seen_at, manual_status, bio, banner_url, banner_color, created_at",
    )
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    avatar_url: data.avatar_url,
    status: data.status,
    status_text: data.status_text,
    last_seen_at: data.last_seen_at,
    manual_status: data.manual_status,
    bio: data.bio,
    banner_url: data.banner_url,
    banner_color: data.banner_color,
    created_at: data.created_at,
  };
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, profile: current } = useCurrentProfile();
  const {
    blockedIds,
    isBlocked,
    blockUser,
    unblockUser: unblockUserFn,
  } = useBlockedUsers();
  const {
    ignoredIds,
    isIgnored,
    ignoreUser: ignoreUserFn,
    unignoreUser: unignoreUserFn,
  } = useIgnoredUsers();
  const {
    nicknames,
    nicknameFor,
    setNickname,
  } = useFriendNicknames();
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsTab, setFriendsTab] = useState<FriendsTab>("friends");
  const [small, setSmall] = useState<{
    profile: FriendProfile;
    top: number;
    left: number;
    ready: SmallProfileReadyData;
  } | null>(null);
  const [big, setBig] = useState<FriendProfile | null>(null);
  const [bigFocus, setBigFocus] = useState<MutualFocus | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [ignoreTarget, setIgnoreTarget] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [ignoring, setIgnoring] = useState(false);
  const [messageNotice, setMessageNotice] = useState<string | null>(null);

  const messageUser = useCallback(
    async (userId: string) => {
      if (!user || userId === user.id) return { error: null };
      if (isBlocked(userId)) {
        const error = "You blocked this user. Unblock them to send messages.";
        setMessageNotice(error);
        return { error };
      }
      const { blockedByThem } = await loadIsBlockedBy(userId);
      if (blockedByThem) {
        const error = "This user has blocked you.";
        setMessageNotice(error);
        return { error };
      }
      const { conversationId, error } = await ensureDmConversation(userId);
      if (!error && conversationId) {
        router.push(messengerDmPath(conversationId));
        return { error: null };
      }
      const blockedMsg = friendlyBlockDmMessage(error);
      if (blockedMsg) {
        setMessageNotice(blockedMsg);
        return { error: blockedMsg };
      }
      if (error) {
        setMessageNotice(error);
        return { error };
      }
      router.push(`${messengerHomePath()}?dm=${userId}`);
      return { error: null };
    },
    [user, router, isBlocked],
  );

  const openSmallProfile = useCallback(
    async (userId: string, anchorEl?: HTMLElement | null) => {
      // Capture anchor before async work so scroll/layout can't move it.
      const anchorRect = anchorEl?.getBoundingClientRect() ?? null;
      const isSelf = !!user && user.id === userId;

      // Load everything before opening so the card appears as one finished piece.
      const [profile, blockedByResult] = await Promise.all([
        fetchProfile(userId),
        isSelf
          ? Promise.resolve({ blockedByThem: false })
          : loadIsBlockedBy(userId),
      ]);
      if (!profile) return;

      const restricted = blockedByResult.blockedByThem;
      const emptyFriends = { friends: [] as MutualFriend[] };
      const emptyServers = { servers: [] as MutualServer[] };

      const [friendsResult, serversResult, friendship] = await Promise.all([
        isSelf || restricted
          ? Promise.resolve(emptyFriends)
          : loadMutualFriends(userId),
        isSelf || restricted
          ? Promise.resolve(emptyServers)
          : loadMutualServers(userId),
        isSelf || restricted
          ? Promise.resolve({ status: "none" as const, edgeId: null })
          : loadFriendshipWith(userId),
      ]);

      const pos = clampCardPosition(anchorRect);
      setSmall({
        profile,
        ...pos,
        ready: {
          mutualFriends: friendsResult.friends,
          mutualServers: serversResult.servers,
          friendStatus: friendship.status,
          friendEdgeId: friendship.edgeId,
          restricted,
        },
      });
    },
    [user],
  );

  const openBigProfile = useCallback(async (
    userId: string,
    focus: MutualFocus | null = null,
  ) => {
    const profile = await fetchProfile(userId);
    if (!profile) return;
    setSmall(null);
    setBigFocus(focus);
    setBig(profile);
  }, []);

  const openEditProfile = useCallback(async () => {
    if (!user) return;
    const profile =
      big?.id === user.id
        ? big
        : (await fetchProfile(user.id)) ??
          (current
            ? {
                id: current.id,
                username: current.username,
                avatar_url: current.avatar_url,
                status: current.status,
                status_text: current.status_text,
                last_seen_at: current.last_seen_at,
                manual_status: current.manual_status,
                bio: current.bio,
                banner_url: current.banner_url,
                banner_color: current.banner_color,
                created_at: current.created_at,
              }
            : null);
    if (!profile) return;
    setBig(profile);
    setEditOpen(true);
  }, [user, big, current]);

  const openFriends = useCallback((tab: FriendsTab = "friends") => {
    setFriendsTab(tab);
    setFriendsOpen(true);
  }, []);

  const closeFriends = useCallback(() => setFriendsOpen(false), []);

  const requestBlock = useCallback((userId: string, username: string) => {
    if (!user || userId === user.id) return;
    setBlockTarget({ id: userId, username });
  }, [user]);

  const requestIgnore = useCallback((userId: string, username: string) => {
    if (!user || userId === user.id) return;
    setIgnoreTarget({ id: userId, username });
  }, [user]);

  const confirmBlock = useCallback(async () => {
    if (!blockTarget) return;
    setBlocking(true);
    const { error } = await blockUser(blockTarget.id);
    setBlocking(false);
    if (error) return;
    const blockedId = blockTarget.id;
    setBlockTarget(null);
    setSmall((prev) => (prev?.profile.id === blockedId ? null : prev));
    setBig((prev) => (prev?.id === blockedId ? null : prev));
    setBigFocus(null);
    setEditOpen(false);
  }, [blockTarget, blockUser]);

  const confirmIgnore = useCallback(async () => {
    if (!ignoreTarget) return;
    setIgnoring(true);
    const { error } = await ignoreUserFn(ignoreTarget.id);
    setIgnoring(false);
    if (error) return;
    setIgnoreTarget(null);
  }, [ignoreTarget, ignoreUserFn]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      openSmallProfile,
      openBigProfile,
      openEditProfile,
      openFriends,
      closeFriends,
      friendsOpen,
      friendsTab,
      setFriendsTab,
      messageUser,
      isBlocked,
      blockedIds,
      requestBlock,
      unblockUser: unblockUserFn,
      isIgnored,
      ignoredIds,
      requestIgnore,
      unignoreUser: unignoreUserFn,
      nicknames,
      nicknameFor,
      setNickname,
    }),
    [
      openSmallProfile,
      openBigProfile,
      openEditProfile,
      openFriends,
      closeFriends,
      friendsOpen,
      friendsTab,
      messageUser,
      isBlocked,
      blockedIds,
      requestBlock,
      unblockUserFn,
      isIgnored,
      ignoredIds,
      requestIgnore,
      unignoreUserFn,
      nicknames,
      nicknameFor,
      setNickname,
    ],
  );

  return (
    <ProfileContext.Provider value={value}>
      {children}

      {small && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[79]"
            aria-label="Close profile card"
            onClick={() => setSmall(null)}
          />
          <SmallProfileCard
            key={small.profile.id}
            profile={small.profile}
            top={small.top}
            left={small.left}
            ready={small.ready}
            isSelf={!!user && small.profile.id === user.id}
            isBlocked={isBlocked(small.profile.id)}
            onClose={() => setSmall(null)}
            onMessage={() => {
              const id = small.profile.id;
              setSmall(null);
              void messageUser(id);
            }}
            onViewProfile={() => {
              const id = small.profile.id;
              setSmall(null);
              void openBigProfile(id);
            }}
            onViewMutuals={(section) => {
              const id = small.profile.id;
              setSmall(null);
              void openBigProfile(id, section);
            }}
            onBlock={() =>
              requestBlock(small.profile.id, small.profile.username)
            }
            onUnblock={() => void unblockUserFn(small.profile.id)}
            isIgnored={isIgnored(small.profile.id)}
            displayName={
              nicknameFor(small.profile.id) || small.profile.username
            }
            onIgnore={() =>
              requestIgnore(small.profile.id, small.profile.username)
            }
            onUnignore={() => void unignoreUserFn(small.profile.id)}
          />
        </>
      )}

      {big && (
        <BigProfileModal
          profile={big}
          isSelf={!!user && big.id === user.id}
          isBlocked={isBlocked(big.id)}
          isIgnored={isIgnored(big.id)}
          displayName={nicknameFor(big.id) || big.username}
          nickname={nicknameFor(big.id)}
          focusSection={bigFocus}
          onClose={() => {
            setBig(null);
            setBigFocus(null);
          }}
          onMessage={() => {
            const id = big.id;
            setBig(null);
            setBigFocus(null);
            void messageUser(id);
          }}
          onEdit={() => setEditOpen(true)}
          onOpenProfile={(userId) => {
            void openBigProfile(userId);
          }}
          onBlock={() => requestBlock(big.id, big.username)}
          onUnblock={() => void unblockUserFn(big.id)}
          onIgnore={() => requestIgnore(big.id, big.username)}
          onUnignore={() => void unignoreUserFn(big.id)}
          onSaveNickname={(nickname) => setNickname(big.id, nickname)}
        />
      )}

      {editOpen && big && user && big.id === user.id && (
        <EditProfileModal
          open={editOpen}
          profile={big}
          onClose={() => setEditOpen(false)}
          onSaved={(next) => {
            setBig(next);
            setSmall((prev) =>
              prev && prev.profile.id === next.id
                ? { ...prev, profile: next }
                : prev,
            );
          }}
        />
      )}

      <ConfirmModal
        open={!!blockTarget}
        title={blockTarget ? `Block ${blockTarget.username}?` : "Block user?"}
        description="They will no longer be able to message you, send friend requests, or interact with you. You can unblock them later."
        confirmLabel="Block"
        cancelLabel="Cancel"
        danger
        busy={blocking}
        onCancel={() => {
          if (!blocking) setBlockTarget(null);
        }}
        onConfirm={() => void confirmBlock()}
      />

      <ConfirmModal
        open={!!ignoreTarget}
        title={
          ignoreTarget ? `Ignore ${ignoreTarget.username}?` : "Ignore user?"
        }
        description="You won’t see their messages or get notifications from them. You can unignore them later."
        confirmLabel="Ignore"
        cancelLabel="Cancel"
        busy={ignoring}
        onCancel={() => {
          if (!ignoring) setIgnoreTarget(null);
        }}
        onConfirm={() => void confirmIgnore()}
      />

      <ConfirmModal
        open={!!messageNotice}
        title="Can't send message"
        description={messageNotice ?? ""}
        confirmLabel="OK"
        cancelLabel="Close"
        onCancel={() => setMessageNotice(null)}
        onConfirm={() => setMessageNotice(null)}
      />
    </ProfileContext.Provider>
  );
}

export function useProfileUi() {
  const value = useContext(ProfileContext);
  if (!value) {
    throw new Error("useProfileUi must be used within ProfileProvider");
  }
  return value;
}

export function useOptionalProfileUi() {
  return useContext(ProfileContext);
}
