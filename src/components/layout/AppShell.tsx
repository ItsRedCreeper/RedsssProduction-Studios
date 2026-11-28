"use client";

import {
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { ProfileProvider } from "@/components/profile/ProfileProvider";
import { PresenceController } from "@/components/presence/PresenceController";
import { PresenceFeedProvider } from "@/components/presence/PresenceFeed";
import { UnreadProvider } from "@/components/notifications/UnreadProvider";

const SiteActivityTracker = dynamic(
  () =>
    import("@/components/layout/SiteActivityTracker").then((m) => ({
      default: m.SiteActivityTracker,
    })),
  { ssr: false },
);

type VoiceStackProps = { children: ReactNode };

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
  const [secondaryReady, setSecondaryReady] = useState(!lockViewport);
  // Voice/call ~3k lines + WebRTC — keep out of the home bundle; load on messenger
  // immediately, otherwise after idle. Once loaded, stay mounted for call continuity.
  const [VoiceStack, setVoiceStack] = useState<ComponentType<VoiceStackProps> | null>(
    null,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (VoiceStack) return;
    let cancelled = false;
    const load = () => {
      void import("@/components/messenger/voice/VoiceCallProviders").then(
        (mod) => {
          if (!cancelled) setVoiceStack(() => mod.VoiceCallProviders);
        },
      );
    };
    if (lockViewport) {
      load();
      return () => {
        cancelled = true;
      };
    }
    const ric = window.requestIdleCallback?.(load, { timeout: 900 });
    const timer =
      ric == null ? window.setTimeout(load, 50) : null;
    return () => {
      cancelled = true;
      if (ric != null) window.cancelIdleCallback?.(ric);
      if (timer != null) window.clearTimeout(timer);
    };
  }, [VoiceStack, lockViewport]);

  useEffect(() => {
    if (!lockViewport) {
      setSecondaryReady(true);
      return;
    }
    setSecondaryReady(false);
    // Short yield so messenger servers/messages start first without a noticeable lag.
    const timer = window.setTimeout(() => setSecondaryReady(true), 400);
    return () => window.clearTimeout(timer);
  }, [lockViewport]);

  // Omit interactive chrome + page until mount so Cursor's injected
  // `data-cursor-ref` attrs can't mismatch SSR HTML. Pages under (app)
  // set `export const instant = false` because children are deferred.
  if (!mounted) {
    return <AppShellFrame lockViewport={lockViewport} />;
  }

  // Messenger needs voice/call context before shell mounts (useVoiceSession throws).
  if (lockViewport && !VoiceStack) {
    return (
      <AppShellFrame lockViewport>
        <header className="z-30 h-14 shrink-0 border-b border-[var(--ms-border,#1e1f22)] bg-[var(--ms-rail,#1a1b1e)]/95 backdrop-blur-md" />
        <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden border-t-0 bg-[var(--ms-chat,#313338)] text-sm text-[var(--ms-text-muted,#949ba4)]">
          Opening messenger…
        </main>
      </AppShellFrame>
    );
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
      {secondaryReady ? <SiteActivityTracker /> : null}
      <main
        className={`relative z-10 flex min-h-0 min-w-0 flex-1 flex-col ${
          lockViewport ? "overflow-hidden border-t-0" : "overflow-y-auto"
        }`}
      >
        {children}
      </main>
    </AppShellFrame>
  );

  const withUnread = secondaryReady ? (
    <UnreadProvider>{chrome}</UnreadProvider>
  ) : (
    chrome
  );

  const withProfile = (
    <PresenceFeedProvider>
      <ProfileProvider>{withUnread}</ProfileProvider>
    </PresenceFeedProvider>
  );

  if (VoiceStack) {
    return <VoiceStack>{withProfile}</VoiceStack>;
  }

  return withProfile;
}
