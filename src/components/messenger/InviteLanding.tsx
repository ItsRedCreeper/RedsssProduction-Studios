"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import {
  messengerChannelPath,
  messengerServerPath,
} from "@/lib/messenger-routes";
import {
  serverInitials,
  serverInitialsClass,
} from "@/lib/server-initials";

type InvitePreview = {
  invite: {
    id: string;
    code: string;
    server_id: string;
    channel_id: string | null;
    max_uses: number | null;
    uses: number;
    expires_at: string | null;
    is_permanent: boolean;
    expired: boolean;
  };
  server: {
    id: string;
    name: string;
    description: string | null;
    icon_url: string | null;
    is_public: boolean;
    invites_paused: boolean;
  };
  member_count: number;
  online_count: number;
  joined: boolean;
};

type InviteLandingProps = {
  code: string;
};

export function InviteLanding({ code }: InviteLandingProps) {
  const router = useRouter();
  const { user, loading: profileLoading } = useCurrentProfile();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    if (!user) {
      setLoading(false);
      setMissing(false);
      setPreview(null);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc("get_invite_preview", {
        p_code: code,
      });

      if (cancelled) return;
      if (rpcError || data == null) {
        setMissing(true);
        setPreview(null);
        setLoading(false);
        return;
      }

      const raw =
        typeof data === "string"
          ? (JSON.parse(data) as InvitePreview)
          : (data as InvitePreview);
      if (!raw?.invite?.id || !raw?.server?.id) {
        setMissing(true);
        setPreview(null);
        setLoading(false);
        return;
      }

      setPreview(raw);
      setMissing(false);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [code, profileLoading, user]);

  const invite = preview?.invite ?? null;
  const server = preview?.server ?? null;
  const expired = !!invite?.expired;
  const paused = !!server?.invites_paused;
  const joined = !!preview?.joined;
  const memberCount = preview?.member_count ?? 0;
  const onlineCount = preview?.online_count ?? 0;

  async function join() {
    if (!user || !invite || !server || expired || paused) return;
    setJoining(true);
    setError(null);
    const supabase = createClient();
    const { data, error: joinError } = await supabase.rpc(
      "join_server_via_invite",
      { p_code: code },
    );

    if (joinError) {
      setJoining(false);
      setError(joinError.message);
      return;
    }

    const result =
      typeof data === "string"
        ? (JSON.parse(data) as {
            server_id: string;
            channel_id: string | null;
            already_member: boolean;
          })
        : (data as {
            server_id: string;
            channel_id: string | null;
            already_member: boolean;
          } | null);

    setJoining(false);
    const serverId = result?.server_id ?? server.id;
    const channelId = result?.channel_id ?? invite.channel_id;
    if (channelId) {
      router.push(messengerChannelPath(serverId, channelId));
    } else {
      router.push(messengerServerPath(serverId));
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_top,_rgba(220,38,38,0.14),_transparent_50%),#1a1b1e] px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--ms-sidebar)] shadow-2xl shadow-black/40 ring-1 ring-accent/20">
        {loading || profileLoading ? (
          <p className="p-6 text-sm text-muted">Looking up invite…</p>
        ) : missing || !server || !invite ? (
          <div className="p-6">
            <h1 className="text-xl font-bold text-white">Invite not found</h1>
            <p className="mt-2 text-sm text-[#b5bac1]">
              This invite is invalid or no longer exists.
            </p>
            <Link
              href="/messenger"
              className="mt-5 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              Back to Messenger
            </Link>
          </div>
        ) : (
          <>
            <div className="relative h-28 bg-gradient-to-br from-accent/50 via-[#2b2d31] to-[#1e1f22]">
              {server.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={server.icon_url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-35"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-[#2b2d31] via-[#2b2d31]/40 to-transparent" />
            </div>
            <div className="relative px-6 pb-6 pt-0">
              <div className="-mt-10 mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-4 border-[#2b2d31] bg-[var(--ms-chat)] text-lg font-bold text-white shadow-lg shadow-black/40 ring-2 ring-accent/30">
                {server.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={server.icon_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className={serverInitialsClass(server.name)}>
                    {serverInitials(server.name)}
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
                You&apos;ve been invited to join
              </p>
              <h1 className="mt-1 truncate text-2xl font-bold text-white">{server.name}</h1>
              <p className="mt-2 text-sm leading-relaxed text-[#b5bac1]">
                {server.description || "No description yet."}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[var(--ms-text)]">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--ms-connected)]" />
                  {onlineCount} Online
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#80848e]" />
                  {memberCount} Member{memberCount === 1 ? "" : "s"}
                </span>
              </div>

              {expired && (
                <p className="mt-4 rounded-md border border-[var(--ms-danger)]/40 bg-[#ed4245]/10 px-3 py-2 text-sm text-[var(--ms-danger)]">
                  This invite has expired or reached its use limit.
                </p>
              )}
              {paused && !expired && (
                <p className="mt-4 rounded-md border border-[var(--ms-danger)]/40 bg-[#ed4245]/10 px-3 py-2 text-sm text-[var(--ms-danger)]">
                  Invites are paused for this server.
                </p>
              )}
              {error && (
                <p className="mt-4 rounded-md border border-[var(--ms-danger)]/40 bg-[#ed4245]/10 px-3 py-2 text-sm text-[var(--ms-danger)]">
                  {error}
                </p>
              )}
              {!user && (
                <p className="mt-4 text-sm text-[#b5bac1]">
                  Sign in to join this server.
                </p>
              )}

              <div className="mt-6 flex gap-2">
                {joined ? (
                  <Link
                    href={messengerServerPath(server.id)}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
                  >
                    Open server
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={joining || expired || paused || !user}
                    onClick={() => void join()}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                  >
                    {joining ? "Joining…" : "Accept Invite"}
                  </button>
                )}
                <Link
                  href={user ? "/messenger" : "/login"}
                  className="inline-flex items-center justify-center rounded-xl bg-[#3f4147] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4e5058]"
                >
                  {user ? "Cancel" : "Sign in"}
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
