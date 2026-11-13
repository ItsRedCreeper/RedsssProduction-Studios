"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SiteLogo } from "@/components/layout/SiteLogo";
import {
  FriendsPanel,
  type FriendListItem,
} from "@/components/layout/FriendsPanel";
import { NotificationsPanel } from "@/components/layout/NotificationsPanel";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useOptionalVoiceSession } from "@/components/messenger/voice/VoiceSessionProvider";
import { statusDotClass, statusLabel } from "@/components/messenger/data";
import { NAV_LINKS } from "@/lib/nav";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading } = useCurrentProfile();
  const voice = useOptionalVoiceSession();
  const speaking = !!voice?.selfSpeaking;
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handleMessage = (_friend: FriendListItem) => {
    setFriendsOpen(false);
  };

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const displayName = profile?.username ?? (loading ? "…" : "Guest");

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-5">
          <Link
            href="/"
            className="flex min-w-0 shrink-0 items-center gap-2.5 transition-opacity hover:opacity-90"
          >
            <SiteLogo />
            <span className="hidden truncate text-sm font-semibold tracking-tight text-foreground sm:inline md:max-w-[11rem] lg:max-w-none">
              RedsssProduction Studios
            </span>
            <span className="truncate text-sm font-semibold tracking-tight text-foreground sm:hidden">
              Redsss
            </span>
          </Link>

          <nav
            className="hidden flex-1 items-center justify-center gap-0.5 md:flex"
            aria-label="Primary"
          >
            {NAV_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "text-accent"
                      : "text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  {link.label}
                  {active && (
                    <span className="absolute inset-x-2 -bottom-[calc(0.5rem+1px)] h-0.5 rounded-full bg-accent" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              className={`relative rounded-md p-2 transition-colors ${
                notificationsOpen
                  ? "bg-accent-muted text-accent"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen(true)}
            >
              <Bell className="h-5 w-5" strokeWidth={1.75} />
              {unreadNotifications > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`rounded-md p-2 transition-colors ${
                friendsOpen
                  ? "bg-accent-muted text-accent"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
              aria-label="Friends"
              aria-expanded={friendsOpen}
              onClick={() => setFriendsOpen(true)}
            >
              <Users className="h-5 w-5" strokeWidth={1.75} />
            </button>

            <div className="ml-1 flex items-center gap-2.5">
              <span
                className="relative shrink-0"
                title={statusLabel(profile?.status)}
              >
                <UserAvatar
                  username={displayName}
                  avatarUrl={profile?.avatar_url}
                  size="lg"
                  speaking={speaking}
                  className={speaking ? "!ring-offset-background" : ""}
                />
                <span
                  className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-background ${statusDotClass(profile?.status)}`}
                  aria-label={statusLabel(profile?.status)}
                />
              </span>
              <span className="hidden max-w-[10rem] truncate text-sm font-semibold text-foreground sm:inline">
                {displayName}
              </span>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        <nav
          className="flex gap-1 overflow-x-auto border-t border-border px-2 py-1.5 md:hidden"
          aria-label="Primary mobile"
        >
          {NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-accent-muted text-accent ring-1 ring-accent/40"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <FriendsPanel
        open={friendsOpen}
        onClose={() => setFriendsOpen(false)}
        onMessage={handleMessage}
        userId={user?.id ?? null}
      />

      <NotificationsPanel
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        userId={user?.id ?? null}
        onUnreadChange={setUnreadNotifications}
      />

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm text-foreground shadow-lg shadow-black/40"
          role="status"
        >
          {toast}
        </div>
      )}
    </>
  );
}
