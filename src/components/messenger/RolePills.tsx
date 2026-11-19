"use client";

import type { Role } from "@/components/messenger/types";
import { ensureReadableRoleColor } from "@/lib/roles";

type RolePillsProps = {
  roles: Role[];
  className?: string;
  /** Compact for small profile card. */
  size?: "sm" | "md";
};

export function RolePills({
  roles,
  className = "",
  size = "md",
}: RolePillsProps) {
  if (roles.length === 0) return null;
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]";
  const dot = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {roles.map((role) => {
        const color = ensureReadableRoleColor(role.color || "#99aab5");
        return (
          <span
            key={role.id}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-md font-medium text-[#dbdee1] ${pad}`}
            style={{ backgroundColor: `${color}22`, border: `1px solid ${color}55` }}
            title={role.name}
          >
            <span
              className={`shrink-0 rounded-full ${dot}`}
              style={{ backgroundColor: color }}
              aria-hidden
            />
            <span className="truncate">{role.name}</span>
          </span>
        );
      })}
    </div>
  );
}
