"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Channel, DmThread, Server } from "@/components/messenger/types";

type ForwardMessageModalProps = {
  open: boolean;
  preview: string;
  servers: Server[];
  channelsByServer: Record<string, Channel[]>;
  threads: DmThread[];
  onClose: () => void;
  onForward: (target: {
    kind: "channel" | "dm";
    id: string;
    serverId?: string;
  }) => void;
};

export function ForwardMessageModal({
  open,
  preview,
  servers,
  channelsByServer,
  threads,
  onClose,
  onForward,
}: ForwardMessageModalProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const channelOptions = useMemo(() => {
    const out: { id: string; label: string; serverId: string }[] = [];
    for (const server of servers) {
      for (const channel of channelsByServer[server.id] ?? []) {
        if (channel.type !== "text") continue;
        const label = `${server.name} / #${channel.name}`;
        if (q && !label.toLowerCase().includes(q)) continue;
        out.push({ id: channel.id, label, serverId: server.id });
      }
    }
    return out.slice(0, 40);
  }, [servers, channelsByServer, q]);

  const dmOptions = useMemo(() => {
    return threads
      .filter((thread) => {
        if (!q) return true;
        return thread.username.toLowerCase().includes(q);
      })
      .slice(0, 20);
  }, [threads, q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-[#313338] shadow-2xl ring-1 ring-accent/15">
        <div className="flex items-center justify-between border-b border-black/30 px-4 py-3">
          <h2 className="text-base font-semibold text-white">Forward Message</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="space-y-3 px-4 py-3">
          <p className="line-clamp-3 rounded-md bg-[#2b2d31] px-3 py-2 text-sm text-[#b5bac1]">
            {preview || "(attachment)"}
          </p>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search channels or DMs"
            className="w-full rounded-md border border-[#3f4147] bg-[#1e1f22] px-3 py-2 text-sm outline-none focus:border-accent/60"
            autoFocus
          />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[#949ba4]">
              Channels
            </p>
            {channelOptions.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted">No channels</p>
            )}
            {channelOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() =>
                  onForward({
                    kind: "channel",
                    id: option.id,
                    serverId: option.serverId,
                  })
                }
                className="flex w-full rounded-md px-2 py-1.5 text-left text-sm text-[#dbdee1] hover:bg-white/10"
              >
                {option.label}
              </button>
            ))}
            <p className="mt-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-[#949ba4]">
              Direct messages
            </p>
            {dmOptions.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => onForward({ kind: "dm", id: thread.id })}
                className="flex w-full rounded-md px-2 py-1.5 text-left text-sm text-[#dbdee1] hover:bg-white/10"
              >
                @{thread.username}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
