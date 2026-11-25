"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  HeadphoneOff,
  Headphones,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Signal,
  Video,
  VideoOff,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SignalZero,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef } from "react";
import type { VoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";
import {
  useVoiceMenu,
  type VoiceMenuPanel,
} from "@/components/messenger/voice/voiceMenuStore";
import { HoverTip } from "@/components/ui/HoverTip";

type DeviceOption = {
  deviceId: string;
  label: string;
};

type VoiceChannelControlsProps = {
  muted: boolean;
  deafened: boolean;
  quality: VoiceConnectionQuality;
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
  compact?: boolean;
  showLeave?: boolean;
  cameraOn?: boolean;
  screenSharing?: boolean;
  onToggleCamera?: () => void;
  onToggleScreenShare?: () => void;
};

function QualityIcon({
  level,
  className,
}: {
  level: VoiceConnectionQuality["level"];
  className: string;
}) {
  if (level === "excellent") {
    return <Signal className={className} strokeWidth={2} aria-hidden />;
  }
  if (level === "good") {
    return <SignalHigh className={className} strokeWidth={2} aria-hidden />;
  }
  if (level === "fair") {
    return <SignalMedium className={className} strokeWidth={2} aria-hidden />;
  }
  if (level === "poor") {
    return <SignalLow className={className} strokeWidth={2} aria-hidden />;
  }
  return <SignalZero className={className} strokeWidth={2} aria-hidden />;
}

function menuPosition(
  anchor: { top: number; left: number; bottom: number; right: number },
  width: number,
) {
  const bottom = Math.max(8, window.innerHeight - anchor.top + 6);
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8);
  return { bottom, left };
}

function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <div className="px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-[#b5bac1]">{percent}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--ms-border)] accent-[#23a559]"
        aria-label={label}
      />
    </div>
  );
}

