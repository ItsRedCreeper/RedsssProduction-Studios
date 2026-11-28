import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

/** AppShell defers chrome until client mount (Cursor hydration workaround). */
export const instant = false;

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
