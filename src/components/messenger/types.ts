import type { Tables } from "@/lib/supabase/database.types";

export type Server = Tables<"servers">;
export type Channel = Tables<"channels">;
export type Category = Tables<"channel_categories">;
export type Profile = Tables<"profiles">;
export type Role = Tables<"roles">;
export type Invite = Tables<"invites">;
export type Reaction = Tables<"message_reactions">;
export type VoiceState = Tables<"voice_states">;

export type MiniProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
  status: string;
  status_text: string | null;
  bio?: string | null;
  banner_url?: string | null;
};

export type ReplyPreview = {
  id: string;
  content: string;
  user_id: string;
  profiles: Pick<Profile, "username" | "avatar_url"> | null;
};

export type ChatMessage = Tables<"messages"> & {
  profiles: Pick<Profile, "username" | "avatar_url"> | null;
  reply_to?: ReplyPreview | null;
  optimistic?: boolean;
  failed?: boolean;
};

export type ReactionGroup = {
  emoji: string;
  count: number;
  reacted: boolean;
};

export type MemberView = {
  user_id: string;
  nickname: string | null;
  joined_at: string;
  username: string;
  avatar_url: string | null;
  status: string;
  status_text: string | null;
  bio?: string | null;
  banner_url?: string | null;
  roleIds: string[];
};

export type DmThread = {
  id: string;
  otherUserId: string;
  username: string;
  avatar_url: string | null;
  status: string;
  preview: string | null;
  previewAt: string | null;
};

export type FriendEntry = {
  id: string;
  username: string;
  avatar_url: string | null;
  status: string;
  status_text: string | null;
};

export type SettingsTab =
  | "overview"
  | "roles"
  | "members"
  | "invites"
  | "channels";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🔥", "👀", "🎉"] as const;
