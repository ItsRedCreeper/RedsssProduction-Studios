"use client";

import { useEffect, useRef } from "react";
import { setUserActivity } from "@/lib/activity";
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

  useEffect(() => {
    let cancelled = false;

    async function publish() {
      let type: string = "other";
      let contextId: string | null = null;
      let contextName: string | null = null;
      let contextExtra: string | null = null;
      let isPublic = true;

      if (inVoice && voiceServerId) {
        type = "voice";
        contextId = voiceServerId;
        contextName = voiceServerName;
        isPublic = voiceServerPublic;
      } else if (discoverMode || pane === "discover") {
        type = "discover";
      } else if (pane === "home" && activeThread) {
        type = "dm";
        contextId = activeThread.id;
        contextName = activeThread.username;
        contextExtra = activeThread.otherUserId;
        isPublic = false;
      } else if (pane === "home") {
        type = "other";
        contextName = "In Messenger";
        isPublic = true;
      } else if (pane === "server" && activeServer) {
        type = "server";
        contextId = activeServer.id;
        contextName = activeServer.name;
        isPublic = !!activeServer.is_public;
        if (activeChannel?.type === "voice") {
          type = "voice";
        }
      }

      const key = [
        type,
        contextId ?? "",
        contextName ?? "",
        contextExtra ?? "",
        isPublic ? "1" : "0",
      ].join("|");
      if (key === lastKey.current) return;
      const seq = ++inflight.current;
      if (cancelled) return;
      const { error } = await setUserActivity({
        type,
        contextId,
        contextName,
        contextExtra,
        isPublic,
      });
      if (cancelled || seq !== inflight.current) return;
      // Only lock the key after a successful write so failures retry.
      if (!error) lastKey.current = key;
    }

    void publish();
    return () => {
      cancelled = true;
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
