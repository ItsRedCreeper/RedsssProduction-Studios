"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HeadphoneOff, MicOff, MonitorUp, PhoneOff, Volume2 } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { HoverTip } from "@/components/ui/HoverTip";
import { VoiceChannelControls } from "@/components/messenger/VoiceChannelControls";
import { avatarAccentColor } from "@/lib/avatar";
import type { VoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";
import type { MemberView, VoiceState } from "@/components/messenger/types";
import type { VoiceRemoteMedia } from "@/components/messenger/voice/VoiceSessionProvider";

/** Discord lists voice members A→Z by nickname/username and keeps that order stable. */
function voiceDisplayName(
  state: VoiceState,
  membersById: Map<string, MemberView>,
) {
  const member = membersById.get(state.user_id);
  return member?.nickname || member?.username || "Unknown";
}

type DeviceOption = {
  deviceId: string;
  label: string;
};

type StageItem =
  | {
      key: string;
      kind: "user";
      userId: string;
      state: VoiceState;
      stream: MediaStream | null;
    }
  | {
      key: string;
      kind: "screen";
      userId: string;
      label: string;
      stream: MediaStream;
      muted?: boolean;
      deafened?: boolean;
    };

type VoicePaneProps = {
  channelName: string;
  joined: boolean;
  muted: boolean;
  deafened: boolean;
  quality: VoiceConnectionQuality;
  currentUserId: string | null;
  participants: VoiceState[];
  membersById: Map<string, MemberView>;
  speakingUserIds?: ReadonlySet<string>;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeave: () => void;
  onRejoin: () => void;
  inputDeviceId?: string;
  outputDeviceId?: string;
  inputs?: DeviceOption[];
  outputs?: DeviceOption[];
  onInputDeviceChange?: (deviceId: string) => void;
  onOutputDeviceChange?: (deviceId: string) => void;
  inputVolume?: number;
  outputVolume?: number;
  onInputVolumeChange?: (value: number) => void;
  onOutputVolumeChange?: (value: number) => void;
  onOpenDeviceMenus?: () => void;
  micLevel?: number;
  micError?: string | null;
  cameraOn?: boolean;
  screenSharing?: boolean;
  onToggleCamera?: () => void;
  onToggleScreenShare?: () => void;
  localVideoStream?: MediaStream | null;
  localScreenStream?: MediaStream | null;
  remoteMedia?: Record<string, VoiceRemoteMedia>;
};

function gridClass(count: number) {
  if (count <= 1) return "mx-auto grid-cols-1 max-w-3xl";
  if (count === 2) return "mx-auto grid-cols-1 sm:grid-cols-2 max-w-5xl";
  if (count <= 4) return "mx-auto grid-cols-2 max-w-5xl";
  if (count <= 6) return "mx-auto grid-cols-2 lg:grid-cols-3 max-w-6xl";
  return "mx-auto grid-cols-2 md:grid-cols-3 xl:grid-cols-4 max-w-6xl";
}

/** Preferred avatar px — held until the tile is too small, then shrunk to fit. */
function preferredAvatarPx(size: "focus" | "grid" | "strip") {
  if (size === "focus") return 128;
  if (size === "strip") return 40;
  return 80;
}

function MediaVideo({
  stream,
  mirrored,
  fit = "cover",
}: {
  stream: MediaStream;
  mirrored?: boolean;
  /** Screen shares use contain so the full frame (including the top) stays visible. */
  fit?: "cover" | "contain";
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const bind = (force = false) => {
      if (cancelled) return;
      // Chrome often keeps a black frame if the first bind happened while muted;
      // tear down and reattach a fresh MediaStream wrapper to force paint.
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

function VoiceTile({
  item,
  member,
  currentUserId,
  speaking,
  size,
  onSelect,
}: {
  item: StageItem;
  member: MemberView | undefined;
  currentUserId: string | null;
  speaking: boolean;
  size: "focus" | "grid" | "strip";
  onSelect: () => void;
}) {
  const isScreen = item.kind === "screen";
  const name = isScreen
    ? item.label
    : member?.nickname || member?.username || "Unknown";
  const isSelf = item.userId === currentUserId;
  const stream = item.kind === "user" ? item.stream : item.stream;
  const hasVideo = !!stream;
  const hasPhoto = !!member?.avatar_url;
  const accent = hasPhoto
    ? avatarAccentColor(member?.username || name, member?.banner_color)
    : null;
  const compact = size === "strip";
  const preferred = preferredAvatarPx(size);
  const fitRef = useRef<HTMLDivElement | null>(null);
  const [avatarPx, setAvatarPx] = useState(preferred);
  const muted = item.kind === "user" ? item.state.muted : !!item.muted;
  const deafened = item.kind === "user" ? item.state.deafened : !!item.deafened;

  useEffect(() => {
    const el = fitRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      setAvatarPx(preferred);
      return;
    }
    const sync = () => {
      const { width, height } = el.getBoundingClientRect();
      const maxByHeight = Math.max(0, height - (compact ? 22 : 36));
      const maxByWidth = Math.max(0, width - (compact ? 16 : 24));
      const next = Math.max(
        compact ? 20 : 28,
        Math.min(preferred, maxByHeight, maxByWidth),
      );
      setAvatarPx(Math.round(next));
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, [preferred, compact]);

  const letterPx = Math.max(compact ? 9 : 11, Math.round(avatarPx * 0.36));

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={
        size === "focus"
          ? `Exit focus on ${name}`
          : `Focus ${name} in the voice grid`
      }
      className={`relative aspect-video w-full overflow-hidden rounded-2xl bg-[var(--ms-border)] text-left ring-2 transition-[box-shadow,filter] duration-200 hover:brightness-110 ${
        speaking
          ? "ring-[#23a559]"
          : isSelf
            ? "ring-accent/50"
            : "ring-transparent hover:ring-white/10"
      }`}
    >
      <div className="absolute inset-0 bg-[var(--ms-sidebar)]">
        {hasVideo && stream ? (
          <MediaVideo
            stream={stream}
            mirrored={isSelf && !isScreen}
            fit={isScreen ? "contain" : "cover"}
          />
        ) : (
          <>
            {hasPhoto ? (
              <>
                <div
                  className="absolute inset-0"
                  style={{
                    background: `radial-gradient(ellipse 70% 60% at 50% 42%, ${accent}40 0%, ${accent}18 42%, #1e1f22 72%)`,
                  }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={member!.avatar_url!}
                  alt=""
                  aria-hidden
                  className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl"
                />
              </>
            ) : null}
            <div
              ref={fitRef}
              className={`absolute inset-0 flex items-center justify-center ${
                compact ? "px-2 pb-6 pt-2" : "px-3 pb-9 pt-3"
              }`}
            >
              <span
                className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
                style={{ width: avatarPx, height: avatarPx, fontSize: letterPx }}
              >
                <UserAvatar
                  username={name}
                  avatarUrl={member?.avatar_url}
                  size="lg"
                  speaking={false}
                  className="!h-full !w-full !text-[length:inherit]"
                />
              </span>
            </div>
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

        {(muted || deafened) && !isScreen && (
          <span
            className={`absolute flex items-center justify-center rounded-full bg-[var(--ms-border)]/90 text-[var(--ms-danger)] ring-2 ring-black/40 ${
              compact
                ? "right-1.5 top-1.5 h-6 w-6"
                : "right-3 top-3 h-8 w-8"
            }`}
          >
            {deafened ? (
              <HeadphoneOff
                className={compact ? "h-3 w-3" : "h-4 w-4"}
                strokeWidth={2}
              />
            ) : (
              <MicOff
                className={compact ? "h-3 w-3" : "h-4 w-4"}
                strokeWidth={2}
              />
            )}
          </span>
        )}
        {isScreen ? (
          <span
            className={`absolute flex items-center justify-center rounded-full bg-[#ed4245] text-white ring-2 ring-black/40 ${
              compact
                ? "right-1.5 top-1.5 h-6 w-6"
                : "right-3 top-3 h-8 w-8"
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
          <HoverTip
            label={isSelf ? `${name} (You)` : name}
            onlyIfTruncated
            delayMs={40}
            className="min-w-0"
          >
            <p
              className={`min-w-0 truncate font-semibold text-white drop-shadow ${
                compact ? "text-[11px]" : "text-sm"
              }`}
            >
              {name}
              {isSelf ? (
                <span className="ml-1 text-[10px] font-normal text-[var(--ms-text)]">
                  (You)
                </span>
              ) : null}
            </p>
          </HoverTip>
          {!compact && (
            <div className="flex shrink-0 items-center gap-1.5 text-[var(--ms-text)]">
              {isScreen ? (
                <span className="rounded bg-[#ed4245] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                  Live
                </span>
              ) : null}
              {(muted || deafened) && !isScreen && (
                <MicOff className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {deafened && !isScreen && (
                <HeadphoneOff className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export function VoicePane({
  channelName,
  joined,
  muted,
  deafened,
  quality,
  currentUserId,
  participants,
  membersById,
  speakingUserIds,
  onToggleMute,
  onToggleDeafen,
  onLeave,
  onRejoin,
  inputDeviceId,
  outputDeviceId,
  inputs,
  outputs,
  onInputDeviceChange,
  onOutputDeviceChange,
  inputVolume,
  outputVolume,
  onInputVolumeChange,
  onOutputVolumeChange,
  onOpenDeviceMenus,
  micLevel,
  micError,
  cameraOn = false,
  screenSharing = false,
  onToggleCamera,
  onToggleScreenShare,
  localVideoStream = null,
  localScreenStream = null,
  remoteMedia = {},
}: VoicePaneProps) {
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  /** True once the focused tile had live camera/screen during this focus session. */
  const focusedHadMediaRef = useRef(false);

  const ordered = [...participants].sort((a, b) =>
    voiceDisplayName(a, membersById).localeCompare(
      voiceDisplayName(b, membersById),
      undefined,
      { sensitivity: "base" },
    ),
  );

  const stageItems = useMemo(() => {
    const items: StageItem[] = [];
    for (const state of ordered) {
      const isSelf = state.user_id === currentUserId;
      const media = remoteMedia[state.user_id];
      const cameraStream = isSelf
        ? localVideoStream
        : (media?.camera ?? null);
      items.push({
        key: `user:${state.user_id}`,
        kind: "user",
        userId: state.user_id,
        state,
        stream: cameraStream,
      });
      const screenStream = isSelf
        ? localScreenStream
        : (media?.screen ?? null);
      if (screenStream) {
        const member = membersById.get(state.user_id);
        const base =
          member?.nickname || member?.username || (isSelf ? "You" : "Someone");
        items.push({
          key: `screen:${state.user_id}`,
          kind: "screen",
          userId: state.user_id,
          label: `${base}'s Screen`,
          stream: screenStream,
          muted: state.muted,
          deafened: state.deafened,
        });
      }
    }
    return items;
  }, [
    ordered,
    currentUserId,
    localVideoStream,
    localScreenStream,
    remoteMedia,
    membersById,
  ]);

  useEffect(() => {
    if (!joined) {
      setFocusedKey(null);
      focusedHadMediaRef.current = false;
      return;
    }
    if (!focusedKey) {
      focusedHadMediaRef.current = false;
      return;
    }
    const item = stageItems.find((entry) => entry.key === focusedKey);
    // Person left, or their screen-share tile was removed → back to grid.
    if (!item) {
      setFocusedKey(null);
      focusedHadMediaRef.current = false;
      return;
    }
    const hasMedia = !!item.stream;
    if (hasMedia) focusedHadMediaRef.current = true;
    // Camera/screen stopped while in big-focus view → back to grid.
    if (focusedHadMediaRef.current && !hasMedia) {
      setFocusedKey(null);
      focusedHadMediaRef.current = false;
    }
  }, [focusedKey, joined, stageItems]);

  useEffect(() => {
    if (!focusedKey) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFocusedKey(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusedKey]);

  const focusedItem = focusedKey
    ? (stageItems.find((item) => item.key === focusedKey) ?? null)
    : null;
  const stripItems = focusedItem
    ? stageItems.filter((item) => item.key !== focusedItem.key)
    : [];

  // Preview before joining: title + stacked avatars + count + Join (centered, not docked).
  if (!joined) {
    const preview = ordered.slice(0, 5);
    const count = ordered.length;
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,_rgba(220,38,38,0.08),_transparent_55%),#1e1f22]/40] px-6 py-10">
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ms-sidebar)] text-[#b5bac1] ring-2 ring-accent/30">
            <Volume2 className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-white">
            {channelName}
          </h2>

          {count > 0 ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <span className="flex -space-x-1.5" aria-hidden>
                {preview.map((state) => {
                  const member = membersById.get(state.user_id);
                  const name =
                    member?.nickname || member?.username || "Unknown";
                  return (
                    <HoverTip
                      key={state.user_id}
                      label={name}
                      delayMs={40}
                      className="rounded-full ring-2 ring-[#1e1f22]"
                    >
                      <span className="block">
                        <UserAvatar
                          username={name}
                          avatarUrl={member?.avatar_url}
                          size="sm"
                          className="!h-8 !w-8 !text-[11px]"
                        />
                      </span>
                    </HoverTip>
                  );
                })}
              </span>
              <p className="text-sm font-medium text-[#b5bac1]">
                {count} {count === 1 ? "person" : "people"} in voice
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--ms-text-muted)]">
              No one is in this voice channel yet.
            </p>
          )}

          <button
            type="button"
            onClick={onRejoin}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--ms-connected)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
          >
            <Volume2 className="h-4 w-4" strokeWidth={2} />
            Join Voice
          </button>
        </div>
      </div>
    );
  }

  const emptyStage = (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ms-sidebar)] text-[#b5bac1]">
        <Volume2 className="h-7 w-7" strokeWidth={1.75} />
      </div>
      <h2 className="text-xl font-semibold text-white">{channelName}</h2>
      <p className="mt-2 max-w-sm text-sm text-[var(--ms-text-muted)]">
        Setting up your voice tile…
      </p>
    </div>
  );

  function renderTile(item: StageItem, size: "focus" | "grid" | "strip") {
    return (
      <VoiceTile
        item={item}
        member={membersById.get(item.userId)}
        currentUserId={currentUserId}
        speaking={
          joined
            ? (speakingUserIds?.has(item.userId) ?? false) &&
              item.kind === "user"
            : false
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

  const stage =
    stageItems.length === 0 ? (
      emptyStage
    ) : focusedItem ? (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          className="flex w-full max-w-4xl flex-col gap-2"
          style={{
            width: "min(100%, 56rem, calc((100dvh - 14rem) * 16 / 9))",
          }}
        >
          {renderTile(focusedItem, "focus")}
          {stripItems.length > 0 && (
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
          )}
        </div>
      </div>
    ) : (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <ul className={`grid w-full gap-3 ${gridClass(stageItems.length)}`}>
          {stageItems.map((item) => (
            <li key={item.key}>{renderTile(item, "grid")}</li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--ms-border)]/40">
      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6">
        {stage}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-black/30 bg-[#292b2f] px-4 py-3">
        <VoiceChannelControls
          muted={muted}
          deafened={deafened}
          quality={quality}
          onToggleMute={onToggleMute}
          onToggleDeafen={onToggleDeafen}
          onLeave={onLeave}
          inputDeviceId={inputDeviceId}
          outputDeviceId={outputDeviceId}
          inputs={inputs}
          outputs={outputs}
          onInputDeviceChange={onInputDeviceChange}
          onOutputDeviceChange={onOutputDeviceChange}
          inputVolume={inputVolume}
          outputVolume={outputVolume}
          onInputVolumeChange={onInputVolumeChange}
          onOutputVolumeChange={onOutputVolumeChange}
          onOpenDeviceMenus={onOpenDeviceMenus}
          micLevel={micLevel}
          micError={micError}
          showLeave={false}
          cameraOn={cameraOn}
          screenSharing={screenSharing}
          onToggleCamera={onToggleCamera}
          onToggleScreenShare={onToggleScreenShare}
        />
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex items-center gap-2 rounded-md bg-[#ed4245] px-3 py-2 text-sm font-semibold text-white hover:bg-[#c03537]"
        >
          <PhoneOff className="h-4 w-4" strokeWidth={2} />
          Disconnect
        </button>
      </div>
    </div>
  );
}
