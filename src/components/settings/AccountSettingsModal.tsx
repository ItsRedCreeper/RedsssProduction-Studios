"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/field-limits";
import { createClient } from "@/lib/supabase/client";

type AccountSettingsModalProps = {
  open: boolean;
  user: User | null;
  onClose: () => void;
};

function hasEmailPasswordIdentity(user: User | null) {
  if (!user) return false;
  const identities = user.identities ?? [];
  if (identities.length === 0) {
    return !!user.email;
  }
  return identities.some((identity) => identity.provider === "email");
}

function hasGoogleIdentity(user: User | null) {
  if (!user) return false;
  return (user.identities ?? []).some(
    (identity) => identity.provider === "google",
  );
}

export function AccountSettingsModal({
  open,
  user,
  onClose,
}: AccountSettingsModalProps) {
  const canChangePassword = useMemo(
    () => hasEmailPasswordIdentity(user),
    [user],
  );
  const googleConnected = useMemo(() => hasGoogleIdentity(user), [user]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(null);
    setBusy(false);
    setGoogleBusy(false);
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

  async function handleConnectGoogle() {
    setError(null);
    setSuccess(null);
    setGoogleBusy(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/")}`;
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (linkError) {
      const lower = linkError.message.toLowerCase();
      if (lower.includes("manual linking")) {
        setError("Google linking isn’t available right now.");
      } else {
        setError(linkError.message);
      }
      setGoogleBusy(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!user?.email) {
      setError("No email on this account.");
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All password fields are required.");
      return;
    }
    if (newPassword.length < PASSWORD_MIN) {
      setError(`New password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (newPassword.length > PASSWORD_MAX) {
      setError(`New password must be ${PASSWORD_MAX} characters or fewer.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) {
        setError(
          verifyError.message.toLowerCase().includes("invalid login")
            ? "Current password is incorrect."
            : verifyError.message,
        );
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password updated");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/75"
        aria-label="Close account settings"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-settings-title"
        className="relative z-10 flex max-h-[min(90dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#1e1f22] bg-[#2b2d31] shadow-2xl shadow-black/60"
      >
        <div className="flex items-center justify-between border-b border-black/30 px-5 py-4">
          <h2
            id="account-settings-title"
            className="text-lg font-semibold text-white"
          >
            Account Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#949ba4] hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-5">
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Google</h3>
              <p className="mt-1 text-xs text-[#949ba4]">
                {googleConnected
                  ? "Google is connected to this account."
                  : "Connect Google to sign in with either method."}
              </p>
            </div>
            {googleConnected ? (
              <p className="rounded-md border border-[#23a559]/40 bg-[#23a559]/10 px-3 py-2 text-sm text-[#23a559]">
                Connected
              </p>
            ) : (
              <button
                type="button"
                disabled={googleBusy || busy}
                onClick={() => void handleConnectGoogle()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#3f4147] bg-[#1e1f22] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2b2d31] disabled:opacity-60"
              >
                {googleBusy ? "Redirecting…" : "Connect Google"}
              </button>
            )}
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Change Password
              </h3>
              <p className="mt-1 text-xs text-[#949ba4]">
                {canChangePassword
                  ? "Update the password for your email sign-in."
                  : "Password changes are available for email accounts."}
              </p>
            </div>

            {canChangePassword ? (
              <form
                onSubmit={(event) => void handlePasswordSubmit(event)}
                className="space-y-3"
              >
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#949ba4]">
                    Current password
                  </span>
                  <PasswordInput
                    autoComplete="current-password"
                    maxLength={PASSWORD_MAX}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="border-[#3f4147] bg-[#1e1f22] text-white focus:ring-accent"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#949ba4]">
                    New password
                  </span>
                  <PasswordInput
                    autoComplete="new-password"
                    minLength={PASSWORD_MIN}
                    maxLength={PASSWORD_MAX}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="border-[#3f4147] bg-[#1e1f22] text-white focus:ring-accent"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-[#949ba4]">
                    Confirm new password
                  </span>
                  <PasswordInput
                    autoComplete="new-password"
                    minLength={PASSWORD_MIN}
                    maxLength={PASSWORD_MAX}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="border-[#3f4147] bg-[#1e1f22] text-white focus:ring-accent"
                  />
                </label>

                <button
                  type="submit"
                  disabled={busy || googleBusy}
                  className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                >
                  {busy ? "Updating…" : "Update Password"}
                </button>
              </form>
            ) : (
              <p className="rounded-md border border-white/10 bg-[#1e1f22] px-3 py-3 text-sm text-[#b5bac1]">
                This account signed in with Google. There is no password to
                change here.
              </p>
            )}
          </section>

          {error && (
            <p className="rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-md border border-[#23a559]/40 bg-[#23a559]/10 px-3 py-2 text-sm text-[#23a559]">
              {success}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
