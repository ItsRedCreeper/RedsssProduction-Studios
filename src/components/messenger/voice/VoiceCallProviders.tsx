"use client";

import type { ReactNode } from "react";
import { VoiceSessionProvider } from "@/components/messenger/voice/VoiceSessionProvider";
import { CallSessionProvider } from "@/components/messenger/voice/CallSessionProvider";

/** Heavy voice/call stack — loaded only after messenger is visited. */
export function VoiceCallProviders({ children }: { children: ReactNode }) {
  return (
    <VoiceSessionProvider>
      <CallSessionProvider>{children}</CallSessionProvider>
    </VoiceSessionProvider>
  );
}