function DevicePickerPanel({
  open,
  anchor,
  label,
  selectedId,
  options,
  onSelect,
  onClose,
}: {
  open: boolean;
  anchor: { top: number; left: number; bottom: number; right: number } | null;
  label: string;
  selectedId: string;
  options: DeviceOption[];
  onSelect: (deviceId: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-voice-device-menu]")) return;
      if (target?.closest("[data-voice-device-trigger]")) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open, onClose]);

  if (!open || !anchor || typeof document === "undefined") return null;
  const { bottom, left } = menuPosition(anchor, 280);

  return createPortal(
    <div
      data-voice-device-menu
      role="menu"
      aria-label={label}
      style={{ bottom, left }}
      className="fixed z-[130] max-h-[min(22rem,calc(100dvh-2rem))] w-[280px] overflow-y-auto rounded-md border border-[var(--ms-border)] bg-[#111214] py-1 shadow-xl shadow-black/50"
    >
      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
        {label}
      </p>
      {options.length === 0 ? (
        <p className="px-3 py-2 text-sm text-[var(--ms-text-muted)]">No devices found.</p>
      ) : (
        options.map((option) => {
          const selected = selectedId === option.deviceId;
          return (
            <button
              key={option.deviceId || option.label}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => onSelect(option.deviceId)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#404249] hover:text-white ${
                selected ? "text-white" : "text-[var(--ms-text)]"
              }`}
            >
              <Check
                className={`h-3.5 w-3.5 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`}
                strokeWidth={2.5}
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
            </button>
          );
        })
      )}
    </div>,
    document.body,
  );
}

function SettingsPanel({
  open,
  anchor,
  kind,
  deviceLabel,
  selectedDeviceId,
  devices,
  volume,
  onOpenDevices,
  onVolumeChange,
  onClose,
}: {
  open: boolean;
  anchor: { top: number; left: number; bottom: number; right: number } | null;
  kind: "input" | "output";
  deviceLabel: string;
  selectedDeviceId: string;
  devices: DeviceOption[];
  volume: number;
  onOpenDevices: () => void;
  onVolumeChange: (value: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-voice-device-menu]")) return;
      if (target?.closest("[data-voice-device-trigger]")) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open, onClose]);

  if (!open || !anchor || typeof document === "undefined") return null;
  const { bottom, left } = menuPosition(anchor, 300);
  const selected =
    devices.find((device) => device.deviceId === selectedDeviceId)?.label ?? "Default";

  return createPortal(
    <div
      data-voice-device-menu
      role="menu"
      aria-label={kind === "input" ? "Input settings" : "Output settings"}
      style={{ bottom, left }}
      className="fixed z-[120] w-[300px] overflow-hidden rounded-md border border-[var(--ms-border)] bg-[#111214] py-1 shadow-xl shadow-black/50"
    >
      <button
        type="button"
        role="menuitem"
        onClick={onOpenDevices}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[#404249] hover:text-white"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--ms-text-muted)]">
            {deviceLabel}
          </span>
          <span className="mt-0.5 block truncate text-sm text-[var(--ms-text)]">{selected}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ms-text-muted)]" strokeWidth={2} />
      </button>
      <div className="mx-2 border-t border-white/10" />
      <VolumeSlider
        label={kind === "input" ? "Input Volume" : "Output Volume"}
        value={volume}
        onChange={onVolumeChange}
      />
    </div>,
    document.body,
  );
}

export function VoiceChannelControls({
  muted,
  deafened,
  quality,
  onToggleMute,
  onToggleDeafen,
  onLeave,
  inputDeviceId = "",
  outputDeviceId = "",
  inputs = [],
  outputs = [],
  onInputDeviceChange,
  onOutputDeviceChange,
  inputVolume = 1,
  outputVolume = 1,
  onInputVolumeChange,
  onOutputVolumeChange,
  onOpenDeviceMenus,
  micLevel = 0,
  micError = null,
  compact = false,
  showLeave = true,
  cameraOn = false,
  screenSharing = false,
  onToggleCamera,
  onToggleScreenShare,
}: VoiceChannelControlsProps) {
  const ownerId = useId();
  const { menu, open, close, closeAny } = useVoiceMenu(ownerId);
  const inputTriggerRef = useRef<HTMLButtonElement | null>(null);
  const outputTriggerRef = useRef<HTMLButtonElement | null>(null);

  function triggerRect(kind: "input" | "output") {
    const node = kind === "input" ? inputTriggerRef.current : outputTriggerRef.current;
    return node?.getBoundingClientRect() ?? null;
  }

  function togglePanel(kind: "input" | "output") {
    onOpenDeviceMenus?.();
    const rect = triggerRect(kind);
    if (!rect) return;
    if (menu?.panel === kind) {
      close();
      return;
    }
    open(kind, rect);
  }

  function openDeviceList(kind: "input" | "output") {
    onOpenDeviceMenus?.();
    const rect = triggerRect(kind);
    if (!rect) return;
    const panel: VoiceMenuPanel = kind === "input" ? "input-devices" : "output-devices";
    open(panel, rect);
  }

  const panelOpen = menu?.panel === "input" || menu?.panel === "output" ? menu.panel : null;
  const devicePicker =
    menu?.panel === "input-devices"
      ? "input"
      : menu?.panel === "output-devices"
        ? "output"
        : null;
  const anchor = menu?.anchor ?? null;

  return (
    <div
      className={`flex items-center gap-0.5 ${
        compact
          ? "mt-1 mb-2 ml-2 rounded-xl border border-white/[0.04] bg-[var(--ms-border)]/80 px-1.5 py-1.5"
          : ""
      }`}
    >
      <HoverTip label={quality.tip} delayMs={40}>
        <button
          type="button"
          className={`relative rounded-md p-1.5 ${quality.colorClass} hover:bg-white/5`}
          aria-label={quality.tip}
        >
          <QualityIcon level={quality.level} className="h-4 w-4" />
        </button>
      </HoverTip>

      <div className="flex items-center">
        <HoverTip label={micError ? micError : muted ? "Unmute" : "Mute"} delayMs={40}>
          <button
            type="button"
            onClick={onToggleMute}
            className={`relative rounded-l-md p-1.5 ${
              muted
                ? "bg-[#ed4245]/20 text-[var(--ms-danger)]"
                : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
            }`}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? (
              <MicOff className="h-4 w-4" strokeWidth={2} />
            ) : (
              <Mic className="h-4 w-4" strokeWidth={2} />
            )}
            {!muted && (
              <span
                className="pointer-events-none absolute bottom-0.5 left-1/2 h-1 w-5 -translate-x-1/2 overflow-hidden rounded-full bg-black/50"
                aria-hidden
              >
                <span
                  className="block h-full origin-left rounded-full bg-[var(--ms-connected)] transition-[transform] duration-75"
                  style={{
                    transform: `scaleX(${Math.min(1, Math.max(0.04, micLevel * inputVolume))})`,
                  }}
                />
              </span>
            )}
          </button>
        </HoverTip>
        {onInputDeviceChange && onInputVolumeChange && (
          <HoverTip label="Input Settings" delayMs={40}>
            <button
              ref={inputTriggerRef}
              type="button"
              data-voice-device-trigger
              onClick={() => togglePanel("input")}
              className={`rounded-r-md p-1 ${
                muted
                  ? "bg-[#ed4245]/20 text-[var(--ms-danger)]"
                  : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
              }`}
              aria-label="Input settings"
              aria-expanded={panelOpen === "input" || devicePicker === "input"}
              aria-haspopup="menu"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${
                  panelOpen === "input" || devicePicker === "input"
                    ? "rotate-180"
                    : "rotate-0"
                }`}
                strokeWidth={2.5}
              />
            </button>
          </HoverTip>
        )}
      </div>

      <div className="flex items-center">
        <HoverTip label={deafened ? "Undeafen" : "Deafen"} delayMs={40}>
          <button
            type="button"
            onClick={onToggleDeafen}
            className={`rounded-l-md p-1.5 ${
              deafened
                ? "bg-[#ed4245]/20 text-[var(--ms-danger)]"
                : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
            }`}
            aria-label={deafened ? "Undeafen" : "Deafen"}
          >
            {deafened ? (
              <HeadphoneOff className="h-4 w-4" strokeWidth={2} />
            ) : (
              <Headphones className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </HoverTip>
        {onOutputDeviceChange && onOutputVolumeChange && (
          <HoverTip label="Output Settings" delayMs={40}>
            <button
              ref={outputTriggerRef}
              type="button"
              data-voice-device-trigger
              onClick={() => togglePanel("output")}
              className={`rounded-r-md p-1 ${
                deafened
                  ? "bg-[#ed4245]/20 text-[var(--ms-danger)]"
                  : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
              }`}
              aria-label="Output settings"
              aria-expanded={panelOpen === "output" || devicePicker === "output"}
              aria-haspopup="menu"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${
                  panelOpen === "output" || devicePicker === "output"
                    ? "rotate-180"
                    : "rotate-0"
                }`}
                strokeWidth={2.5}
              />
            </button>
          </HoverTip>
        )}
      </div>

      {onToggleCamera && (
        <HoverTip label={cameraOn ? "Turn Off Camera" : "Turn On Camera"} delayMs={40}>
          <button
            type="button"
            onClick={onToggleCamera}
            className={`rounded-md p-1.5 ${
              cameraOn
                ? "bg-white/10 text-white"
                : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
            }`}
            aria-label={cameraOn ? "Turn off camera" : "Turn on camera"}
          >
            {cameraOn ? (
              <Video className="h-4 w-4" strokeWidth={2} />
            ) : (
              <VideoOff className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </HoverTip>
      )}

      {onToggleScreenShare && (
        <HoverTip
          label={screenSharing ? "Stop Sharing" : "Share Your Screen"}
          delayMs={40}
        >
          <button
            type="button"
            onClick={onToggleScreenShare}
            className={`rounded-md p-1.5 ${
              screenSharing
                ? "bg-[#ed4245]/20 text-[var(--ms-danger)]"
                : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
            }`}
            aria-label={screenSharing ? "Stop screen share" : "Share screen"}
          >
            <MonitorUp className="h-4 w-4" strokeWidth={2} />
          </button>
        </HoverTip>
      )}

      {showLeave && (
        <HoverTip label="Disconnect" delayMs={40}>
          <button
            type="button"
            onClick={onLeave}
            className="rounded-md p-1.5 text-[#b5bac1] hover:bg-[#ed4245]/15 hover:text-[var(--ms-danger)]"
            aria-label="Disconnect"
          >
            <PhoneOff className="h-4 w-4" strokeWidth={2} />
          </button>
        </HoverTip>
      )}

      <SettingsPanel
        open={panelOpen === "input"}
        anchor={anchor}
        kind="input"
        deviceLabel="Input Device"
        selectedDeviceId={inputDeviceId}
        devices={inputs}
        volume={inputVolume}
        onOpenDevices={() => openDeviceList("input")}
        onVolumeChange={(value) => onInputVolumeChange?.(value)}
        onClose={closeAny}
      />
      <SettingsPanel
        open={panelOpen === "output"}
        anchor={anchor}
        kind="output"
        deviceLabel="Output Device"
        selectedDeviceId={outputDeviceId}
        devices={outputs}
        volume={outputVolume}
        onOpenDevices={() => openDeviceList("output")}
        onVolumeChange={(value) => onOutputVolumeChange?.(value)}
        onClose={closeAny}
      />

      <DevicePickerPanel
        open={devicePicker === "input"}
        anchor={anchor}
        label="Input Device"
        selectedId={inputDeviceId}
        options={inputs}
        onSelect={(deviceId) => onInputDeviceChange?.(deviceId)}
        onClose={closeAny}
      />
      <DevicePickerPanel
        open={devicePicker === "output"}
        anchor={anchor}
        label="Output Device"
        selectedId={outputDeviceId}
        options={outputs}
        onSelect={(deviceId) => onOutputDeviceChange?.(deviceId)}
        onClose={closeAny}
      />

    </div>
  );
}
