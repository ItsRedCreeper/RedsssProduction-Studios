"use client";

import { FormEvent, useEffect, useState } from "react";
import { Hash, Volume2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Category, Channel } from "@/components/messenger/types";

type CreateChannelModalProps = {
  open: boolean;
  serverId: string;
  categories: Category[];
  channelCount: number;
  initialType?: "text" | "voice";
  initialCategoryId?: string | null;
  onClose: () => void;
  onCreated: (channel: Channel, categories: Category[]) => void;
};

export function CreateChannelModal({
  open,
  serverId,
  categories,
  channelCount,
  initialType = "text",
  initialCategoryId = null,
  onClose,
  onCreated,
}: CreateChannelModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"text" | "voice">(initialType);
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setType(initialType);
    setError(null);
    const preferred =
      initialCategoryId && categories.some((category) => category.id === initialCategoryId)
        ? initialCategoryId
        : categories.find((category) =>
            initialType === "voice"
              ? /voice/i.test(category.name)
              : /text/i.test(category.name),
          )?.id ??
          categories[0]?.id ??
          "";
    setCategoryId(preferred);
  }, [open, initialType, initialCategoryId, categories]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!trimmed) {
      setError("Enter a channel name.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();

    let nextCategories = categories;
    let nextCategoryId = categoryId || null;

    if (!nextCategoryId) {
      const categoryName = type === "voice" ? "Voice Channels" : "Text Channels";
      const { data: category, error: categoryError } = await supabase
        .from("channel_categories")
        .insert({
          server_id: serverId,
          name: categoryName,
          position: categories.length,
        })
        .select("*")
        .single();
      if (categoryError || !category) {
        setSaving(false);
        setError(categoryError?.message ?? "Could not create category.");
        return;
      }
      nextCategories = [...categories, category];
      nextCategoryId = category.id;
    }

    const { data, error: insertError } = await supabase
      .from("channels")
      .insert({
        server_id: serverId,
        name: trimmed,
        type,
        category_id: nextCategoryId,
        position: channelCount,
      })
      .select("*")
      .single();

    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create channel.");
      return;
    }
    onCreated(data, nextCategories);
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
        aria-labelledby="create-channel-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-md border border-[#1e1f22] bg-[#313338] shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between border-b border-black/30 px-5 py-4">
          <div>
            <h2
              id="create-channel-title"
              className="text-lg font-semibold text-white"
            >
              Create Channel
            </h2>
            <p className="mt-1 text-sm text-[#949ba4]">
              Add a text or voice channel to this server.
            </p>
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

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType("text")}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium ${
                type === "text"
                  ? "bg-accent text-white"
                  : "bg-[#2b2d31] text-[#dbdee1] hover:bg-[#3f4147]"
              }`}
            >
              <Hash className="h-4 w-4" strokeWidth={2} />
              Text
            </button>
            <button
              type="button"
              onClick={() => setType("voice")}
              className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium ${
                type === "voice"
                  ? "bg-accent text-white"
                  : "bg-[#2b2d31] text-[#dbdee1] hover:bg-[#3f4147]"
              }`}
            >
              <Volume2 className="h-4 w-4" strokeWidth={2} />
              Voice
            </button>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Channel name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="new-channel"
              maxLength={40}
              autoFocus
              className="w-full rounded-md border border-border bg-[#1e1f22] px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/50"
            />
          </label>

          {categories.length > 0 && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Category
              </span>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="w-full rounded-md border border-border bg-[#1e1f22] px-3 py-2.5 text-sm outline-none focus:border-accent/50"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <p className="rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm text-[#dbdee1] hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create Channel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
