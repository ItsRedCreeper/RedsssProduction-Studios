"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Hash,
  Link2,
  Lock,
  Plus,
  Shield,
  Smile,
  Trash2,
  Upload,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { compareRolePositionDesc } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { DirtySaveButton } from "@/components/ui/DirtySaveButton";
import { ImageCropModal } from "@/components/ui/ImageCropModal";
import { CustomEmoji } from "@/components/messenger/CustomEmoji";
import {
  byPosition,
  inviteUrl,
  makeInviteCode,
  statusLabel,
} from "@/components/messenger/data";
import {
  CATEGORY_NAME_MAX,
  CATEGORY_NAME_MIN,
  CHANNEL_NAME_MAX,
  CHANNEL_NAME_MIN,
  ROLE_NAME_MAX,
  ROLE_NAME_MIN,
  SERVER_DESCRIPTION_MAX,
  SERVER_NAME_MAX,
  SERVER_NAME_MIN,
} from "@/lib/field-limits";
import { sanitizeEmojiName, type ServerEmoji } from "@/lib/emoji";
import type { AutomodRule } from "@/lib/automod";
import {
  DEFAULT_MEMBER_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSION_OPTIONS,
  isPrivateChannel,
  roleCanViewChannel,
  setChannelPrivate,
  setRoleChannelView,
  type Permission,
  type PermissionMap,
} from "@/lib/permissions";
import { canManageRoleTarget, canModerateMember } from "@/lib/roles";
import type {
  Category,
  Channel,
  Invite,
  MemberView,
  Role,
  Server,
  SettingsTab,
} from "@/components/messenger/types";

const ROLE_PERM_OPTIONS = ROLE_PERMISSION_OPTIONS.map((option) => ({
  key: option.key,
  label: option.label,
}));

type ServerSticker = {
  id: string;
  server_id: string;
  name: string;
  url: string;
  created_by: string;
  created_at: string;
};

type AutomodRuleRow = AutomodRule & { name: string; server_id: string };

const TABS: { id: SettingsTab; label: string; icon: typeof Shield }[] = [
  { id: "overview", label: "Overview", icon: Shield },
  { id: "roles", label: "Roles", icon: Shield },
  { id: "members", label: "Members", icon: Users },
  { id: "invites", label: "Invites", icon: Link2 },
  { id: "channels", label: "Channels", icon: Hash },
  { id: "emojis", label: "Emojis", icon: Smile },
  { id: "stickers", label: "Stickers", icon: Upload },
  { id: "automod", label: "AutoMod", icon: Shield },
  { id: "safety", label: "Safety", icon: Shield },
];

type ServerSettingsModalProps = {
  open: boolean;
  server: Server;
  userId: string;
  members: MemberView[];
  channels: Channel[];
  categories: Category[];
  initialTab: SettingsTab;
  isOwner?: boolean;
  canManageServer?: boolean;
  canManageChannels?: boolean;
  canManageRoles?: boolean;
  canKickMembers?: boolean;
  canBanMembers?: boolean;
  canCreateInvites?: boolean;
  canManageEmojis?: boolean;
  /** Caller's role ids — used for Discord-style hierarchy checks. */
  actorRoleIds?: string[];
  onClose: () => void;
  onServerUpdated: (server: Server) => void;
  onChannelsChanged: (channels: Channel[], categories: Category[]) => void;
  onMembersChanged: (members: MemberView[]) => void;
  onRolesChanged?: (roles: Role[]) => void;
  onEmojisChanged?: () => void;
  onAutomodChanged?: () => void;
};

