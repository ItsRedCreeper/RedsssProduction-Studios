"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, LogOut, Menu, Settings, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SiteLogo } from "@/components/layout/SiteLogo";
import {
  FriendsPanel,
  type FriendListItem,
} from "@/components/layout/FriendsPanel";
import { NotificationsPanel } from "@/components/layout/NotificationsPanel";
import { AccountSettingsModal } from "@/components/settings/AccountSettingsModal";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { createClient } from "@/lib/supabase/client";
import { useOptionalVoiceSession } from "@/components/messenger/voice/VoiceSessionProvider";
import { useProfileUi } from "@/components/profile/ProfileProvider";
import { NAV_LINKS } from "@/lib/nav";
import { messengerDmPath, messengerHomePath } from "@/lib/messenger-routes";
import { ensureDmConversation } from "@/lib/friends";
import { HoverTip } from "@/components/ui/HoverTip";
import { UserPresenceBar } from "@/components/messenger/UserPresenceBar";
import { useOptionalUnread } from "@/components/notifications/UnreadProvider";
import { formatUnreadCount, UNREAD_BADGE_RED } from "@/lib/unread";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useCurrentProfile();
  const voice = useOptionalVoiceSession();
  const profileUi = useProfileUi();
  const speaking = !!voice?.selfSpeaking;
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const unreadFeed = useOptionalUnread();
  const bellCount = unreadFeed?.bellCount ?? unreadNotifications;
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const handleMessage = useCallback(
    (friend: FriendListItem) => {
      profileUi.closeFriends();
      void (async () => {
        const { conversationId } = await ensureDmConversation(friend.id);
        router.push(
          conversationId ? messengerDmPath(conversationId) : messengerHomePath(),
        );
      })();
    },
    [profileUi, router],
  );

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="relative z-30 shrink-0 overflow-visible border-b border-[var(--ms-border,#1e1f22)] bg-[var(--ms-rail,#1a1b1e)]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full min-w-0 max-w-[1600px] items-center gap-2 px-2 sm:gap-3 sm:px-5">
          <button
            type="button"
            suppressHydrationWarning
            className="rounded-md p-2 text-muted hover:bg-surface-hover hover:text-foreground lg:hidden"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? (
              <X className="h-5 w-5" strokeWidth={1.75} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            )}
          </button>
          <Link
            href="/"
            suppressHydrationWarning
            className="flex min-w-0 shrink items-center gap-2 transition-opacity hover:opacity-90 sm:gap-2.5"
          >
            <SiteLogo />
            <HoverTip
              label="RedsssProduction Studios"
              onlyIfTruncated
              delayMs={40}
              className="min-w-0 max-w-[11rem] sm:max-w-[14rem] md:max-w-[18rem] lg:max-w-none"
            >
              <span className="block truncate text-sm font-semibold tracking-tight text-foreground">
                RedsssProduction Studios
              </span>
            </HoverTip>
          </Link>

          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex"
            aria-label="Primary"
            suppressHydrationWarning
          >
            {NAV_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  suppressHydrationWarning
                  className={`relative shrink-0 rounded-md px-2 py-1.5 text-sm font-medium transition-colors xl:px-3 ${
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

          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-2">
            <HoverTip label="Notifications">
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
                {bellCount > 0 && (
                  <span
                    className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                    style={{ backgroundColor: UNREAD_BADGE_RED }}
                  >
                    {formatUnreadCount(bellCount)}
                  </span>
                )}
              </button>
            </HoverTip>
            <HoverTip label="Friends">
              <button
                type="button"
                className={`rounded-md p-2 transition-colors ${
                  profileUi.friendsOpen
                    ? "bg-accent-muted text-accent"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
                aria-label="Friends"
                aria-expanded={profileUi.friendsOpen}
                onClick={() => profileUi.openFriends("friends")}
              >
                <Users className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </HoverTip>

            <div className="ml-1 flex items-center gap-1.5 sm:gap-2">
              {user && (
                <HoverTip label="Account settings">
                  <button
                    type="button"
                    className={`rounded-md p-2 transition-colors ${
                      accountSettingsOpen
                        ? "bg-accent-muted text-accent"
                        : "text-muted hover:bg-surface-hover hover:text-foreground"
                    }`}
                    aria-label="Account settings"
                    aria-expanded={accountSettingsOpen}
                    onClick={() => setAccountSettingsOpen(true)}
                  >
                    <Settings className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                </HoverTip>
              )}
              {user ? (
                <>
                  <UserPresenceBar speaking={speaking} />
                  <HoverTip label="Log Out" delayMs={40}>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                      aria-label="Sign out"
                    >
                      <LogOut className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </HoverTip>
                </>
              ) : (
                <Link
                  href={`/login?next=${encodeURIComponent(
                    `${pathname || "/"}${
                      searchParams.toString()
                        ? `?${searchParams.toString()}`
                        : ""
                    }`,
                  )}`}
                  className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>

        {navOpen ? (
          <nav
            className="absolute inset-x-0 top-full z-40 border-b border-[var(--ms-border,#1e1f22)] bg-[var(--ms-rail,#1a1b1e)] py-1 shadow-xl shadow-black/40 lg:hidden"
            aria-label="Primary mobile"
          >
            {NAV_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block px-4 py-2.5 text-sm font-medium ${
                    active
                      ? "bg-accent-muted text-accent"
                      : "text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                  onClick={() => setNavOpen(false)}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </header>

      <FriendsPanel
        open={profileUi.friendsOpen}
        onClose={profileUi.closeFriends}
        onMessage={handleMessage}
        userId={user?.id ?? null}
        initialTab={profileUi.friendsTab}
      />

      <NotificationsPanel
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        userId={user?.id ?? null}
        onUnreadChange={setUnreadNotifications}
        onOpenFriends={(tab) => {
          setNotificationsOpen(false);
          profileUi.openFriends(tab);
        }}
      />

      <AccountSettingsModal
        open={accountSettingsOpen}
        user={user}
        onClose={() => setAccountSettingsOpen(false)}
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
