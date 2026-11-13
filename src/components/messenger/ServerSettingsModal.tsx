"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Hash,
  Link2,
  Plus,
  Shield,
  Trash2,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  byPosition,
  inviteUrl,
  makeInviteCode,
  statusLabel,
} from "@/components/messenger/data";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
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
  { key: PERMISSIONS.MANAGE_CHANNELS, label: "Manage channels" },
  { key: PERMISSIONS.MANAGE_ROLES, label: "Manage roles" },
  { key: PERMISSIONS.MANAGE_MESSAGES, label: "Manage messages" },
  { key: PERMISSIONS.KICK_MEMBERS, label: "Kick members" },
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
];

type ServerSettingsModalProps = {
  open: boolean;
  server: Server;
  userId: string;
  members: MemberView[];
  channels: Channel[];
  categories: Category[];
  initialTab: SettingsTab;
  onClose: () => void;
  onServerUpdated: (server: Server) => void;
  onChannelsChanged: (channels: Channel[], categories: Category[]) => void;
  onMembersChanged: (members: MemberView[]) => void;
};

export function ServerSettingsModal({
  open,
  server,
  userId,
  members,
  channels,
  categories,
  initialTab,
  onClose,
  onServerUpdated,
  onChannelsChanged,
  onMembersChanged,
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
  const creatingInvite = useRef(false);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setName(server.name);
    setDescription(server.description ?? "");
    setIsPublic(server.is_public);
    setError(null);
    setConfirmChannelId(null);
    setEditingChannelId(null);
  }, [open, initialTab, server]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [rolesResult, invitesResult] = await Promise.all([
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
      ]);
      if (cancelled) return;
      if (rolesResult.error) setError(rolesResult.error.message);
      else setRoles(rolesResult.data ?? []);
      if (invitesResult.error) setError(invitesResult.error.message);
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

  async function saveOverview(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Server name must be at least 2 characters.");
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
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("roles")
      .insert({
        server_id: server.id,
        name: trimmed,
        color: roleColor,
        position: roles.length,
        permissions: {},
      })
      .select("*")
      .single();
    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create role.");
      return;
    }
    setRoles((current) => [...current, data].sort(byPosition));
    setRoleName("");
  }

  async function saveRole(
    role: Role,
    nextName: string,
    nextColor: string,
    nextPermissions: Record<string, boolean>,
  ) {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("roles")
      .update({
        name: trimmed,
        color: nextColor,
        permissions: nextPermissions,
      })
      .eq("id", role.id)
      .select("*")
      .single();
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not update role.");
      return;
    }
    setRoles((current) =>
      current.map((item) => (item.id === role.id ? data : item)),
    );
  }

  async function deleteRole(roleId: string) {
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
    setRoles((current) => current.filter((role) => role.id !== roleId));
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
    await supabase
      .from("server_members")
      .update({ role_id: roleId })
      .eq("server_id", server.id)
      .eq("user_id", memberId);

    onMembersChanged(
      members.map((item) =>
        item.user_id === memberId
          ? { ...item, roleIds: [...new Set([...item.roleIds, roleId])] }
          : item,
      ),
    );
  }

  async function removeRole(memberId: string, roleId: string) {
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
    if (memberId === server.owner_id || memberId === userId) return;
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
    if (!trimmed) return;
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
    if (!trimmed) return;
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
    if (!trimmed) return;
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
            {TABS.map((item) => {
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
              {TABS.find((item) => item.id === tab)?.label}
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

            {tab === "overview" && (
              <form onSubmit={saveOverview} className="space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Server name
                  </span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={64}
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
                    maxLength={200}
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
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </form>
            )}

            {tab === "roles" && (
              <div className="space-y-4">
                <ul className="space-y-2">
                  {roles.length === 0 && (
                    <li className="text-sm text-muted">No roles yet.</li>
                  )}
                  {roles.map((role) => (
                    <RoleRow
                      key={role.id}
                      role={role}
                      confirm={confirmRoleId === role.id}
                      onSave={saveRole}
                      onAskDelete={() => setConfirmRoleId(role.id)}
                      onCancelDelete={() => setConfirmRoleId(null)}
                      onDelete={() => void deleteRole(role.id)}
                    />
                  ))}
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
                      maxLength={40}
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

            {tab === "members" && (
              <ul className="space-y-2">
                {members.length === 0 && (
                  <li className="text-sm text-muted">No members loaded.</li>
                )}
                {members.map((member) => {
                  const label = member.nickname || member.username;
                  const isOwner = member.user_id === server.owner_id;
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
                            {isOwner && (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-accent">
                                Owner
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {statusLabel(member.status)}
                          </p>
                        </div>
                        {!isOwner && member.user_id !== userId && (
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
                          return (
                            <button
                              key={roleId}
                              type="button"
                              onClick={() => void removeRole(member.user_id, roleId)}
                              title="Remove role"
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
                        {roles.length > 0 && (
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
                              .filter((role) => !member.roleIds.includes(role.id))
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

            {tab === "invites" && (
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

            {tab === "channels" && (
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
                      maxLength={40}
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
                      maxLength={40}
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
                          <button
                            type="button"
                            onClick={() => void renameChannel(channel.id)}
                            className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-white"
                          >
                            Save
                          </button>
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
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleRow({
  role,
  confirm,
  onSave,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  role: Role;
  confirm: boolean;
  onSave: (
    role: Role,
    name: string,
    color: string,
    permissions: Record<string, boolean>,
  ) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color || "#dc2626");
  const [perms, setPerms] = useState<Record<string, boolean>>(() => {
    const raw = role.permissions;
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, boolean>)
      : {};
  });

  useEffect(() => {
    setName(role.name);
    setColor(role.color || "#dc2626");
    const raw = role.permissions;
    setPerms(
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, boolean>)
        : {},
    );
  }, [role.name, role.color, role.permissions]);

  return (
    <li className="space-y-2 rounded-md bg-[#2b2d31] px-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
      <input
        type="color"
        value={color}
        onChange={(event) => setColor(event.target.value)}
        aria-label={`${role.name} color`}
        className="h-8 w-10 cursor-pointer rounded-md border border-border bg-transparent"
      />
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-white outline-none focus:border-accent/40"
      />
      <button
        type="button"
        onClick={() => onSave(role, name, color, perms)}
        className="rounded-md bg-[#3f4147] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#4e5058]"
      >
        Save
      </button>
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
            onClick={onCancelDelete}
            className="rounded-md px-2 py-1.5 text-xs text-muted hover:text-white"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onAskDelete}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent-muted"
        >
          Delete
        </button>
      )}
      </div>
      <div className="grid grid-cols-2 gap-1.5 px-1 pb-1 sm:grid-cols-3">
        {ROLE_PERM_OPTIONS.map((option) => (
          <label
            key={option.key}
            className="flex items-center gap-1.5 text-[11px] text-[#dbdee1]"
          >
            <input
              type="checkbox"
              checked={Boolean(perms[option.key])}
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

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md bg-[#2b2d31] px-2 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        Category
      </span>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={40}
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm uppercase tracking-wide text-white outline-none focus:border-accent/40"
      />
      <button
        type="button"
        onClick={() => onSave(name)}
        className="rounded-md bg-[#3f4147] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#4e5058]"
      >
        Save
      </button>
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
