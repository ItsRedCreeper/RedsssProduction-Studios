"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

type AuthFormProps = {
  nextPath?: string;
};

function friendlyAuthError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("email not confirmed")) {
    return "This account still needs email confirmation. Ask an admin to confirm it, or create a new account now that confirmation is disabled.";
  }
  if (lower.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }
  return message;
}

export function AuthForm({ nextPath = "/" }: AuthFormProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function goAfterAuth() {
    const target = nextPath.startsWith("/") ? nextPath : "/";
    // Full navigation so the proxy reliably reads the new session cookies.
    window.location.assign(target);
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
        setError("Sign-in succeeded but no session was returned. Try again.");
        return;
      }

      goAfterAuth();
    } finally {
      setLoading(false);
    }
  }

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
              placeholder="RedsssAdmin"
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
            placeholder="you@studio.dev"
            autoComplete="email"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Password
          </span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-accent/60 focus:ring-1 focus:ring-accent-ring"
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
          disabled={loading}
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
