"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadProfileAsset, type FriendProfile } from "@/lib/friends";
import {
  BIO_MAX,
  USERNAME_MAX,
  USERNAME_MIN,
} from "@/lib/field-limits";
import {
  BANNER_COLOR_PRESETS,
  DEFAULT_BANNER_COLOR,
  normalizeBannerColor,
  resolveBannerColor,
} from "@/lib/profile-banner";
import { notifyProfileUpdated } from "@/hooks/useCurrentProfile";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { DirtySaveButton } from "@/components/ui/DirtySaveButton";
import { HoverTip } from "@/components/ui/HoverTip";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import {
  ImageCropModal,
  type ImageCropKind,
} from "@/components/ui/ImageCropModal";
import {
  GIF_NOT_ALLOWED_HERE,
  STATIC_IMAGE_ACCEPT,
  isAllowedStaticImage,
} from "@/lib/upload-image-types";

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
  const [bannerColor, setBannerColor] = useState(
    resolveBannerColor(profile.banner_color),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [crop, setCrop] = useState<{
    kind: ImageCropKind;
    file: File;
  } | null>(null);

  // Seed drafts only when the editor opens (or the profile identity changes).
  // Presence heartbeats refresh `profile` every few seconds — do not wipe unsaved edits.
  useEffect(() => {
    if (!open) return;
    setUsername(profile.username);
    setBio(profile.bio ?? "");
    setAvatarUrl(profile.avatar_url);
    setBannerUrl(profile.banner_url);
    setBannerColor(resolveBannerColor(profile.banner_color));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally ignore heartbeat profile refreshes
  }, [open, profile.id]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || saving || uploading || crop) return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, uploading, crop, onClose]);

  const dirty =
    username.trim() !== profile.username ||
    (bio.trim() || "") !== (profile.bio?.trim() || "") ||
    avatarUrl !== profile.avatar_url ||
    bannerUrl !== profile.banner_url ||
    resolveBannerColor(bannerColor) !==
      resolveBannerColor(profile.banner_color);

  if (!open) return null;

  function onPick(kind: "avatar" | "banner", file: File | null) {
    if (!file) return;
    if (!isAllowedStaticImage(file)) {
      setError(GIF_NOT_ALLOWED_HERE);
      return;
    }
    setError(null);
    setCrop({ kind, file });
  }

  async function uploadCropped(kind: "avatar" | "banner", file: File) {
    setCrop(null);
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
    if (trimmed.length < USERNAME_MIN) {
      setError(`Username must be at least ${USERNAME_MIN} characters.`);
      return;
    }
    if (trimmed.length > USERNAME_MAX) {
      setError(`Username must be ${USERNAME_MAX} characters or fewer.`);
      return;
    }
    const color = normalizeBannerColor(bannerColor) ?? DEFAULT_BANNER_COLOR;
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
        banner_color: color,
      })
      .eq("id", profile.id)
      .select(
        "id, username, avatar_url, status, status_text, bio, banner_url, banner_color, created_at",
      )
      .single();
    setSaving(false);
    if (updateError || !data) {
      const raw = updateError?.message ?? "";
      const lower = raw.toLowerCase();
      if (
        lower.includes("duplicate") ||
        lower.includes("unique") ||
        lower.includes("profiles_username")
      ) {
        setError("That username is already taken.");
      } else {
        setError(raw || "Could not save profile.");
      }
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
      banner_color: data.banner_color,
      created_at: data.created_at,
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
      <ImageCropModal
        open={!!crop}
        file={crop?.file ?? null}
        kind={crop?.kind ?? "avatar"}
        onCancel={() => setCrop(null)}
        onCropped={(cropped) => {
          if (!crop) return;
          const kind = crop.kind === "banner" ? "banner" : "avatar";
          void uploadCropped(kind, cropped);
        }}
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
            <ProfileBanner
              bannerUrl={bannerUrl}
              bannerColor={bannerColor}
              className="relative flex h-28 items-center justify-center rounded-lg border border-dashed border-border"
            >
              <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 px-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-black/55 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/70">
                  <ImagePlus className="h-3.5 w-3.5" strokeWidth={2} />
                  {uploading === "banner" ? "Uploading…" : bannerUrl ? "Change image" : "Upload image"}
                  <input
                    type="file"
                    accept={STATIC_IMAGE_ACCEPT}
                    className="hidden"
                    disabled={!!uploading || saving}
                    onChange={(event) => {
                      void onPick("banner", event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                  />
                </label>
                {bannerUrl && (
                  <button
                    type="button"
                    disabled={saving || !!uploading}
                    onClick={() => setBannerUrl(null)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-black/55 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/70 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    Remove image
                  </button>
                )}
              </div>
            </ProfileBanner>

            {!bannerUrl && (
              <div className="mt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                  Banner color
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {BANNER_COLOR_PRESETS.map((swatch) => {
                    const selected =
                      bannerColor.toLowerCase() === swatch.toLowerCase();
                    return (
                      <HoverTip key={swatch} label={swatch} delayMs={40}>
                        <button
                          type="button"
                          aria-label={`Banner color ${swatch}`}
                          aria-pressed={selected}
                          disabled={saving}
                          onClick={() => setBannerColor(swatch)}
                          className={`h-7 w-7 rounded-full border-2 transition ${
                            selected
                              ? "border-white scale-110"
                              : "border-transparent hover:border-white/50"
                          }`}
                          style={{ backgroundColor: swatch }}
                        />
                      </HoverTip>
                    );
                  })}
                  <HoverTip label="Custom Color" delayMs={40}>
                    <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-[#4e5058] hover:border-white/50">
                      <span
                        className="absolute inset-0"
                        style={{ backgroundColor: bannerColor }}
                      />
                      <input
                        type="color"
                        value={bannerColor}
                        disabled={saving}
                        onChange={(event) => setBannerColor(event.target.value)}
                        className="absolute inset-0 cursor-pointer opacity-0"
                        aria-label="Custom banner color"
                      />
                    </label>
                  </HoverTip>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-2">
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
                  accept={STATIC_IMAGE_ACCEPT}
                  className="hidden"
                  disabled={!!uploading || saving}
                  onChange={(event) => {
                    void onPick("avatar", event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
              </label>
              {avatarUrl && (
                <button
                  type="button"
                  disabled={saving || !!uploading}
                  onClick={() => setAvatarUrl(null)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#949ba4] hover:text-white disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={2} />
                  Remove
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                Username
              </label>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                minLength={USERNAME_MIN}
                maxLength={USERNAME_MAX}
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
              maxLength={BIO_MAX}
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
            Close
          </button>
          <DirtySaveButton
            type="submit"
            dirty={dirty}
            saving={saving}
            disabled={!!uploading || !username.trim()}
            label="Save"
          />
        </div>
      </form>
    </div>
  );
}
