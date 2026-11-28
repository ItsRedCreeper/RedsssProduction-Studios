"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { ProfileProvider } from "@/components/profile/ProfileProvider";
import { SiteActivityTracker } from "@/components/layout/SiteActivityTracker";
import { PresenceController } from "@/components/presence/PresenceController";
import { PresenceFeedProvider } from "@/components/presence/PresenceFeed";
import { VoiceSessionProvider } from "@/components/messenger/voice/VoiceSessionProvider";
import { CallSessionProvider } from "@/components/messenger/voice/CallSessionProvider";
import { UnreadProvider } from "@/components/notifications/UnreadProvider";

/**
 * SSR + first client paint use this shell so hydration always matches.
 * Cursor's IDE browser injects `data-cursor-ref` into the live DOM before
 * React hydrates interactive trees; mounting the real chrome after paint
 * avoids that attribute mismatch (and the Next.js issues badge).
 */
function AppShellFrame({
  lockViewport,
  children,
}: {
  lockViewport: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden">
      {children ?? (
        <>
          <header className="z-30 h-14 shrink-0 border-b border-[var(--ms-border,#1e1f22)] bg-[var(--ms-rail,#1a1b1e)]/95 backdrop-blur-md" />
          <main
            className={`relative z-10 flex min-h-0 min-w-0 flex-1 flex-col ${
              lockViewport ? "overflow-hidden border-t-0" : "overflow-y-auto"
            }`}
          />
        </>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const lockViewport =
    pathname === "/messenger" || pathname.startsWith("/messenger/");
  const [mounted, setMounted] = useState(false);
  // Messenger boot: delay unread/presence network so channel loads win the pool.
  // Voice/Call stay mounted (MessengerShell requires the context) but restore is deferred inside.
  const [secondaryReady, setSecondaryReady] = useState(!lockViewport);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!lockViewport) {
      setSecondaryReady(true);
      return;
    }
    setSecondaryReady(false);
    const timer = window.setTimeout(() => setSecondaryReady(true), 2_000);
    return () => window.clearTimeout(timer);
  }, [lockViewport]);

  // Omit interactive chrome + page until mount so Cursor's injected
  // `data-cursor-ref` attrs can't mismatch SSR HTML. Pages under (app)
  // set `export const instant = false` because children are deferred.
  if (!mounted) {
    return <AppShellFrame lockViewport={lockViewport} />;
  }

  // PresenceFeed must wrap ProfileProvider so small/big profile modals
  // (rendered beside children inside ProfileProvider) can read live presence.
  const chrome = (
    <AppShellFrame lockViewport={lockViewport}>
      {secondaryReady ? <PresenceController /> : null}
      <Suspense
        fallback={
          <header className="z-30 h-14 shrink-0 border-b border-[var(--ms-border,#1e1f22)] bg-[var(--ms-rail,#1a1b1e)]/95 backdrop-blur-md" />
        }
      >
        <Navbar />
      </Suspense>
      <SiteActivityTracker />
      <main
        className={`relative z-10 flex min-h-0 min-w-0 flex-1 flex-col ${
          lockViewport ? "overflow-hidden border-t-0" : "overflow-y-auto"
        }`}
      >
        {children}
      </main>
    </AppShellFrame>
  );

  return (
    <VoiceSessionProvider>
      <CallSessionProvider>
        <PresenceFeedProvider>
          <ProfileProvider>
            {secondaryReady ? (
              <UnreadProvider>{chrome}</UnreadProvider>
            ) : (
              chrome
            )}
          </ProfileProvider>
        </PresenceFeedProvider>
      </CallSessionProvider>
    </VoiceSessionProvider>
  );
}
