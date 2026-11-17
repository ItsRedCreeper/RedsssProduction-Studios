"use client";

import { useEffect, useRef } from "react";
import { onActivityRepublish, setUserActivity } from "@/lib/activity";
import type { Channel, DmThread, Server } from "@/components/messenger/types";

type ActivityTrackerProps = {
  pane: "home" | "server" | "discover" | string;
  discoverMode: boolean;
  activeServer: Server | null;
  activeChannel: Channel | null;
  activeThread: DmThread | null;
  inVoice: boolean;
  voiceServerName: string | null;
  voiceServerId: string | null;
  voiceServerPublic: boolean;
};

function buildActivity(opts: {
  pane: string;
  discoverMode: boolean;
  activeServer: Server | null;
  activeChannel: Channel | null;
  activeThread: DmThread | null;
  inVoice: boolean;
  voiceServerName: string | null;
  voiceServerId: string | null;
  voiceServerPublic: boolean;
}) {
  let type: string = "other";
  let contextId: string | null = null;
  let contextName: string | null = null;
  let contextExtra: string | null = null;
  let isPublic = true;

  if (opts.inVoice && opts.voiceServerId) {
    type = "voice";
    contextId = opts.voiceServerId;
    contextName = opts.voiceServerName;
    isPublic = opts.voiceServerPublic;
  } else if (opts.discoverMode || opts.pane === "discover") {
    type = "discover";
  } else if (opts.pane === "home" && opts.activeThread) {
    type = "dm";
    contextId = opts.activeThread.id;
    contextName = opts.activeThread.username;
    contextExtra = opts.activeThread.otherUserId;
    isPublic = false;
  } else if (opts.pane === "home") {
    type = "other";
    contextName = "In Messenger";
    isPublic = true;
  } else if (opts.pane === "server" && opts.activeServer) {
    type = "server";
    contextId = opts.activeServer.id;
    contextName = opts.activeServer.name;
    isPublic = !!opts.activeServer.is_public;
    if (opts.activeChannel?.type === "voice") {
      type = "voice";
    }
  } else {
    // Server still loading / unknown pane — never leave a stale Games/Home row.
    type = "other";
    contextName = "In Messenger";
    isPublic = true;
  }

  return { type, contextId, contextName, contextExtra, isPublic };
}

/**
 * Publishes the current messenger context as user_activity for friends/profiles.
 */
export function ActivityTracker({
  pane,
  discoverMode,
  activeServer,
  activeChannel,
  activeThread,
  inVoice,
  voiceServerName,
  voiceServerId,
  voiceServerPublic,
}: ActivityTrackerProps) {
  const lastKey = useRef<string>("");
  const inflight = useRef(0);
  const propsRef = useRef({
    pane,
    discoverMode,
    activeServer,
    activeChannel,
    activeThread,
    inVoice,
    voiceServerName,
    voiceServerId,
    voiceServerPublic,
  });
  propsRef.current = {
    pane,
    discoverMode,
    activeServer,
    activeChannel,
    activeThread,
    inVoice,
    voiceServerName,
    voiceServerId,
    voiceServerPublic,
  };

  useEffect(() => {
    let cancelled = false;

    async function publish(force = false) {
      const built = buildActivity(propsRef.current);
      const key = [
        built.type,
        built.contextId ?? "",
        built.contextName ?? "",
        built.contextExtra ?? "",
        built.isPublic ? "1" : "0",
      ].join("|");
      if (!force && key === lastKey.current) return;
      const seq = ++inflight.current;
      if (cancelled) return;
      const { error } = await setUserActivity(built);
      if (cancelled || seq !== inflight.current) return;
      if (!error) lastKey.current = key;
    }

    // Always force on dep change so returning from Games/Home overwrites stale activity.
    void publish(true);

    function onVisible() {
      if (document.visibilityState === "visible") {
        lastKey.current = "";
        void publish(true);
      }
    }
    function onRepublish() {
      lastKey.current = "";
      void publish(true);
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const offRepublish = onActivityRepublish(onRepublish);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      offRepublish();
    };
  }, [
    pane,
    discoverMode,
    activeServer,
    activeChannel,
    activeThread,
    inVoice,
    voiceServerName,
    voiceServerId,
    voiceServerPublic,
  ]);

  return null;
}
