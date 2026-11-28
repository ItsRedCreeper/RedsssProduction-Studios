"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Maximize2,
  Minimize2,
  MonitorUp,
  PhoneOff,
} from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { VoiceChannelControls } from "@/components/messenger/VoiceChannelControls";
import { useCallSession } from "@/components/messenger/voice/CallSessionProvider";
import { HoverTip } from "@/components/ui/HoverTip";
import { createClient } from "@/lib/supabase/client";

type StageItem =
  | {
      key: string;
      kind: "user";
      userId: string;
      label: string;
      stream: MediaStream | null;
      isSelf: boolean;
    }
  | {
      key: string;
      kind: "screen";
      userId: string;
      label: string;
      stream: MediaStream;
      isSelf: boolean;
    };

function gridClass(count: number) {
  if (count <= 1) return "mx-auto grid-cols-1 max-w-3xl";
  if (count === 2) return "mx-auto grid-cols-1 sm:grid-cols-2 max-w-5xl";
  if (count <= 4) return "mx-auto grid-cols-2 max-w-5xl";
  if (count <= 6) return "mx-auto grid-cols-2 lg:grid-cols-3 max-w-6xl";
  return "mx-auto grid-cols-2 md:grid-cols-3 xl:grid-cols-4 max-w-6xl";
}

function MediaVideo({
  stream,
  mirrored,
  fit = "cover",
}: {
  stream: MediaStream;
  mirrored?: boolean;
  fit?: "cover" | "contain";
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const bind = (force = false) => {
      if (cancelled) return;
      if (force) el.srcObject = null;
      el.srcObject = new MediaStream(stream.getTracks());
      void el.play().catch(() => undefined);
    };
    bind(true);
    const tracks = stream.getTracks();
    const onUnmute = () => bind(true);
    for (const track of tracks) {
      track.addEventListener("unmute", onUnmute);
    }
    const iv = window.setInterval(() => {
      const video = stream.getVideoTracks()[0];
      if (!video || video.muted) return;
      if (el.videoWidth === 0 || el.readyState < 2) bind(true);
      else window.clearInterval(iv);
    }, 250);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      for (const track of tracks) {
        track.removeEventListener("unmute", onUnmute);
      }
    };
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`absolute inset-0 h-full w-full ${
        fit === "contain" ? "object-contain bg-black" : "object-cover"
      } ${mirrored ? "-scale-x-100" : ""}`}
    />
  );
}

