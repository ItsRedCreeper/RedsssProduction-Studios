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
        Row: {
          id: string
          server_id: string
          name: string
          position: number
          permission_overrides: Json
          created_at: string
        }
        Insert: {
          id?: string
          server_id: string
          name: string
          position?: number
          permission_overrides?: Json
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["channel_categories"]["Insert"]>
        Relationships: []
      }
      channels: {
        Row: {
          id: string
          server_id: string
          name: string
          type: string
          category_id: string | null
          topic: string | null
          position: number
          permission_overrides: Json
          slowmode_seconds: number
          nsfw: boolean
          permissions_synced: boolean
          created_at: string
        }
        Insert: {
          id?: string
          server_id: string
          name: string
          type: string
          category_id?: string | null
          topic?: string | null
          position?: number
          permission_overrides?: Json
          slowmode_seconds?: number
          nsfw?: boolean
          permissions_synced?: boolean
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["channels"]["Insert"]>
        Relationships: []
      }
      server_bans: {
        Row: {
          server_id: string
          user_id: string
          banned_by: string | null
          reason: string | null
          delete_message_seconds: number
          expires_at: string | null
          created_at: string
        }
        Insert: {
          server_id: string
          user_id: string
          banned_by?: string | null
          reason?: string | null
          delete_message_seconds?: number
          expires_at?: string | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["server_bans"]["Insert"]>
        Relationships: []
      }
      dm_conversations: {
        Row: {
          id: string
          created_at: string
          name: string | null
          is_group: boolean
          owner_id: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          name?: string | null
          is_group?: boolean
          owner_id?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["dm_conversations"]["Insert"]>
        Relationships: []
      }
      channel_threads: {
        Row: {
          id: string
          channel_id: string
          server_id: string
          starter_message_id: string | null
          name: string
          creator_id: string | null
          archived: boolean
          created_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          server_id: string
          starter_message_id?: string | null
          name: string
          creator_id?: string | null
          archived?: boolean
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["channel_threads"]["Insert"]>
        Relationships: []
      }
      dm_call_sessions: {
        Row: {
          conversation_id: string
          started_by: string
          with_video: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          conversation_id: string
          started_by: string
          with_video?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["dm_call_sessions"]["Insert"]>
        Relationships: []
      }
      dm_call_participants: {
        Row: {
          conversation_id: string
          user_id: string
          camera_on: boolean
          screen_on: boolean
          joined_at: string
        }
        Insert: {
          conversation_id: string
          user_id: string
          camera_on?: boolean
          screen_on?: boolean
          joined_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["dm_call_participants"]["Insert"]>
        Relationships: []
      }
      server_stickers: {
        Row: {
          id: string
          server_id: string
          name: string
          url: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          server_id: string
          name: string
          url: string
          created_by: string
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["server_stickers"]["Insert"]>
        Relationships: []
      }
      server_automod_rules: {
        Row: {
          id: string
          server_id: string
          name: string
          enabled: boolean
          keywords: string[]
          action: string
          created_at: string
        }
        Insert: {
          id?: string
          server_id: string
          name?: string
          enabled?: boolean
          keywords?: string[]
          action?: string
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["server_automod_rules"]["Insert"]>
        Relationships: []
      }
      poll_votes: {
        Row: {
          message_id: string
          user_id: string
          option_index: number
          created_at: string
        }
        Insert: {
          message_id: string
          user_id: string
          option_index: number
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["poll_votes"]["Insert"]>
        Relationships: []
      }
      dm_messages: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          content: string
          reply_to_id: string | null
          pinned: boolean
          is_system: boolean
          created_at: string
          edited_at: string | null
          attachment_url: string | null
          attachment_type: string | null
          attachments: Json
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id: string
          content: string
          reply_to_id?: string | null
          pinned?: boolean
          is_system?: boolean
          created_at?: string
          edited_at?: string | null
          attachment_url?: string | null
          attachment_type?: string | null
          attachments?: Json
        }
        Update: Partial<Database["public"]["Tables"]["dm_messages"]["Insert"]>
        Relationships: []
      }
      dm_message_reactions: {
        Row: { id: string; message_id: string; user_id: string; emoji: string; created_at: string }
        Insert: { id?: string; message_id: string; user_id: string; emoji: string; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["dm_message_reactions"]["Insert"]>
        Relationships: []
      }
      dm_participants: {
        Row: { conversation_id: string; user_id: string; hidden: boolean }
        Insert: { conversation_id: string; user_id: string; hidden?: boolean }
        Update: Partial<Database["public"]["Tables"]["dm_participants"]["Insert"]>
        Relationships: []
      }
      blocked_users: {
        Row: {
          id: string
          blocker_id: string
          blocked_id: string
          created_at: string
        }
        Insert: {
          id?: string
          blocker_id: string
          blocked_id: string
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["blocked_users"]["Insert"]>
        Relationships: []
      }
      ignored_users: {
        Row: {
          id: string
          ignorer_id: string
          ignored_id: string
          created_at: string
        }
        Insert: {
          id?: string
          ignorer_id: string
          ignored_id: string
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["ignored_users"]["Insert"]>
        Relationships: []
      }
      friend_nicknames: {
        Row: {
          id: string
          user_id: string
          friend_id: string
          nickname: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          friend_id: string
          nickname: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["friend_nicknames"]["Insert"]>
        Relationships: []
      }
      friend_notes: {
        Row: {
          id: string
          user_id: string
          friend_id: string
          note: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          friend_id: string
          note?: string
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["friend_notes"]["Insert"]>
        Relationships: []
      }
      friend_favorites: {
        Row: {
          id: string
          user_id: string
          friend_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          friend_id: string
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["friend_favorites"]["Insert"]>
        Relationships: []
      }
      user_activity: {
        Row: {
          user_id: string
          activity_type: string
          context_id: string | null
          context_name: string | null
          context_extra: string | null
          is_public_context: boolean
          updated_at: string
        }
        Insert: {
          user_id: string
          activity_type?: string
          context_id?: string | null
          context_name?: string | null
          context_extra?: string | null
          is_public_context?: boolean
          updated_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["user_activity"]["Insert"]>
        Relationships: []
      }
      friends: {
        Row: { id: string; user_id: string; friend_id: string; status: string; created_at: string }
        Insert: { id?: string; user_id: string; friend_id: string; status: string; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["friends"]["Insert"]>
        Relationships: []
      }
      invites: {
        Row: {
          id: string
          code: string
          server_id: string
          creator_id: string
          max_uses: number | null
          uses: number
          expires_at: string | null
          is_permanent: boolean
          channel_id: string | null
          temporary_membership: boolean
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          server_id: string
          creator_id: string
          max_uses?: number | null
          uses?: number
          expires_at?: string | null
          is_permanent?: boolean
          channel_id?: string | null
          temporary_membership?: boolean
          created_at?: string
        }
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
      server_emojis: {
        Row: {
          id: string
          server_id: string
          name: string
          url: string
          animated: boolean
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          server_id: string
          name: string
          url: string
          animated?: boolean
          created_by: string
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["server_emojis"]["Insert"]>
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          channel_id: string
          user_id: string
          content: string
          reply_to_id: string | null
          pinned: boolean
          is_system: boolean
          thread_id: string | null
          message_kind: string
          poll: Json | null
          forwarded_from: Json | null
          edited_at: string | null
          attachment_url: string | null
          attachment_type: string | null
          attachments: Json
          created_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          user_id: string
          content: string
          reply_to_id?: string | null
          pinned?: boolean
          is_system?: boolean
          thread_id?: string | null
          message_kind?: string
          poll?: Json | null
          forwarded_from?: Json | null
          edited_at?: string | null
          attachment_url?: string | null
          attachment_type?: string | null
          attachments?: Json
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          username: string
          avatar_url: string | null
          status: string
          status_text: string | null
          status_text_expires_at: string | null
          manual_status: string
          manual_status_expires_at: string | null
          last_seen_at: string | null
          bio: string | null
          banner_url: string | null
          banner_color: string | null
          created_at: string
        }
        Insert: {
          id: string
          username: string
          avatar_url?: string | null
          status?: string
          status_text?: string | null
          status_text_expires_at?: string | null
          manual_status?: string
          manual_status_expires_at?: string | null
          last_seen_at?: string | null
          bio?: string | null
          banner_url?: string | null
          banner_color?: string | null
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>
        Relationships: []
      }
      roles: {
        Row: { id: string; server_id: string; name: string; permissions: Json; color: string; position: number; hoist: boolean; is_default: boolean; created_at: string }
        Insert: { id?: string; server_id: string; name: string; permissions?: Json; color?: string; position?: number; hoist?: boolean; is_default?: boolean; created_at?: string }
        Update: Partial<Database["public"]["Tables"]["roles"]["Insert"]>
        Relationships: []
      }
      server_members: {
        Row: {
          server_id: string
          user_id: string
          role_id: string | null
          nickname: string | null
          joined_at: string
          timed_out_until: string | null
        }
        Insert: {
          server_id: string
          user_id: string
          role_id?: string | null
          nickname?: string | null
          joined_at?: string
          timed_out_until?: string | null
        }
        Update: Partial<Database["public"]["Tables"]["server_members"]["Insert"]>
        Relationships: []
      }
      servers: {
        Row: {
          id: string
          name: string
          description: string | null
          icon_url: string | null
          owner_id: string
          is_public: boolean
          invites_paused: boolean
          verification_level: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          icon_url?: string | null
          owner_id: string
          is_public?: boolean
          invites_paused?: boolean
          verification_level?: number
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["servers"]["Insert"]>
        Relationships: []
      }
      server_audit_log: {
        Row: {
          id: string
          server_id: string
          actor_id: string | null
          action: string
          target_id: string | null
          target_type: string | null
          details: Json
          created_at: string
        }
        Insert: {
          id?: string
          server_id: string
          actor_id?: string | null
          action: string
          target_id?: string | null
          target_type?: string | null
          details?: Json
          created_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["server_audit_log"]["Insert"]>
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
      accept_friend_request: {
        Args: { request_id: string }
        Returns: string
      }
      are_users_blocked: {
        Args: { a: string; b: string }
        Returns: boolean
      }
      block_user: {
        Args: { target_id: string }
        Returns: undefined
      }
      is_blocked_by: {
        Args: { other_id: string }
        Returns: boolean
      }
      cleanup_stale_voice_states: {
        Args: { max_age?: string }
        Returns: number
      }
      ensure_dm_conversation: {
        Args: { other_user_id: string }
        Returns: string
      }
      get_mutual_friends: {
        Args: { other_user_id: string }
        Returns: {
          id: string
          username: string
          avatar_url: string | null
          status: string
        }[]
      }
      get_mutual_servers: {
        Args: { other_user_id: string }
        Returns: {
          id: string
          name: string
          icon_url: string | null
        }[]
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
      unblock_user: {
        Args: { target_id: string }
        Returns: undefined
      }
      ignore_user: {
        Args: { target_id: string }
        Returns: undefined
      }
      unignore_user: {
        Args: { target_id: string }
        Returns: undefined
      }
      set_friend_nickname: {
        Args: { p_friend_id: string; p_nickname: string }
        Returns: undefined
      }
      discover_server_stats: {
        Args: Record<string, never>
        Returns: {
          server_id: string
          member_count: number
          online_count: number
        }[]
      }
      get_public_server_preview: {
        Args: { p_server_id: string }
        Returns: Json
      }
      get_public_channel_messages: {
        Args: {
          p_channel_id: string
          p_limit?: number
          p_before?: string | null
        }
        Returns: Json
      }
      get_channel_messages: {
        Args: {
          p_channel_id: string
          p_limit?: number
          p_before?: string | null
        }
        Returns: Json
      }
      heartbeat_presence: {
        Args: {
          p_status: string
          p_manual_status?: string | null
        }
        Returns: undefined
      }
      set_manual_status: {
        Args: {
          p_manual_status: string
          p_status_text?: string | null
          p_clear_status_text?: boolean
          p_clear_after_minutes?: number | null
          p_manual_clear_after_minutes?: number | null
        }
        Returns: undefined
      }
      clear_expired_status_text: {
        Args: Record<string, never>
        Returns: undefined
      }
      set_user_activity: {
        Args: {
          p_activity_type: string
          p_context_id?: string | null
          p_context_name?: string | null
          p_context_extra?: string | null
          p_is_public?: boolean
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
