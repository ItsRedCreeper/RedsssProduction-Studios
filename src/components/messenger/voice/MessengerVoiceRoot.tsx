"use client";

import type { ReactNode } from "react";
import { VoiceSessionProvider } from "@/components/messenger/voice/VoiceSessionProvider";

export function MessengerVoiceRoot({ children }: { children: ReactNode }) {
  return <VoiceSessionProvider>{children}</VoiceSessionProvider>;
}
