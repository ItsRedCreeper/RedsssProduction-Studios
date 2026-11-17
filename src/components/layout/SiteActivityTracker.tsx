"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { setUserActivity, type ActivityType } from "@/lib/activity";

function activityForPath(pathname: string): {
  type: ActivityType;
  name?: string;
} | null {
  if (pathname.startsWith("/messenger")) return null;
  if (pathname === "/" || pathname.startsWith("/home")) {
    return { type: "home" };
  }
  if (pathname.startsWith("/games")) return { type: "games" };
  if (pathname.startsWith("/reports")) return { type: "reports" };
  if (pathname.startsWith("/funding")) return { type: "funding" };
  if (pathname.startsWith("/discover")) return { type: "discover" };
  return null;
}

/** Tracks non-messenger page activity (Home, Games, Reports, Funding). */
export function SiteActivityTracker() {
  const pathname = usePathname();
  const lastKey = useRef("");

  useEffect(() => {
    const next = activityForPath(pathname);
    if (!next) {
      // Entering messenger — clear local lock so ActivityTracker always wins.
      lastKey.current = "";
      return;
    }
    const key = next.type;
    if (key === lastKey.current) return;
    let cancelled = false;
    void (async () => {
      const { error } = await setUserActivity({
        type: next.type,
        contextName: next.name ?? null,
        isPublic: true,
      });
      if (!cancelled && !error) lastKey.current = key;
    })();

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const again = activityForPath(pathname);
      if (!again || again.type !== key) return;
      lastKey.current = "";
      void setUserActivity({
        type: again.type,
        contextName: again.name ?? null,
        isPublic: true,
      }).then(({ error }) => {
        if (!error) lastKey.current = key;
      });
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return null;
}
