import { Suspense } from "react";
import { MessengerShell } from "@/components/messenger/MessengerShell";

type MessengerLayoutProps = {
  discover?: boolean;
};

export function MessengerLayout({ discover = false }: MessengerLayoutProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-[var(--ms-chat)] text-sm text-[var(--ms-text-muted)]">
          Loading messenger…
        </div>
      }
    >
      <MessengerShell discover={discover} />
    </Suspense>
  );
}
