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
import { ensureDmConversation, type FriendProfile } from "@/lib/friends";
import { messengerHomePath } from "@/lib/messenger-routes";
import {
  SmallProfileCard,
  type MutualFocus,
} from "@/components/profile/SmallProfileCard";
import { BigProfileModal } from "@/components/profile/BigProfileModal";
import { EditProfileModal } from "@/components/profile/EditProfileModal";

export type FriendsTab = "friends" | "pending" | "add";

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
  messageUser: (userId: string) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function clampCardPosition(anchor?: DOMRect | null): Anchor {
  const width = 280;
  const height = 280;
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
    .select("id, username, avatar_url, status, status_text, bio, banner_url, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    avatar_url: data.avatar_url,
    status: data.status,
    status_text: data.status_text,
    bio: data.bio,
    banner_url: data.banner_url,
    created_at: data.created_at,
  };
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, profile: current } = useCurrentProfile();
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsTab, setFriendsTab] = useState<FriendsTab>("friends");
  const [small, setSmall] = useState<{
    profile: FriendProfile;
    top: number;
    left: number;
  } | null>(null);
  const [big, setBig] = useState<FriendProfile | null>(null);
  const [bigFocus, setBigFocus] = useState<MutualFocus | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const messageUser = useCallback(
    async (userId: string) => {
      if (!user || userId === user.id) return;
      const { conversationId, error } = await ensureDmConversation(userId);
      if (error || !conversationId) {
        router.push(`${messengerHomePath()}?dm=${userId}`);
        return;
      }
      router.push(`${messengerHomePath()}?dm=${userId}`);
    },
    [user, router],
  );

  const openSmallProfile = useCallback(
    async (userId: string, anchorEl?: HTMLElement | null) => {
      const profile = await fetchProfile(userId);
      if (!profile) return;
      const pos = clampCardPosition(anchorEl?.getBoundingClientRect() ?? null);
      setSmall({ profile, ...pos });
    },
    [],
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
                bio: current.bio,
                banner_url: current.banner_url,
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
            profile={small.profile}
            top={small.top}
            left={small.left}
            isSelf={!!user && small.profile.id === user.id}
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
          />
        </>
      )}

      {big && (
        <BigProfileModal
          profile={big}
          isSelf={!!user && big.id === user.id}
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
