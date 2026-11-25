"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Maximize2, Minimize2, PhoneOff } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { VoiceChannelControls } from "@/components/messenger/VoiceChannelControls";
import { useCallSession } from "@/components/messenger/voice/CallSessionProvider";
import { HoverTip } from "@/components/ui/HoverTip";
import { createClient } from "@/lib/supabase/client";

function VideoTile({
  stream,
  label,
  muted,
  speaking,
  cameraOff,
  live,
  onWatch,
  watching,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  speaking?: boolean;
  cameraOff?: boolean;
  live?: boolean;
  onWatch?: () => void;
  watching?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);

  return (
    <div
      className={`relative min-h-[9rem] overflow-hidden rounded-md bg-[#1e1f22] ${
        speaking ? "ring-2 ring-[#23a559]" : "ring-1 ring-black/40"
      } $      {watching ? "ring-2 ring-[#00a8fc]" : ""}`}
    >
      {stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          className={`h-full w-full object-cover ${muted ? "-scale-x-100" : ""}`}
        />
      ) : (
        <div className="flex h-full min-h-[9rem] flex-col items-center justify-center gap-2 px-3 text-sm text-[#949ba4]">
          {cameraOff ? (
            <UserAvatar username={label} size="lg" className="!h-16 !w-16" />
          ) : null}
          <span>{label}</span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2">
        <span className="truncate text-[11px] font-medium text-white">
          {label}
          {live ? (
            <span className="ml-1 rounded bg-[#ed4245] px-1 py-0.5 text-[9px] font-bold uppercase">
              Live
            </span>
          ) : null}
        </span>
        {onWatch ? (
          <button
            type="button"
            onClick={onWatch}
            className="rounded bg-black/50 p-1 text-white hover:bg-black/70"
            aria-label={watching ? "Stop watching" : "Watch stream"}
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CallOverlay() {
  const call = useCallSession();
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});
  const peers = useMemo(() => {
    if (!call.connection) return [] as string[];
    const ids = new Set<string>([
      ...Object.keys(call.remoteMedia),
      ...call.connection.peerUserIds,
    ]);
    return [...ids].filter(Boolean);
  }, [call.connection, call.remoteMedia]);

  const connectedPeers = useMemo(
    () => peers.filter((id) => !!call.remoteMedia[id]),
    [peers, call.remoteMedia],
  );

  useEffect(() => {
    if (peers.length === 0) return;
    let cancelled = false;
    const missing = peers.filter((id) => !peerNames[id]);
    if (missing.length === 0) return;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", missing);
      if (cancelled || !data) return;
      setPeerNames((prev) => {
        const next = { ...prev };
        for (const row of data) {
          if (row.username) next[row.id] = row.username;
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [peers, peerNames]);

  function labelFor(peerId: string) {
    return peerNames[peerId] || call.connection?.label || "Participant";
  }

  if (!call.connection) return null;

  const statusLabel = call.connection.withVideo
    ? "Video Connected"
    : "Voice Connected";
  const inCallCount = 1 + (call.outgoing ? connectedPeers.length : peers.length);

  const focused =
    call.watchingPeerId && call.remoteMedia[call.watchingPeerId]
      ? call.remoteMedia[call.watchingPeerId]
      : null;
  const focusedStream = focused?.screen ?? focused?.camera ?? null;

  if (!call.stageExpanded) {
    return (
      <div className="absolute bottom-16 left-3 z-40 w-[min(100%-1.5rem,18rem)] overflow-hidden rounded-md border border-[#1e1f22] bg-[#232428] shadow-xl shadow-black/50 sm:bottom-3">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-[#23a559]">
              {statusLabel}
            </p>
            <p className="truncate text-xs text-[#dbdee1]">
              {call.connection.label}
              {call.screenSharing ? " · Live" : ""}
            </p>
          </div>
          <HoverTip label="Expand Call">
            <button
              type="button"
              onClick={() => call.setStageExpanded(true)}
              className="rounded-md p-1.5 text-[#b5bac1] hover:bg-white/10 hover:text-white"
              aria-label="Expand call"
            >
              <Maximize2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </HoverTip>
          <HoverTip label="Disconnect">
            <button
              type="button"
              onClick={() => void call.leaveCall()}
              className="rounded-md p-1.5 text-accent hover:bg-accent/15"
              aria-label="Disconnect"
            >
              <PhoneOff className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </HoverTip>
        </div>
        <div className="border-t border-black/40 px-2 py-2">
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
            showLeave={false}
            cameraOn={call.cameraOn}
            screenSharing={call.screenSharing}
            onToggleCamera={() => void call.toggleCamera()}
            onToggleScreenShare={() => void call.toggleScreenShare()}
          />
        </div>
      </div>
    );
  }

  const gridCols =
    peers.length <= 1
      ? "grid-cols-1 sm:grid-cols-2"
      : peers.length <= 3
        ? "grid-cols-2"
        : "grid-cols-2 lg:grid-cols-3";

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#111214]/95 backdrop-blur-sm">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-black/40 px-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#23a559]">
            {statusLabel}
          </p>
          <p className="truncate text-sm font-semibold text-white">
            {call.connection.label}
            <span className="ml-2 text-xs font-normal text-[#949ba4]">
              {call.outgoing && connectedPeers.length === 0
                ? "Ringing…"
                : `${inCallCount} in call`}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          {call.micError ? (
            <p className="mr-2 max-w-[12rem] truncate text-xs text-accent">
              {call.micError}
            </p>
          ) : null}
          <HoverTip label="Minimize Call">
            <button
              type="button"
              onClick={() => call.setStageExpanded(false)}
              className="rounded-md p-1.5 text-[#b5bac1] hover:bg-white/10 hover:text-white"
              aria-label="Minimize call"
            >
              <Minimize2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </HoverTip>
        </div>
      </div>

      {focusedStream ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          <VideoTile
            stream={focusedStream}
            label="Watching stream"
            live
            watching
            onWatch={() => call.setWatchingPeerId(null)}
          />
          <div className={`grid gap-3 ${gridCols}`}>
            <VideoTile
              stream={call.localVideoStream}
              label="You"
              muted
              cameraOff={!call.cameraOn}
              live={call.screenSharing}
            />
            {peers.map((peerId) => {
              const media = call.remoteMedia[peerId];
              const stream = media?.camera ?? null;
              const hasScreen = !!media?.screen;
              return (
                <VideoTile
                  key={peerId}
                  stream={stream}
                  label={labelFor(peerId)}
                  cameraOff={!stream}
                  live={hasScreen}
                  speaking={call.speakingPeerIds.has(peerId)}
                  onWatch={
                    hasScreen
                      ? () => call.setWatchingPeerId(peerId)
                      : undefined
                  }
                  watching={call.watchingPeerId === peerId}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className={`grid min-h-0 flex-1 gap-3 overflow-y-auto p-4 ${gridCols}`}
        >
          <VideoTile
            stream={call.localVideoStream}
            label="You"
            muted
            cameraOff={!call.cameraOn}
            live={call.screenSharing}
          />
          {peers.length === 0 ||
          (call.outgoing && connectedPeers.length === 0) ? (
            <VideoTile
              stream={null}
              label={
                call.outgoing
                  ? "Ringing…"
                  : call.connection.isGroup
                    ? "Waiting for others to join…"
                    : "Waiting for answer…"
              }
            />
          ) : (
            peers.map((peerId) => {
              const media = call.remoteMedia[peerId];
              const stream = media?.camera ?? null;
              const hasScreen = !!media?.screen;
              return (
                <VideoTile
                  key={peerId}
                  stream={stream}
                  label={labelFor(peerId)}
                  cameraOff={!stream}
                  live={hasScreen}
                  speaking={call.speakingPeerIds.has(peerId)}
                  onWatch={
                    hasScreen
                      ? () => call.setWatchingPeerId(peerId)
                      : undefined
                  }
                  watching={call.watchingPeerId === peerId}
                />
              );
            })
          )}
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-1 border-t border-black/40 bg-[#232428] px-3 py-3">
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
          showLeave={false}
          cameraOn={call.cameraOn}
          screenSharing={call.screenSharing}
          onToggleCamera={() => void call.toggleCamera()}
          onToggleScreenShare={() => void call.toggleScreenShare()}
        />
        <HoverTip label="Disconnect">
          <button
            type="button"
            onClick={() => void call.leaveCall()}
            className="rounded-md bg-[#ed4245] p-2 text-white hover:bg-[#c03537]"
            aria-label="Disconnect"
          >
            <PhoneOff className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </HoverTip>
      </div>
    </div>
  );
}
