"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { ProfileProvider } from "@/components/profile/ProfileProvider";
import { SiteActivityTracker } from "@/components/layout/SiteActivityTracker";
import { PresenceController } from "@/components/presence/PresenceController";
import { PresenceFeedProvider } from "@/components/presence/PresenceFeed";
import { VoiceSessionProvider } from "@/components/messenger/voice/VoiceSessionProvider";
import { CallSessionProvider } from "@/components/messenger/voice/CallSessionProvider";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const lockViewport =
    pathname === "/messenger" || pathname.startsWith("/messenger/");

  // PresenceFeed must wrap ProfileProvider so small/big profile modals
  // (rendered beside children inside ProfileProvider) can read live presence.
  return (
    <VoiceSessionProvider>
      <CallSessionProvider>
        <PresenceFeedProvider>
          <ProfileProvider>
            <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden">
              <PresenceController />
              <Suspense
                fallback={
                  <header className="z-30 h-14 shrink-0 border-b border-border bg-background/95 backdrop-blur-md" />
                }
              >
                <Navbar />
              </Suspense>
              <SiteActivityTracker />
              <main
                className={`relative z-10 flex min-h-0 min-w-0 flex-1 flex-col ${
                  lockViewport ? "overflow-hidden" : "overflow-y-auto"
                }`}
              >
                {children}
              </main>
            </div>
          </ProfileProvider>
        </PresenceFeedProvider>
      </CallSessionProvider>
    </VoiceSessionProvider>
  );
}
