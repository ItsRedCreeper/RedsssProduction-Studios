"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  HeadphoneOff,
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SignalZero,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState } from "react";
import type { VoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";
import {
  useVoiceMenu,
  type VoiceMenuPanel,
} from "@/components/messenger/voice/voiceMenuStore";

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
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
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
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#1e1f22] accent-[#23a559]"
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
      className="fixed z-[130] max-h-[min(22rem,calc(100dvh-2rem))] w-[280px] overflow-y-auto rounded-md border border-[#1e1f22] bg-[#111214] py-1 shadow-xl shadow-black/50"
    >
      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#949ba4]">
        {label}
      </p>
      {options.length === 0 ? (
        <p className="px-3 py-2 text-sm text-[#949ba4]">No devices found.</p>
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
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-white ${
                selected ? "text-white" : "text-[#dbdee1]"
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
      className="fixed z-[120] w-[300px] overflow-hidden rounded-md border border-[#1e1f22] bg-[#111214] py-1 shadow-xl shadow-black/50"
    >
      <button
        type="button"
        role="menuitem"
        onClick={onOpenDevices}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent hover:text-white"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
            {deviceLabel}
          </span>
          <span className="mt-0.5 block truncate text-sm text-[#dbdee1]">{selected}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[#949ba4]" strokeWidth={2} />
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
}: VoiceChannelControlsProps) {
  const ownerId = useId();
  const { menu, open, close, closeAny } = useVoiceMenu(ownerId);
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);
  const inputTriggerRef = useRef<HTMLButtonElement | null>(null);
  const outputTriggerRef = useRef<HTMLButtonElement | null>(null);
  const tipId = useId();

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
        compact ? "mt-1 mb-2 ml-2 rounded-md bg-[#1e1f22]/80 px-1.5 py-1.5" : ""
      }`}
    >
      <button
        type="button"
        className={`relative rounded-md p-1.5 ${quality.colorClass} hover:bg-white/5`}
        aria-label={quality.tip}
        aria-describedby={tip ? tipId : undefined}
        onPointerEnter={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setTip({ top: rect.top - 8, left: rect.left + rect.width / 2 });
        }}
        onPointerLeave={() => setTip(null)}
        onFocus={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setTip({ top: rect.top - 8, left: rect.left + rect.width / 2 });
        }}
        onBlur={() => setTip(null)}
      >
        <QualityIcon level={quality.level} className="h-4 w-4" />
      </button>

      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggleMute}
          className={`relative rounded-l-md p-1.5 ${
            muted ? "bg-accent/20 text-accent" : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
          }`}
          aria-label={muted ? "Unmute" : "Mute"}
          title={micError ? micError : muted ? "Unmute" : "Mute"}
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
                className="block h-full origin-left rounded-full bg-[#23a559] transition-[transform] duration-75"
                style={{
                  transform: `scaleX(${Math.min(1, Math.max(0.04, micLevel * inputVolume))})`,
                }}
              />
            </span>
          )}
        </button>
        {onInputDeviceChange && onInputVolumeChange && (
          <button
            ref={inputTriggerRef}
            type="button"
            data-voice-device-trigger
            onClick={() => togglePanel("input")}
            className={`rounded-r-md p-1 ${
              muted ? "bg-accent/20 text-accent" : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
            }`}
            aria-label="Input settings"
            title="Input settings"
            aria-expanded={panelOpen === "input" || devicePicker === "input"}
            aria-haspopup="menu"
          >
            <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggleDeafen}
          className={`rounded-l-md p-1.5 ${
            deafened
              ? "bg-accent/20 text-accent"
              : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
          }`}
          aria-label={deafened ? "Undeafen" : "Deafen"}
          title={deafened ? "Undeafen" : "Deafen"}
        >
          {deafened ? (
            <HeadphoneOff className="h-4 w-4" strokeWidth={2} />
          ) : (
            <Headphones className="h-4 w-4" strokeWidth={2} />
          )}
        </button>
        {onOutputDeviceChange && onOutputVolumeChange && (
          <button
            ref={outputTriggerRef}
            type="button"
            data-voice-device-trigger
            onClick={() => togglePanel("output")}
            className={`rounded-r-md p-1 ${
              deafened
                ? "bg-accent/20 text-accent"
                : "text-[#b5bac1] hover:bg-white/5 hover:text-white"
            }`}
            aria-label="Output settings"
            title="Output settings"
            aria-expanded={panelOpen === "output" || devicePicker === "output"}
            aria-haspopup="menu"
          >
            <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {showLeave && (
        <button
          type="button"
          onClick={onLeave}
          className="rounded-md p-1.5 text-[#b5bac1] hover:bg-accent/15 hover:text-accent"
          aria-label="Disconnect"
          title="Disconnect"
        >
          <PhoneOff className="h-4 w-4" strokeWidth={2} />
        </button>
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

      {tip &&
        createPortal(
          <span
            id={tipId}
            role="tooltip"
            style={{ top: tip.top, left: tip.left }}
            className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-accent/45 bg-[#111214] px-2.5 py-1.5 text-[11px] font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
          >
            <span
              className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-accent/45 bg-[#111214]"
              aria-hidden
            />
            {quality.tip}
          </span>,
          document.body,
        )}
    </div>
  );
}
