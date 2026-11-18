/** Shared OAuth / account-linking helpers for Google sign-in. */

export const AUTH_ERROR = {
  callback: "auth_callback",
  emailExists: "email_exists",
  cancelled: "cancelled",
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR)[keyof typeof AUTH_ERROR];

export function mapOAuthRedirectError(
  error: string | null,
  description: string | null,
): AuthErrorCode | null {
  if (!error) return null;

  const code = error.toLowerCase();
  const detail = (description ?? "").toLowerCase();

  // User closed / denied the Google consent screen.
  if (
    code === "access_denied" ||
    code === "user_cancelled" ||
    detail.includes("access_denied") ||
    detail.includes("cancel")
  ) {
    return AUTH_ERROR.cancelled;
  }

  // Same email already registered and automatic linking could not finish.
  if (
    detail.includes("already been registered") ||
    detail.includes("already registered") ||
    detail.includes("email address is already") ||
    detail.includes("identity is already linked") ||
    detail.includes("user already exists") ||
    code === "user_already_exists" ||
    code === "identity_already_exists"
  ) {
    return AUTH_ERROR.emailExists;
  }

  return AUTH_ERROR.callback;
}

export function messageForAuthError(code: string | null): string | null {
  if (!code || code === AUTH_ERROR.cancelled) return null;
  if (code === AUTH_ERROR.emailExists) {
    return "An account with this email already exists. Please log in with your password, then you can connect Google from Account Settings later.";
  }
  if (code === AUTH_ERROR.callback) {
    return "Sign-in failed. Try again.";
  }
  return null;
}

export function profileSeedFromUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const meta = user.user_metadata ?? {};
  const username =
    (typeof meta.username === "string" && meta.username.trim()) ||
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    (user.email ? user.email.split("@")[0] : "") ||
    `user_${user.id.slice(0, 8)}`;

  const avatarUrl =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    null;

  return {
    id: user.id,
    username,
    avatar_url: avatarUrl,
  };
}
