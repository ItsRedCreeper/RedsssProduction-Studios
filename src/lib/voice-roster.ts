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

function matchRosterChannel(
  ch: { topic?: string; subTopic?: string },
  topic: string,
) {
  const t = ch.topic ?? "";
  const sub = ch.subTopic ?? "";
  return sub === topic || t === topic || t === `realtime:${topic}`;
}

/**
 * Fan out join/leave/mute so other clients update before postgres_changes + REST.
 *
 * Never removeChannel on this topic — supabase-js reuses RealtimeChannel by topic,
 * so tearing one down kills MessengerShell's listener (and can disturb speaking/rtc).
 */
export async function publishVoiceRoster(
  serverId: string,
  payload: VoiceRosterPayload,
) {
  if (!serverId) return;
  const topic = voiceRosterTopic(serverId);
  const supabase = createClient();
  let channel = supabase
    .getChannels()
    .find((ch) => matchRosterChannel(ch, topic));

  if (!channel) {
    // channel() reuses by topic if MessengerShell already opened it.
    channel = supabase.channel(topic, {
      config: { broadcast: { self: true } },
    });
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => resolve(), 600);
      channel!.subscribe((status) => {
        if (
          status === "SUBSCRIBED" ||
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          window.clearTimeout(timer);
          resolve();
        }
      });
    });
  }

  try {
    await channel.send({
      type: "broadcast",
      event: VOICE_ROSTER_EVENT,
      payload,
    });
  } catch {
    /* postgres_changes remains the fallback */
  }
}
