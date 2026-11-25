"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  messengerHomePath,
  recallMessengerPath,
} from "@/lib/messenger-routes";

function resolveEntryTarget() {
  const last = recallMessengerPath();
  if (
    last &&
    /^\/messenger\/(channels|discover)(\/|$)/.test(last) &&
    last !== "/messenger" &&
    last !== "/messenger/"
  ) {
    return last;
  }
  return messengerHomePath();
}

export function MessengerEntry() {
  const router = useRouter();
  const [stuck, setStuck] = useState(false);
  const [target] = useState(resolveEntryTarget);

  useEffect(() => {
    router.replace(target);
    const timer = window.setTimeout(() => setStuck(true), 2500);
    return () => window.clearTimeout(timer);
  }, [router, target]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-[#313338] px-4 text-sm text-[#949ba4]">
      <p>Opening messenger…</p>
      {stuck ? (
        <a
          href={target}
          className="font-semibold text-white underline-offset-2 hover:underline"
        >
          Continue
        </a>
      ) : null}
    </div>
  );
}
