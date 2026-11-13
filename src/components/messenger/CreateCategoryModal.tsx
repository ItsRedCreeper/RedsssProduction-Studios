"use client";

import { FormEvent, useEffect, useState } from "react";
import { FolderPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/components/messenger/types";

type CreateCategoryModalProps = {
  open: boolean;
  serverId: string;
  categoryCount: number;
  onClose: () => void;
  onCreated: (category: Category) => void;
};

export function CreateCategoryModal({
  open,
  serverId,
  categoryCount,
  onClose,
  onCreated,
}: CreateCategoryModalProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setError(null);
  }, [open]);

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
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a category name.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("channel_categories")
      .insert({
        server_id: serverId,
        name: trimmed,
        position: categoryCount,
      })
      .select("*")
      .single();
    setSaving(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "Could not create category.");
      return;
    }
    onCreated(data);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-category-title"
        className="relative w-full max-w-md overflow-hidden rounded-lg border border-border bg-[#313338] shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div>
            <h2 id="create-category-title" className="text-lg font-semibold text-white">
              Create Category
            </h2>
            <p className="mt-1 text-sm text-muted">
              Group channels the way Discord does — Text, Voice, or anything you want.
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

        <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Category name
            </span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              placeholder="Text Channels"
              className="w-full rounded-md border border-border bg-[#1e1f22] px-3 py-2.5 text-sm text-white outline-none focus:border-accent/50"
            />
          </label>

          {error && (
            <p className="rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-black/30 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
            >
              <FolderPlus className="h-4 w-4" strokeWidth={2} />
              {saving ? "Creating…" : "Create Category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
