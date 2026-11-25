"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Hash, Volume2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DirtySaveButton } from "@/components/ui/DirtySaveButton";
import { compareRolePositionDesc } from "@/lib/roles";
import {
  CHANNEL_NAME_MAX,
  CHANNEL_NAME_MIN,
} from "@/lib/field-limits";
import {
  CHANNEL_PERMISSION_OPTIONS,
  EVERYONE_OVERRIDE_KEY,
  getOverrideState,
  isPrivateChannel,
  setChannelPrivate,
  setOverrideState,
  setRoleChannelView,
  type ChannelOverrides,
  type OverrideState,
  type Permission,
} from "@/lib/permissions";
import type { Channel, Role } from "@/components/messenger/types";

const SLOWMODE_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 5, label: "5s" },
  { value: 10, label: "10s" },
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 60, label: "1m" },
  { value: 120, label: "2m" },
  { value: 300, label: "5m" },
  { value: 600, label: "10m" },
  { value: 900, label: "15m" },
  { value: 1800, label: "30m" },
  { value: 3600, label: "1h" },
  { value: 7200, label: "2h" },
  { value: 21600, label: "6h" },
];

type EditChannelModalProps = {
  open: boolean;
  channel: Channel | null;
  roles: Role[];
  onClose: () => void;
  onSaved: (channel: Channel) => void;
  onDuplicated?: (channel: Channel) => void;
};

type Tab = "overview" | "permissions";

function TriState({
  state,
  disabled,
  onChange,
}: {
  state: OverrideState;
  disabled?: boolean;
  onChange: (next: OverrideState) => void;
}) {
  const cycle: OverrideState[] = ["inherit", "allow", "deny"];
  const next = cycle[(cycle.indexOf(state) + 1) % cycle.length] ?? "inherit";
  const label =
    state === "allow" ? "Allow" : state === "deny" ? "Deny" : "Inherit";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(next)}
      title={`Permission: ${label}. Click to cycle.`}
      className={`inline-flex h-7 min-w-[4.5rem] items-center justify-center rounded-md border px-2 text-[11px] font-semibold disabled:opacity-50 ${
        state === "allow"
          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
          : state === "deny"
            ? "border-accent/50 bg-accent-muted text-accent"
            : "border-[#3f4147] bg-[var(--ms-border)] text-[var(--ms-text-muted)]"
      }`}
    >
      {state === "allow" ? (
        <Check className="mr-1 h-3 w-3" strokeWidth={2.5} />
      ) : null}
      {label}
    </button>
  );
}

