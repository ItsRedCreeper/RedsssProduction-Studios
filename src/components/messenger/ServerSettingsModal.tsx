"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Hash,
  Link2,
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
import {
  DEFAULT_MEMBER_PERMISSIONS,
  PERMISSIONS,
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

const ROLE_PERM_OPTIONS: { key: Permission; label: string }[] = [
  { key: PERMISSIONS.ADMINISTRATOR, label: "Administrator" },
  { key: PERMISSIONS.MANAGE_SERVER, label: "Manage server" },
  { key: PERMISSIONS.MANAGE_CHANNELS, label: "Manage channels" },
  { key: PERMISSIONS.MANAGE_ROLES, label: "Manage roles" },
  { key: PERMISSIONS.MANAGE_EMOJIS, label: "Manage emojis" },
  { key: PERMISSIONS.MANAGE_MESSAGES, label: "Manage messages" },
  { key: PERMISSIONS.KICK_MEMBERS, label: "Kick members" },
  { key: PERMISSIONS.BAN_MEMBERS, label: "Ban members" },
  { key: PERMISSIONS.CREATE_INVITES, label: "Create invites" },
  { key: PERMISSIONS.SEND_MESSAGES, label: "Send messages" },
  { key: PERMISSIONS.CONNECT, label: "Connect to voice" },
  { key: PERMISSIONS.SPEAK, label: "Speak in voice" },
  { key: PERMISSIONS.VIEW_CHANNEL, label: "View channels" },
];

const TABS: { id: SettingsTab; label: string; icon: typeof Shield }[] = [
  { id: "overview", label: "Overview", icon: Shield },
  { id: "roles", label: "Roles", icon: Shield },
  { id: "members", label: "Members", icon: Users },
  { id: "invites", label: "Invites", icon: Link2 },
  { id: "channels", label: "Channels", icon: Hash },
  { id: "emojis", label: "Emojis", icon: Smile },
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
  canCreateInvites = false,
  canManageEmojis = false,
  actorRoleIds = [],
  onClose,
  onServerUpdated,
  onChannelsChanged,
  onMembersChanged,
  onRolesChanged,
  onEmojisChanged,
}: ServerSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description ?? "");
  const [isPublic, setIsPublic] = useState(server.is_public);
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
        return canManageRoles || canKickMembers || isOwner;
      case "invites":
        return canCreateInvites || isOwner;
      case "channels":
        return canManageChannels || isOwner;
      case "emojis":
        return canManageEmojis || isOwner;
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
    setError(null);
    setConfirmChannelId(null);
    setEditingChannelId(null);
    setEmojiName("");
    setEmojiFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [rolesResult, invitesResult, emojiResult] = await Promise.all([
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
    const trimmed = nextName.trim();
    if (trimmed.length < ROLE_NAME_MIN) {
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
        hoist: nextHoist,
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
    const { data, error: insertError } = await supabase
      .from("channels")
      .insert({
        server_id: server.id,
        name: trimmed,
        type: channelType,
        category_id: channelCategoryId || null,
        position: channels.length,
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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-settings-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-md border border-[#1e1f22] bg-[#313338] shadow-2xl shadow-black/50"
      >
        <aside className="flex w-44 shrink-0 flex-col bg-[#2b2d31] p-3 sm:w-52">
          <p
            id="server-settings-title"
            className="mb-3 truncate px-2 text-xs font-semibold uppercase tracking-wide text-[#949ba4]"
          >
            {server.name}
          </p>
          <nav className="space-y-1">
            {visibleTabs.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm ${
                    active
                      ? "bg-accent text-white"
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
          <div className="flex items-center justify-between border-b border-black/30 px-5 py-3">
            <h2 className="text-base font-semibold text-white">
              {visibleTabs.find((item) => item.id === tab)?.label ??
                TABS.find((item) => item.id === tab)?.label}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {error && (
              <p className="mb-3 rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
                {error}
              </p>
            )}

            {tab === "overview" && canEditOverview && (
              <form onSubmit={saveOverview} className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Server name
                  </span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={SERVER_NAME_MIN}
                    maxLength={SERVER_NAME_MAX}
                    className="w-full rounded-md border border-border bg-[#1e1f22] px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/50"
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
                    className="w-full resize-none rounded-md border border-border bg-[#1e1f22] px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/50"
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-[#1e1f22] px-3 py-3">
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
                <DirtySaveButton
                  type="submit"
                  dirty={overviewDirty}
                  saving={saving}
                  disabled={name.trim().length < 2}
                  label="Save changes"
                />
              </form>
            )}

            {tab === "roles" && (canManageRoles || isOwner) && (
              <div className="space-y-4">
                <div className="space-y-1.5 rounded-md border border-[#3f4147] bg-[#1e1f22]/60 px-3 py-2.5 text-xs leading-relaxed text-[#b5bac1]">
                  <p>
                    <span className="font-semibold text-[#dbdee1]">Hierarchy:</span>{" "}
                    list is top → bottom. Higher roles win username color and
                    can only manage people/roles below them.
                  </p>
                  <p>
                    <span className="font-semibold text-[#dbdee1]">Member list:</span>{" "}
                    turn on “Display role members separately” on a role to give
                    it its own section. People show under their{" "}
                    <em>highest</em> displayed role; everyone else is Online /
                    Offline.
                  </p>
                  <p>
                    <span className="font-semibold text-[#dbdee1]">Default Member:</span>{" "}
                    like Discord’s @everyone — every member always has it, it
                    stays at the bottom, and it can’t be removed.
                  </p>
                </div>
                <ul className="space-y-2">
                  {roles.length === 0 && (
                    <li className="text-sm text-muted">No roles yet.</li>
                  )}
                  {roles.map((role, index) => {
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
                  })}
                </ul>
                <form onSubmit={createRole} className="flex flex-wrap items-end gap-2 border-t border-black/30 pt-4">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      New role
                    </span>
                    <input
                      value={roleName}
                      onChange={(event) => setRoleName(event.target.value)}
                      placeholder="Role name"
                      maxLength={ROLE_NAME_MAX}
                      className="block w-48 rounded-md border border-border bg-[#1e1f22] px-3 py-2 text-sm outline-none focus:border-accent/50"
                    />
                  </label>
                  <input
                    type="color"
                    value={roleColor}
                    onChange={(event) => setRoleColor(event.target.value)}
                    aria-label="Role color"
                    className="h-9 w-12 cursor-pointer rounded-md border border-border bg-[#1e1f22]"
                  />
                  <button
                    type="submit"
                    disabled={saving || !roleName.trim()}
                    className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    Add role
                  </button>
                </form>
              </div>
            )}

            {tab === "members" &&
              (canManageRoles || canKickMembers || isOwner) && (
              <ul className="space-y-2">
                {members.length === 0 && (
                  <li className="text-sm text-muted">No members loaded.</li>
                )}
                {members.map((member) => {
                  const label = member.nickname || member.username;
                  const memberIsOwner = member.user_id === server.owner_id;
                  return (
                    <li
                      key={member.user_id}
                      className="rounded-md bg-[#2b2d31] px-3 py-2.5"
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
                          (canKickMembers || isOwner) &&
                          canModerateMember(
                            roles,
                            actorRoleIds,
                            member.roleIds,
                            { isOwner },
                          ) && (
                          <button
                            type="button"
                            onClick={() => void kickMember(member.user_id)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-muted"
                          >
                            Kick
                          </button>
                        )}
                      </div>
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
                            className="rounded-md border border-border bg-[#1e1f22] px-2 py-1 text-xs text-[#dbdee1] outline-none focus:border-accent/50"
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
                <p className="text-sm text-[#b5bac1]">
                  This server has one permanent invite link. Use Invite People from the
                  server header to share it with friends.
                </p>
                {(() => {
                  const permanent =
                    invites.find((invite) => invite.is_permanent) ?? invites[0] ?? null;
                  if (!permanent) {
                    return <p className="text-sm text-muted">No permanent invite yet.</p>;
                  }
                  return (
                    <div className="rounded-md bg-[#2b2d31] px-3 py-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                        Permanent invite link
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 truncate text-sm text-[#dbdee1]">
                          {inviteUrl(permanent.code)}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyInvite(permanent.code)}
                          className="inline-flex items-center gap-1 rounded-md bg-[#3f4147] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#4e5058]"
                        >
                          {copiedCode === permanent.code ? (
                            <Check className="h-3.5 w-3.5" strokeWidth={2} />
                          ) : (
                            <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                          )}
                          {copiedCode === permanent.code ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-[#6d6f78]">
                        {permanent.uses} join{permanent.uses === 1 ? "" : "s"} so far
                      </p>
                    </div>
                  );
                })()}
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
                      className="block w-52 rounded-md border border-border bg-[#1e1f22] px-3 py-2 text-sm outline-none focus:border-accent/50"
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

                <ul className="space-y-1">
                  {sortedCategories.length === 0 ? (
                    <li className="text-sm text-muted">No categories yet.</li>
                  ) : (
                    sortedCategories.map((category) => (
                      <CategoryRow
                        key={category.id}
                        category={category}
                        onSave={(name) => void renameCategory(category, name)}
                        onDelete={() => void deleteCategory(category.id)}
                      />
                    ))
                  )}
                </ul>

                <form
                  onSubmit={createChannel}
                  className="flex flex-wrap items-end gap-2 border-t border-black/30 pt-4"
                >
                  <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      New channel
                    </span>
                    <input
                      value={channelName}
                      onChange={(event) => setChannelName(event.target.value)}
                      placeholder="channel-name"
                      maxLength={ROLE_NAME_MAX}
                      className="block w-52 rounded-md border border-border bg-[#1e1f22] px-3 py-2 text-sm outline-none focus:border-accent/50"
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
                      className="block rounded-md border border-border bg-[#1e1f22] px-3 py-2 text-sm outline-none focus:border-accent/50"
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
                      className="block min-w-[10rem] rounded-md border border-border bg-[#1e1f22] px-3 py-2 text-sm outline-none focus:border-accent/50"
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
                </form>

                <ul className="space-y-1 border-t border-black/30 pt-4">
                  {sortedChannels.length === 0 && (
                    <li className="text-sm text-muted">No channels yet.</li>
                  )}
                  {sortedChannels.map((channel) => (
                    <li
                      key={channel.id}
                      className="flex flex-wrap items-center gap-2 rounded-md px-2 py-2 text-sm text-[#dbdee1] hover:bg-white/5"
                    >
                      {channel.type === "voice" ? (
                        <Volume2 className="h-4 w-4 text-accent" strokeWidth={1.75} />
                      ) : (
                        <Hash className="h-4 w-4 text-[#949ba4]" strokeWidth={2} />
                      )}
                      {editingChannelId === channel.id ? (
                        <>
                          <input
                            value={editChannelName}
                            onChange={(event) => setEditChannelName(event.target.value)}
                            className="min-w-0 flex-1 rounded-md border border-border bg-[#1e1f22] px-2 py-1 text-sm outline-none focus:border-accent/50"
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
                          <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                          <span className="truncate text-xs text-muted">
                            {channel.category_id
                              ? categoryNameMap.get(channel.category_id) ?? "Category"
                              : "No category"}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingChannelId(channel.id);
                              setEditChannelName(channel.name);
                              setConfirmChannelId(null);
                            }}
                            className="rounded-md px-2 py-1 text-xs text-[#dbdee1] hover:bg-white/10"
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
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </button>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === "emojis" && (canManageEmojis || isOwner) && (
              <div className="space-y-5">
                <p className="text-sm text-[#b5bac1]">
                  Upload custom emojis for this server. Members can use them here,
                  in other servers, and in DMs while they stay in this server.
                </p>
                {canManageEmojis || isOwner ? (
                  <form
                    onSubmit={(event) => void uploadServerEmoji(event)}
                    className="space-y-3 rounded-md border border-[#3f4147] bg-[#1e1f22] p-3"
                  >
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="min-w-[10rem] flex-1 space-y-1 text-xs font-semibold uppercase tracking-wide text-[#949ba4]">
                        Name
                        <input
                          value={emojiName}
                          onChange={(event) =>
                            setEmojiName(sanitizeEmojiName(event.target.value))
                          }
                          placeholder="creeper_wave"
                          maxLength={32}
                          className="mt-1 w-full rounded-md border border-border bg-[#111214] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#dbdee1] outline-none focus:border-accent/50"
                        />
                      </label>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#949ba4]">
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
                          className="inline-flex items-center gap-2 rounded-md bg-[#3f4147] px-3 py-2 text-sm text-[#dbdee1] hover:bg-[#4e5058]"
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
                    <p className="text-[11px] text-[#949ba4]">
                      PNG, JPG, GIF, or WebP · max 512 KB · names use letters,
                      numbers, and underscores
                    </p>
                  </form>
                ) : (
                  <p className="rounded-md border border-[#3f4147] bg-[#1e1f22] px-3 py-2 text-sm text-[#949ba4]">
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
                        <p className="truncate text-sm font-medium text-[#dbdee1]">
                          :{emoji.name}:
                        </p>
                        <p className="text-[11px] text-[#949ba4]">
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
    <li className="space-y-3 rounded-md bg-[#2b2d31] px-3 py-3">
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
          disabled={!canEdit}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-white outline-none focus:border-accent/40 disabled:opacity-50"
        />
        {role.is_default ? (
          <span className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#949ba4]">
            @everyone
          </span>
        ) : null}
        {!canEdit ? (
          <span className="rounded-md px-2 py-1 text-[10px] font-medium text-[#949ba4]">
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
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#949ba4]">
          Display
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[#dbdee1]">
            <span className="text-[#949ba4]">Role color</span>
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              aria-label={`${role.name} color`}
              disabled={!canEdit}
              className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent disabled:opacity-50"
            />
          </label>
        </div>
        <label
          className={`flex items-start gap-2 text-xs text-[#dbdee1] ${
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
          <span>
            <span className="font-medium">Display role members separately</span>
            <span className="mt-0.5 block text-[11px] text-[#949ba4]">
              Shows this role as its own section in the member list (online
              members only). People with several displayed roles appear under
              the highest one.
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-2 border-t border-black/25 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#949ba4]">
          Permissions
        </p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {ROLE_PERM_OPTIONS.map((option) => (
            <label
              key={option.key}
              className={`flex items-center gap-1.5 text-[11px] text-[#dbdee1] ${
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
    </li>
  );
}

function CategoryRow({
  category,
  onSave,
  onDelete,
}: {
  category: Category;
  onSave: (name: string) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    setName(category.name);
  }, [category.name]);

  const dirty = name.trim() !== category.name && name.trim().length > 0;

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md bg-[#2b2d31] px-2 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        Category
      </span>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={ROLE_NAME_MAX}
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm uppercase tracking-wide text-white outline-none focus:border-accent/40"
      />
      <DirtySaveButton
        size="sm"
        dirty={dirty}
        label="Save"
        onClick={() => onSave(name)}
      />
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
    </li>
  );
}
