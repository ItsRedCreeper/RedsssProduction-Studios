"use client";

import type { ReactNode } from "react";
import { Suspense } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { VoiceSessionProvider } from "@/components/messenger/voice/VoiceSessionProvider";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <VoiceSessionProvider>
      <Suspense
        fallback={
          <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/95 backdrop-blur-md" />
        }
      >
        <Navbar />
      </Suspense>
      <main className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</main>
    </VoiceSessionProvider>
  );
}
