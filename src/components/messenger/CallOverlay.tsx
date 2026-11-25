"use client";

import { useEffect, useRef } from "react";
import {
  MonitorUp,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";
import { VoiceChannelControls } from "@/components/messenger/VoiceChannelControls";
import { useCallSession } from "@/components/messenger/voice/CallSessionProvider";
import { HoverTip } from "@/components/ui/HoverTip";

function VideoTile({
  stream,
  label,
  muted,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);
  return (
    <div className="relative min-h-[10rem] overflow-hidden rounded-md bg-[#1e1f22]">
      {stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full min-h-[10rem] items-center justify-center text-sm text-[#949ba4]">
          {label}
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">
        {label}
      </span>
    </div>
  );
}

export function CallOverlay() {
  const call = useCallSession();
  if (!call.connection) return null;

  const remoteEntries = Object.entries(call.remoteVideos);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#1e1f22]/80 backdrop-blur-sm">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/40 px-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#23a559]">
            {call.connection.withVideo ? "Video Call" : "Voice Call"}
          </p>
          <p className="truncate text-sm font-semibold text-white">
            {call.connection.label}
          </p>
        </div>
        {call.micError ? (
          <p className="max-w-xs truncate text-xs text-accent">{call.micError}</p>
        ) : null}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
        <VideoTile
          stream={call.localVideoStream}
          label="You"
          muted
        />
        {remoteEntries.length === 0 ? (
          <VideoTile stream={null} label="Waiting for others…" />
        ) : (
          remoteEntries.map(([peerId, stream]) => (
            <VideoTile key={peerId} stream={stream} label="Friend" />
          ))
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-black/40 bg-[#232428] px-3 py-3">
        <VoiceChannelControls
          muted={call.muted}
          deafened={call.deafened}
          quality={call.quality}
          onToggleMute={call.toggleMute}
          onToggleDeafen={call.toggleDeafen}
          onLeave={() => void call.leaveCall()}
          micLevel={call.micLevel}
          micError={call.micError}
          compact
        />
        <HoverTip label={call.cameraOn ? "Turn Off Camera" : "Turn On Camera"}>
          <button
            type="button"
            onClick={() => void call.toggleCamera()}
            className={`rounded-md p-2 ${
              call.cameraOn
                ? "bg-white/10 text-white"
                : "text-[#b5bac1] hover:bg-white/10 hover:text-white"
            }`}
            aria-label="Toggle camera"
          >
            {call.cameraOn ? (
              <Video className="h-5 w-5" strokeWidth={1.75} />
            ) : (
              <VideoOff className="h-5 w-5" strokeWidth={1.75} />
            )}
          </button>
        </HoverTip>
        <HoverTip
          label={call.screenSharing ? "Stop Sharing" : "Share Your Screen"}
        >
          <button
            type="button"
            onClick={() => void call.toggleScreenShare()}
            className={`rounded-md p-2 ${
              call.screenSharing
                ? "bg-accent/20 text-accent"
                : "text-[#b5bac1] hover:bg-white/10 hover:text-white"
            }`}
            aria-label="Toggle screen share"
          >
            <MonitorUp className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </HoverTip>
        <HoverTip label="Leave Call">
          <button
            type="button"
            onClick={() => void call.leaveCall()}
            className="rounded-md bg-accent p-2 text-white hover:bg-accent-hover"
            aria-label="Leave call"
          >
            <PhoneOff className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </HoverTip>
      </div>
    </div>
  );
}
