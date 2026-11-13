"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const INPUT_KEY = "redsss-voice-input-device";
const OUTPUT_KEY = "redsss-voice-output-device";
const INPUT_VOL_KEY = "redsss-voice-input-volume";
const OUTPUT_VOL_KEY = "redsss-voice-output-volume";

export type AudioDeviceChoice = {
  deviceId: string;
  label: string;
};

function readStored(key: string) {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readVolume(key: string, fallback = 1) {
  const raw = readStored(key);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

export function isVirtualAudioLabel(label: string) {
  return /virtual|oculus|vb-?audio|cable|stereo mix|what.?u.?hear|obs.*virtual/i.test(
    label,
  );
}

/** Prefer a real hardware mic over Windows "default" aliases that point at virtual devices. */
export function pickPreferredInputDevice(devices: AudioDeviceChoice[]) {
  if (devices.length === 0) return "";
  const concrete = devices.filter(
    (device) => device.deviceId !== "default" && device.deviceId !== "communications",
  );
  const real = concrete.filter((device) => !isVirtualAudioLabel(device.label));
  if (real[0]) return real[0].deviceId;
  if (concrete[0]) return concrete[0].deviceId;
  return devices[0]?.deviceId ?? "";
}

function resolveSelection(
  stored: string,
  devices: AudioDeviceChoice[],
  kind: "input" | "output",
): string {
  if (stored && devices.some((device) => device.deviceId === stored)) {
    return stored;
  }
  // First-time only: skip virtual defaults when possible.
  if (kind === "input") return pickPreferredInputDevice(devices);
  const browserDefault = devices.find((device) => device.deviceId === "default");
  if (browserDefault) return browserDefault.deviceId;
  return devices[0]?.deviceId ?? "";
}

export function useAudioDevices() {
  const [inputs, setInputs] = useState<AudioDeviceChoice[]>([]);
  const [outputs, setOutputs] = useState<AudioDeviceChoice[]>([]);
  const [inputDeviceId, setInputDeviceIdState] = useState("");
  const [outputDeviceId, setOutputDeviceIdState] = useState("");
  const [inputVolume, setInputVolumeState] = useState(1);
  const [outputVolume, setOutputVolumeState] = useState(1);
  const [ready, setReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setInputVolumeState(readVolume(INPUT_VOL_KEY, 1));
    setOutputVolumeState(readVolume(OUTPUT_VOL_KEY, 1));
    setHydrated(true);
  }, []);

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      setInputs([]);
      setOutputs([]);
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextInputs = devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }));
      const nextOutputs = devices
        .filter((device) => device.kind === "audiooutput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Speaker ${index + 1}`,
        }));
      setInputs(nextInputs);
      setOutputs(nextOutputs);

      setInputDeviceIdState((current) => {
        const stored = current || readStored(INPUT_KEY);
        const next = resolveSelection(stored, nextInputs, "input");
        if (next && next !== readStored(INPUT_KEY)) writeStored(INPUT_KEY, next);
        return next;
      });
      setOutputDeviceIdState((current) => {
        const next = resolveSelection(
          current || readStored(OUTPUT_KEY),
          nextOutputs,
          "output",
        );
        if (next && next !== readStored(OUTPUT_KEY)) writeStored(OUTPUT_KEY, next);
        return next;
      });
      setReady(true);
    } catch {
      setInputs([]);
      setOutputs([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!navigator.mediaDevices?.addEventListener) return;
    const onChange = () => void refresh();
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }, [refresh]);

  const setInputDeviceId = useCallback((deviceId: string) => {
    setInputDeviceIdState(deviceId);
    writeStored(INPUT_KEY, deviceId);
  }, []);

  const setOutputDeviceId = useCallback((deviceId: string) => {
    setOutputDeviceIdState(deviceId);
    writeStored(OUTPUT_KEY, deviceId);
  }, []);

  const setInputVolume = useCallback((value: number) => {
    const next = Math.min(1, Math.max(0, value));
    setInputVolumeState(next);
    writeStored(INPUT_VOL_KEY, String(next));
  }, []);

  const setOutputVolume = useCallback((value: number) => {
    const next = Math.min(1, Math.max(0, value));
    setOutputVolumeState(next);
    writeStored(OUTPUT_VOL_KEY, String(next));
  }, []);

  return useMemo(
    () => ({
      ready: ready && hydrated,
      inputs,
      outputs,
      inputDeviceId,
      outputDeviceId,
      inputVolume,
      outputVolume,
      setInputDeviceId,
      setOutputDeviceId,
      setInputVolume,
      setOutputVolume,
      refresh,
    }),
    [
      ready,
      hydrated,
      inputs,
      outputs,
      inputDeviceId,
      outputDeviceId,
      inputVolume,
      outputVolume,
      setInputDeviceId,
      setOutputDeviceId,
      setInputVolume,
      setOutputVolume,
      refresh,
    ],
  );
}
