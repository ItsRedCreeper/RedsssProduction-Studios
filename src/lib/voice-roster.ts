import { createClient } from "@/lib/supabase/client";
import type { VoiceState } from "@/components/messenger/types";

export const VOICE_ROSTER_EVENT = "roster";

export type VoiceRosterPayload =
  | { type: "upsert"; state: VoiceState }
  | {
      type: "remove";
      user_id: string;
      server_id: string;
      channel_id?: string | null;
    };

export function voiceRosterTopic(serverId: string) {
  return `voice-roster:${serverId}`;
}

/** Fan out join/leave/mute so other clients update before postgres_changes + REST. */
export async function publishVoiceRoster(
  serverId: string,
  payload: VoiceRosterPayload,
) {
  if (!serverId) return;
  const topic = voiceRosterTopic(serverId);
  const supabase = createClient();
  const existing = supabase.getChannels().find((ch) => {
    const t = ch.topic ?? "";
    return t === topic || t === `realtime:${topic}` || t.endsWith(`:${topic}`);
  });
  if (existing) {
    await existing.send({
      type: "broadcast",
      event: VOICE_ROSTER_EVENT,
      payload,
    });
    return;
  }
  const channel = supabase.channel(topic, {
    config: { broadcast: { self: false } },
  });
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => resolve(), 800);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(timer);
        resolve();
      }
    });
  });
  try {
    await channel.send({
      type: "broadcast",
      event: VOICE_ROSTER_EVENT,
      payload,
    });
  } finally {
    void supabase.removeChannel(channel);
  }
}