function CallTile({
  item,
  speaking,
  size,
  onSelect,
}: {
  item: StageItem;
  speaking: boolean;
  size: "focus" | "grid" | "strip";
  onSelect: () => void;
}) {
  const compact = size === "strip";
  const hasVideo = !!item.stream;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={
        size === "focus" ? `Exit focus on ${item.label}` : `Focus ${item.label}`
      }
      className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-[var(--ms-border)] text-left ring-2 transition-[box-shadow,filter] duration-200 hover:brightness-110 ${
        speaking
          ? "ring-[#23a559]"
          : item.isSelf
            ? "ring-accent/50"
            : "ring-transparent hover:ring-white/10"
      }`}
    >
      <div className="absolute inset-0 bg-[var(--ms-sidebar)]">
        {hasVideo && item.stream ? (
          <MediaVideo
            stream={item.stream}
            mirrored={item.isSelf && item.kind === "user"}
            fit={item.kind === "screen" ? "contain" : "cover"}
          />
        ) : (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-2 ${
              compact ? "px-2 pb-6 pt-2" : "px-3 pb-9 pt-3"
            }`}
          >
            <UserAvatar
              username={item.label}
              size="lg"
              className={compact ? "!h-10 !w-10" : "!h-16 !w-16"}
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        {item.kind === "screen" ? (
          <span
            className={`absolute flex items-center justify-center rounded-full bg-[#ed4245] text-white ring-2 ring-black/40 ${
              compact ? "right-1.5 top-1.5 h-6 w-6" : "right-3 top-3 h-8 w-8"
            }`}
          >
            <MonitorUp
              className={compact ? "h-3 w-3" : "h-4 w-4"}
              strokeWidth={2}
            />
          </span>
        ) : null}
        <div
          className={`absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 ${
            compact ? "px-2 py-1.5" : "px-3 py-2"
          }`}
        >
          <p
            className={`min-w-0 truncate font-semibold text-white drop-shadow ${
              compact ? "text-[11px]" : "text-sm"
            }`}
          >
            {item.label}
            {item.isSelf ? (
              <span className="ml-1 text-[10px] font-normal text-[var(--ms-text)]">
                (You)
              </span>
            ) : null}
          </p>
          {item.kind === "screen" && !compact ? (
            <span className="rounded bg-[#ed4245] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              Live
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

export function CallOverlay() {
  const call = useCallSession();
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const focusedHadMediaRef = useRef(false);

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
    return (
      call.connection?.peerNames[peerId] ||
      peerNames[peerId] ||
      call.connection?.label ||
      "Participant"
    );
  }

  const stageItems = useMemo(() => {
    if (!call.connection) return [] as StageItem[];
    const items: StageItem[] = [
      {
        key: "user:self",
        kind: "user",
        userId: "self",
        label: "You",
        stream: call.localVideoStream,
        isSelf: true,
      },
    ];
    if (call.localScreenStream) {
      items.push({
        key: "screen:self",
        kind: "screen",
        userId: "self",
        label: "Your Screen",
        stream: call.localScreenStream,
        isSelf: true,
      });
    }
    for (const peerId of peers) {
      const media = call.remoteMedia[peerId];
      const name = labelFor(peerId);
      items.push({
        key: `user:${peerId}`,
        kind: "user",
        userId: peerId,
        label: name,
        stream: media?.camera ?? null,
        isSelf: false,
      });
      if (media?.screen) {
        items.push({
          key: `screen:${peerId}`,
          kind: "screen",
          userId: peerId,
          label: `${name}'s Screen`,
          stream: media.screen,
          isSelf: false,
        });
      }
    }
    return items;
    // labelFor depends on peerNames/connection — included via peers + peerNames
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    call.connection,
    call.localVideoStream,
    call.localScreenStream,
    call.remoteMedia,
    peers,
    peerNames,
  ]);

  useEffect(() => {
    if (!focusedKey) {
      focusedHadMediaRef.current = false;
      return;
    }
    const item = stageItems.find((entry) => entry.key === focusedKey);
    if (!item) {
      setFocusedKey(null);
      focusedHadMediaRef.current = false;
      return;
    }
    const hasMedia = !!item.stream;
    if (hasMedia) focusedHadMediaRef.current = true;
    if (focusedHadMediaRef.current && !hasMedia) {
      setFocusedKey(null);
      focusedHadMediaRef.current = false;
    }
  }, [focusedKey, stageItems]);

  useEffect(() => {
    if (!focusedKey) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        focusedHadMediaRef.current = false;
        setFocusedKey(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedKey]);

  if (!call.connection) return null;

  const ringing = !!call.outgoing && connectedPeers.length === 0;
  const statusLabel = ringing ? "Ringing…" : "Voice Connected";
  const inCallCount =
    1 + (ringing ? 0 : call.outgoing ? connectedPeers.length : peers.length);

  const focusedItem = focusedKey
    ? (stageItems.find((item) => item.key === focusedKey) ?? null)
    : null;
  const stripItems = focusedItem
    ? stageItems.filter((item) => item.key !== focusedItem.key)
    : [];

  // Mini bar stays top-anchored so it never covers the composer or
  // collides with the sidebar VoiceConnectionBar footer.
  if (!call.stageExpanded) {
    return (
      <div className="absolute left-14 right-2 top-2 z-40 w-auto max-w-[18rem] overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--ms-rail)]/95 shadow-xl shadow-black/50 ring-1 ring-accent/15 backdrop-blur-sm sm:left-auto sm:right-3 sm:w-[min(100%-1.5rem,18rem)] sm:max-w-none">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-[var(--ms-connected)]">
              {statusLabel}
            </p>
            <p className="truncate text-xs text-[var(--ms-text)]">
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
              className="rounded-md p-1.5 text-[var(--ms-danger)] hover:bg-[#ed4245]/15"
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

  function renderTile(item: StageItem, size: "focus" | "grid" | "strip") {
    return (
      <CallTile
        item={item}
        speaking={
          item.kind === "user" &&
          !item.isSelf &&
          call.speakingPeerIds.has(item.userId)
        }
        size={size}
        onSelect={() =>
          setFocusedKey((prev) => {
            if (prev === item.key) {
              focusedHadMediaRef.current = false;
              return null;
            }
            focusedHadMediaRef.current =
              item.kind === "screen" || !!item.stream;
            return item.key;
          })
        }
      />
    );
  }

  const stageBody =
    ringing && stageItems.length <= 1 ? (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
        <div>
          <p className="text-lg font-semibold text-white">
            {call.outgoing
              ? "Ringing…"
              : call.connection.isGroup
                ? "Waiting for others to join…"
                : "Waiting for answer…"}
          </p>
          <p className="mt-2 text-sm text-[var(--ms-text-muted)]">
            {call.connection.label}
          </p>
        </div>
      </div>
    ) : focusedItem ? (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-5">
        <div
          className="flex w-full max-w-4xl flex-col gap-2"
          style={{
            width: "min(100%, 56rem, calc((100dvh - 14rem) * 16 / 9))",
          }}
        >
          {renderTile(focusedItem, "focus")}
          {stripItems.length > 0 ? (
            <ul className="flex w-full justify-center gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
              {stripItems.map((item) => (
                <li
                  key={item.key}
                  className="w-[30%] min-w-[7.5rem] max-w-[11rem] shrink-0"
                >
                  {renderTile(item, "strip")}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-5">
        <ul className={`grid w-full gap-3 ${gridClass(stageItems.length)}`}>
          {stageItems.map((item) => (
            <li key={item.key}>{renderTile(item, "grid")}</li>
          ))}
        </ul>
      </div>
    );

  const stage = (
    <div className="fixed inset-x-0 bottom-0 top-14 z-[45] flex flex-col bg-[#111214] isolate">
      <div className="messenger-header flex h-12 shrink-0 items-center justify-between gap-3 bg-[var(--ms-rail)] px-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ms-connected)]">
            {statusLabel}
          </p>
          <p className="truncate text-sm font-semibold text-white">
            {call.connection.label}
            <span className="ml-2 text-xs font-normal text-[var(--ms-text-muted)]">
              {ringing ? "Waiting for an answer" : `${inCallCount} in call`}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1">
          {call.micError ? (
            <HoverTip label={call.micError} delayMs={40}>
              <p className="mr-2 shrink-0 text-xs font-medium text-[#f0b232]">
                Mic issue
              </p>
            </HoverTip>
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

      {stageBody}

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-black/40 bg-[#292b2f] px-4 py-3">
        <VoiceChannelControls
          muted={call.muted}
          deafened={call.deafened}
          quality={call.quality}
          onToggleMute={call.toggleMute}
          onToggleDeafen={call.toggleDeafen}
          onLeave={() => void call.leaveCall()}
          micLevel={call.micLevel}
          micError={call.micError}
          showLeave={false}
          cameraOn={call.cameraOn}
          screenSharing={call.screenSharing}
          onToggleCamera={() => void call.toggleCamera()}
          onToggleScreenShare={() => void call.toggleScreenShare()}
        />
        <button
          type="button"
          onClick={() => void call.leaveCall()}
          className="inline-flex items-center gap-2 rounded-md bg-[#ed4245] px-3 py-2 text-sm font-semibold text-white hover:bg-[#c03537]"
        >
          <PhoneOff className="h-4 w-4" strokeWidth={2} />
          Disconnect
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return stage;
  return createPortal(stage, document.body);
}
