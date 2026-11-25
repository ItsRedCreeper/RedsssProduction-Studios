"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useOptionalVoiceSession } from "@/components/messenger/voice/VoiceSessionProvider";
import { useProfileUi } from "@/components/profile/ProfileProvider";
import { statusLabel } from "@/components/messenger/data";
import { LiveStatusDot } from "@/components/presence/LiveStatusDot";
import { resolveDisplayStatus } from "@/lib/presence";
import { NAV_LINKS } from "@/lib/nav";
import { messengerDmPath, messengerHomePath } from "@/lib/messenger-routes";
import { ensureDmConversation } from "@/lib/friends";
import { HoverTip } from "@/components/ui/HoverTip";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading } = useCurrentProfile();
  const voice = useOptionalVoiceSession();
  const profileUi = useProfileUi();
  const speaking = !!voice?.selfSpeaking;
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const onMessenger = pathname.startsWith("/messenger");
  const [unreadNotifications, setUnreadNotifications] = useState(0);
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

  const displayName = profile?.username ?? (loading ? "…" : "Guest");

  return (
    <>
      <header
        className={`relative z-30 shrink-0 overflow-x-hidden border-b bg-background/95 backdrop-blur-md ${
          onMessenger ? "border-[#1e1f22]" : "border-border"
        }`}
      >
        <div className="mx-auto flex h-14 w-full min-w-0 max-w-[1600px] items-center gap-2 px-2 sm:gap-3 sm:px-5">
          <button
            type="button"
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
            className="flex min-w-0 shrink items-center gap-2 transition-opacity hover:opacity-90 sm:gap-2.5"
          >
            <SiteLogo />
            <span className="hidden truncate text-sm font-semibold tracking-tight text-foreground xl:inline">
              RedsssProduction Studios
            </span>
            <span className="hidden truncate text-sm font-semibold tracking-tight text-foreground sm:inline xl:hidden">
              Redsss
            </span>
          </Link>

          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex"
            aria-label="Primary"
          >
            {NAV_LINKS.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
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
                {unreadNotifications > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
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

            <div className="ml-1 flex items-center gap-1.5 sm:gap-2.5">
              {user && (
                <HoverTip label="User Settings">
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
              <button
                type="button"
                className="relative shrink-0"
                aria-label={
                  user
                    ? statusLabel(
                        resolveDisplayStatus(
                          profile?.status,
                          profile?.last_seen_at,
                        ),
                      )
                    : "Profile"
                }
                onClick={() => {
                  if (!user) return;
                  void profileUi.openBigProfile(user.id);
                }}
              >
                <UserAvatar
                  username={displayName}
                  avatarUrl={profile?.avatar_url}
                  size="lg"
                  speaking={speaking}
                  className={speaking ? "!ring-offset-background" : ""}
                />
                {user && (
                  <LiveStatusDot
                    userId={user.id}
                    status={profile?.status}
                    lastSeenAt={profile?.last_seen_at}
                    size="md"
                    ringClassName="ring-2 ring-background"
                  />
                )}
              </button>
              <HoverTip
                label={displayName}
                onlyIfTruncated
                delayMs={40}
                className="hidden max-w-[8rem] xl:inline-flex"
              >
                <button
                  type="button"
                  className="max-w-[8rem] truncate text-sm font-semibold text-foreground"
                  onClick={() => {
                    if (!user) return;
                    void profileUi.openBigProfile(user.id);
                  }}
                >
                  {displayName}
                </button>
              </HoverTip>
              {user ? (
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
              ) : (
                <Link
                  href={`/login?next=${encodeURIComponent(pathname || "/")}`}
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
            className={`absolute inset-x-0 top-full z-40 border-b bg-background py-1 shadow-xl shadow-black/40 lg:hidden ${
              onMessenger ? "border-[#1e1f22]" : "border-border"
            }`}
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
