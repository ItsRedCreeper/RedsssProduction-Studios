"use client";

import { VoiceChannelControls } from "@/components/messenger/VoiceChannelControls";
import { HoverTip } from "@/components/ui/HoverTip";
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
  cameraOn?: boolean;
  screenSharing?: boolean;
  onToggleCamera?: () => void;
  onToggleScreenShare?: () => void;
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
  cameraOn,
  screenSharing,
  onToggleCamera,
  onToggleScreenShare,
}: VoiceConnectionBarProps) {
  return (
    <div className="shrink-0 border-t border-[#1f2023] bg-[#232428] px-2 py-2">
      <div className="mb-1 px-1">
        <HoverTip
          label={micError || "Voice Connected"}
          delayMs={40}
          className="block max-w-full"
        >
          <p className={`truncate text-xs font-semibold ${quality.colorClass}`}>
            Voice Connected
            {micError ? (
              <span className="font-normal text-[#f0b232]"> · Mic issue</span>
            ) : null}
          </p>
        </HoverTip>
        {onOpenChannel ? (
          <HoverTip
            label={serverName ? `${channelName} / ${serverName}` : channelName}
            onlyIfTruncated
            delayMs={40}
            className="block max-w-full"
          >
            <button
              type="button"
              onClick={onOpenChannel}
              className="block max-w-full truncate text-left text-[11px] text-[#b5bac1] hover:text-white hover:underline"
            >
              {channelName}
              {serverName ? ` / ${serverName}` : ""}
            </button>
          </HoverTip>
        ) : (
          <HoverTip
            label={serverName ? `${channelName} / ${serverName}` : channelName}
            onlyIfTruncated
            delayMs={40}
            className="block max-w-full"
          >
            <p className="truncate text-[11px] text-[#b5bac1]">
              {channelName}
              {serverName ? ` / ${serverName}` : ""}
            </p>
          </HoverTip>
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
        cameraOn={cameraOn}
        screenSharing={screenSharing}
        onToggleCamera={onToggleCamera}
        onToggleScreenShare={onToggleScreenShare}
      />
    </div>
  );
}
