export const MOCK_USER = {
  username: "RedsssAdmin",
  displayName: "Redsss Admin",
};

export type Friend = {
  id: string;
  username: string;
  status: "online" | "idle" | "offline";
};

export const MOCK_FRIENDS: Friend[] = [
  { id: "1", username: "NovaPixel", status: "online" },
  { id: "2", username: "ShadowForge", status: "online" },
  { id: "3", username: "EchoLane", status: "idle" },
  { id: "4", username: "VoltRunner", status: "online" },
  { id: "5", username: "AshCircuit", status: "offline" },
  { id: "6", username: "IronSketch", status: "idle" },
];

export type Server = {
  id: string;
  name: string;
  initials: string;
  accent: string;
};

export const MOCK_SERVERS: Server[] = [
  { id: "home", name: "Redsss HQ", initials: "RH", accent: "#dc2626" },
  { id: "dev", name: "Dev Lab", initials: "DL", accent: "#525252" },
  { id: "games", name: "Games Floor", initials: "GF", accent: "#737373" },
  { id: "media", name: "Media Desk", initials: "MD", accent: "#404040" },
];

export type Channel = {
  id: string;
  name: string;
  type: "text" | "voice";
};

export const MOCK_CHANNELS: Channel[] = [
  { id: "general", name: "general", type: "text" },
  { id: "announcements", name: "announcements", type: "text" },
  { id: "design-feedback", name: "design-feedback", type: "text" },
  { id: "builds", name: "builds", type: "text" },
  { id: "lobby", name: "Lobby", type: "voice" },
  { id: "standup", name: "Standup", type: "voice" },
  { id: "playtest", name: "Playtest", type: "voice" },
];

export type Message = {
  id: string;
  author: string;
  initials: string;
  content: string;
  timestamp: string;
};

export const MOCK_MESSAGES: Message[] = [
  {
    id: "1",
    author: "NovaPixel",
    initials: "NP",
    content: "Pushing the new landing mock tonight. Layout shell looks sharp.",
    timestamp: "Today at 6:42 PM",
  },
  {
    id: "2",
    author: "RedsssAdmin",
    initials: "RA",
    content: "Nice — keep the red accents selective. Gray and black for fills.",
    timestamp: "Today at 6:45 PM",
  },
  {
    id: "3",
    author: "ShadowForge",
    initials: "SF",
    content: "Messenger skeleton is up. Channel list + message rail ready for review.",
    timestamp: "Today at 7:01 PM",
  },
  {
    id: "4",
    author: "EchoLane",
    initials: "EL",
    content: "Voice channels need a clearer visual split from text. Looking good overall.",
    timestamp: "Today at 7:08 PM",
  },
];

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Games" },
  { href: "/messenger", label: "RedsssMessenger" },
  { href: "/reports", label: "Reports" },
  { href: "/funding", label: "Funding" },
] as const;
