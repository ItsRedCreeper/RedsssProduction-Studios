"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";

export type CurrentProfile = Tables<"profiles">;

const PROFILE_UPDATED_EVENT = "redsss-profile-updated";

export function notifyProfileUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

export function useCurrentProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function init() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      userIdRef.current = currentUser?.id ?? null;
      setUser(currentUser);
      if (currentUser) {
        await loadProfile(currentUser.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    }

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      userIdRef.current = nextUser?.id ?? null;
      setUser(nextUser);
      if (nextUser) {
        void loadProfile(nextUser.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    function onUpdated() {
      const id = userIdRef.current;
      if (id) void loadProfile(id);
    }

    window.addEventListener(PROFILE_UPDATED_EVENT, onUpdated);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener(PROFILE_UPDATED_EVENT, onUpdated);
    };
  }, [loadProfile]);

  return { user, profile, loading, refreshProfile: loadProfile };
}