export function ServerSettingsModal({
  open,
  server,
  userId,
  members,
  channels,
  categories,
  initialTab,
  isOwner = false,
  canManageServer = false,
  canManageChannels = false,
  canManageRoles = false,
  canKickMembers = false,
  canBanMembers = false,
  canCreateInvites = false,
  canManageEmojis = false,
  actorRoleIds = [],
  onClose,
  onServerUpdated,
  onChannelsChanged,
  onMembersChanged,
  onRolesChanged,
  onEmojisChanged,
  onAutomodChanged,
}: ServerSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description ?? "");
  const [isPublic, setIsPublic] = useState(server.is_public);
  const [iconBusy, setIconBusy] = useState(false);
  const [iconCropFile, setIconCropFile] = useState<File | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [nickEditId, setNickEditId] = useState<string | null>(null);
  const [nickDraft, setNickDraft] = useState("");
  const [timeoutMemberId, setTimeoutMemberId] = useState<string | null>(null);
  const [timeoutMinutes, setTimeoutMinutes] = useState(60);
  const [banDurationHours, setBanDurationHours] = useState<number | "perm">(
    "perm",
  );
  const [inviteChannelId, setInviteChannelId] = useState<string>("");
  const iconFileRef = useRef<HTMLInputElement | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [roleName, setRoleName] = useState("");
  const [roleColor, setRoleColor] = useState("#dc2626");
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState<"text" | "voice">("text");
  const [channelCategoryId, setChannelCategoryId] = useState<string>("");
  const [categoryName, setCategoryName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [confirmRoleId, setConfirmRoleId] = useState<string | null>(null);
  const [confirmChannelId, setConfirmChannelId] = useState<string | null>(null);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editChannelName, setEditChannelName] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [permsChannelId, setPermsChannelId] = useState<string | null>(null);
  const [permsCategoryId, setPermsCategoryId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [serverStickers, setServerStickers] = useState<ServerSticker[]>([]);
  const [stickerName, setStickerName] = useState("");
  const [stickerFile, setStickerFile] = useState<File | null>(null);
  const [stickerBusy, setStickerBusy] = useState(false);
  const stickerFileRef = useRef<HTMLInputElement | null>(null);
  const [automodRules, setAutomodRules] = useState<AutomodRuleRow[]>([]);
  const [automodRuleName, setAutomodRuleName] = useState("");
  const [automodKeywords, setAutomodKeywords] = useState("");
  const [automodBusy, setAutomodBusy] = useState(false);
  const [banMemberId, setBanMemberId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banDeleteDays, setBanDeleteDays] = useState(0);
  const [bans, setBans] = useState<
    {
      user_id: string;
      reason: string | null;
      expires_at: string | null;
      created_at: string;
      username?: string;
    }[]
  >([]);
  const [inviteExpiryHours, setInviteExpiryHours] = useState<number | "never">(
    168,
  );
  const [inviteMaxUses, setInviteMaxUses] = useState<number | "">("");
  const [serverEmojis, setServerEmojis] = useState<ServerEmoji[]>([]);
  const [emojiName, setEmojiName] = useState("");
  const [emojiFile, setEmojiFile] = useState<File | null>(null);
  const [emojiBusy, setEmojiBusy] = useState(false);
  const emojiFileRef = useRef<HTMLInputElement | null>(null);
  const creatingInvite = useRef(false);

  const canEditOverview = isOwner || canManageServer;
  const visibleTabs = TABS.filter((item) => {
    switch (item.id) {
      case "overview":
        return canEditOverview;
      case "roles":
        return canManageRoles || isOwner;
      case "members":
        return canManageRoles || canKickMembers || canBanMembers || isOwner;
      case "invites":
        return canCreateInvites || isOwner;
      case "channels":
        return canManageChannels || isOwner;
      case "emojis":
        return canManageEmojis || isOwner;
      case "stickers":
        return canManageEmojis || isOwner;
      case "automod":
        return canManageServer || isOwner;
      case "safety":
        return canManageServer || isOwner;
      default:
        return false;
    }
  });

  // Only reset the active settings tab when the modal opens — not when the
  // server object refreshes (presence/realtime/focus), which was bouncing users
  // back to Overview after switching browser tabs.
  useEffect(() => {
    if (!open) return;
    const allowed = visibleTabs.some((item) => item.id === initialTab)
      ? initialTab
      : visibleTabs[0]?.id ?? initialTab;
    setTab(allowed);
    setName(server.name);
    setDescription(server.description ?? "");
    setIsPublic(server.is_public);
    setTransferTo("");
    setError(null);
    setConfirmChannelId(null);
    setEditingChannelId(null);
    setEmojiName("");
    setEmojiFile(null);
    setStickerName("");
    setStickerFile(null);
    setAutomodRuleName("");
    setAutomodKeywords("");
    setPermsCategoryId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [
        rolesResult,
        invitesResult,
        emojiResult,
        bansResult,
        stickersResult,
        automodResult,
      ] = await Promise.all([
          supabase
            .from("roles")
            .select("*")
            .eq("server_id", server.id)
            .order("position", { ascending: true }),
          supabase
            .from("invites")
            .select("*")
            .eq("server_id", server.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("server_emojis")
            .select("*")
            .eq("server_id", server.id)
            .order("name", { ascending: true }),
          supabase
            .from("server_bans")
            .select("user_id, reason, expires_at, created_at")
            .eq("server_id", server.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("server_stickers")
            .select("*")
            .eq("server_id", server.id)
            .order("name", { ascending: true }),
          supabase
            .from("server_automod_rules")
            .select("*")
            .eq("server_id", server.id)
            .order("created_at", { ascending: true }),
        ]);
      if (cancelled) return;
      if (rolesResult.error) setError(rolesResult.error.message);
      else {
        const next = [...(rolesResult.data ?? [])].sort(compareRolePositionDesc);
        setRoles(next);
        onRolesChanged?.(next);
      }
      if (invitesResult.error) setError(invitesResult.error.message);
      if (emojiResult.error) setError(emojiResult.error.message);
      else setServerEmojis((emojiResult.data as ServerEmoji[]) ?? []);
      if (stickersResult.error) setError(stickersResult.error.message);
      else setServerStickers((stickersResult.data as ServerSticker[]) ?? []);
      if (automodResult.error) setError(automodResult.error.message);
      else setAutomodRules((automodResult.data as AutomodRuleRow[]) ?? []);
      if (!bansResult.error) {
        const rows = bansResult.data ?? [];
        const ids = rows.map((row) => row.user_id);
        let names: Record<string, string> = {};
        if (ids.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, username")
            .in("id", ids);
          for (const profile of profiles ?? []) {
            names[profile.id] = profile.username;
          }
        }
        setBans(
          rows.map((row) => ({
            ...row,
            username: names[row.user_id],
          })),
        );
      }
      let loadedInvites = invitesResult.data ?? [];
      if (!invitesResult.error) setInvites(loadedInvites);

      // Ensure the single permanent invite exists for older servers.
      const permanent = loadedInvites.find((invite) => invite.is_permanent);
      if (!permanent && !creatingInvite.current) {
        creatingInvite.current = true;
        try {
          const code = makeInviteCode();
          const { data, error: insertError } = await supabase
            .from("invites")
            .insert({
              code,
              server_id: server.id,
              creator_id: userId,
              max_uses: null,
              expires_at: null,
              is_permanent: true,
              uses: 0,
            })
            .select("*")
            .single();
          if (!cancelled && !insertError && data) {
            loadedInvites = [data, ...loadedInvites];
            setInvites(loadedInvites);
          } else if (!cancelled && insertError) {
            setError(insertError.message);
          }
        } finally {
          creatingInvite.current = false;
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, server.id, userId]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (categories.length === 0) {
      setChannelCategoryId("");
      return;
    }
    if (!channelCategoryId || !categories.some((c) => c.id === channelCategoryId)) {
      setChannelCategoryId(categories[0].id);
    }
  }, [categories, channelCategoryId]);

  useEffect(() => {
    if (!open || roles.length === 0) return;
    setSelectedRoleId((current) => {
      if (current && roles.some((role) => role.id === current)) return current;
      const defaultRole = roles.find((role) => role.is_default);
      return defaultRole?.id ?? roles[0]?.id ?? null;
    });
  }, [open, roles]);

  if (!open) return null;

  const overviewDirty =
    name.trim() !== server.name ||
    (description.trim() || "") !== (server.description?.trim() || "") ||
    isPublic !== server.is_public;

  async function saveOverview(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < SERVER_NAME_MIN) {
      setError(`Server name must be at least ${SERVER_NAME_MIN} characters.`);
      return;
    }
    if (trimmed.length > SERVER_NAME_MAX) {
      setError(`Server name must be ${SERVER_NAME_MAX} characters or fewer.`);
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("servers")
      .update({
        name: trimmed,
        description: description.trim() || null,
        is_public: isPublic,
      })
      .eq("id", server.id)
      .select("*")
      .single();
    setSaving(false);
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not save server.");
      return;
    }
    onServerUpdated(data);
  }

  async function uploadServerIcon(file: File) {
    if (!canEditOverview) return;
    if (file.size > 512 * 1024) {
      setError("Server icon must be 512 KB or smaller.");
      return;
    }
    setIconBusy(true);
    setError(null);
    const supabase = createClient();
    const ext =
      file.type === "image/gif"
        ? "gif"
        : file.type === "image/webp"
          ? "webp"
          : file.type === "image/png"
            ? "png"
            : "jpg";
    const path = `${server.id}/icon.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("server-icons")
      .upload(path, file, {
        contentType: file.type || "image/png",
        upsert: true,
      });
    if (uploadError) {
      setIconBusy(false);
      setError(uploadError.message);
      return;
    }
    const { data: publicUrl } = supabase.storage
      .from("server-icons")
      .getPublicUrl(path);
    const iconUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;
    const { data, error: updateError } = await supabase
      .from("servers")
      .update({ icon_url: iconUrl })
      .eq("id", server.id)
      .select("*")
      .single();
    setIconBusy(false);
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not save server icon.");
      return;
    }
    onServerUpdated(data);
  }

  async function transferOwnership() {
    if (!isOwner || !transferTo) return;
    if (transferTo === userId) return;
    if (!members.some((member) => member.user_id === transferTo)) {
      setError("Pick a member of this server.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("servers")
      .update({ owner_id: transferTo })
      .eq("id", server.id)
      .eq("owner_id", userId)
      .select("*")
      .single();
    setSaving(false);
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not transfer ownership.");
      return;
    }
    void supabase.from("server_audit_log").insert({
      server_id: server.id,
      actor_id: userId,
      action: "TRANSFER_OWNERSHIP",
      target_id: transferTo,
      target_type: "user",
    });
    onServerUpdated(data);
    setTransferTo("");
  }

  async function saveNickname(memberId: string) {
    const trimmed = nickDraft.trim();
    if (trimmed.length > 32) {
      setError("Nickname must be 32 characters or fewer.");
      return;
    }
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("server_members")
      .update({ nickname: trimmed || null })
      .eq("server_id", server.id)
      .eq("user_id", memberId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onMembersChanged(
      members.map((member) =>
        member.user_id === memberId
          ? { ...member, nickname: trimmed || null }
          : member,
      ),
    );
    setNickEditId(null);
  }

  async function timeoutMember(memberId: string) {
    if (memberId === server.owner_id || memberId === userId) return;
    const target = members.find((member) => member.user_id === memberId);
    if (
      target &&
      !canModerateMember(roles, actorRoleIds, target.roleIds, { isOwner })
    ) {
      setError(
        "You can't timeout someone with an equal or higher role than yours.",
      );
      return;
    }
    const until = new Date(
      Date.now() + Math.max(1, timeoutMinutes) * 60 * 1000,
    ).toISOString();
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("server_members")
      .update({ timed_out_until: until })
      .eq("server_id", server.id)
      .eq("user_id", memberId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onMembersChanged(
      members.map((member) =>
        member.user_id === memberId
          ? { ...member, timed_out_until: until }
          : member,
      ),
    );
    void supabase.from("server_audit_log").insert({
      server_id: server.id,
      actor_id: userId,
      action: "TIMEOUT",
      target_id: memberId,
      target_type: "user",
      details: { until, minutes: timeoutMinutes },
    });
    setTimeoutMemberId(null);
  }

  async function clearTimeout(memberId: string) {
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("server_members")
      .update({ timed_out_until: null })
      .eq("server_id", server.id)
      .eq("user_id", memberId);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onMembersChanged(
      members.map((member) =>
        member.user_id === memberId
          ? { ...member, timed_out_until: null }
          : member,
      ),
    );
  }

  async function createRole(event: FormEvent) {
    event.preventDefault();
    const trimmed = roleName.trim();
    if (trimmed.length < ROLE_NAME_MIN) {
      setError(`Role name must be at least ${ROLE_NAME_MIN} characters.`);
      return;
    }
    if (trimmed.length > ROLE_NAME_MAX) {
      setError(`Role name must be ${ROLE_NAME_MAX} characters or fewer.`);
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    // Discord: new roles sit just above @everyone (the default role).
    const defaultRole = roles.find((role) => role.is_default);
    const newPosition = (defaultRole?.position ?? -1) + 1;
    const toBump = roles.filter((role) => role.position >= newPosition);
    for (const role of toBump) {
      const { error: bumpError } = await supabase
        .from("roles")
        .update({ position: role.position + 1 })
        .eq("id", role.id);
      if (bumpError) {
        setSaving(false);
        setError(bumpError.message);
        return;
      }
    }
    const templatePerms =
      defaultRole?.permissions &&
      typeof defaultRole.permissions === "object" &&
      !Array.isArray(defaultRole.permissions)
        ? (defaultRole.permissions as PermissionMap)
        : DEFAULT_MEMBER_PERMISSIONS;
    const { data, error: insertError } = await supabase
      .from("roles")
      .insert({
        server_id: server.id,
        name: trimmed,
        color: roleColor,
        position: newPosition,
        hoist: false,
        permissions: templatePerms,
      })
      .select("*")
      .single();
    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create role.");
      return;
    }
    const bumped = roles.map((role) =>
      role.position >= newPosition
        ? { ...role, position: role.position + 1 }
        : role,
    );
    const next = [...bumped, data].sort(compareRolePositionDesc);
    setRoles(next);
    onRolesChanged?.(next);
    setRoleName("");
    setSelectedRoleId(data.id);
  }

  async function saveRole(
    role: Role,
    nextName: string,
    nextColor: string,
    nextPermissions: Record<string, boolean>,
    nextHoist: boolean,
  ) {
    if (
      !canManageRoleTarget(roles, actorRoleIds, role, { isOwner })
    ) {
      setError("You can only edit roles below your highest role.");
      return;
    }
    // Discord: @everyone name is fixed; Display separately is not offered.
    const trimmed = role.is_default ? role.name : nextName.trim();
    const hoistValue = role.is_default ? false : nextHoist;
    if (!role.is_default && trimmed.length < ROLE_NAME_MIN) {
      setError(`Role name must be at least ${ROLE_NAME_MIN} characters.`);
      return;
    }
    if (trimmed.length > ROLE_NAME_MAX) {
      setError(`Role name must be ${ROLE_NAME_MAX} characters or fewer.`);
      return;
    }
    // Discord: you can only grant permissions you yourself have.
    const actorPerms = isOwner
      ? null
      : roles
          .filter((item) => actorRoleIds.includes(item.id))
          .reduce<PermissionMap>((acc, item) => {
            const raw = item.permissions;
            if (raw && typeof raw === "object" && !Array.isArray(raw)) {
              for (const [key, value] of Object.entries(
                raw as Record<string, boolean>,
              )) {
                if (value || key === PERMISSIONS.ADMINISTRATOR) {
                  if (key === PERMISSIONS.ADMINISTRATOR && value) {
                    for (const perm of Object.values(PERMISSIONS)) acc[perm] = true;
                  } else if (value) acc[key as Permission] = true;
                }
              }
            }
            return acc;
          }, {});
    const sanitized: PermissionMap = { ...nextPermissions };
    if (actorPerms && !actorPerms.ADMINISTRATOR) {
      for (const key of Object.values(PERMISSIONS)) {
        if (sanitized[key] && !actorPerms[key]) sanitized[key] = false;
      }
    }
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("roles")
      .update({
        name: trimmed,
        color: nextColor,
        permissions: sanitized,
        hoist: hoistValue,
      })
      .eq("id", role.id)
      .select("*")
      .single();
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not update role.");
      return;
    }
    const next = roles
      .map((item) => (item.id === role.id ? data : item))
      .sort(compareRolePositionDesc);
    setRoles(next);
    onRolesChanged?.(next);
  }

  async function moveRole(roleId: string, direction: -1 | 1) {
    // Display is highest-first; direction -1 = move up in list = higher position.
    // Discord: @everyone / default Member stays pinned at the bottom.
    const ordered = [...roles].sort(compareRolePositionDesc);
    const index = ordered.findIndex((role) => role.id === roleId);
    if (index < 0) return;
    const current = ordered[index];
    if (!current || current.is_default) return;
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= ordered.length) return;
    const other = ordered[swapIndex];
    if (!other || other.is_default) return;
    setError(null);
    const supabase = createClient();
    const aPos = current.position;
    const bPos = other.position;
    const [aResult, bResult] = await Promise.all([
      supabase
        .from("roles")
        .update({ position: bPos })
        .eq("id", current.id)
        .select("*")
        .single(),
      supabase
        .from("roles")
        .update({ position: aPos })
        .eq("id", other.id)
        .select("*")
        .single(),
    ]);
    if (aResult.error || bResult.error || !aResult.data || !bResult.data) {
      setError(
        aResult.error?.message ??
          bResult.error?.message ??
          "Could not reorder roles.",
      );
      return;
    }
    const byId = new Map(roles.map((role) => [role.id, role]));
    byId.set(aResult.data.id, aResult.data);
    byId.set(bResult.data.id, bResult.data);
    const next = [...byId.values()].sort(compareRolePositionDesc);
    setRoles(next);
    onRolesChanged?.(next);
  }

  async function deleteRole(roleId: string) {
    const target = roles.find((role) => role.id === roleId);
    if (target?.is_default) {
      setError("The default Member role cannot be deleted.");
      setConfirmRoleId(null);
      return;
    }
    setError(null);
    const supabase = createClient();
    await supabase
      .from("member_roles")
      .delete()
      .eq("server_id", server.id)
      .eq("role_id", roleId);
    const { error: deleteError } = await supabase
      .from("roles")
      .delete()
      .eq("id", roleId);
    if (deleteError) {
      setError(deleteError.message);
      setConfirmRoleId(null);
      return;
    }
    const next = roles.filter((role) => role.id !== roleId);
    setRoles(next);
    onRolesChanged?.(next);
    onMembersChanged(
      members.map((member) => ({
        ...member,
        roleIds: member.roleIds.filter((id) => id !== roleId),
      })),
    );
    setConfirmRoleId(null);
  }

  async function assignRole(memberId: string, roleId: string) {
    if (!roleId) return;
    const targetRole = roles.find((role) => role.id === roleId);
    if (
      targetRole &&
      !canManageRoleTarget(roles, actorRoleIds, targetRole, { isOwner })
    ) {
      setError("You can only assign roles below your highest role.");
      return;
    }
    setError(null);
    const supabase = createClient();
    const member = members.find((item) => item.user_id === memberId);
    if (member?.roleIds.includes(roleId)) return;

    const { error: insertError } = await supabase.from("member_roles").insert({
      server_id: server.id,
      user_id: memberId,
      role_id: roleId,
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }

    // Discord: @everyone / default Member is additive forever — assigning Admin
    // must never replace it. Re-attach if a stale client somehow dropped it.
    const defaultRole = roles.find((role) => role.is_default);
    const nextRoleIds = new Set([...(member?.roleIds ?? []), roleId]);
    if (defaultRole && !nextRoleIds.has(defaultRole.id)) {
      const { error: defaultError } = await supabase.from("member_roles").insert({
        server_id: server.id,
        user_id: memberId,
        role_id: defaultRole.id,
      });
      if (!defaultError || /duplicate|unique/i.test(defaultError.message)) {
        nextRoleIds.add(defaultRole.id);
      }
    }

    // Legacy single-column hint only — real roles live in member_roles.
    await supabase
      .from("server_members")
      .update({ role_id: roleId })
      .eq("server_id", server.id)
      .eq("user_id", memberId);

    onMembersChanged(
      members.map((item) =>
        item.user_id === memberId
          ? { ...item, roleIds: [...nextRoleIds] }
          : item,
      ),
    );
  }

  async function removeRole(memberId: string, roleId: string) {
    const target = roles.find((role) => role.id === roleId);
    if (target?.is_default) {
      setError("The default Member role cannot be removed from members.");
      return;
    }
    if (
      target &&
      !canManageRoleTarget(roles, actorRoleIds, target, { isOwner })
    ) {
      setError("You can only remove roles below your highest role.");
      return;
    }
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("member_roles")
      .delete()
      .eq("server_id", server.id)
      .eq("user_id", memberId)
      .eq("role_id", roleId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    const nextRoleIds =
      members.find((item) => item.user_id === memberId)?.roleIds.filter(
        (id) => id !== roleId,
      ) ?? [];
    await supabase
      .from("server_members")
      .update({ role_id: nextRoleIds[0] ?? null })
      .eq("server_id", server.id)
      .eq("user_id", memberId);

    onMembersChanged(
      members.map((item) =>
        item.user_id === memberId ? { ...item, roleIds: nextRoleIds } : item,
      ),
    );
  }

  async function kickMember(memberId: string) {
    if (!canKickMembers && !isOwner) return;
    if (memberId === server.owner_id || memberId === userId) return;
    const target = members.find((member) => member.user_id === memberId);
    if (
      target &&
      !canModerateMember(roles, actorRoleIds, target.roleIds, { isOwner })
    ) {
      setError(
        "You can't kick someone with an equal or higher role than yours.",
      );
      return;
    }
    setError(null);
    const supabase = createClient();
    await supabase
      .from("member_roles")
      .delete()
      .eq("server_id", server.id)
      .eq("user_id", memberId);
    const { error: deleteError } = await supabase
      .from("server_members")
      .delete()
      .eq("server_id", server.id)
      .eq("user_id", memberId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    onMembersChanged(members.filter((member) => member.user_id !== memberId));
  }

  async function banMember(memberId: string) {
    if (!canBanMembers && !isOwner) return;
    if (memberId === server.owner_id || memberId === userId) return;
    const target = members.find((member) => member.user_id === memberId);
    if (
      target &&
      !canModerateMember(roles, actorRoleIds, target.roleIds, { isOwner })
    ) {
      setError(
        "You can't ban someone with an equal or higher role than yours.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const deleteSeconds = Math.max(0, banDeleteDays) * 24 * 60 * 60;
    const expiresAt =
      banDurationHours === "perm"
        ? null
        : new Date(
            Date.now() + Number(banDurationHours) * 60 * 60 * 1000,
          ).toISOString();
    const { error: banError } = await supabase.from("server_bans").upsert({
      server_id: server.id,
      user_id: memberId,
      banned_by: userId,
      reason: banReason.trim() || null,
      delete_message_seconds: deleteSeconds,
      expires_at: expiresAt,
    });
    if (banError) {
      setSaving(false);
      setError(banError.message);
      return;
    }
    if (deleteSeconds > 0) {
      const since = new Date(Date.now() - deleteSeconds * 1000).toISOString();
      const channelIds = channels.map((channel) => channel.id);
      if (channelIds.length > 0) {
        await supabase
          .from("messages")
          .delete()
          .eq("user_id", memberId)
          .in("channel_id", channelIds)
          .gte("created_at", since);
      }
    }
    await supabase
      .from("member_roles")
      .delete()
      .eq("server_id", server.id)
      .eq("user_id", memberId);
    await supabase
      .from("server_members")
      .delete()
      .eq("server_id", server.id)
      .eq("user_id", memberId);
    setSaving(false);
    onMembersChanged(members.filter((member) => member.user_id !== memberId));
    setBans((prev) => [
      {
        user_id: memberId,
        reason: banReason.trim() || null,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        username: target?.username,
      },
      ...prev.filter((ban) => ban.user_id !== memberId),
    ]);
    setBanMemberId(null);
    setBanReason("");
    setBanDeleteDays(0);
    setBanDurationHours("perm");
  }

  async function unbanMember(memberId: string) {
    if (!canBanMembers && !isOwner) return;
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("server_bans")
      .delete()
      .eq("server_id", server.id)
      .eq("user_id", memberId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setBans((prev) => prev.filter((ban) => ban.user_id !== memberId));
  }

  async function createTimedInvite(event: FormEvent) {
    event.preventDefault();
    if (!canCreateInvites && !isOwner) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const code = makeInviteCode();
    const expiresAt =
      inviteExpiryHours === "never"
        ? null
        : new Date(Date.now() + inviteExpiryHours * 60 * 60 * 1000).toISOString();
    const { data, error: insertError } = await supabase
      .from("invites")
      .insert({
        code,
        server_id: server.id,
        creator_id: userId,
        max_uses: inviteMaxUses === "" ? null : Number(inviteMaxUses),
        expires_at: expiresAt,
        is_permanent: inviteExpiryHours === "never" && inviteMaxUses === "",
        channel_id: inviteChannelId || null,
        uses: 0,
      })
      .select("*")
      .single();
    setInviteChannelId("");
    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create invite.");
      return;
    }
    setInvites((prev) => [data, ...prev]);
    setInviteMaxUses("");
  }

  async function deleteInvite(inviteId: string) {
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("invites")
      .delete()
      .eq("id", inviteId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setInvites((prev) => prev.filter((invite) => invite.id !== inviteId));
  }

  async function toggleInvitesPaused() {
    if (!canManageServer && !isOwner) return;
    const next = !server.invites_paused;
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("servers")
      .update({ invites_paused: next })
      .eq("id", server.id)
      .select("*")
      .single();
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not update invite pause.");
      return;
    }
    onServerUpdated(data);
  }

  async function syncChannelToCategory(channel: Channel) {
    if (!channel.category_id) return;
    const category = categories.find((item) => item.id === channel.category_id);
    if (!category) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("channels")
      .update({
        permission_overrides: category.permission_overrides ?? {},
        permissions_synced: true,
      })
      .eq("id", channel.id)
      .select("*")
      .single();
    setSaving(false);
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not sync permissions.");
      return;
    }
    onChannelsChanged(
      channels.map((item) => (item.id === channel.id ? data : item)),
      categories,
    );
  }

  async function copyInvite(code: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((current) => (current === code ? null : current)), 1600);
    } catch {
      setError("Could not copy the invite link.");
    }
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    const trimmed = categoryName.trim();
    if (trimmed.length < CATEGORY_NAME_MIN) {
      setError(`Category name must be at least ${CATEGORY_NAME_MIN} characters.`);
      return;
    }
    if (trimmed.length > CATEGORY_NAME_MAX) {
      setError(`Category name must be ${CATEGORY_NAME_MAX} characters or fewer.`);
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("channel_categories")
      .insert({
        server_id: server.id,
        name: trimmed,
        position: categories.length,
      })
      .select("*")
      .single();
    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create category.");
      return;
    }
    onChannelsChanged(channels, [...categories, data].sort(byPosition));
    setCategoryName("");
  }

  async function renameCategory(category: Category, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === category.name) return;
    if (trimmed.length < CATEGORY_NAME_MIN) {
      setError(`Category name must be at least ${CATEGORY_NAME_MIN} characters.`);
      return;
    }
    if (trimmed.length > CATEGORY_NAME_MAX) {
      setError(`Category name must be ${CATEGORY_NAME_MAX} characters or fewer.`);
      return;
    }
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("channel_categories")
      .update({ name: trimmed })
      .eq("id", category.id)
      .select("*")
      .single();
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not rename category.");
      return;
    }
    onChannelsChanged(
      channels,
      categories.map((item) => (item.id === category.id ? data : item)).sort(byPosition),
    );
  }

  async function deleteCategory(categoryId: string) {
    setError(null);
    const supabase = createClient();
    // Detach channels first so they become uncategorized.
    await supabase
      .from("channels")
      .update({ category_id: null })
      .eq("category_id", categoryId);
    const { error: deleteError } = await supabase
      .from("channel_categories")
      .delete()
      .eq("id", categoryId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    onChannelsChanged(
      channels.map((channel) =>
        channel.category_id === categoryId
          ? { ...channel, category_id: null }
          : channel,
      ),
      categories.filter((category) => category.id !== categoryId),
    );
  }

  async function createChannel(event: FormEvent) {
    event.preventDefault();
    const trimmed = channelName.trim().toLowerCase().replace(/\s+/g, "-");
    if (trimmed.length < CHANNEL_NAME_MIN) {
      setError(`Channel name must be at least ${CHANNEL_NAME_MIN} characters.`);
      return;
    }
    if (trimmed.length > CHANNEL_NAME_MAX) {
      setError(`Channel name must be ${CHANNEL_NAME_MAX} characters or fewer.`);
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const overrides = newChannelPrivate
      ? setChannelPrivate({}, true)
      : undefined;
    const { data, error: insertError } = await supabase
      .from("channels")
      .insert({
        server_id: server.id,
        name: trimmed,
        type: channelType,
        category_id: channelCategoryId || null,
        position: channels.length,
        ...(overrides ? { permission_overrides: overrides } : {}),
      })
      .select("*")
      .single();
    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create channel.");
      return;
    }
    onChannelsChanged([...channels, data].sort(byPosition), categories);
    setChannelName("");
    setNewChannelPrivate(false);
    if (newChannelPrivate) setPermsChannelId(data.id);
  }

  async function saveCategoryOverrides(
    category: Category,
    nextOverrides: ReturnType<typeof setChannelPrivate>,
  ) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("channel_categories")
      .update({ permission_overrides: nextOverrides })
      .eq("id", category.id)
      .select("*")
      .single();
    setSaving(false);
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not update category permissions.");
      return;
    }
    onChannelsChanged(
      channels,
      categories.map((item) => (item.id === category.id ? data : item)).sort(byPosition),
    );
  }

  async function saveChannelOverrides(
    channel: Channel,
    nextOverrides: ReturnType<typeof setChannelPrivate>,
  ) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("channels")
      .update({ permission_overrides: nextOverrides })
      .eq("id", channel.id)
      .select("*")
      .single();
    setSaving(false);
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not update channel permissions.");
      return;
    }
    onChannelsChanged(
      channels.map((item) => (item.id === channel.id ? data : item)),
      categories,
    );
  }

  async function renameChannel(channelId: string) {
    const trimmed = editChannelName.trim().toLowerCase().replace(/\s+/g, "-");
    if (trimmed.length < CHANNEL_NAME_MIN) {
      setError(`Channel name must be at least ${CHANNEL_NAME_MIN} characters.`);
      return;
    }
    if (trimmed.length > CHANNEL_NAME_MAX) {
      setError(`Channel name must be ${CHANNEL_NAME_MAX} characters or fewer.`);
      return;
    }
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("channels")
      .update({ name: trimmed })
      .eq("id", channelId)
      .select("*")
      .single();
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not rename channel.");
      return;
    }
    onChannelsChanged(
      channels.map((channel) => (channel.id === channelId ? data : channel)),
      categories,
    );
    setEditingChannelId(null);
  }

  async function deleteChannel(channelId: string) {
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("channels")
      .delete()
      .eq("id", channelId);
    if (deleteError) {
      setError(deleteError.message);
      setConfirmChannelId(null);
      return;
    }
    onChannelsChanged(
      channels.filter((channel) => channel.id !== channelId),
      categories,
    );
    setConfirmChannelId(null);
  }

  async function uploadServerEmoji(event: FormEvent) {
    event.preventDefault();
    if (!canManageEmojis) {
      setError("You don't have permission to manage emojis.");
      return;
    }
    if (!emojiFile) {
      setError("Choose an image or GIF first.");
      return;
    }
    const name = sanitizeEmojiName(emojiName || emojiFile.name.replace(/\.[^.]+$/, ""));
    if (name.length < 2) {
      setError("Emoji name must be at least 2 characters.");
      return;
    }
    if (emojiFile.size > 512 * 1024) {
      setError("Emoji must be 512 KB or smaller.");
      return;
    }
    setEmojiBusy(true);
    setError(null);
    const supabase = createClient();
    const ext =
      emojiFile.type === "image/gif"
        ? "gif"
        : emojiFile.type === "image/webp"
          ? "webp"
          : emojiFile.type === "image/png"
            ? "png"
            : "jpg";
    const id = crypto.randomUUID();
    const path = `${server.id}/${id}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("server-emojis")
      .upload(path, emojiFile, {
        contentType: emojiFile.type || "image/png",
        upsert: false,
      });
    if (uploadError) {
      setEmojiBusy(false);
      setError(uploadError.message);
      return;
    }
    const { data: publicUrl } = supabase.storage
      .from("server-emojis")
      .getPublicUrl(path);
    const { data, error: insertError } = await supabase
      .from("server_emojis")
      .insert({
        id,
        server_id: server.id,
        name,
        url: publicUrl.publicUrl,
        animated: emojiFile.type === "image/gif",
        created_by: userId,
      })
      .select("*")
      .single();
    setEmojiBusy(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not save emoji.");
      return;
    }
    setServerEmojis((prev) =>
      [...prev, data as ServerEmoji].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setEmojiName("");
    setEmojiFile(null);
    if (emojiFileRef.current) emojiFileRef.current.value = "";
    onEmojisChanged?.();
  }

  async function deleteServerEmoji(emoji: ServerEmoji) {
    if (!canManageEmojis) {
      setError("You don't have permission to manage emojis.");
      return;
    }
    setEmojiBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("server_emojis")
      .delete()
      .eq("id", emoji.id);
    if (deleteError) {
      setEmojiBusy(false);
      setError(deleteError.message);
      return;
    }
    const pathMatch = emoji.url.match(/server-emojis\/(.+)$/);
    if (pathMatch?.[1]) {
      void supabase.storage.from("server-emojis").remove([decodeURIComponent(pathMatch[1])]);
    }
    setServerEmojis((prev) => prev.filter((row) => row.id !== emoji.id));
    setEmojiBusy(false);
    onEmojisChanged?.();
  }

  async function uploadServerSticker(event: FormEvent) {
    event.preventDefault();
    if (!canManageEmojis && !isOwner) {
      setError("You don't have permission to manage stickers.");
      return;
    }
    if (!stickerFile) {
      setError("Choose an image first.");
      return;
    }
    const stickerLabel = sanitizeEmojiName(
      stickerName || stickerFile.name.replace(/\.[^.]+$/, ""),
    );
    if (stickerLabel.length < 2) {
      setError("Sticker name must be at least 2 characters.");
      return;
    }
    if (stickerFile.size > 512 * 1024) {
      setError("Sticker must be 512 KB or smaller.");
      return;
    }
    setStickerBusy(true);
    setError(null);
    const supabase = createClient();
    const ext =
      stickerFile.type === "image/gif"
        ? "gif"
        : stickerFile.type === "image/webp"
          ? "webp"
          : stickerFile.type === "image/png"
            ? "png"
            : "jpg";
    const id = crypto.randomUUID();
    let bucket = "server-stickers";
    let path = `${server.id}/${id}.${ext}`;
    let uploadError = (
      await supabase.storage.from(bucket).upload(path, stickerFile, {
        contentType: stickerFile.type || "image/png",
        upsert: false,
      })
    ).error;
    if (uploadError) {
      // Fallback: use server-emojis bucket with stickers/ path prefix
      bucket = "server-emojis";
      path = `stickers/${server.id}/${id}.${ext}`;
      uploadError = (
        await supabase.storage.from(bucket).upload(path, stickerFile, {
          contentType: stickerFile.type || "image/png",
          upsert: false,
        })
      ).error;
    }
    if (uploadError) {
      setStickerBusy(false);
      setError(uploadError.message);
      return;
    }
    const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(path);
    const { data, error: insertError } = await supabase
      .from("server_stickers")
      .insert({
        id,
        server_id: server.id,
        name: stickerLabel,
        url: publicUrl.publicUrl,
        created_by: userId,
      })
      .select("*")
      .single();
    setStickerBusy(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not save sticker.");
      return;
    }
    setServerStickers((prev) =>
      [...prev, data as ServerSticker].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    setStickerName("");
    setStickerFile(null);
    if (stickerFileRef.current) stickerFileRef.current.value = "";
    onEmojisChanged?.();
  }

  async function deleteServerSticker(sticker: ServerSticker) {
    if (!canManageEmojis && !isOwner) {
      setError("You don't have permission to manage stickers.");
      return;
    }
    setStickerBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("server_stickers")
      .delete()
      .eq("id", sticker.id);
    if (deleteError) {
      setStickerBusy(false);
      setError(deleteError.message);
      return;
    }
    const stickersMatch = sticker.url.match(/server-stickers\/(.+)$/);
    const emojiStickersMatch = sticker.url.match(/server-emojis\/(.+)$/);
    if (stickersMatch?.[1]) {
      void supabase.storage
        .from("server-stickers")
        .remove([decodeURIComponent(stickersMatch[1])]);
    } else if (emojiStickersMatch?.[1]) {
      void supabase.storage
        .from("server-emojis")
        .remove([decodeURIComponent(emojiStickersMatch[1])]);
    }
    setServerStickers((prev) => prev.filter((row) => row.id !== sticker.id));
    setStickerBusy(false);
    onEmojisChanged?.();
  }

  async function createAutomodRule(event: FormEvent) {
    event.preventDefault();
    if (!canManageServer && !isOwner) return;
    const name = automodRuleName.trim();
    if (name.length < 2) {
      setError("Rule name must be at least 2 characters.");
      return;
    }
    const keywords = automodKeywords
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (keywords.length === 0) {
      setError("Add at least one keyword (comma-separated).");
      return;
    }
    setAutomodBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("server_automod_rules")
      .insert({
        server_id: server.id,
        name,
        enabled: true,
        keywords,
        action: "block",
      })
      .select("*")
      .single();
    setAutomodBusy(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create AutoMod rule.");
      return;
    }
    setAutomodRules((prev) => [...prev, data as AutomodRuleRow]);
    setAutomodRuleName("");
    setAutomodKeywords("");
    onAutomodChanged?.();
  }

  async function setAutomodRuleEnabled(ruleId: string, enabled: boolean) {
    if (!canManageServer && !isOwner) return;
    setAutomodBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("server_automod_rules")
      .update({ enabled })
      .eq("id", ruleId)
      .select("*")
      .single();
    setAutomodBusy(false);
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not update rule.");
      return;
    }
    setAutomodRules((prev) =>
      prev.map((rule) => (rule.id === ruleId ? (data as AutomodRuleRow) : rule)),
    );
    onAutomodChanged?.();
  }

  async function deleteAutomodRule(ruleId: string) {
    if (!canManageServer && !isOwner) return;
    setAutomodBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("server_automod_rules")
      .delete()
      .eq("id", ruleId);
    setAutomodBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setAutomodRules((prev) => prev.filter((rule) => rule.id !== ruleId));
    onAutomodChanged?.();
  }

  const roleById = new Map(roles.map((role) => [role.id, role]));
  const categoryNameMap = new Map(categories.map((category) => [category.id, category.name]));
  const sortedChannels = [...channels].sort(byPosition);
  const sortedCategories = [...categories].sort(byPosition);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close settings"
        onClick={onClose}
      />
      <ImageCropModal
        open={!!iconCropFile}
        file={iconCropFile}
        kind="icon"
        onCancel={() => setIconCropFile(null)}
        onCropped={(cropped) => {
          setIconCropFile(null);
          void uploadServerIcon(cropped);
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-settings-title"
        className="messenger-shell relative z-10 flex max-h-[min(90dvh,52rem)] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--ms-chat)] shadow-2xl shadow-black/50 ring-1 ring-accent/15"
      >
        <aside className="flex w-40 shrink-0 flex-col border-r border-[var(--ms-border)] bg-[var(--ms-sidebar)] p-3 sm:w-52">
          <p
            id="server-settings-title"
            className="mb-3 truncate px-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]"
          >
            {server.name}
          </p>
          <nav className="space-y-0.5">
            {visibleTabs.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
                    active
                      ? "bg-[var(--ms-active)] text-white shadow-[inset_2px_0_0_0_var(--accent)]"
                      : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="messenger-header flex items-center justify-between bg-[var(--ms-chat)] px-5 py-3">
            <h2 className="text-base font-semibold tracking-tight text-white">
              {visibleTabs.find((item) => item.id === tab)?.label ??
                TABS.find((item) => item.id === tab)?.label}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--ms-text-muted)] hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:max-w-[45rem]">
            {error && (
              <p className="mb-3 rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
                {error}
              </p>
            )}

            {tab === "overview" && canEditOverview && (
              <form onSubmit={saveOverview} className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-[var(--ms-border)] text-xl font-bold text-white">
                    {server.icon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={server.icon_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      server.name.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="space-y-1">
                    <input
                      ref={iconFileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file?.type.startsWith("image/")) {
                          setIconCropFile(file);
                        }
                        event.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      disabled={iconBusy}
                      onClick={() => iconFileRef.current?.click()}
                      className="rounded-md bg-[#3f4147] px-3 py-2 text-sm text-[var(--ms-text)] hover:bg-[#4e5058] disabled:opacity-50"
                    >
                      {iconBusy ? "Uploading…" : "Change Icon"}
                    </button>
                    <p className="text-[11px] text-[var(--ms-text-muted)]">
                      Crop after upload · PNG, JPG, GIF, or WebP · max 512 KB
                    </p>
                  </div>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Server name
                  </span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={SERVER_NAME_MIN}
                    maxLength={SERVER_NAME_MAX}
                    className="w-full rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/60"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Description
                  </span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    maxLength={SERVER_DESCRIPTION_MAX}
                    className="w-full resize-none rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/60"
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-3">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(event) => setIsPublic(event.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="text-sm text-foreground">
                    Make this server discoverable
                  </span>
                </label>
                <div
                  className={
                    overviewDirty
                      ? "sticky bottom-0 z-10 -mx-1 mt-2 rounded-xl border border-white/[0.08] bg-[var(--ms-elevated,#232428)] px-3 py-3 shadow-lg shadow-black/40"
                      : undefined
                  }
                >
                  {overviewDirty ? (
                    <p className="mb-2 text-xs text-[var(--ms-text-muted,#949ba4)]">
                      You have unsaved changes.
                    </p>
                  ) : null}
                  <DirtySaveButton
                    type="submit"
                    dirty={overviewDirty}
                    saving={saving}
                    disabled={name.trim().length < 2}
                    label="Save changes"
                  />
                </div>
                {isOwner ? (
                  <div className="space-y-2 border-t border-[var(--ms-danger)]/30 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ms-danger)]">
                      Danger zone
                    </p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                      Transfer ownership
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={transferTo}
                        onChange={(event) => setTransferTo(event.target.value)}
                        className="min-w-[12rem] flex-1 rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2 text-sm"
                      >
                        <option value="">Select a member…</option>
                        {members
                          .filter((member) => member.user_id !== userId)
                          .map((member) => (
                            <option key={member.user_id} value={member.user_id}>
                              {member.nickname || member.username}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={saving || !transferTo}
                        onClick={() => void transferOwnership()}
                        className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Transfer
                      </button>
                    </div>
                  </div>
                ) : null}
              </form>
            )}

            {tab === "roles" && (canManageRoles || isOwner) && (
              <div className="flex min-h-[20rem] gap-3">
                <form
                  onSubmit={createRole}
                  className="flex w-40 shrink-0 flex-col rounded-md border border-[#3f4147] bg-[var(--ms-sidebar)]"
                >
                  <div className="flex-1 overflow-y-auto p-2">
                    {roles.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-muted">No roles yet.</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {roles.map((role) => (
                          <li key={role.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedRoleId(role.id)}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                                selectedRoleId === role.id
                                  ? "bg-[#404249] text-white"
                                  : "text-[var(--ms-text)] hover:bg-white/5"
                              }`}
                            >
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: role.color || "#99aab5",
                                }}
                              />
                              <span className="min-w-0 truncate">{role.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="space-y-2 border-t border-[#3f4147] p-2">
                    <input
                      value={roleName}
                      onChange={(event) => setRoleName(event.target.value)}
                      placeholder="Role name"
                      maxLength={ROLE_NAME_MAX}
                      className="w-full rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-2 py-1.5 text-sm outline-none focus:border-accent/60"
                    />
                    <input
                      type="color"
                      value={roleColor}
                      onChange={(event) => setRoleColor(event.target.value)}
                      aria-label="New role color"
                      className="h-9 w-full cursor-pointer rounded-md border border-[#3f4147] bg-[var(--ms-border)]"
                    />
                    <button
                      type="submit"
                      disabled={saving || !roleName.trim()}
                      className="flex w-full items-center justify-center gap-1 rounded-md bg-[#3f4147] px-2 py-1.5 text-sm font-medium text-white hover:bg-[#4e5058] disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2} />
                      New Role
                    </button>
                  </div>
                </form>
                <div className="min-w-0 flex-1 overflow-y-auto">
                  {selectedRoleId && roles.some((r) => r.id === selectedRoleId) ? (
                    (() => {
                      const role = roles.find((r) => r.id === selectedRoleId)!;
                      const index = roles.findIndex((r) => r.id === selectedRoleId);
                      const canEdit = canManageRoleTarget(
                        roles,
                        actorRoleIds,
                        role,
                        { isOwner },
                      );
                      const belowIsDefault =
                        index < roles.length - 1 &&
                        Boolean(roles[index + 1]?.is_default);
                      return (
                        <RoleRow
                          key={role.id}
                          role={role}
                          confirm={confirmRoleId === role.id}
                          canEdit={canEdit}
                          canDelete={!role.is_default && canEdit}
                          canMoveUp={
                            !role.is_default && index > 0 && (isOwner || canEdit)
                          }
                          canMoveDown={
                            !role.is_default &&
                            !belowIsDefault &&
                            index < roles.length - 1 &&
                            (isOwner || canEdit)
                          }
                          onMoveUp={() => void moveRole(role.id, -1)}
                          onMoveDown={() => void moveRole(role.id, 1)}
                          onSave={saveRole}
                          onAskDelete={() => setConfirmRoleId(role.id)}
                          onCancelDelete={() => setConfirmRoleId(null)}
                          onDelete={() => void deleteRole(role.id)}
                        />
                      );
                    })()
                  ) : (
                    <p className="text-sm text-muted">Select a role to edit.</p>
                  )}
                </div>
              </div>
            )}

            {tab === "members" &&
              (canManageRoles || canKickMembers || canBanMembers || isOwner) && (
              <ul className="space-y-2">
                {(canBanMembers || isOwner) && bans.length > 0 && (
                  <li className="mb-1 space-y-2 rounded-md border border-[#3f4147] bg-[var(--ms-border)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                      Bans
                    </p>
                    <ul className="space-y-1">
                      {bans.map((ban) => (
                        <li
                          key={ban.user_id}
                          className="flex items-center justify-between gap-2 text-sm text-[var(--ms-text)]"
                        >
                          <span className="min-w-0 truncate">
                            {ban.username ?? ban.user_id}
                            {ban.reason ? (
                              <span className="text-[var(--ms-text-muted)]">
                                {" "}
                                — {ban.reason}
                              </span>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            onClick={() => void unbanMember(ban.user_id)}
                            className="shrink-0 rounded-md px-2 py-1 text-xs hover:bg-white/10"
                          >
                            Unban
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                )}
                {members.length === 0 && (
                  <li className="text-sm text-muted">No members loaded.</li>
                )}
                {members.map((member) => {
                  const label = member.nickname || member.username;
                  const memberIsOwner = member.user_id === server.owner_id;
                  return (
                    <li
                      key={member.user_id}
                      className="rounded-md bg-[var(--ms-sidebar)] px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          username={label}
                          avatarUrl={member.avatar_url}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-white">
                            {label}
                            {memberIsOwner && (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-accent">
                                Owner
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {statusLabel(member.status)}
                          </p>
                        </div>
                        {!memberIsOwner &&
                          member.user_id !== userId &&
                          canModerateMember(
                            roles,
                            actorRoleIds,
                            member.roleIds,
                            { isOwner },
                          ) && (
                          <div className="flex items-center gap-1">
                            {(canKickMembers || isOwner) && (
                              <button
                                type="button"
                                onClick={() => void kickMember(member.user_id)}
                                className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-muted"
                              >
                                Kick
                              </button>
                            )}
                            {(canBanMembers || isOwner) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setBanMemberId(member.user_id);
                                  setBanReason("");
                                  setBanDeleteDays(0);
                                  setBanDurationHours("perm");
                                }}
                                className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-muted"
                              >
                                Ban
                              </button>
                            )}
                            {(canKickMembers || canBanMembers || isOwner) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setTimeoutMemberId(member.user_id);
                                  setTimeoutMinutes(60);
                                }}
                                className="rounded-md px-2 py-1 text-xs font-medium text-[var(--ms-text)] hover:bg-white/10"
                              >
                                Timeout
                              </button>
                            )}
                            {(canManageRoles || isOwner || member.user_id === userId) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNickEditId(member.user_id);
                                  setNickDraft(member.nickname ?? "");
                                }}
                                className="rounded-md px-2 py-1 text-xs font-medium text-[var(--ms-text)] hover:bg-white/10"
                              >
                                Nick
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {member.timed_out_until &&
                      Date.parse(member.timed_out_until) > Date.now() ? (
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[#f0b232]">
                          <span>
                            Timed out until{" "}
                            {new Date(member.timed_out_until).toLocaleString()}
                          </span>
                          {(canKickMembers || canBanMembers || isOwner) && (
                            <button
                              type="button"
                              onClick={() => void clearTimeout(member.user_id)}
                              className="rounded-md px-2 py-1 hover:bg-white/10"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ) : null}
                      {nickEditId === member.user_id ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <input
                            value={nickDraft}
                            onChange={(event) => setNickDraft(event.target.value)}
                            maxLength={32}
                            placeholder="Nickname"
                            className="min-w-[8rem] flex-1 rounded-md border border-[#3f4147] bg-[#111214] px-2 py-1.5 text-sm outline-none focus:border-accent/60"
                          />
                          <button
                            type="button"
                            onClick={() => void saveNickname(member.user_id)}
                            className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setNickEditId(null)}
                            className="rounded-md px-2 py-1.5 text-xs text-muted hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                      {timeoutMemberId === member.user_id ? (
                        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-[#3f4147] bg-[var(--ms-border)] p-3">
                          <label className="text-xs text-[var(--ms-text-muted)]">
                            Duration
                            <select
                              value={timeoutMinutes}
                              onChange={(event) =>
                                setTimeoutMinutes(Number(event.target.value))
                              }
                              className="mt-1 block rounded-md border border-[#3f4147] bg-[#111214] px-2 py-1.5 text-sm text-[var(--ms-text)]"
                            >
                              <option value={1}>60 seconds</option>
                              <option value={5}>5 minutes</option>
                              <option value={10}>10 minutes</option>
                              <option value={60}>1 hour</option>
                              <option value={1440}>1 day</option>
                              <option value={10080}>1 week</option>
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => void timeoutMember(member.user_id)}
                            className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white"
                          >
                            Confirm Timeout
                          </button>
                          <button
                            type="button"
                            onClick={() => setTimeoutMemberId(null)}
                            className="rounded-md px-2 py-1.5 text-xs text-muted hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                      {banMemberId === member.user_id ? (
                        <div className="mt-2 space-y-2 rounded-md border border-[#3f4147] bg-[var(--ms-border)] p-3">
                          <input
                            value={banReason}
                            onChange={(event) => setBanReason(event.target.value)}
                            placeholder="Reason (optional)"
                            className="w-full rounded-md border border-[#3f4147] bg-[#111214] px-2 py-1.5 text-sm outline-none focus:border-accent/60"
                          />
                          <label className="block text-xs text-[var(--ms-text-muted)]">
                            Delete message history
                            <select
                              value={banDeleteDays}
                              onChange={(event) =>
                                setBanDeleteDays(Number(event.target.value))
                              }
                              className="mt-1 block w-full rounded-md border border-[#3f4147] bg-[#111214] px-2 py-1.5 text-sm text-[var(--ms-text)]"
                            >
                              <option value={0}>Don&apos;t delete any</option>
                              <option value={1}>Previous 24 hours</option>
                              <option value={7}>Previous 7 days</option>
                            </select>
                          </label>
                          <label className="block text-xs text-[var(--ms-text-muted)]">
                            Ban duration
                            <select
                              value={String(banDurationHours)}
                              onChange={(event) => {
                                const value = event.target.value;
                                setBanDurationHours(
                                  value === "perm" ? "perm" : Number(value),
                                );
                              }}
                              className="mt-1 block w-full rounded-md border border-[#3f4147] bg-[#111214] px-2 py-1.5 text-sm text-[var(--ms-text)]"
                            >
                              <option value="perm">Permanent</option>
                              <option value="1">1 hour</option>
                              <option value="24">1 day</option>
                              <option value="168">7 days</option>
                              <option value="720">30 days</option>
                            </select>
                          </label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void banMember(member.user_id)}
                              className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white"
                            >
                              Confirm Ban
                            </button>
                            <button
                              type="button"
                              onClick={() => setBanMemberId(null)}
                              className="rounded-md px-2 py-1.5 text-xs text-muted hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {member.roleIds.map((roleId) => {
                          const role = roleById.get(roleId);
                          if (!role) return null;
                          if (role.is_default) {
                            return (
                              <span
                                key={roleId}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-white"
                                style={{
                                  backgroundColor: `${role.color || "#99aab5"}33`,
                                }}
                                title="Default role"
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{
                                    backgroundColor: role.color || "#99aab5",
                                  }}
                                />
                                {role.name}
                              </span>
                            );
                          }
                          if (!canManageRoles && !isOwner) {
                            return (
                              <span
                                key={roleId}
                                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-white"
                                style={{
                                  backgroundColor: `${role.color || "#dc2626"}33`,
                                }}
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{
                                    backgroundColor: role.color || "#dc2626",
                                  }}
                                />
                                {role.name}
                              </span>
                            );
                          }
                          return (
                            <button
                              key={roleId}
                              type="button"
                              onClick={() => void removeRole(member.user_id, roleId)}
                              aria-label={`Remove role ${role.name}`}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-white"
                              style={{ backgroundColor: `${role.color || "#dc2626"}33` }}
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: role.color || "#dc2626" }}
                              />
                              {role.name}
                              <X className="h-3 w-3 opacity-70" strokeWidth={2} />
                            </button>
                          );
                        })}
                        {(canManageRoles || isOwner) &&
                          roles.some(
                            (role) =>
                              !role.is_default &&
                              !member.roleIds.includes(role.id) &&
                              canManageRoleTarget(roles, actorRoleIds, role, {
                                isOwner,
                              }),
                          ) && (
                          <select
                            value=""
                            onChange={(event) => {
                              const value = event.target.value;
                              if (value) void assignRole(member.user_id, value);
                            }}
                            className="rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-2 py-1 text-xs text-[var(--ms-text)] outline-none focus:border-accent/60"
                          >
                            <option value="">Add role…</option>
                            {roles
                              .filter(
                                (role) =>
                                  !role.is_default &&
                                  !member.roleIds.includes(role.id) &&
                                  canManageRoleTarget(
                                    roles,
                                    actorRoleIds,
                                    role,
                                    { isOwner },
                                  ),
                              )
                              .map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {tab === "invites" && (canCreateInvites || isOwner) && (
              <div className="space-y-4">
                {(canManageServer || isOwner) && (
                  <label className="flex cursor-pointer items-start gap-2 rounded-md bg-[var(--ms-sidebar)] px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={Boolean(server.invites_paused)}
                      onChange={() => void toggleInvitesPaused()}
                      className="mt-0.5 h-4 w-4 rounded border-[#3f4147] accent-accent"
                    />
                    <span>
                      <span className="block text-sm font-medium text-white">
                        Pause Invites
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--ms-text-muted)]">
                        Temporarily stop new members from joining with invite links.
                      </span>
                    </span>
                  </label>
                )}
                <form
                  onSubmit={(event) => void createTimedInvite(event)}
                  className="flex flex-wrap items-end gap-2 rounded-md bg-[var(--ms-sidebar)] p-3"
                >
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Expire after
                    </span>
                    <select
                      value={String(inviteExpiryHours)}
                      onChange={(event) => {
                        const value = event.target.value;
                        setInviteExpiryHours(
                          value === "never" ? "never" : Number(value),
                        );
                      }}
                      className="block rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2 text-sm"
                    >
                      <option value="0.5">30 minutes</option>
                      <option value="1">1 hour</option>
                      <option value="6">6 hours</option>
                      <option value="12">12 hours</option>
                      <option value="24">1 day</option>
                      <option value="168">7 days</option>
                      <option value="never">Never</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Max uses
                    </span>
                    <select
                      value={inviteMaxUses === "" ? "" : String(inviteMaxUses)}
                      onChange={(event) => {
                        const value = event.target.value;
                        setInviteMaxUses(value === "" ? "" : Number(value));
                      }}
                      className="block rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2 text-sm"
                    >
                      <option value="">No limit</option>
                      <option value="1">1 use</option>
                      <option value="5">5 uses</option>
                      <option value="10">10 uses</option>
                      <option value="25">25 uses</option>
                      <option value="50">50 uses</option>
                      <option value="100">100 uses</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Landing channel
                    </span>
                    <select
                      value={inviteChannelId}
                      onChange={(event) => setInviteChannelId(event.target.value)}
                      className="block min-w-[10rem] rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2 text-sm"
                    >
                      <option value="">Default</option>
                      {channels
                        .filter((channel) => channel.type === "text")
                        .map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            #{channel.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={saving || Boolean(server.invites_paused)}
                    className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    Create Invite
                  </button>
                </form>
                <ul className="space-y-2">
                  {invites.length === 0 && (
                    <li className="text-sm text-muted">No invites yet.</li>
                  )}
                  {invites.map((invite) => (
                    <li
                      key={invite.id}
                      className="rounded-md bg-[var(--ms-sidebar)] px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 truncate text-sm text-[var(--ms-text)]">
                          {inviteUrl(invite.code)}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyInvite(invite.code)}
                          className="inline-flex items-center gap-1 rounded-md bg-[#3f4147] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#4e5058]"
                        >
                          {copiedCode === invite.code ? (
                            <Check className="h-3.5 w-3.5" strokeWidth={2} />
                          ) : (
                            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                          )}
                          {copiedCode === invite.code ? "Copied" : "Copy"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteInvite(invite.id)}
                          className="rounded-md p-1 text-accent hover:bg-accent-muted"
                          aria-label="Delete invite"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-[var(--ms-text-faint)]">
                        {invite.uses}
                        {invite.max_uses != null ? `/${invite.max_uses}` : ""} uses
                        {invite.expires_at
                          ? ` · expires ${new Date(invite.expires_at).toLocaleString()}`
                          : " · never expires"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === "channels" && (canManageChannels || isOwner) && (
              <div className="space-y-5">
                <form onSubmit={createCategory} className="flex flex-wrap items-end gap-2">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      New category
                    </span>
                    <input
                      value={categoryName}
                      onChange={(event) => setCategoryName(event.target.value)}
                      placeholder="Category name"
                      maxLength={ROLE_NAME_MAX}
                      className="block w-52 rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2 text-sm outline-none focus:border-accent/60"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={saving || !categoryName.trim()}
                    className="inline-flex items-center gap-1 rounded-md bg-[#3f4147] px-3 py-2 text-sm font-medium text-white hover:bg-[#4e5058] disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    Add category
                  </button>
                </form>

                <ul className="space-y-2">
                  {sortedCategories.length === 0 ? (
                    <li className="text-sm text-muted">No categories yet.</li>
                  ) : (
                    sortedCategories.map((category) => {
                      const privateCategory = isPrivateChannel(
                        category.permission_overrides,
                      );
                      const permsOpen = permsCategoryId === category.id;
                      const grantableRoles = roles
                        .filter((role) => !role.is_default)
                        .sort(compareRolePositionDesc);
                      return (
                        <li
                          key={category.id}
                          className="rounded-md px-2 py-2 text-sm text-[var(--ms-text)] hover:bg-white/5"
                        >
                          <CategoryRow
                            category={category}
                            privateCategory={privateCategory}
                            onSave={(name) => void renameCategory(category, name)}
                            onDelete={() => void deleteCategory(category.id)}
                            onTogglePerms={() =>
                              setPermsCategoryId(
                                permsOpen ? null : category.id,
                              )
                            }
                          />
                          {permsOpen ? (
                            <div className="mt-3 space-y-3 rounded-md border border-[#3f4147] bg-[var(--ms-border)] p-3">
                              <label className="flex cursor-pointer items-start gap-2">
                                <input
                                  type="checkbox"
                                  checked={privateCategory}
                                  disabled={saving}
                                  onChange={(event) =>
                                    void saveCategoryOverrides(
                                      category,
                                      setChannelPrivate(
                                        category.permission_overrides,
                                        event.target.checked,
                                      ),
                                    )
                                  }
                                  className="mt-0.5 h-4 w-4 rounded border-[#3f4147] accent-accent"
                                />
                                <span>
                                  <span className="block text-sm font-medium text-white">
                                    Private Category
                                  </span>
                                  <span className="mt-0.5 block text-xs text-[var(--ms-text-muted)]">
                                    Only selected roles can view channels in this
                                    category (until synced per channel).
                                  </span>
                                </span>
                              </label>
                              {privateCategory ? (
                                <div className="space-y-2 border-t border-[#3f4147] pt-3">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                                    Who can access
                                  </p>
                                  {grantableRoles.length === 0 ? (
                                    <p className="text-xs text-[var(--ms-text-muted)]">
                                      Create a role first, then grant access here.
                                    </p>
                                  ) : (
                                    <ul className="space-y-1">
                                      {grantableRoles.map((role) => {
                                        const allowed = roleCanViewChannel(
                                          category.permission_overrides,
                                          role.id,
                                        );
                                        return (
                                          <li key={role.id}>
                                            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                                              <input
                                                type="checkbox"
                                                checked={allowed}
                                                disabled={saving}
                                                onChange={(event) =>
                                                  void saveCategoryOverrides(
                                                    category,
                                                    setRoleChannelView(
                                                      category.permission_overrides,
                                                      role.id,
                                                      event.target.checked,
                                                    ),
                                                  )
                                                }
                                                className="h-4 w-4 rounded border-[#3f4147] accent-accent"
                                              />
                                              <span
                                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                                style={{
                                                  backgroundColor:
                                                    role.color || "#99aab5",
                                                }}
                                              />
                                              <span className="text-sm text-[var(--ms-text)]">
                                                {role.name}
                                              </span>
                                            </label>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })
                  )}
                </ul>

                <form
                  onSubmit={createChannel}
                  className="space-y-3 border-t border-black/30 pt-4"
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                        New channel
                      </span>
                      <input
                        value={channelName}
                        onChange={(event) => setChannelName(event.target.value)}
                        placeholder="channel-name"
                        maxLength={ROLE_NAME_MAX}
                        className="block w-52 rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2 text-sm outline-none focus:border-accent/60"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Type
                      </span>
                      <select
                        value={channelType}
                        onChange={(event) =>
                          setChannelType(event.target.value as "text" | "voice")
                        }
                        className="block rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2 text-sm outline-none focus:border-accent/60"
                      >
                        <option value="text">Text</option>
                        <option value="voice">Voice</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Category
                      </span>
                      <select
                        value={channelCategoryId}
                        onChange={(event) => setChannelCategoryId(event.target.value)}
                        className="block min-w-[10rem] rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2 text-sm outline-none focus:border-accent/60"
                      >
                        {sortedCategories.length === 0 && (
                          <option value="">No category</option>
                        )}
                        {sortedCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      disabled={saving || !channelName.trim()}
                      className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      Create channel
                    </button>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ms-text)]">
                    <input
                      type="checkbox"
                      checked={newChannelPrivate}
                      onChange={(event) =>
                        setNewChannelPrivate(event.target.checked)
                      }
                      className="h-4 w-4 rounded border-[#3f4147] accent-accent"
                    />
                    Private Channel
                  </label>
                </form>

                <ul className="space-y-2 border-t border-black/30 pt-4">
                  {sortedChannels.length === 0 && (
                    <li className="text-sm text-muted">No channels yet.</li>
                  )}
                  {sortedChannels.map((channel) => {
                    const privateChannel = isPrivateChannel(
                      channel.permission_overrides,
                    );
                    const permsOpen = permsChannelId === channel.id;
                    const grantableRoles = roles
                      .filter((role) => !role.is_default)
                      .sort(compareRolePositionDesc);
                    return (
                      <li
                        key={channel.id}
                        className="rounded-md px-2 py-2 text-sm text-[var(--ms-text)] hover:bg-white/5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {channel.type === "voice" ? (
                            <Volume2
                              className="h-4 w-4 text-accent"
                              strokeWidth={1.75}
                            />
                          ) : (
                            <Hash
                              className="h-4 w-4 text-[var(--ms-text-muted)]"
                              strokeWidth={2}
                            />
                          )}
                          {privateChannel ? (
                            <Lock
                              className="h-3.5 w-3.5 text-[var(--ms-text-muted)]"
                              strokeWidth={2}
                              aria-label="Private"
                            />
                          ) : null}
                          {editingChannelId === channel.id ? (
                            <>
                              <input
                                value={editChannelName}
                                onChange={(event) =>
                                  setEditChannelName(event.target.value)
                                }
                                className="min-w-0 flex-1 rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-2 py-1 text-sm outline-none focus:border-accent/60"
                                autoFocus
                              />
                              <DirtySaveButton
                                size="sm"
                                dirty={
                                  editChannelName.trim() !== channel.name &&
                                  editChannelName.trim().length > 0
                                }
                                saving={saving}
                                label="Save"
                                onClick={() => void renameChannel(channel.id)}
                              />
                              <button
                                type="button"
                                onClick={() => setEditingChannelId(null)}
                                className="rounded-md px-2 py-1 text-xs text-muted hover:text-white"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="min-w-0 flex-1 truncate">
                                {channel.name}
                              </span>
                              <span className="truncate text-xs text-muted">
                                {channel.category_id
                                  ? categoryNameMap.get(channel.category_id) ??
                                    "Category"
                                  : "No category"}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setPermsChannelId(
                                    permsOpen ? null : channel.id,
                                  );
                                  setConfirmChannelId(null);
                                  setEditingChannelId(null);
                                }}
                                className="rounded-md px-2 py-1 text-xs text-[var(--ms-text)] hover:bg-white/10"
                              >
                                Permissions
                              </button>
                              {channel.category_id &&
                              !channel.permissions_synced ? (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() =>
                                    void syncChannelToCategory(channel)
                                  }
                                  className="rounded-md px-2 py-1 text-xs text-[var(--ms-text)] hover:bg-white/10 disabled:opacity-50"
                                >
                                  Sync Now
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingChannelId(channel.id);
                                  setEditChannelName(channel.name);
                                  setConfirmChannelId(null);
                                  setPermsChannelId(null);
                                }}
                                className="rounded-md px-2 py-1 text-xs text-[var(--ms-text)] hover:bg-white/10"
                              >
                                Rename
                              </button>
                              {confirmChannelId === channel.id ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void deleteChannel(channel.id)}
                                    className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-white"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmChannelId(null)}
                                    className="rounded-md px-2 py-1 text-xs text-muted hover:text-white"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmChannelId(channel.id)}
                                  className="rounded-md p-1 text-accent hover:bg-accent-muted"
                                  aria-label={`Delete ${channel.name}`}
                                >
                                  <Trash2
                                    className="h-3.5 w-3.5"
                                    strokeWidth={1.75}
                                  />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        {permsOpen ? (
                          <div className="mt-3 space-y-3 rounded-md border border-[#3f4147] bg-[var(--ms-border)] p-3">
                            <label className="flex cursor-pointer items-start gap-2">
                              <input
                                type="checkbox"
                                checked={privateChannel}
                                disabled={saving}
                                onChange={(event) =>
                                  void saveChannelOverrides(
                                    channel,
                                    setChannelPrivate(
                                      channel.permission_overrides,
                                      event.target.checked,
                                    ),
                                  )
                                }
                                className="mt-0.5 h-4 w-4 rounded border-[#3f4147] accent-accent"
                              />
                              <span>
                                <span className="block text-sm font-medium text-white">
                                  Private Channel
                                </span>
                                <span className="mt-0.5 block text-xs text-[var(--ms-text-muted)]">
                                  Only selected roles can view this channel.
                                </span>
                              </span>
                            </label>
                            {privateChannel ? (
                              <div className="space-y-2 border-t border-[#3f4147] pt-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                                  Who can access
                                </p>
                                {grantableRoles.length === 0 ? (
                                  <p className="text-xs text-[var(--ms-text-muted)]">
                                    Create a role first, then grant it access here.
                                  </p>
                                ) : (
                                  <ul className="space-y-1">
                                    {grantableRoles.map((role) => {
                                      const allowed = roleCanViewChannel(
                                        channel.permission_overrides,
                                        role.id,
                                      );
                                      return (
                                        <li key={role.id}>
                                          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                                            <input
                                              type="checkbox"
                                              checked={allowed}
                                              disabled={saving}
                                              onChange={(event) =>
                                                void saveChannelOverrides(
                                                  channel,
                                                  setRoleChannelView(
                                                    channel.permission_overrides,
                                                    role.id,
                                                    event.target.checked,
                                                  ),
                                                )
                                              }
                                              className="h-4 w-4 rounded border-[#3f4147] accent-accent"
                                            />
                                            <span
                                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                                              style={{
                                                backgroundColor:
                                                  role.color || "#99aab5",
                                              }}
                                            />
                                            <span className="text-sm text-[var(--ms-text)]">
                                              {role.name}
                                            </span>
                                          </label>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {tab === "emojis" && (canManageEmojis || isOwner) && (
              <div className="space-y-5">
                <p className="text-sm text-[#b5bac1]">
                  Upload custom emojis for this server. Members can use them in
                  chat with{" "}
                  <span className="font-mono text-[var(--ms-text)]">:name:</span>.
                </p>
                {canManageEmojis || isOwner ? (
                  <form
                    onSubmit={(event) => void uploadServerEmoji(event)}
                    className="space-y-3 rounded-md border border-[#3f4147] bg-[var(--ms-border)] p-3"
                  >
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="min-w-[10rem] flex-1 space-y-1 text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                        Name
                        <input
                          value={emojiName}
                          onChange={(event) =>
                            setEmojiName(sanitizeEmojiName(event.target.value))
                          }
                          placeholder="wave_hello"
                          maxLength={32}
                          className="mt-1 w-full rounded-md border border-[#3f4147] bg-[#111214] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--ms-text)] outline-none focus:border-accent/60"
                        />
                      </label>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                          Image
                        </p>
                        <input
                          ref={emojiFileRef}
                          type="file"
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            setEmojiFile(file);
                            if (file && !emojiName) {
                              setEmojiName(
                                sanitizeEmojiName(
                                  file.name.replace(/\.[^.]+$/, ""),
                                ),
                              );
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => emojiFileRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-md bg-[#3f4147] px-3 py-2 text-sm text-[var(--ms-text)] hover:bg-[#4e5058]"
                        >
                          <Upload className="h-4 w-4" strokeWidth={1.75} />
                          {emojiFile ? emojiFile.name : "Choose file"}
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={emojiBusy || !emojiFile}
                        className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        {emojiBusy ? "Uploading…" : "Upload"}
                      </button>
                    </div>
                    <p className="text-[11px] text-[var(--ms-text-muted)]">
                      PNG, JPG, GIF, or WebP · max 512 KB · names use letters,
                      numbers, and underscores
                    </p>
                  </form>
                ) : (
                  <p className="rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2 text-sm text-[var(--ms-text-muted)]">
                    You need the Manage Emojis permission to upload or delete
                    emojis.
                  </p>
                )}
                <ul className="space-y-1">
                  {serverEmojis.length === 0 && (
                    <li className="text-sm text-muted">No custom emojis yet.</li>
                  )}
                  {serverEmojis.map((emoji) => (
                    <li
                      key={emoji.id}
                      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/5"
                    >
                      <CustomEmoji emoji={emoji} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--ms-text)]">
                          :{emoji.name}:
                        </p>
                        <p className="text-[11px] text-[var(--ms-text-muted)]">
                          {emoji.animated ? "Animated" : "Static"}
                        </p>
                      </div>
                      {canManageEmojis && (
                        <button
                          type="button"
                          disabled={emojiBusy}
                          onClick={() => void deleteServerEmoji(emoji)}
                          className="rounded-md p-1.5 text-accent hover:bg-accent-muted disabled:opacity-50"
                          aria-label={`Delete :${emoji.name}:`}
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === "stickers" && (canManageEmojis || isOwner) && (
              <div className="space-y-5">
                <p className="text-sm text-[#b5bac1]">
                  Upload custom stickers for this server. Images appear in the
                  sticker picker when members send messages.
                </p>
                <form
                  onSubmit={(event) => void uploadServerSticker(event)}
                  className="space-y-3 rounded-md border border-[#3f4147] bg-[var(--ms-border)] p-3"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="min-w-[10rem] flex-1 space-y-1 text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                      Name
                      <input
                        value={stickerName}
                        onChange={(event) =>
                          setStickerName(
                            sanitizeEmojiName(event.target.value),
                          )
                        }
                        placeholder="celebrate"
                        maxLength={32}
                        className="mt-1 w-full rounded-md border border-[#3f4147] bg-[#111214] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--ms-text)] outline-none focus:border-accent/60"
                      />
                    </label>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                        Image
                      </p>
                      <input
                        ref={stickerFileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          setStickerFile(file);
                          if (file && !stickerName) {
                            setStickerName(
                              sanitizeEmojiName(
                                file.name.replace(/\.[^.]+$/, ""),
                              ),
                            );
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => stickerFileRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-md bg-[#3f4147] px-3 py-2 text-sm text-[var(--ms-text)] hover:bg-[#4e5058]"
                      >
                        <Upload className="h-4 w-4" strokeWidth={1.75} />
                        {stickerFile ? stickerFile.name : "Choose file"}
                      </button>
                    </div>
                    <button
                      type="submit"
                      disabled={stickerBusy || !stickerFile}
                      className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      {stickerBusy ? "Uploading…" : "Upload"}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--ms-text-muted)]">
                    PNG, JPG, GIF, or WebP · max 512 KB
                  </p>
                </form>
                <ul className="space-y-1">
                  {serverStickers.length === 0 && (
                    <li className="text-sm text-muted">No stickers yet.</li>
                  )}
                  {serverStickers.map((sticker) => (
                    <li
                      key={sticker.id}
                      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sticker.url}
                        alt=""
                        className="h-14 w-14 rounded-md object-contain"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--ms-text)]">
                          {sticker.name}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={stickerBusy}
                        onClick={() => void deleteServerSticker(sticker)}
                        className="rounded-md p-1.5 text-accent hover:bg-accent-muted disabled:opacity-50"
                        aria-label={`Delete ${sticker.name}`}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === "automod" && (canManageServer || isOwner) && (
              <div className="space-y-5">
                <p className="text-sm text-[#b5bac1]">
                  Block messages that contain configured keywords. Rules run when
                  members send messages in this server.
                </p>
                <form
                  onSubmit={(event) => void createAutomodRule(event)}
                  className="space-y-3 rounded-md border border-[#3f4147] bg-[var(--ms-border)] p-3"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="min-w-[8rem] flex-1 space-y-1 text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                      Rule name
                      <input
                        value={automodRuleName}
                        onChange={(event) =>
                          setAutomodRuleName(event.target.value)
                        }
                        placeholder="No spam links"
                        maxLength={64}
                        className="mt-1 w-full rounded-md border border-[#3f4147] bg-[#111214] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--ms-text)] outline-none focus:border-accent/60"
                      />
                    </label>
                    <label className="min-w-[12rem] flex-[2] space-y-1 text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                      Keywords (comma-separated)
                      <input
                        value={automodKeywords}
                        onChange={(event) =>
                          setAutomodKeywords(event.target.value)
                        }
                        placeholder="spam-link.example, click here"
                        className="mt-1 w-full rounded-md border border-[#3f4147] bg-[#111214] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--ms-text)] outline-none focus:border-accent/60"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={automodBusy || !automodRuleName.trim()}
                      className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      Add rule
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--ms-text-muted)]">
                    Action: block message · new rules start enabled
                  </p>
                </form>
                <ul className="space-y-2">
                  {automodRules.length === 0 && (
                    <li className="text-sm text-[var(--ms-text-muted)]">No AutoMod rules yet.</li>
                  )}
                  {automodRules.map((rule) => (
                    <li
                      key={rule.id}
                      className="rounded-md bg-[var(--ms-sidebar)] px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--ms-text)]">
                          {rule.name}
                        </span>
                        <label className="flex items-center gap-2 text-xs text-[var(--ms-text-muted)]">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            disabled={automodBusy}
                            onChange={(event) =>
                              void setAutomodRuleEnabled(
                                rule.id,
                                event.target.checked,
                              )
                            }
                            className="h-4 w-4 accent-accent"
                          />
                          Enabled
                        </label>
                        <button
                          type="button"
                          disabled={automodBusy}
                          onClick={() => void deleteAutomodRule(rule.id)}
                          className="rounded-md p-1 text-accent hover:bg-accent-muted disabled:opacity-50"
                          aria-label={`Delete ${rule.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-[var(--ms-text-muted)]">
                        {rule.keywords.join(", ") || "No keywords"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === "safety" && (canManageServer || isOwner) && (
              <div className="space-y-5">
                <p className="text-sm text-[#b5bac1]">
                  Control invites for this server. Keyword blocking is configured
                  in the{" "}
                  <button
                    type="button"
                    onClick={() => setTab("automod")}
                    className="text-accent hover:underline"
                  >
                    AutoMod
                  </button>{" "}
                  tab.
                </p>
                <div className="space-y-4 rounded-md border border-[#3f4147] bg-[var(--ms-border)] p-3">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(server.invites_paused)}
                      onChange={() => void toggleInvitesPaused()}
                      className="mt-0.5 h-4 w-4 rounded border-[#3f4147] accent-accent"
                    />
                    <span>
                      <span className="block text-sm font-medium text-white">
                        Pause invites
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--ms-text-muted)]">
                        Temporarily stop new members from joining with invite
                        links.
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleRow({
  role,
  confirm,
  canEdit = true,
  canDelete = true,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
  onSave,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  role: Role;
  confirm: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSave: (
    role: Role,
    name: string,
    color: string,
    permissions: Record<string, boolean>,
    hoist: boolean,
  ) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color || "#dc2626");
  const [hoist, setHoist] = useState(Boolean(role.hoist));
  const [perms, setPerms] = useState<Record<string, boolean>>(() => {
    const raw = role.permissions;
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, boolean>)
      : {};
  });

  useEffect(() => {
    setName(role.name);
    setColor(role.color || "#dc2626");
    setHoist(Boolean(role.hoist));
    const raw = role.permissions;
    setPerms(
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, boolean>)
        : {},
    );
  }, [role.name, role.color, role.hoist, role.permissions]);

  const baselinePerms =
    role.permissions &&
    typeof role.permissions === "object" &&
    !Array.isArray(role.permissions)
      ? (role.permissions as Record<string, boolean>)
      : {};
  const dirty =
    name.trim() !== role.name ||
    (color || "#dc2626").toLowerCase() !==
      (role.color || "#dc2626").toLowerCase() ||
    hoist !== Boolean(role.hoist) ||
    ROLE_PERM_OPTIONS.some(
      (option) => Boolean(perms[option.key]) !== Boolean(baselinePerms[option.key]),
    );

  return (
    <div className="space-y-3 rounded-md bg-[var(--ms-sidebar)] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="rounded p-0.5 text-[#b5bac1] hover:bg-white/10 hover:text-white disabled:opacity-30"
            aria-label={`Move ${role.name} higher in hierarchy`}
            title="Higher in hierarchy"
          >
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="rounded p-0.5 text-[#b5bac1] hover:bg-white/10 hover:text-white disabled:opacity-30"
            aria-label={`Move ${role.name} lower in hierarchy`}
            title="Lower in hierarchy"
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canEdit || role.is_default}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-white outline-none focus:border-accent/60 disabled:opacity-50"
        />
        {role.is_default ? (
          <span className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
            Default
          </span>
        ) : null}
        {!canEdit ? (
          <span className="rounded-md px-2 py-1 text-[10px] font-medium text-[var(--ms-text-muted)]">
            Above your role
          </span>
        ) : role.is_default ? null : confirm ? (
          <>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="rounded-md px-2 py-1.5 text-xs text-muted hover:text-white"
            >
              Cancel
            </button>
          </>
        ) : canDelete ? (
          <button
            type="button"
            onClick={onAskDelete}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent-muted"
          >
            Delete
          </button>
        ) : null}
        {canEdit && (
          <DirtySaveButton
            size="sm"
            dirty={dirty}
            disabled={!name.trim()}
            label="Save Changes"
            onClick={() => onSave(role, name, color, perms, hoist)}
          />
        )}
      </div>

      <div className="space-y-2 border-t border-black/25 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
          Display
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[var(--ms-text)]">
            <span className="text-[var(--ms-text-muted)]">Role color</span>
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              aria-label={`${role.name} color`}
              disabled={!canEdit}
              className="h-8 w-10 cursor-pointer rounded-md border border-[#3f4147] bg-transparent disabled:opacity-50"
            />
          </label>
        </div>
        {!role.is_default ? (
          <label
            className={`flex items-start gap-2 text-xs text-[var(--ms-text)] ${
              canEdit ? "" : "opacity-50"
            }`}
          >
            <input
              type="checkbox"
              checked={hoist}
              disabled={!canEdit}
              onChange={(event) => setHoist(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
            />
            <span className="font-medium">
              Display role members separately from online members
            </span>
          </label>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-black/25 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
          Permissions
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {ROLE_PERM_OPTIONS.map((option) => (
            <label
              key={option.key}
              className={`flex items-center gap-1.5 text-[11px] text-[var(--ms-text)] ${
                canEdit ? "" : "opacity-50"
              }`}
            >
              <input
                type="checkbox"
                checked={Boolean(perms[option.key])}
                disabled={!canEdit}
                onChange={(event) =>
                  setPerms((current) => ({
                    ...current,
                    [option.key]: event.target.checked,
                  }))
                }
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  privateCategory,
  onSave,
  onDelete,
  onTogglePerms,
}: {
  category: Category;
  privateCategory?: boolean;
  onSave: (name: string) => void;
  onDelete: () => void;
  onTogglePerms?: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setName(category.name);
  }, [category.name]);

  const dirty = name.trim() !== category.name && name.trim().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--ms-sidebar)] px-2 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        Category
      </span>
      {privateCategory ? (
        <Lock
          className="h-3.5 w-3.5 text-[var(--ms-text-muted)]"
          strokeWidth={2}
          aria-label="Private"
        />
      ) : null}
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={ROLE_NAME_MAX}
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm uppercase tracking-wide text-white outline-none focus:border-accent/60"
      />
      <DirtySaveButton
        size="sm"
        dirty={dirty}
        label="Save"
        onClick={() => onSave(name)}
      />
      {onTogglePerms ? (
        <button
          type="button"
          onClick={onTogglePerms}
          className="rounded-md px-2 py-1 text-xs text-[var(--ms-text)] hover:bg-white/10"
        >
          Permissions
        </button>
      ) : null}
      {confirm ? (
        <>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="rounded-md px-2 py-1.5 text-xs text-muted hover:text-white"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent-muted"
        >
          Delete
        </button>
      )}
    </div>
  );
}
