"use client";

import {
  useEffect,
  useMemo,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Compass, Search, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import {
  serverInitials,
  serverInitialsClass,
} from "@/lib/server-initials";
import { ResizableSidebar } from "@/components/messenger/ResizableSidebar";
import type { Tables } from "@/lib/supabase/database.types";

type DiscoverPaneProps = {
  onJoined: (serverId: string) => void;
  onOpenServer: (serverId: string) => void;
  footer?: ReactNode;
  sidebarWidth: number;
  onSidebarResizeStart: (event: PointerEvent<HTMLElement>) => void;
};

const CATEGORIES = [
  { id: "featured", label: "Featured", icon: Sparkles },
  { id: "all", label: "All Public", icon: Compass },
] as const;

export function DiscoverPane({
  onJoined,
  onOpenServer,
  footer,
  sidebarWidth,
  onSidebarResizeStart,
}: DiscoverPaneProps) {
  const { user } = useCurrentProfile();
  const [servers, setServers] = useState<Tables<"servers">[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["id"]>("featured");
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      if (!user) return;
      setLoading(true);
      setError(null);

      const [publicRes, membershipRes] = await Promise.all([
        supabase
          .from("servers")
          .select("*")
          .eq("is_public", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("server_members")
          .select("server_id")
          .eq("user_id", user.id),
      ]);

      if (cancelled) return;

      if (publicRes.error) {
        setError(publicRes.error.message);
        setServers([]);
      } else {
        setServers(publicRes.data ?? []);
      }

      setMemberIds((membershipRes.data ?? []).map((row) => row.server_id));
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function joinServer(serverId: string) {
    if (!user) return;
    setJoiningId(serverId);
    setError(null);
    const supabase = createClient();
    const { error: joinError } = await supabase.from("server_members").insert({
      server_id: serverId,
      user_id: user.id,
    });
    setJoiningId(null);

    if (joinError) {
      setError(joinError.message);
      return;
    }

    setMemberIds((current) =>
      current.includes(serverId) ? current : [...current, serverId],
    );
    onJoined(serverId);
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = servers.filter((server) => {
      if (!needle) return true;
      return `${server.name} ${server.description ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
    if (category === "featured") {
      list = list.slice(0, 12);
    }
    return list;
  }, [servers, query, category]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <ResizableSidebar width={sidebarWidth} onResizeStart={onSidebarResizeStart}>
        <aside className="flex h-full w-full flex-col bg-[#2b2d31]">
          <div className="flex h-12 shrink-0 items-center border-b border-black/30 px-4 text-[15px] font-semibold text-white shadow-sm shadow-black/20">
            Discover
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
              Browse
            </p>
            <ul className="space-y-0.5">
              {CATEGORIES.map((item) => {
                const Icon = item.icon;
                const active = category === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setCategory(item.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[15px] ${
                        active
                          ? "bg-[#404249] text-white"
                          : "text-[#949ba4] hover:bg-white/5 hover:text-[#dbdee1]"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${active ? "text-accent" : ""}`}
                        strokeWidth={1.75}
                      />
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {footer}
        </aside>
      </ResizableSidebar>

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#313338]">
        <div className="relative shrink-0 overflow-hidden border-b border-black/30">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(220,38,38,0.35),_transparent_55%),linear-gradient(135deg,#1e1f22_0%,#2b2d31_45%,#111214_100%)]" />
          <div className="relative px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-white shadow-lg shadow-accent/30">
                <Compass className="h-5 w-5" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Find your community
                </h1>
                <p className="mt-1 max-w-xl text-sm text-[#b5bac1]">
                  Browse public Redsss servers and join in one click — same place as your servers, no separate page.
                </p>
              </div>
            </div>
            <label className="relative mt-5 block max-w-xl">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#949ba4]"
                strokeWidth={2}
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Explore public servers"
                className="w-full rounded-md border border-transparent bg-[#1e1f22]/90 py-3 pl-10 pr-4 text-sm text-foreground outline-none ring-1 ring-[#3f4147] placeholder:text-[#6d6f78] focus:ring-accent"
              />
            </label>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-black/20 px-3 py-2 sm:hidden">
          {CATEGORIES.map((item) => {
            const active = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
                  active ? "bg-accent text-white" : "bg-[#2b2d31] text-muted"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
          {error && (
            <p className="mb-4 rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
              {error}
            </p>
          )}

          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {category === "featured" ? "Featured" : "All public servers"}
              </h2>
              <p className="text-xs text-[#949ba4]">
                {loading
                  ? "Loading…"
                  : `${filtered.length} server${filtered.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-52 animate-pulse rounded-md bg-[#2b2d31]"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#3f4147] bg-[#2b2d31]/50 px-6 py-16 text-center">
              <Compass className="mx-auto mb-3 h-8 w-8 text-muted" strokeWidth={1.5} />
              <p className="text-sm font-medium text-foreground">No public servers found</p>
              <p className="mt-1 text-xs text-muted">
                Create a server and turn on Discoverable in Server Settings.
              </p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((server) => {
                const joined = memberIds.includes(server.id);
                return (
                  <li
                    key={server.id}
                    className="flex flex-col overflow-hidden rounded-md border border-[#3f4147] bg-[#2b2d31] transition-colors hover:border-accent/50"
                  >
                    <div className="h-24 bg-[linear-gradient(135deg,rgba(220,38,38,0.55),#1e1f22_55%,#111214)]" />
                    <div className="relative flex flex-1 flex-col px-4 pb-4 pt-0">
                      <div className="-mt-7 mb-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-[1rem] bg-[#313338] text-sm font-bold text-white ring-4 ring-[#2b2d31]">
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
                      <h3 className="truncate text-base font-semibold text-white">
                        {server.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-[#b5bac1]">
                        {server.description || "No description yet."}
                      </p>
                      <div className="mt-4">
                        {joined ? (
                          <button
                            type="button"
                            onClick={() => onOpenServer(server.id)}
                            className="inline-flex w-full items-center justify-center rounded-md bg-[#4e5058] px-3 py-2 text-sm font-semibold text-white hover:bg-[#5c5e66]"
                          >
                            Open
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={joiningId === server.id}
                            onClick={() => void joinServer(server.id)}
                            className="inline-flex w-full items-center justify-center rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                          >
                            {joiningId === server.id ? "Joining…" : "Join Server"}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
