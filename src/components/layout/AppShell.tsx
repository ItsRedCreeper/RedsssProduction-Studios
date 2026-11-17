"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { ProfileProvider } from "@/components/profile/ProfileProvider";
import { SiteActivityTracker } from "@/components/layout/SiteActivityTracker";
import { PresenceController } from "@/components/presence/PresenceController";
import { PresenceFeedProvider } from "@/components/presence/PresenceFeed";
import { VoiceSessionProvider } from "@/components/messenger/voice/VoiceSessionProvider";

export function AppShell({ children }: { children: ReactNode }) {
  // PresenceFeed must wrap ProfileProvider so small/big profile modals
  // (rendered beside children inside ProfileProvider) can read live presence.
  return (
    <VoiceSessionProvider>
      <PresenceFeedProvider>
        <ProfileProvider>
          <PresenceController />
          <Suspense
            fallback={
              <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/95 backdrop-blur-md" />
            }
          >
            <Navbar />
          </Suspense>
          <SiteActivityTracker />
          <main className="relative z-10 flex min-h-0 flex-1 flex-col">
            {children}
          </main>
        </ProfileProvider>
      </PresenceFeedProvider>
    </VoiceSessionProvider>
  );
}
