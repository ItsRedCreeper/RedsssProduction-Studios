export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      channel_categories: {
        Row: { id: string; server_id: string; name: string; position: number; created_at: string }
        Insert: { id?: string; server_id: string; name: string; position?: number; created_at?: string }
        Update: { id?: string; server_id?: string; name?: string; position?: number; created_at?: string }
        Relationships: []
      }
      channels: {
        Row: { id: string; server_id: string; name: string; type: string; category_id: string | null; topic: string | null; position: number; permission_overrides: Json; created_at: string }
        Insert: { id?: string; server_id: string; name: string; type: string; category_id?: string | null; topic?: string | null; position?: number; permission_overrides?: Json; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["channels"]["Insert"]>
        Relationships: []
      }
      dm_conversations: {
        Row: { id: string; created_at: string }
        Insert: { id?: string; created_at?: string }
        Update: { id?: string; created_at?: string }
        Relationships: []
      }
      dm_messages: {
        Row: { id: string; conversation_id: string; user_id: string; content: string; reply_to_id: string | null; created_at: string; edited_at: string | null }
        Insert: { id?: string; conversation_id: string; user_id: string; content: string; reply_to_id?: string | null; created_at?: string; edited_at?: string | null }
        Update: Partial<Database["public"]["Tables"]["dm_messages"]["Insert"]>
        Relationships: []
      }
      dm_participants: {
        Row: { conversation_id: string; user_id: string }
        Insert: { conversation_id: string; user_id: string }
        Update: Partial<Database["public"]["Tables"]["dm_participants"]["Insert"]>
        Relationships: []
      }
      friends: {
        Row: { id: string; user_id: string; friend_id: string; status: string; created_at: string }
        Insert: { id?: string; user_id: string; friend_id: string; status: string; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["friends"]["Insert"]>
        Relationships: []
      }
      invites: {
        Row: { id: string; code: string; server_id: string; creator_id: string; max_uses: number | null; uses: number; expires_at: string | null; is_permanent: boolean; created_at: string }
        Insert: { id?: string; code: string; server_id: string; creator_id: string; max_uses?: number | null; uses?: number; expires_at?: string | null; is_permanent?: boolean; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["invites"]["Insert"]>
        Relationships: []
      }
      server_friend_invites: {
        Row: { id: string; server_id: string; inviter_id: string; invitee_id: string; created_at: string }
        Insert: { id?: string; server_id: string; inviter_id: string; invitee_id: string; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["server_friend_invites"]["Insert"]>
        Relationships: []
      }
      member_roles: {
        Row: { server_id: string; user_id: string; role_id: string }
        Insert: { server_id: string; user_id: string; role_id: string }
        Update: Partial<Database["public"]["Tables"]["member_roles"]["Insert"]>
        Relationships: []
      }
      message_reactions: {
        Row: { id: string; message_id: string; user_id: string; emoji: string; created_at: string }
        Insert: { id?: string; message_id: string; user_id: string; emoji: string; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["message_reactions"]["Insert"]>
        Relationships: []
      }
      messages: {
        Row: { id: string; channel_id: string; user_id: string; content: string; reply_to_id: string | null; pinned: boolean; edited_at: string | null; attachment_url: string | null; attachment_type: string | null; created_at: string }
        Insert: { id?: string; channel_id: string; user_id: string; content: string; reply_to_id?: string | null; pinned?: boolean; edited_at?: string | null; attachment_url?: string | null; attachment_type?: string | null; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>
        Relationships: []
      }
      profiles: {
        Row: { id: string; username: string; avatar_url: string | null; status: string; status_text: string | null; created_at: string }
        Insert: { id: string; username: string; avatar_url?: string | null; status?: string; status_text?: string | null; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>
        Relationships: []
      }
      roles: {
        Row: { id: string; server_id: string; name: string; permissions: Json; color: string; position: number; hoist: boolean; created_at: string }
        Insert: { id?: string; server_id: string; name: string; permissions?: Json; color?: string; position?: number; hoist?: boolean; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["roles"]["Insert"]>
        Relationships: []
      }
      server_members: {
        Row: { server_id: string; user_id: string; role_id: string | null; nickname: string | null; joined_at: string }
        Insert: { server_id: string; user_id: string; role_id?: string | null; nickname?: string | null; joined_at?: string }
        Update: Partial<Database["public"]["Tables"]["server_members"]["Insert"]>
        Relationships: []
      }
      servers: {
        Row: { id: string; name: string; description: string | null; icon_url: string | null; owner_id: string; is_public: boolean; created_at: string }
        Insert: { id?: string; name: string; description?: string | null; icon_url?: string | null; owner_id: string; is_public?: boolean; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["servers"]["Insert"]>
        Relationships: []
      }
      user_channel_reads: {
        Row: { user_id: string; channel_id: string; last_read_at: string }
        Insert: { user_id: string; channel_id: string; last_read_at?: string }
        Update: Partial<Database["public"]["Tables"]["user_channel_reads"]["Insert"]>
        Relationships: []
      }
      voice_states: {
        Row: { user_id: string; channel_id: string; server_id: string; muted: boolean; deafened: boolean; updated_at: string }
        Insert: { user_id: string; channel_id: string; server_id: string; muted?: boolean; deafened?: boolean; updated_at?: string }
        Update: Partial<Database["public"]["Tables"]["voice_states"]["Insert"]>
        Relationships: []
      }
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string | null;
          link: string | null;
          read: boolean;
          created_at: string;
        }
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          body?: string | null;
          link?: string | null;
          read?: boolean;
          created_at?: string;
        }
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      cleanup_stale_voice_states: {
        Args: { max_age?: string }
        Returns: number
      }
      create_notification: {
        Args: {
          p_user_id: string;
          p_type: string;
          p_title: string;
          p_body?: string | null;
          p_link?: string | null;
        }
        Returns: string
      }
      notify_message_mentions: {
        Args: {
          p_message_id: string;
          p_channel_id: string;
          p_author_id: string;
          p_content: string;
        }
        Returns: undefined
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]
