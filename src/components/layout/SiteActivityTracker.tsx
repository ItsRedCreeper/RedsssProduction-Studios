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
    if (!next) return;
    const key = next.type;
    if (key === lastKey.current) return;
    lastKey.current = key;
    void setUserActivity({
      type: next.type,
      contextName: next.name ?? null,
      isPublic: true,
    });
  }, [pathname]);

  return null;
}
