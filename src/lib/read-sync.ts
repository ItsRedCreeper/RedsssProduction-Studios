/** Cross-component / cross-tab sync for channel & DM read cursors. */

export const READ_SYNC_EVENT = "redsss-reads-sync";
export const READ_SYNC_CHANNEL = "redsss-reads";

export type ReadSyncPayload =
  | { type: "channel"; channelId: string; at: string }
  | { type: "dm"; conversationId: string; at: string }
  | { type: "mark-all"; at: string; channelIds: string[]; dmIds: string[] };

export function publishReadSync(payload: ReadSyncPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ReadSyncPayload>(READ_SYNC_EVENT, { detail: payload }),
  );
  try {
    const bc = new BroadcastChannel(READ_SYNC_CHANNEL);
    bc.postMessage(payload);
    bc.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
}
