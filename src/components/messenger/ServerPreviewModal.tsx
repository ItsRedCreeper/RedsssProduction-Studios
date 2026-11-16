"use client";

import { useEffect, useMemo, useState } from "react";
import { Hash, Volume2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  serverInitials,
  serverInitialsClass,
} from "@/lib/server-initials";
import type { Tables } from "@/lib/supabase/database.types";

type ChannelRow = Tables<"channels">;

type ServerPreviewModalProps = {
  server: Tables<"servers">;
  joining?: boolean;
  onClose: () => void;
  onJoin: () => void;
};

export function ServerPreviewModal({
  server,
  joining = false,
  onClose,
  onJoin,
}: ServerPreviewModalProps) {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      setLoading(true);
      setError(null);
      const [channelsRes, countRes] = await Promise.all([
        supabase
          .from("channels")
          .select("*")
          .eq("server_id", server.id)
          .order("position", { ascending: true }),
        supabase
          .from("server_members")
          .select("*", { count: "exact", head: true })
          .eq("server_id", server.id),
      ]);
      if (cancelled) return;
      if (channelsRes.error) setError(channelsRes.error.message);
      const next = channelsRes.data ?? [];
      setChannels(next);
      setMemberCount(countRes.count ?? null);
      const preferred =
        next.find(
          (channel) =>
            channel.type === "text" &&
            channel.name.toLowerCase() === "general",
        ) ?? next.find((channel) => channel.type === "text") ?? next[0];
      setActiveChannelId(preferred?.id ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [server.id]);

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId) ?? null,
    [channels, activeChannelId],
  );

  const textChannels = channels.filter((channel) => channel.type === "text");
  const voiceChannels = channels.filter((channel) => channel.type === "voice");

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-preview-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-[min(85vh,40rem)] w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-[#313338] shadow-2xl shadow-black/60">
        <aside className="flex w-56 shrink-0 flex-col bg-[#2b2d31]">
          <div className="flex items-center gap-2 border-b border-black/30 px-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#313338] text-xs font-bold text-white">
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
            </div>
            <div className="min-w-0">
              <p
                id="server-preview-title"
                className="truncate text-sm font-semibold text-white"
              >
                {server.name}
              </p>
              <p className="truncate text-[11px] text-[#949ba4]">
                {memberCount == null
                  ? "…"
                  : `${memberCount} member${memberCount === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            {loading ? (
              <p className="px-2 text-xs text-[#949ba4]">Loading channels…</p>
            ) : channels.length === 0 ? (
              <p className="px-2 text-xs text-[#949ba4]">No channels</p>
            ) : (
              <>
                {textChannels.length > 0 && (
                  <section className="mb-3">
                    <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                      Text Channels
                    </p>
                    <ul className="space-y-0.5">
                      {textChannels.map((channel) => {
                        const active = channel.id === activeChannelId;
                        return (
                          <li key={channel.id}>
                            <button
                              type="button"
                              onClick={() => setActiveChannelId(channel.id)}
                              className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm ${
                                active
                                  ? "bg-[#404249] text-white"
                                  : "text-[#949ba4] hover:bg-white/5 hover:text-[#dbdee1]"
                              }`}
                            >
                              <Hash className="h-4 w-4 shrink-0" strokeWidth={2} />
                              <span className="truncate">{channel.name}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
                {voiceChannels.length > 0 && (
                  <section>
                    <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                      Voice Channels
                    </p>
                    <ul className="space-y-0.5">
                      {voiceChannels.map((channel) => {
                        const active = channel.id === activeChannelId;
                        return (
                          <li key={channel.id}>
                            <button
                              type="button"
                              onClick={() => setActiveChannelId(channel.id)}
                              className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm ${
                                active
                                  ? "bg-[#404249] text-white"
                                  : "text-[#949ba4] hover:bg-white/5 hover:text-[#dbdee1]"
                              }`}
                            >
                              <Volume2 className="h-4 w-4 shrink-0" strokeWidth={2} />
                              <span className="truncate">{channel.name}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 items-center justify-between border-b border-black/30 px-4">
            <div className="flex min-w-0 items-center gap-2 text-white">
              {activeChannel?.type === "voice" ? (
                <Volume2 className="h-5 w-5 shrink-0 text-[#949ba4]" strokeWidth={2} />
              ) : (
                <Hash className="h-5 w-5 shrink-0 text-[#949ba4]" strokeWidth={2} />
              )}
              <span className="truncate font-semibold">
                {activeChannel?.name ?? "Preview"}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[#949ba4] hover:bg-white/5 hover:text-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="border-b border-accent/30 bg-accent/10 px-4 py-2 text-center text-xs font-medium text-[#f2b8b5]">
            Previewing {server.name} — Join to participate
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-[#dbdee1]">
              {activeChannel?.type === "voice"
                ? "Voice preview is read-only"
                : "No message history in preview"}
            </p>
            <p className="mt-1 max-w-sm text-xs text-[#949ba4]">
              {server.description?.trim() ||
                "Join this server to chat, join voice, and participate."}
            </p>
            {error && <p className="mt-3 text-xs text-accent">{error}</p>}
          </div>

          <div className="border-t border-black/30 bg-[#2b2d31] px-4 py-3">
            <button
              type="button"
              disabled={joining}
              onClick={onJoin}
              className="inline-flex w-full items-center justify-center rounded-md bg-accent px-3 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              {joining ? "Joining…" : "Join Server"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
