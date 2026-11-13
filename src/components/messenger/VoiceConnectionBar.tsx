"use client";

import { VoiceChannelControls } from "@/components/messenger/VoiceChannelControls";
import type { VoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";

type DeviceOption = {
  deviceId: string;
  label: string;
};

type VoiceConnectionBarProps = {
  channelName: string;
  serverName?: string | null;
  muted: boolean;
  deafened: boolean;
  quality: VoiceConnectionQuality;
  onOpenChannel?: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeave: () => void;
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

export function VoiceConnectionBar({
  channelName,
  serverName,
  muted,
  deafened,
  quality,
  onOpenChannel,
  onToggleMute,
  onToggleDeafen,
  onLeave,
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
}: VoiceConnectionBarProps) {
  return (
    <div className="shrink-0 border-t border-black/40 bg-[#232428] px-2 py-2">
      <div className="mb-1 px-1">
        <p className={`text-xs font-semibold ${quality.colorClass}`}>
          Voice Connected
        </p>
        {micError ? (
          <p className="truncate text-[11px] text-accent" title={micError}>
            {micError}
          </p>
        ) : null}
        {onOpenChannel ? (
          <button
            type="button"
            onClick={onOpenChannel}
            className="block max-w-full truncate text-left text-[11px] text-[#b5bac1] hover:text-white hover:underline"
            title={serverName ? `${channelName} / ${serverName}` : channelName}
          >
            {channelName}
            {serverName ? ` / ${serverName}` : ""}
          </button>
        ) : (
          <p className="truncate text-[11px] text-[#b5bac1]">
            {channelName}
            {serverName ? ` / ${serverName}` : ""}
          </p>
        )}
      </div>
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
      />
    </div>
  );
}