export function EditChannelModal({
  open,
  channel,
  roles,
  onClose,
  onSaved,
  onDuplicated,
}: EditChannelModalProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [slowmode, setSlowmode] = useState(0);
  const [nsfw, setNsfw] = useState(false);
  const [overrides, setOverrides] = useState<ChannelOverrides>({});
  const [target, setTarget] = useState<string>(EVERYONE_OVERRIDE_KEY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !channel) return;
    setTab("overview");
    setName(channel.name);
    setTopic(channel.topic ?? "");
    setSlowmode(channel.slowmode_seconds ?? 0);
    setNsfw(Boolean(channel.nsfw));
    setOverrides(
      (channel.permission_overrides &&
      typeof channel.permission_overrides === "object" &&
      !Array.isArray(channel.permission_overrides)
        ? (channel.permission_overrides as ChannelOverrides)
        : {}) ?? {},
    );
    setTarget(EVERYONE_OVERRIDE_KEY);
    setError(null);
  }, [open, channel]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sortedRoles = useMemo(
    () => [...roles].sort(compareRolePositionDesc),
    [roles],
  );

  const privateChannel = isPrivateChannel(overrides);

  const overviewDirty = Boolean(
    channel &&
      (name.trim() !== channel.name ||
        (topic.trim() || "") !== (channel.topic ?? "") ||
        slowmode !== (channel.slowmode_seconds ?? 0) ||
        nsfw !== Boolean(channel.nsfw)),
  );

  const permsDirty = Boolean(
    channel &&
      JSON.stringify(overrides) !==
        JSON.stringify(channel.permission_overrides ?? {}),
  );

  if (!open || !channel) return null;

  const permOptions = CHANNEL_PERMISSION_OPTIONS.filter((option) => {
    if (channel.type === "voice") return option.group !== "text";
    return option.group !== "voice";
  });

  async function saveOverview(event?: FormEvent) {
    event?.preventDefault();
    if (!channel) return;
    const trimmed = name.trim().toLowerCase().replace(/\s+/g, "-");
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
    const { data, error: updateError } = await supabase
      .from("channels")
      .update({
        name: trimmed,
        topic: topic.trim() || null,
        slowmode_seconds: slowmode,
        nsfw,
      })
      .eq("id", channel.id)
      .select("*")
      .single();
    setSaving(false);
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not save channel.");
      return;
    }
    onSaved(data);
  }

  async function savePermissions() {
    if (!channel) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("channels")
      .update({
        permission_overrides: overrides,
        permissions_synced: false,
      })
      .eq("id", channel.id)
      .select("*")
      .single();
    setSaving(false);
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not save permissions.");
      return;
    }
    onSaved(data);
  }

  async function duplicateChannel() {
    if (!channel || !onDuplicated) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { count } = await supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .eq("server_id", channel.server_id);
    const { data, error: insertError } = await supabase
      .from("channels")
      .insert({
        server_id: channel.server_id,
        name: `${channel.name}-copy`,
        type: channel.type,
        category_id: channel.category_id,
        topic: channel.topic,
        position: (count ?? 0) + 1,
        permission_overrides: channel.permission_overrides,
        slowmode_seconds: channel.slowmode_seconds ?? 0,
        nsfw: Boolean(channel.nsfw),
        permissions_synced: false,
      })
      .select("*")
      .single();
    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not duplicate channel.");
      return;
    }
    onDuplicated(data);
    onClose();
  }

  function setPerm(permission: Permission, state: OverrideState) {
    setOverrides((current) =>
      setOverrideState(current, target, permission, state),
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-channel-title"
        className="relative z-10 flex max-h-[min(90dvh,42rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--ms-chat)] shadow-2xl shadow-black/50 ring-1 ring-accent/15"
      >
        <div className="messenger-header flex items-start justify-between bg-[var(--ms-chat,#313338)] px-5 py-4">
          <div className="flex items-center gap-2">
            {channel.type === "voice" ? (
              <Volume2 className="h-5 w-5 text-accent" strokeWidth={1.75} />
            ) : (
              <Hash className="h-5 w-5 text-[var(--ms-text-muted)]" strokeWidth={2} />
            )}
            <div>
              <h2
                id="edit-channel-title"
                className="text-lg font-semibold text-white"
              >
                Edit Channel
              </h2>
              <p className="text-sm text-[var(--ms-text-muted)]">#{channel.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--ms-border,#1e1f22)] px-5">
          {(
            [
              ["overview", "Overview"],
              ["permissions", "Permissions"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === id
                  ? "border-accent text-white"
                  : "border-transparent text-[var(--ms-text-muted)] hover:text-[var(--ms-text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:max-w-[45rem]">
          {error && (
            <p className="mb-3 rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
              {error}
            </p>
          )}

          {tab === "overview" && (
            <form onSubmit={(event) => void saveOverview(event)} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Channel name
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={CHANNEL_NAME_MAX}
                  className="w-full rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2.5 text-sm outline-none focus:border-accent/60"
                />
              </label>
              {channel.type === "text" && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Topic
                  </span>
                  <textarea
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    rows={3}
                    maxLength={1024}
                    placeholder="Let everyone know how to use this channel"
                    className="w-full resize-none rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2.5 text-sm outline-none focus:border-accent/60"
                  />
                </label>
              )}
              {channel.type === "text" && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Slowmode
                  </span>
                  <select
                    value={slowmode}
                    onChange={(event) => setSlowmode(Number(event.target.value))}
                    className="w-full rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2.5 text-sm outline-none focus:border-accent/60"
                  >
                    {SLOWMODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex cursor-pointer items-start gap-2 rounded-md bg-[var(--ms-sidebar)] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={nsfw}
                  onChange={(event) => setNsfw(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[#3f4147] accent-accent"
                />
                <span>
                  <span className="block text-sm font-medium text-white">
                    Age-Restricted Channel
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--ms-text-muted)]">
                    Users must confirm they are of age to view this channel.
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap justify-between gap-2 pt-1">
                {onDuplicated ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void duplicateChannel()}
                    className="rounded-md px-3 py-2 text-sm text-[var(--ms-text)] hover:bg-white/5 disabled:opacity-50"
                  >
                    Duplicate Channel
                  </button>
                ) : (
                  <span />
                )}
                <DirtySaveButton
                  dirty={overviewDirty}
                  saving={saving}
                  label="Save Changes"
                  onClick={() => void saveOverview()}
                />
              </div>
            </form>
          )}

          {tab === "permissions" && (
            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-2 rounded-md bg-[var(--ms-sidebar)] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={privateChannel}
                  onChange={(event) =>
                    setOverrides((current) =>
                      setChannelPrivate(current, event.target.checked),
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

              <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                    Roles
                  </p>
                  <button
                    type="button"
                    onClick={() => setTarget(EVERYONE_OVERRIDE_KEY)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      target === EVERYONE_OVERRIDE_KEY
                        ? "bg-[#404249] text-white"
                        : "text-[var(--ms-text)] hover:bg-white/5"
                    }`}
                  >
                    Default
                  </button>
                  {sortedRoles
                    .filter((role) => !role.is_default)
                    .map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setTarget(role.id)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                          target === role.id
                            ? "bg-[#404249] text-white"
                            : "text-[var(--ms-text)] hover:bg-white/5"
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: role.color || "#99aab5" }}
                        />
                        <span className="truncate">{role.name}</span>
                      </button>
                    ))}
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                    Advanced permissions
                  </p>
                  {privateChannel && target !== EVERYONE_OVERRIDE_KEY ? (
                    <label className="mb-2 flex items-center gap-2 text-sm text-[var(--ms-text)]">
                      <input
                        type="checkbox"
                        checked={
                          getOverrideState(
                            overrides,
                            target,
                            "VIEW_CHANNEL",
                          ) === "allow"
                        }
                        onChange={(event) =>
                          setOverrides((current) =>
                            setRoleChannelView(
                              current,
                              target,
                              event.target.checked,
                            ),
                          )
                        }
                        className="h-4 w-4 rounded border-[#3f4147] accent-accent"
                      />
                      Can view this channel
                    </label>
                  ) : null}
                  <ul className="space-y-1">
                    {permOptions.map((option) => (
                      <li
                        key={option.key}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-white/5"
                      >
                        <span className="text-sm text-[var(--ms-text)]">
                          {option.label}
                        </span>
                        <TriState
                          state={getOverrideState(
                            overrides,
                            target,
                            option.key,
                          )}
                          onChange={(state) => setPerm(option.key, state)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <DirtySaveButton
                  dirty={permsDirty}
                  saving={saving}
                  label="Save Changes"
                  onClick={() => void savePermissions()}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
