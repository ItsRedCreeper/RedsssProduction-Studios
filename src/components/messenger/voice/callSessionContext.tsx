"use client";

import { createContext, useContext } from "react";
import type { VoiceConnectionQuality } from "@/hooks/useVoiceConnectionQuality";

export type CallConnection = {
  conversationId: string;
  label: string;
  withVideo: boolean;
  isGroup: boolean;
  peerUserIds: string[];
  participantIds: string[];
  peerNames: Record<string, string>;
};

export type OpenCallInfo = {
  conversationId: string;
  withVideo: boolean;
  participantCount: number;
  startedBy: string;
};

export type IncomingCall = {
  conversationId: string;
  fromUserId: string;
  fromUsername: string;
  withVideo: boolean;
  label: string;
};

export type OutgoingRing = {
  conversationId: string;
  label: string;
  withVideo: boolean;
  peerUserId: string;
};

export type CallRemoteMedia = {
  camera: MediaStream | null;
  screen: MediaStream | null;
};

export type CallSessionContextValue = {
  connection: CallConnection | null;
  incoming: IncomingCall | null;
  outgoing: OutgoingRing | null;
  openCalls: Record<string, OpenCallInfo>;
  stageExpanded: boolean;
  setStageExpanded: (expanded: boolean) => void;
  muted: boolean;
  deafened: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  watchingPeerId: string | null;
  setWatchingPeerId: (peerId: string | null) => void;
  quality: VoiceConnectionQuality;
  localVideoStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteMedia: Record<string, CallRemoteMedia>;
  speakingPeerIds: ReadonlySet<string>;
  micError: string | null;
  micLevel: number;
  watchConversation: (conversationId: string | null) => void;
  refreshOpenCalls: (conversationIds: string[]) => Promise<void>;
  startCall: (args: {
    conversationId: string;
    label: string;
    peerUserIds: string[];
    peerNames?: Record<string, string>;
    isGroup?: boolean;
    withVideo?: boolean;
  }) => Promise<void>;
  joinCall: (args: {
    conversationId: string;
    label: string;
    peerUserIds: string[];
    peerNames?: Record<string, string>;
    isGroup?: boolean;
    withVideo?: boolean;
  }) => Promise<void>;
  cancelOutgoing: () => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  leaveCall: () => Promise<void>;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
};

export const CallSessionContext =
  createContext<CallSessionContextValue | null>(null);

export function useCallSession() {
  const ctx = useContext(CallSessionContext);
  if (!ctx) {
    throw new Error("useCallSession must be used within CallSessionProvider");
  }
  return ctx;
}

export function useOptionalCallSession() {
  return useContext(CallSessionContext);
}
