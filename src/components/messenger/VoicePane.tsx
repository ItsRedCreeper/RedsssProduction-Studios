"use client";

import { HeadphoneOff, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { VoiceChannelControls } from "@/components/messenger/VoiceChannelControls";
import type { VoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";
import type { MemberView, VoiceState } from "@/components/messenger/types";

type DeviceOption = {
  deviceId: string;
  label: string;
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
};

function gridClass(count: number) {
  if (count <= 1) return "grid-cols-1 max-w-md mx-auto";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count <= 4) return "grid-cols-2";
  if (count <= 6) return "grid-cols-2 lg:grid-cols-3";
  return "grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
}

function tileHeight(count: number) {
  if (count <= 1) return "min-h-[18rem] sm:min-h-[22rem]";
  if (count <= 4) return "min-h-[12rem] sm:min-h-[14rem]";
  return "min-h-[10rem] sm:min-h-[11rem]";
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
}: VoicePaneProps) {
  const ordered = [...participants].sort((a, b) => {
    if (a.user_id === currentUserId) return -1;
    if (b.user_id === currentUserId) return 1;
    const left = membersById.get(a.user_id);
    const right = membersById.get(b.user_id);
    const leftName = left?.nickname || left?.username || "";
    const rightName = right?.nickname || right?.username || "";
    return leftName.localeCompare(rightName);
  });

  if (!joined) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[#1e1f22]/40">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#2b2d31] text-accent">
            <Volume2 className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <h2 className="text-xl font-semibold text-white">{channelName}</h2>
          <p className="mt-2 max-w-sm text-sm text-[#949ba4]">
            You&apos;re viewing this voice channel. Join to connect and see who&apos;s here.
          </p>
          <button
            type="button"
            onClick={onRejoin}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            <Volume2 className="h-4 w-4" strokeWidth={2} />
            Join Voice
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#1e1f22]/40">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#2b2d31] text-accent">
              <Volume2 className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{channelName}</h2>
              <p className="text-sm text-[#949ba4]">
                {ordered.length === 0
                  ? "Connecting to voice…"
                  : ordered.length === 1
                    ? "Only you are here"
                    : `${ordered.length} connected`}
              </p>
            </div>
          </div>
        </div>

        {ordered.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed border-[#3f4147] bg-[#2b2d31]/40 text-center">
            <Volume2 className="mb-3 h-8 w-8 text-[#4e5058]" strokeWidth={1.5} />
            <p className="text-sm text-[#b5bac1]">Setting up your voice tile…</p>
            <p className="mt-1 max-w-sm text-xs text-muted">
              Live audio is still a stub — presence, mute, and speaking rings are live.
            </p>
          </div>
        ) : (
          <ul className={`grid gap-3 ${gridClass(ordered.length)}`}>
            {ordered.map((state) => {
              const member = membersById.get(state.user_id);
              const name = member?.nickname || member?.username || "Unknown";
              const isSelf = state.user_id === currentUserId;
              const speaking = speakingUserIds?.has(state.user_id) ?? false;
              return (
                <li
                  key={state.user_id}
                  className={`relative flex ${tileHeight(ordered.length)} flex-col overflow-hidden rounded-md bg-[#1e1f22] ring-2 ${
                    speaking
                      ? "ring-[#23a559]"
                      : isSelf
                        ? "ring-accent/50"
                        : "ring-transparent"
                  }`}
                >
                  <div className="relative min-h-0 flex-1 bg-[#2b2d31]">
                    {member?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={member.avatar_url}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#2b2d31]">
                        <UserAvatar
                          username={name}
                          avatarUrl={null}
                          size="lg"
                          speaking={false}
                          className="!h-24 !w-24 !text-3xl"
                        />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    {(state.muted || state.deafened) && (
                      <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#1e1f22]/90 text-accent ring-2 ring-black/40">
                        {state.deafened ? (
                          <HeadphoneOff className="h-4 w-4" strokeWidth={2} />
                        ) : (
                          <MicOff className="h-4 w-4" strokeWidth={2} />
                        )}
                      </span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-3 py-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-white drop-shadow">
                        {name}
                        {isSelf ? (
                          <span className="ml-1 text-[11px] font-normal text-[#dbdee1]">
                            (You)
                          </span>
                        ) : null}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5 text-[#dbdee1]">
                        {(state.muted || state.deafened) && (
                          <MicOff className="h-3.5 w-3.5" strokeWidth={2} />
                        )}
                        {state.deafened && (
                          <HeadphoneOff className="h-3.5 w-3.5" strokeWidth={2} />
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
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
        />
        <button
          type="button"
          onClick={onLeave}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          <PhoneOff className="h-4 w-4" strokeWidth={2} />
          Disconnect
        </button>
      </div>
    </div>
  );
}
