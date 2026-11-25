import { Suspense } from "react";
import { MessengerShell } from "@/components/messenger/MessengerShell";

type MessengerLayoutProps = {
  discover?: boolean;
};

export function MessengerLayout({ discover = false }: MessengerLayoutProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-[#313338] text-sm text-[#949ba4]">
          Loading messenger…
        </div>
      }
    >
      <MessengerShell discover={discover} />
    </Suspense>
  );
}
