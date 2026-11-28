"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

export type CurrentProfile = Tables<"profiles">;

export const PROFILE_UPDATED_EVENT = "redsss-profile-updated";

export function notifyProfileUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

type Snapshot = {
  user: User | null;
  profile: CurrentProfile | null;
  loading: boolean;
};

const serverSnapshot: Snapshot = {
  user: null,
  profile: null,
  loading: true,
};

let snapshot: Snapshot = serverSnapshot;
const listeners = new Set<() => void>();
let started = false;
let profileRequest = 0;

function emit() {
  for (const listener of listeners) listener();
}

function setSnapshot(next: Snapshot) {
  snapshot = next;
  emit();
}

async function fetchProfile(userId: string) {
  const request = ++profileRequest;
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (request !== profileRequest) return;
  if (snapshot.user?.id !== userId) return;
  setSnapshot({ ...snapshot, profile: data, loading: false });
}

function applyUser(nextUser: User | null) {
  const sameUser = snapshot.user?.id === nextUser?.id;
  setSnapshot({
    user: nextUser,
    profile: sameUser ? snapshot.profile : null,
    loading: false,
  });
  if (nextUser && !sameUser) {
    void fetchProfile(nextUser.id);
  } else if (nextUser && sameUser && !snapshot.profile) {
    void fetchProfile(nextUser.id);
  }
}

function ensureStarted() {
  if (started || typeof window === "undefined") return;
  started = true;

  const supabase = createClient();

  // Local session first — avoids N parallel /auth/v1/user network calls when
  // Navbar, Voice, Call, Unread, Presence, and MessengerShell all mount.
  void supabase.auth.getSession().then(({ data: { session } }) => {
    if (snapshot.user) return;
    applyUser(session?.user ?? null);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    applyUser(session?.user ?? null);
  });

  function onUpdated() {
    const id = snapshot.user?.id;
    if (id) void fetchProfile(id);
  }

  window.addEventListener(PROFILE_UPDATED_EVENT, onUpdated);
}

function subscribe(onStoreChange: () => void) {
  ensureStarted();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return serverSnapshot;
}

export function useCurrentProfile() {
  const state = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const refreshProfile = useCallback(async (userId: string) => {
    await fetchProfile(userId);
  }, []);

  return {
    user: state.user,
    profile: state.profile,
    loading: state.loading,
    refreshProfile,
  };
}
