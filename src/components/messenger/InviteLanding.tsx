"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCurrentProfile } from "@/hooks/useCurrentProfile";
import { messengerServerPath } from "@/lib/messenger-routes";
import {
  serverInitials,
  serverInitialsClass,
} from "@/lib/server-initials";
import type { Tables } from "@/lib/supabase/database.types";

type InviteLandingProps = {
  code: string;
};

export function InviteLanding({ code }: InviteLandingProps) {
  const router = useRouter();
  const { user, loading: profileLoading } = useCurrentProfile();
  const [invite, setInvite] = useState<Tables<"invites"> | null>(null);
  const [server, setServer] = useState<Tables<"servers"> | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const { data: inviteRow, error: inviteError } = await supabase
        .from("invites")
        .select("*")
        .eq("code", code)
        .maybeSingle();

      if (cancelled) return;
      if (inviteError || !inviteRow) {
        setMissing(true);
        setInvite(null);
        setServer(null);
        setLoading(false);
        return;
      }

      const { data: serverRow, error: serverError } = await supabase
        .from("servers")
        .select("*")
        .eq("id", inviteRow.server_id)
        .maybeSingle();

      if (cancelled) return;
      if (serverError || !serverRow) {
        setMissing(true);
        setLoading(false);
        return;
      }

      const { data: members } = await supabase
        .from("server_members")
        .select("user_id")
        .eq("server_id", serverRow.id);
      const memberIds = (members ?? []).map((row) => row.user_id);
      let online = 0;
      if (memberIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, status")
          .in("id", memberIds);
        online = (profiles ?? []).filter((profile) =>
          /online|idle|dnd/i.test(profile.status || ""),
        ).length;
      }

      if (cancelled) return;
      setInvite(inviteRow);
      setServer(serverRow);
      setMemberCount(memberIds.length);
      setOnlineCount(online);
      setMissing(false);

      if (user) {
        const { data: membership } = await supabase
          .from("server_members")
          .select("user_id")
          .eq("server_id", serverRow.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled) setJoined(!!membership);
      }

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [code, profileLoading, user]);

  const expired = !!(
    invite &&
    !invite.is_permanent &&
    ((invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) ||
      (invite.max_uses != null && invite.uses >= invite.max_uses))
  );

  async function join() {
    if (!user || !invite || !server || expired) return;
    setJoining(true);
    setError(null);
    const supabase = createClient();
    const { error: joinError } = await supabase.from("server_members").insert({
      server_id: server.id,
      user_id: user.id,
    });

    const duplicate = !!joinError && /duplicate|unique|already/i.test(joinError.message);
    if (joinError && !duplicate) {
      setJoining(false);
      setError(joinError.message);
      return;
    }

    if (!duplicate) {
      await supabase
        .from("invites")
        .update({ uses: invite.uses + 1 })
        .eq("id", invite.id);
    }

    setJoining(false);
    router.push(messengerServerPath(server.id));
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-[#1e1f22] px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-md border border-[#3f4147] bg-[#2b2d31] shadow-2xl shadow-black/40">
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
            <div className="relative h-28 bg-gradient-to-br from-[#4a1010] via-[#2b2d31] to-[#1e1f22]">
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
              <div className="-mt-10 mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[20px] border-4 border-[#2b2d31] bg-[#313338] text-lg font-bold text-white shadow-lg shadow-black/40">
                {server.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={server.icon_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className={serverInitialsClass(server.name)}>
                    {serverInitials(server.name)}
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#949ba4]">
                You&apos;ve been invited to join
              </p>
              <h1 className="mt-1 truncate text-2xl font-bold text-white">{server.name}</h1>
              <p className="mt-2 text-sm leading-relaxed text-[#b5bac1]">
                {server.description || "No description yet."}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[#dbdee1]">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#23a559]" />
                  {onlineCount} Online
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#80848e]" />
                  {memberCount} Member{memberCount === 1 ? "" : "s"}
                </span>
              </div>

              {expired && (
                <p className="mt-4 rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
                  This invite has expired or reached its use limit.
                </p>
              )}
              {error && (
                <p className="mt-4 rounded-md border border-accent/40 bg-accent-muted px-3 py-2 text-sm text-accent">
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
                    className="inline-flex flex-1 items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
                  >
                    Open server
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={joining || expired || !user}
                    onClick={() => void join()}
                    className="inline-flex flex-1 items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
                  >
                    {joining ? "Joining…" : "Accept Invite"}
                  </button>
                )}
                <Link
                  href={user ? "/messenger" : "/login"}
                  className="inline-flex items-center justify-center rounded-md bg-[#3f4147] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4e5058]"
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
