"use client";

import { createContext, useContext } from "react";
import type { VoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";

export type VoiceConnection = {
  channelId: string;
  serverId: string;
  channelName: string;
  serverName: string;
};

export type VoiceRemoteMedia = {
  camera: MediaStream | null;
  screen: MediaStream | null;
};

export type JoinVoiceArgs = {
  channelId: string;
  serverId: string;
  channelName: string;
  serverName: string;
};

export type VoiceSessionContextValue = {
  connection: VoiceConnection | null;
  muted: boolean;
  deafened: boolean;
  quality: VoiceConnectionQuality;
  speakingUserIds: ReadonlySet<string>;
  selfSpeaking: boolean;
  /** 0–1 input level for the local mic meter */
  micLevel: number;
  micError: string | null;
  isSpeaking: (userId: string) => boolean;
  inputDeviceId: string;
  outputDeviceId: string;
  inputVolume: number;
  outputVolume: number;
  inputs: { deviceId: string; label: string }[];
  outputs: { deviceId: string; label: string }[];
  joinVoice: (args: JoinVoiceArgs) => Promise<void>;
  leaveVoice: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  cameraOn: boolean;
  screenSharing: boolean;
  localVideoStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteMedia: Record<string, VoiceRemoteMedia>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  setInputDeviceId: (deviceId: string) => void;
  setOutputDeviceId: (deviceId: string) => void;
  setInputVolume: (value: number) => void;
  setOutputVolume: (value: number) => void;
  refreshDevices: () => void;
  shouldSkipAutoJoin: (channelId: string) => boolean;
  clearSkipAutoJoin: (channelId?: string) => void;
};

export const VoiceSessionContext =
  createContext<VoiceSessionContextValue | null>(null);

export function useVoiceSession() {
  const value = useContext(VoiceSessionContext);
  if (!value) {
    throw new Error("useVoiceSession must be used within VoiceSessionProvider");
  }
  return value;
}

export function useOptionalVoiceSession() {
  return useContext(VoiceSessionContext);
}
