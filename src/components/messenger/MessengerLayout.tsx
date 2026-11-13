import { Suspense } from "react";
import { MessengerShell } from "@/components/messenger/MessengerShell";

type MessengerLayoutProps = {
  discover?: boolean;
};

export function MessengerLayout({ discover = false }: MessengerLayoutProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100dvh-3.5rem-2.75rem)] items-center justify-center bg-[#313338] text-sm text-muted md:h-[calc(100dvh-3.5rem)]">
          Loading messenger…
        </div>
      }
    >
      <MessengerShell discover={discover} />
    </Suspense>
  );
}
