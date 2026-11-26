/**
 * Structured DM system payload for unanswered calls.
 * Avoid `__…__` — that collides with Discord-style underline markdown.
 */
export const MISSED_CALL_PREFIX = "[[missed_call]]";

export type MissedCallInfo = {
  withVideo: boolean;
  callerName: string;
  peerName: string;
  durationSec: number;
};

export function encodeMissedCallMessage(info: MissedCallInfo): string {
  const kind = info.withVideo ? "video" : "voice";
  return [
    MISSED_CALL_PREFIX,
    kind,
    info.callerName.replace(/\|/g, ""),
    info.peerName.replace(/\|/g, ""),
    String(Math.max(1, Math.round(info.durationSec))),
  ].join("|");
}

export function isMissedCallPayload(content: string | null | undefined): boolean {
  if (!content) return false;
  return (
    content.startsWith(`${MISSED_CALL_PREFIX}|`) ||
    // Legacy payloads from the first structured format.
    content.startsWith("__missed_call__|")
  );
}

export function parseMissedCallMessage(content: string): MissedCallInfo | null {
  if (!isMissedCallPayload(content)) return null;
  const parts = content.split("|");
  // [[missed_call]]|voice|Caller|Peer|30
  if (parts.length < 5) return null;
  const kind = parts[1];
  const callerName = parts[2]?.trim() || "Someone";
  const peerName = parts[3]?.trim() || "Someone";
  const durationSec = Number(parts[4]) || 30;
  if (kind !== "voice" && kind !== "video") return null;
  return {
    withVideo: kind === "video",
    callerName,
    peerName,
    durationSec,
  };
}

/** Sidebar / list preview — never show the raw payload. */
export function previewMissedCallContent(
  content: string | null | undefined,
  opts: {
    currentUserId?: string | null;
    messageUserId?: string | null;
  } = {},
): string | null {
  if (!content) return null;
  const missed = formatMissedCallLabel(content, opts);
  return missed?.text ?? (isMissedCallPayload(content) ? "Missed call" : content);
}

/**
 * Viewer-aware label: callee sees "You missed…"; caller sees they weren't answered.
 * `messageUserId` is the caller (who inserted the system row).
 */
export function formatMissedCallLabel(
  content: string,
  opts: {
    currentUserId?: string | null;
    messageUserId?: string | null;
  },
): { text: string; withVideo: boolean; isMissedCall: boolean } | null {
  const parsed = parseMissedCallMessage(content);
  if (parsed) {
    const isCaller =
      !!opts.currentUserId &&
      !!opts.messageUserId &&
      opts.currentUserId === opts.messageUserId;
    if (isCaller) {
      return {
        text: `${parsed.peerName} didn't pick up.`,
        withVideo: parsed.withVideo,
        isMissedCall: true,
      };
    }
    const kind = parsed.withVideo ? "video" : "voice";
    return {
      text: `You missed a ${kind} call from ${parsed.callerName}.`,
      withVideo: parsed.withVideo,
      isMissedCall: true,
    };
  }

  // Legacy plain-text missed-call rows.
  const missedVideo = /missed a video call/i.test(content);
  const missedVoice =
    !missedVideo &&
    /missed a(?:n)? voice call|missed (?:a )?voice call|missed a call from/i.test(
      content,
    );
  if (!missedVideo && !missedVoice) return null;
  return {
    text: content,
    withVideo: missedVideo,
    isMissedCall: true,
  };
}
