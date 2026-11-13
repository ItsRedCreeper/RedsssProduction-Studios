export const MESSENGER_ME = "@me";
export const MESSENGER_LAST_PATH_KEY = "redsss-messenger-last";
export const MESSENGER_LAST_CHANNEL_KEY = "redsss-messenger-last-channel";

export function messengerHomePath() {
  return `/messenger/channels/${MESSENGER_ME}`;
}

export function messengerDmPath(conversationId: string) {
  return `/messenger/channels/${MESSENGER_ME}/${conversationId}`;
}

export function messengerServerPath(serverId: string) {
  return `/messenger/channels/${serverId}`;
}

export function messengerChannelPath(serverId: string, channelId: string) {
  return `/messenger/channels/${serverId}/${channelId}`;
}

export function messengerDiscoverPath() {
  return "/messenger/discover";
}

export function rememberMessengerPath(path: string) {
  try {
    if (path.startsWith("/messenger")) {
      localStorage.setItem(MESSENGER_LAST_PATH_KEY, path);
    }
  } catch {
    /* ignore */
  }
}

export function recallMessengerPath() {
  try {
    return localStorage.getItem(MESSENGER_LAST_PATH_KEY);
  } catch {
    return null;
  }
}

export function rememberServerChannel(serverId: string, channelId: string) {
  try {
    const raw = localStorage.getItem(MESSENGER_LAST_CHANNEL_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[serverId] = channelId;
    localStorage.setItem(MESSENGER_LAST_CHANNEL_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function recallServerChannel(serverId: string) {
  try {
    const raw = localStorage.getItem(MESSENGER_LAST_CHANNEL_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return typeof map[serverId] === "string" ? map[serverId] : null;
  } catch {
    return null;
  }
}

export function isMessengerHomeId(serverId: string | null | undefined) {
  return serverId === MESSENGER_ME;
}
