"use client";

import dynamic from "next/dynamic";

const MessengerShell = dynamic(
  () =>
    import("@/components/messenger/MessengerShell").then((m) => ({
      default: m.MessengerShell,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-[var(--ms-chat)] text-sm text-[var(--ms-text-muted)]">
        Loading messenger…
      </div>
    ),
  },
);

type MessengerLayoutProps = {
  discover?: boolean;
};

export function MessengerLayout({ discover = false }: MessengerLayoutProps) {
  return <MessengerShell discover={discover} />;
}
