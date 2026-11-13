"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  messengerHomePath,
  recallMessengerPath,
} from "@/lib/messenger-routes";

export function MessengerEntry() {
  const router = useRouter();

  useEffect(() => {
    const last = recallMessengerPath();
    if (
      last &&
      last.startsWith("/messenger/") &&
      last !== "/messenger" &&
      last !== "/messenger/"
    ) {
      router.replace(last);
      return;
    }
    router.replace(messengerHomePath());
  }, [router]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem-2.75rem)] items-center justify-center bg-[#313338] text-sm text-muted md:h-[calc(100dvh-3.5rem)]">
      Opening messenger…
    </div>
  );
}
