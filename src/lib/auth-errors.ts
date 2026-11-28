/** Detect expired / missing auth from Supabase client error text. */
export function isAuthFailureMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("jwt expired") ||
    m.includes("invalid jwt") ||
    m.includes("jwt malformed") ||
    m.includes("not authenticated") ||
    m.includes("auth session missing") ||
    m.includes("session from session_id claim in jwt does not exist") ||
    m.includes("refresh_token_not_found") ||
    m.includes("invalid refresh token") ||
    /\b401\b/.test(m) ||
    m.includes("unauthorized")
  );
}

export const SESSION_EXPIRED_MESSAGE =
  "Your session expired. Sign in again to continue — your draft was kept.";

/** Prefer a clear session-expired message when the failure looks like auth. */
export function userFacingActionError(
  message: string | null | undefined,
  fallback: string,
): string {
  if (isAuthFailureMessage(message)) return SESSION_EXPIRED_MESSAGE;
  return (message && message.trim()) || fallback;
}
