"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadProfileAsset, type FriendProfile } from "@/lib/friends";
import { notifyProfileUpdated } from "@/hooks/useCurrentProfile";
import { UserAvatar } from "@/components/ui/UserAvatar";

type EditProfileModalProps = {
  open: boolean;
  profile: FriendProfile;
  onClose: () => void;
  onSaved: (profile: FriendProfile) => void;
};

export function EditProfileModal({
  open,
  profile,
  onClose,
  onSaved,
}: EditProfileModalProps) {
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [bannerUrl, setBannerUrl] = useState(profile.banner_url);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);

  useEffect(() => {
    if (!open) return;
    setUsername(profile.username);
    setBio(profile.bio ?? "");
    setAvatarUrl(profile.avatar_url);
    setBannerUrl(profile.banner_url);
    setError(null);
  }, [open, profile]);

  if (!open) return null;

  async function onPick(kind: "avatar" | "banner", file: File | null) {
    if (!file) return;
    setUploading(kind);
    setError(null);
    const { url, error: uploadError } = await uploadProfileAsset(
      profile.id,
      file,
      kind,
    );
    setUploading(null);
    if (uploadError || !url) {
      setError(uploadError ?? "Upload failed.");
      return;
    }
    if (kind === "avatar") setAvatarUrl(url);
    else setBannerUrl(url);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Username is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("profiles")
      .update({
        username: trimmed,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        banner_url: bannerUrl,
      })
      .eq("id", profile.id)
      .select("id, username, avatar_url, status, status_text, bio, banner_url")
      .single();
    setSaving(false);
    if (updateError || !data) {
      setError(updateError?.message ?? "Could not save profile.");
      return;
    }
    onSaved({
      id: data.id,
      username: data.username,
      avatar_url: data.avatar_url,
      status: data.status,
      status_text: data.status_text,
      bio: data.bio,
      banner_url: data.banner_url,
    });
    notifyProfileUpdated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/75"
        aria-label="Close"
        onClick={onClose}
        disabled={saving}
      />
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-[#111214] shadow-2xl shadow-black/60"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Edit Profile</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1.5 text-muted hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
              Banner
            </p>
            <label className="relative flex h-28 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-[#1e1f22]">
              {bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="absolute inset-0 bg-gradient-to-br from-accent/80 to-[#7f1d1d]" />
              )}
              <span className="relative z-10 inline-flex items-center gap-2 rounded-md bg-black/55 px-3 py-1.5 text-xs font-medium text-white">
                <ImagePlus className="h-3.5 w-3.5" strokeWidth={2} />
                {uploading === "banner" ? "Uploading…" : "Change banner"}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                disabled={!!uploading || saving}
                onChange={(event) =>
                  void onPick("banner", event.target.files?.[0] ?? null)
                }
              />
            </label>
          </div>

          <div className="flex items-center gap-4">
            <label className="relative cursor-pointer">
              <UserAvatar
                username={username || profile.username}
                avatarUrl={avatarUrl}
                size="lg"
                className="!h-16 !w-16 !text-lg"
              />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-[10px] font-semibold text-white opacity-0 transition hover:opacity-100">
                {uploading === "avatar" ? "…" : "Edit"}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                disabled={!!uploading || saving}
                onChange={(event) =>
                  void onPick("avatar", event.target.files?.[0] ?? null)
                }
              />
            </label>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                Username
              </label>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={32}
                className="w-full rounded-md border border-border bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
              About Me
            </label>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={190}
              rows={4}
              className="w-full resize-none rounded-md border border-border bg-[#1e1f22] px-3 py-2 text-sm text-white outline-none focus:border-accent/50"
              placeholder="Tell people a bit about yourself"
            />
            <p className="mt-1 text-right text-[10px] text-muted">{bio.length}/190</p>
          </div>

          {error && <p className="text-sm text-accent">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md px-3 py-2 text-sm text-[#dbdee1] hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !!uploading}
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
