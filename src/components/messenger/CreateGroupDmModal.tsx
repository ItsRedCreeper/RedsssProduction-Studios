"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { FriendEntry } from "@/components/messenger/types";

type CreateGroupDmModalProps = {
  open: boolean;
  userId: string;
  friends: FriendEntry[];
  onClose: () => void;
  onCreated: (conversationId: string) => void;
};

export function CreateGroupDmModal({
  open,
  userId,
  friends,
  onClose,
  onCreated,
}: CreateGroupDmModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setName("");
    setError(null);
  }, [open]);

  if (!open) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 9) return prev; // + self = 10
      return [...prev, id];
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (selected.length < 1) {
      setError("Pick at least one friend.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: convo, error: convoError } = await supabase
      .from("dm_conversations")
      .insert({
        is_group: true,
        name: name.trim() || null,
        owner_id: userId,
      })
      .select("*")
      .single();
    if (convoError || !convo) {
      setSaving(false);
      setError(convoError?.message ?? "Could not create group DM.");
      return;
    }
    const participants = [userId, ...selected].map((id) => ({
      conversation_id: convo.id,
      user_id: id,
      hidden: false,
    }));
    const { error: partError } = await supabase
      .from("dm_participants")
      .insert(participants);
    setSaving(false);
    if (partError) {
      setError(partError.message);
      return;
    }
    onCreated(convo.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--ms-chat)] shadow-2xl ring-1 ring-accent/15"
      >
        <div className="flex items-center justify-between border-b border-black/30 px-4 py-3">
          <h2 className="text-base font-semibold text-white">New Group DM</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="space-y-3 px-4 py-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Group name (optional)
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              className="w-full rounded-md border border-[#3f4147] bg-[var(--ms-border)] px-3 py-2 text-sm outline-none focus:border-accent/60"
            />
          </label>
          <p className="text-xs text-[var(--ms-text-muted)]">
            Select up to 9 friends ({selected.length}/9)
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {friends.map((friend) => {
              const checked = selected.includes(friend.id);
              return (
                <li key={friend.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(friend.id)}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="text-sm text-[var(--ms-text)]">
                      {friend.username}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {error && (
            <p className="rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm text-[var(--ms-text)] hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || selected.length < 1}
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create Group"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
