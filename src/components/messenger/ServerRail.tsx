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
    ? "rounded-[16px] bg-accent text-white"
    : "rounded-[50%] bg-[#313338] text-foreground ring-1 ring-white/5 group-hover/server:rounded-[16px] group-hover/server:bg-accent group-hover/server:text-white";
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
    <aside className="flex w-[72px] shrink-0 flex-col items-stretch gap-2 overflow-x-hidden overflow-y-auto bg-[#1e1f22] py-3">
      <ServerRailButton label="Home" active={homeActive} onClick={onHome}>
        <span
          className={`flex h-12 w-12 items-center justify-center transition-all duration-200 ${iconShell(homeActive)}`}
        >
          <MessagesSquare className="h-5 w-5" strokeWidth={2} />
        </span>
      </ServerRailButton>

      <div className="mx-auto h-[2px] w-8 rounded-full bg-[#35363c]" />

      {loading && (
        <div className="mx-auto h-12 w-12 animate-pulse rounded-[1.5rem] bg-[#313338]" />
      )}

      {servers.map((server) => {
        const active = !homeActive && !discoverActive && server.id === activeServerId;
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
              className={`flex h-12 w-12 items-center justify-center overflow-hidden text-sm font-bold transition-all duration-200 ${iconShell(active)}`}
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

      <div className="mx-auto h-[2px] w-8 rounded-full bg-[#35363c]" />

      <ServerRailButton label="Add a Server" tone="action" onClick={onCreate}>
        <span className="flex h-12 w-12 items-center justify-center rounded-[50%] bg-[#313338] text-accent transition-all duration-200 group-hover/server:rounded-[16px] group-hover/server:bg-accent group-hover/server:text-white">
          <Plus className="h-6 w-6" strokeWidth={2.25} />
        </span>
      </ServerRailButton>

      <ServerRailButton
        label="Discover"
        active={discoverActive}
        tone="action"
        onClick={onDiscover}
      >
        <span
          className={`flex h-12 w-12 items-center justify-center transition-all duration-200 ${
            discoverActive
              ? "rounded-[16px] bg-accent text-white"
              : "rounded-[50%] bg-[#313338] text-accent group-hover/server:rounded-[16px] group-hover/server:bg-accent group-hover/server:text-white"
          }`}
        >
          <Compass className="h-5 w-5" strokeWidth={2} />
        </span>
      </ServerRailButton>
    </aside>
  );
}
