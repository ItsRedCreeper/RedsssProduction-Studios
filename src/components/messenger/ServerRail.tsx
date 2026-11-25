"use client";

import { Compass, MessagesSquare, Plus } from "lucide-react";
import { ServerRailButton } from "@/components/messenger/ServerRailButton";
import {
  serverInitials,
  serverInitialsClass,
} from "@/lib/server-initials";
import type { Server } from "@/components/messenger/types";

type ServerRailProps = {
  servers: Server[];
  activeServerId: string | null;
  unreadServerIds: Set<string>;
  homeActive: boolean;
  discoverActive: boolean;
  loading: boolean;
  onHome: () => void;
  onSelectServer: (serverId: string) => void;
  onCreate: () => void;
  onDiscover: () => void;
};

function iconShell(active: boolean) {
  return active
    ? "rounded-2xl bg-[#3a3c43] text-white ring-2 ring-accent/70"
    : "rounded-2xl bg-[var(--ms-sidebar)] text-[var(--ms-text)] ring-1 ring-white/5 group-hover/server:bg-[#35373c] group-hover/server:text-white group-hover/server:ring-white/10";
}

export function ServerRail({
  servers,
  activeServerId,
  unreadServerIds,
  homeActive,
  discoverActive,
  loading,
  onHome,
  onSelectServer,
  onCreate,
  onDiscover,
}: ServerRailProps) {
  return (
    <aside className="flex w-16 shrink-0 flex-col items-stretch gap-1 overflow-x-hidden overflow-y-auto border-r border-[var(--ms-border)] bg-[var(--ms-rail,#1a1b1e)] py-2.5">
      <ServerRailButton label="Home" active={homeActive} onClick={onHome}>
        <span
          className={`flex h-10 w-10 items-center justify-center transition-all duration-200 ${iconShell(homeActive)}`}
        >
          <MessagesSquare className="h-5 w-5" strokeWidth={2} />
        </span>
      </ServerRailButton>

      <div className="mx-auto my-1 h-px w-8 bg-white/10" />

      {loading && (
        <div className="mx-auto h-10 w-10 animate-pulse rounded-2xl bg-[var(--ms-sidebar)]" />
      )}

      {servers.map((server) => {
        const active =
          !homeActive && !discoverActive && server.id === activeServerId;
        const unread = unreadServerIds.has(server.id);
        return (
          <ServerRailButton
            key={server.id}
            label={server.name}
            active={active}
            unread={unread}
            onClick={() => onSelectServer(server.id)}
          >
            <span
              className={`flex h-10 w-10 items-center justify-center overflow-hidden text-sm font-bold transition-all duration-200 ${iconShell(active)}`}
            >
              {server.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={server.icon_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className={serverInitialsClass(server.name)}>
                  {serverInitials(server.name)}
                </span>
              )}
            </span>
          </ServerRailButton>
        );
      })}

      <div className="mx-auto my-1 h-px w-8 bg-white/10" />

      <ServerRailButton label="Add a Server" tone="action" onClick={onCreate}>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--ms-sidebar)] text-accent ring-1 ring-accent/30 transition-all duration-200 group-hover/server:bg-accent group-hover/server:text-white group-hover/server:ring-accent">
          <Plus className="h-5 w-5" strokeWidth={2.25} />
        </span>
      </ServerRailButton>

      <ServerRailButton
        label="Discover"
        active={discoverActive}
        tone="action"
        onClick={onDiscover}
      >
        <span
          className={`flex h-10 w-10 items-center justify-center transition-all duration-200 ${
            discoverActive
              ? "rounded-2xl bg-[#3a3c43] text-white ring-2 ring-accent/70"
              : "rounded-2xl bg-[var(--ms-sidebar)] text-accent ring-1 ring-accent/30 group-hover/server:bg-accent group-hover/server:text-white group-hover/server:ring-accent"
          }`}
        >
          <Compass className="h-5 w-5" strokeWidth={2} />
        </span>
      </ServerRailButton>
    </aside>
  );
}
