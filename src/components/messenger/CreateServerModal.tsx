"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { makeInviteCode } from "@/components/messenger/data";

type CreateServerModalProps = {
  open: boolean;
  userId: string;
  onClose: () => void;
  onCreated: (serverId: string) => void;
};

export function CreateServerModal({
  open,
  userId,
  onClose,
  onCreated,
}: CreateServerModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocked(false);
    setError(null);
  }, [open]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Server name must be at least 2 characters.");
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data: server, error: serverError } = await supabase
      .from("servers")
      .insert({
        name: trimmed,
        description: description.trim() || null,
        owner_id: userId,
        is_public: isPublic,
      })
      .select("*")
      .single();

    if (serverError || !server) {
      setLoading(false);
      setError(serverError?.message ?? "Could not create server.");
      return;
    }

    const { error: memberError } = await supabase.from("server_members").insert({
      server_id: server.id,
      user_id: userId,
    });

    if (memberError) {
      setLoading(false);
      setError(memberError.message);
      onCreated(server.id);
      setLocked(true);
      return;
    }

    const { data: categories, error: categoryError } = await supabase
      .from("channel_categories")
      .insert([
        { server_id: server.id, name: "Text Channels", position: 0 },
        { server_id: server.id, name: "Voice Channels", position: 1 },
      ])
      .select("*");

    if (categoryError || !categories || categories.length < 2) {
      setLoading(false);
      setError(categoryError?.message ?? "Server was created, but categories failed.");
      onCreated(server.id);
      setLocked(true);
      return;
    }

    const textCategory =
      categories.find((category) => category.name === "Text Channels") ?? categories[0];
    const voiceCategory =
      categories.find((category) => category.name === "Voice Channels") ?? categories[1];

    const { error: channelsError } = await supabase.from("channels").insert([
      {
        server_id: server.id,
        name: "general",
        type: "text",
        category_id: textCategory.id,
        position: 0,
      },
      {
        server_id: server.id,
        name: "general",
        type: "voice",
        category_id: voiceCategory.id,
        position: 0,
      },
    ]);

    if (channelsError) {
      setLoading(false);
      setError(channelsError.message);
      onCreated(server.id);
      setLocked(true);
      return;
    }

    // One permanent invite link for the life of the server.
    await supabase.from("invites").insert({
      code: makeInviteCode(),
      server_id: server.id,
      creator_id: userId,
      max_uses: null,
      expires_at: null,
      is_permanent: true,
      uses: 0,
    });

    setLoading(false);
    setName("");
    setDescription("");
    setIsPublic(false);
    onCreated(server.id);
    onClose();
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
        aria-labelledby="create-server-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-md border border-border bg-surface shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2
              id="create-server-title"
              className="text-lg font-semibold text-foreground"
            >
              Create a Server
            </h2>
            <p className="mt-1 text-sm text-muted">
              Your server is where you and your friends hang out.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Server Name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={64}
              disabled={locked}
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent-ring disabled:opacity-60"
              placeholder="My Cool Server"
              autoFocus
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Description
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={200}
              disabled={locked}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent-ring disabled:opacity-60"
              placeholder="What is this server about?"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-background px-3 py-3">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              disabled={locked}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className="text-sm text-foreground">
              Make this server discoverable
            </span>
          </label>

          {error && (
            <p className="rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
            >
              {locked ? "Close" : "Cancel"}
            </button>
            {!locked && (
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
              >
                {loading ? "Creating…" : "Create"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
