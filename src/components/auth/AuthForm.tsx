"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { messageForAuthError } from "@/lib/auth-oauth";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

type AuthFormProps = {
  nextPath?: string;
};

function friendlyAuthError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("email not confirmed")) {
    return "This account still needs email confirmation.";
  }
  if (lower.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (
    lower.includes("duplicate") ||
    lower.includes("unique") ||
    lower.includes("profiles_username")
  ) {
    return "That username is already taken.";
  }
  if (
    lower.includes("provider is not enabled") ||
    lower.includes("unsupported provider")
  ) {
    return "Google sign-in isn’t available right now.";
  }
  return message;
}

export function AuthForm({ nextPath = "/" }: AuthFormProps) {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const mapped = messageForAuthError(searchParams.get("error"));
    if (mapped) setError(mapped);
  }, [searchParams]);

  function goAfterAuth() {
    const target = nextPath.startsWith("/") ? nextPath : "/";
    // Full navigation so the proxy reliably reads the new session cookies.
    window.location.assign(target);
  }

  async function handleGoogle() {
    setError(null);
    setMessage(null);
    setGoogleLoading(true);
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      nextPath.startsWith("/") ? nextPath : "/",
    )}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (oauthError) {
      setError(friendlyAuthError(oauthError.message));
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = createClient();
    const cleanEmail = email.trim();

    try {
      if (mode === "signup") {
        const trimmedUsername = username.trim();
        if (trimmedUsername.length < 3) {
          setError("Username must be at least 3 characters.");
          return;
        }

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { username: trimmedUsername },
          },
        });

        if (signUpError) {
          setError(friendlyAuthError(signUpError.message));
          return;
        }

        if (data.session) {
          goAfterAuth();
          return;
        }

        // Autoconfirm may already be on — try signing in immediately.
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!signInError) {
          goAfterAuth();
          return;
        }

        setError(friendlyAuthError(signInError.message));
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword(
        {
          email: cleanEmail,
          password,
        },
      );

      if (signInError) {
        setError(friendlyAuthError(signInError.message));
        return;
      }

      if (!data.session) {
        setError("Sign-in failed. Try again.");
        return;
      }

      goAfterAuth();
    } finally {
      setLoading(false);
    }
  }

  const busy = loading || googleLoading;

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl shadow-black/40">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {mode === "login" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "login"
            ? "Access RedsssMessenger and your studio tools."
            : "Join RedsssProduction Studios with email and password."}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-border bg-black/40 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
            setMessage(null);
          }}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "login"
              ? "bg-accent text-white"
              : "text-muted hover:text-foreground"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError(null);
            setMessage(null);
          }}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === "signup"
              ? "bg-accent text-white"
              : "text-muted hover:text-foreground"
          }`}
        >
          Sign up
        </button>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void handleGoogle()}
        className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#3f4147] bg-[#1e1f22] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2b2d31] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-5 w-5 shrink-0"
        >
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        {googleLoading ? "Redirecting…" : "Continue with Google"}
      </button>

      <div className="mb-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          or
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Username
            </span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={32}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent-ring"
              placeholder="GamerName"
              autoComplete="username"
            />
          </label>
        )}

        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent-ring"
            placeholder="you@email.com"
            autoComplete="email"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Password
          </span>
          <PasswordInput
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
        </label>

        {error && (
          <p className="rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </div>
  );
}
