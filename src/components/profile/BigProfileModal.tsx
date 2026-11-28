"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Pencil,
  Star,
  X,
} from "lucide-react";
import { loadFriendNote, saveFriendNote } from "@/lib/friendNotes";
import {
  loadFavoriteFriendIds,
  setFriendFavorite,
} from "@/lib/friendFavorites";
import { notifyFavoritesChanged } from "@/hooks/useFriendFavorites";
import { notifyNotesChanged } from "@/hooks/useFriendNotes";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { ProfileFriendButton } from "@/components/profile/ProfileFriendButton";
import { StatusPicker } from "@/components/profile/StatusPicker";
import { PresenceCaption } from "@/components/presence/PresenceCaption";
import { LiveStatusDot } from "@/components/presence/LiveStatusDot";
import { useUserPresence } from "@/components/presence/PresenceFeed";
import { statusDotClass, statusLabel } from "@/components/messenger/data";
import {
  formatPresenceClearLabel,
  formatStatusExpiry,
  resolveDisplayStatus,
} from "@/lib/presence";
import { HoverTip } from "@/components/ui/HoverTip";
import { avatarLetter } from "@/lib/avatar";
import { ProfileTagsPills } from "@/components/profile/ProfileTagsPills";
import type { MutualFocus } from "@/components/profile/SmallProfileCard";
import {
  formatSinceDate,
  type FriendProfile,
  type FriendStatus,
  type MutualFriend,
  type MutualServer,
} from "@/lib/friends";
import { createClient } from "@/lib/supabase/client";
import {
  messengerChannelPath,
  messengerServerPath,
  recallServerChannel,
} from "@/lib/messenger-routes";
import {
  FRIEND_NOTE_MAX as NOTE_MAX,
  NICKNAME_MAX,
} from "@/lib/field-limits";
import type { Role } from "@/components/messenger/types";
import { RolePills } from "@/components/messenger/RolePills";

const VISIBLE_LIMIT = 6;

/** Preloaded payload so the modal paints as one finished piece. */
export type BigProfileReadyData = {
  mutualFriends: MutualFriend[];
  mutualServers: MutualServer[];
  friendsSince: string | null;
  friendStatus: FriendStatus;
  friendEdgeId: string | null;
  restricted: boolean;
};

type BigProfileModalProps = {
  profile: FriendProfile;
  isSelf: boolean;
  ready: BigProfileReadyData;
  isBlocked?: boolean;
  isIgnored?: boolean;
  displayName?: string;
  nickname?: string | null;
  /** Highest role color when viewing inside a server. */
  nameColor?: string | null;
  /** Server roles for the viewed member (highest first). */
  roles?: Role[];
  focusSection?: MutualFocus | null;
  onClose: () => void;
  onMessage: () => void;
  onEdit: () => void;
  onOpenProfile?: (userId: string) => void;
  onBlock?: () => void;
  onUnblock?: () => void;
  onIgnore?: () => void;
  onUnignore?: () => void;
  onSaveNickname?: (nickname: string) => Promise<{ error: string | null }>;
};

export function BigProfileModal({
  profile,
  isSelf,
  ready,
  isBlocked = false,
  isIgnored = false,
  displayName,
  nickname = null,
  nameColor = null,
  roles = [],
  focusSection = null,
  onClose,
  onMessage,
  onEdit,
  onOpenProfile,
  onBlock,
  onUnblock,
  onIgnore,
  onUnignore,
  onSaveNickname,
}: BigProfileModalProps) {
  const router = useRouter();
  const restricted = ready.restricted;
  const shownName = displayName || profile.username;
  const feedPresence = useUserPresence(profile.id);
  const [liveStatus, setLiveStatus] = useState(profile.status);
  const [liveManual, setLiveManual] = useState(profile.manual_status ?? null);
  const [liveStatusText, setLiveStatusText] = useState(profile.status_text);
  const [liveLastSeen, setLiveLastSeen] = useState(profile.last_seen_at ?? null);
  const [liveManualExpiresAt, setLiveManualExpiresAt] = useState(
    profile.manual_status_expires_at ?? null,
  );
  const [liveCustomExpiresAt, setLiveCustomExpiresAt] = useState(
    profile.status_text_expires_at ?? null,
  );
  const [expiryTick, setExpiryTick] = useState(() => Date.now());
  const bio = restricted ? "" : profile.bio?.trim() || "";
  const statusText = restricted ? "" : liveStatusText?.trim() || "";
  const mutualFriends = ready.mutualFriends;
  const mutualServers = ready.mutualServers;
  const friendsSince = ready.friendsSince;
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [showAllServers, setShowAllServers] = useState(false);
  const [highlight, setHighlight] = useState<MutualFocus | null>(null);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [editingNick, setEditingNick] = useState(false);
  const [nickDraft, setNickDraft] = useState(nickname ?? "");
  const [nickBusy, setNickBusy] = useState(false);
  const [nickError, setNickError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [jumpBusyId, setJumpBusyId] = useState<string | null>(null);
  const isFriend = ready.friendStatus === "friends";
  const friendsSectionRef = useRef<HTMLDivElement | null>(null);
  const serversSectionRef = useRef<HTMLDivElement | null>(null);
  const memberSince = formatSinceDate(profile.created_at);

  useEffect(() => {
    setLiveStatus(profile.status);
    setLiveManual(profile.manual_status ?? null);
    setLiveStatusText(profile.status_text);
    setLiveLastSeen(profile.last_seen_at ?? null);
    setLiveManualExpiresAt(profile.manual_status_expires_at ?? null);
    setLiveCustomExpiresAt(profile.status_text_expires_at ?? null);
  }, [
    profile.id,
    profile.status,
    profile.manual_status,
    profile.status_text,
    profile.last_seen_at,
    profile.manual_status_expires_at,
    profile.status_text_expires_at,
  ]);

  useEffect(() => {
    if (!isSelf) return;
    const id = window.setInterval(() => setExpiryTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [isSelf]);

  const presenceExpiryLabel =
    isSelf && liveManual && liveManual !== "online"
      ? formatPresenceClearLabel(liveManualExpiresAt, expiryTick, {
          isOnline: false,
        })
      : null;
  const customExpiryLabel =
    isSelf && liveStatusText?.trim()
      ? formatStatusExpiry(liveCustomExpiresAt, expiryTick) ??
        "Doesn't clear"
      : null;
  const selfPresenceLabel = resolveDisplayStatus(liveStatus, liveLastSeen);

  // Keep status circle + caption synced from PresenceFeed for self and others.
  // Expiry / manual_status come from profile props (ProfileProvider + notifyProfileUpdated).
  useEffect(() => {
    if (!feedPresence) return;
    if (feedPresence.status) setLiveStatus(feedPresence.status);
    if (feedPresence.lastSeenAt !== undefined) {
      setLiveLastSeen(feedPresence.lastSeenAt);
    }
    if (feedPresence.statusText !== undefined) {
      setLiveStatusText(feedPresence.statusText);
      // Timed custom clear: feed drops the text before profile props catch up —
      // drop the stale "Doesn't clear" / expiry line immediately.
      if (isSelf && !feedPresence.statusText?.trim()) {
        setLiveCustomExpiresAt(null);
      }
    }
  }, [
    feedPresence?.status,
    feedPresence?.lastSeenAt,
    feedPresence?.statusText,
    feedPresence,
    isSelf,
  ]);

  // When presence reverts to Online (timed clear), hide the main-status expiry line
  // even if an optimistic local expires_at is still hanging around.
  useEffect(() => {
    if (!isSelf) return;
    const manual = (liveManual ?? "").toLowerCase();
    if (manual === "online" || manual === "") {
      setLiveManualExpiresAt(null);
    }
    if (!liveStatusText?.trim()) {
      setLiveCustomExpiresAt(null);
    }
  }, [isSelf, liveManual, liveStatusText]);

  useEffect(() => {
    setNickDraft(nickname ?? "");
    setEditingNick(false);
    setNickError(null);
  }, [nickname, profile.id]);

  useEffect(() => {
    setShowAllFriends(false);
    setShowAllServers(false);
    setHighlight(null);
    setEditingNote(false);
    setNoteError(null);
  }, [profile.id]);

  useEffect(() => {
    if (isSelf || restricted || !isFriend) {
      setNote("");
      setNoteDraft("");
      setIsFavorite(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [{ note: nextNote }, { ids }] = await Promise.all([
        loadFriendNote(profile.id),
        loadFavoriteFriendIds(),
      ]);
      if (cancelled) return;
      const text = nextNote?.trim() ?? "";
      setNote(text);
      setNoteDraft(text);
      setIsFavorite(ids.includes(profile.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [isSelf, restricted, isFriend, profile.id]);

  useEffect(() => {
    if (isSelf || restricted || !focusSection) return;
    const target =
      focusSection === "friends"
        ? friendsSectionRef.current
        : serversSectionRef.current;
    if (!target) return;
    if (focusSection === "friends") setShowAllFriends(true);
    if (focusSection === "servers") setShowAllServers(true);
    setHighlight(focusSection);
    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 40);
    const clear = window.setTimeout(() => setHighlight(null), 1800);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clear);
    };
  }, [focusSection, isSelf, restricted, profile.id]);

  const visibleFriends = showAllFriends
    ? mutualFriends
    : mutualFriends.slice(0, VISIBLE_LIMIT);
  const visibleServers = showAllServers
    ? mutualServers
    : mutualServers.slice(0, VISIBLE_LIMIT);

  async function jumpToMutualServer(serverId: string) {
    setJumpBusyId(serverId);
    onClose();
    const recalled = recallServerChannel(serverId);
    if (recalled) {
      router.push(messengerChannelPath(serverId, recalled));
      setJumpBusyId(null);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("channels")
      .select("id, name, type, position")
      .eq("server_id", serverId)
      .eq("type", "text")
      .order("position", { ascending: true });
    const channels = data ?? [];
    const general = channels.find(
      (channel) => channel.name.toLowerCase() === "general",
    );
    const first = general ?? channels[0];
    if (first) router.push(messengerChannelPath(serverId, first.id));
    else router.push(messengerServerPath(serverId));
    setJumpBusyId(null);
  }

  async function saveNickname() {
    if (!onSaveNickname) return;
    setNickBusy(true);
    setNickError(null);
    const { error } = await onSaveNickname(nickDraft.trim());
    setNickBusy(false);
    if (error) {
      setNickError(error);
      return;
    }
    setEditingNick(false);
  }

  async function persistNote(next: string) {
    setNoteBusy(true);
    setNoteError(null);
    const cleaned = next.trim().slice(0, NOTE_MAX);
    const previous = note;
    setNote(cleaned);
    const { error } = await saveFriendNote(profile.id, cleaned);
    setNoteBusy(false);
    if (error) {
      setNote(previous);
      setNoteDraft(previous);
      setNoteError(error);
      return;
    }
    setNoteDraft(cleaned);
    setEditingNote(false);
    notifyNotesChanged();
  }

  async function toggleFavorite() {
    if (!isFriend || favoriteBusy) return;
    const next = !isFavorite;
    setFavoriteBusy(true);
    setIsFavorite(next);
    const { error } = await setFriendFavorite(profile.id, next);
    setFavoriteBusy(false);
    if (error) {
      setIsFavorite(!next);
      return;
    }
    notifyFavoritesChanged();
  }

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="big-profile-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75"
        aria-label="Close profile"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(90dvh,56rem)] w-full max-w-5xl flex-col overflow-visible rounded-2xl border border-white/[0.08] bg-[#111214] shadow-2xl shadow-black/60 ring-1 ring-accent/20">
        <div className="relative shrink-0 overflow-visible rounded-t-2xl pb-14">
          <ProfileBanner
            bannerUrl={profile.banner_url}
            bannerColor={profile.banner_color}
            className="relative h-44 overflow-hidden rounded-t-2xl sm:h-56"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 rounded-md bg-black/50 p-1.5 text-white hover:bg-black/70"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </ProfileBanner>

          <div className="absolute bottom-0 left-5 flex items-end gap-3">
            <span className="relative rounded-full bg-[#111214] p-1.5">
              <UserAvatar
                username={profile.username}
                avatarUrl={profile.avatar_url}
                size="lg"
                className="!h-[112px] !w-[112px] !text-3xl"
              />
              <LiveStatusDot
                userId={profile.id}
                status={liveStatus}
                lastSeenAt={liveLastSeen}
                size="lg"
                ringClassName="ring-[3px] ring-[#111214]"
              />
            </span>
          </div>

          <div className="absolute bottom-1 right-5 z-20 flex flex-wrap items-center justify-end gap-2">
            {isSelf ? (
              <>
                <div className="relative z-30">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomOpen(false);
                      setPresenceOpen((open) => !open);
                    }}
                    className="inline-flex max-w-[12rem] flex-col items-start gap-0.5 rounded-md bg-[#3f4147] px-3 py-2 text-left text-white hover:bg-[#4e5058]"
                  >
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                      <span
                        className={`relative h-2.5 w-2.5 rounded-full ${statusDotClass(selfPresenceLabel)}`}
                      />
                      {statusLabel(selfPresenceLabel)}
                    </span>
                    {presenceExpiryLabel ? (
                      <span className="pl-4 text-[10px] font-medium leading-tight text-[#b5bac1]">
                        {presenceExpiryLabel}
                      </span>
                    ) : null}
                  </button>
                  <StatusPicker
                    mode="presence"
                    open={presenceOpen}
                    status={liveStatus}
                    manualStatus={liveManual}
                    statusText={liveStatusText}
                    manualStatusExpiresAt={liveManualExpiresAt}
                    statusTextExpiresAt={liveCustomExpiresAt}
                    placement="below"
                    onClose={() => setPresenceOpen(false)}
                    onSaved={(next) => {
                      setLiveStatus(next.status);
                      setLiveManual(next.status);
                      setLiveStatusText(next.statusText);
                      setLiveLastSeen(new Date().toISOString());
                      setLiveManualExpiresAt(
                        next.status === "online"
                          ? null
                          : (next.manualStatusExpiresAt ?? null),
                      );
                      if (next.statusTextExpiresAt !== undefined) {
                        setLiveCustomExpiresAt(
                          next.statusText?.trim()
                            ? next.statusTextExpiresAt
                            : null,
                        );
                      }
                      setPresenceOpen(false);
                    }}
                  />
                </div>
                <div className="relative z-30">
                  <button
                    type="button"
                    onClick={() => {
                      setPresenceOpen(false);
                      setCustomOpen((open) => !open);
                    }}
                    className="inline-flex max-w-[12rem] flex-col items-start gap-0.5 rounded-md bg-[#3f4147] px-3 py-2 text-left text-white hover:bg-[#4e5058]"
                  >
                    <span className="inline-flex max-w-full items-center gap-1.5 text-sm font-semibold">
                      <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">
                        {liveStatusText?.trim() || "Custom Status"}
                      </span>
                    </span>
                    {liveStatusText?.trim() && customExpiryLabel ? (
                      <span className="pl-5 text-[10px] font-medium leading-tight text-[#b5bac1]">
                        {customExpiryLabel}
                      </span>
                    ) : null}
                  </button>
                  <StatusPicker
                    mode="custom"
                    open={customOpen}
                    status={liveStatus}
                    manualStatus={liveManual}
                    statusText={liveStatusText}
                    manualStatusExpiresAt={liveManualExpiresAt}
                    statusTextExpiresAt={liveCustomExpiresAt}
                    placement="below"
                    onClose={() => setCustomOpen(false)}
                    onSaved={(next) => {
                      setLiveStatus(next.status);
                      setLiveManual(next.status);
                      setLiveStatusText(next.statusText);
                      setLiveLastSeen(new Date().toISOString());
                      if (next.manualStatusExpiresAt !== undefined) {
                        setLiveManualExpiresAt(
                          next.status === "online"
                            ? null
                            : next.manualStatusExpiresAt,
                        );
                      }
                      setLiveCustomExpiresAt(
                        next.statusText?.trim()
                          ? (next.statusTextExpiresAt ?? null)
                          : null,
                      );
                      setCustomOpen(false);
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
                >
                  <Pencil className="h-4 w-4" strokeWidth={1.75} />
                  Edit Profile
                </button>
              </>
            ) : isBlocked ? (
              <button
                type="button"
                onClick={onUnblock}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#3f4147] px-3 py-2 text-sm font-semibold text-white hover:bg-[#4e5058]"
              >
                Unblock
              </button>
            ) : restricted ? (
              <button
                type="button"
                onClick={onBlock}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#3f4147] px-3 py-2 text-sm font-semibold text-[#f2b8b5] hover:bg-[#4e5058]"
              >
                <Ban className="h-4 w-4" strokeWidth={1.75} />
                Block
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onBlock}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#3f4147] px-3 py-2 text-sm font-semibold text-[#f2b8b5] hover:bg-[#4e5058]"
                >
                  <Ban className="h-4 w-4" strokeWidth={1.75} />
                  Block
                </button>
                {isIgnored ? (
                  <button
                    type="button"
                    onClick={onUnignore}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#3f4147] px-3 py-2 text-sm font-semibold text-white hover:bg-[#4e5058]"
                  >
                    Unignore
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onIgnore}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#3f4147] px-3 py-2 text-sm font-semibold text-[#dbdee1] hover:bg-[#4e5058]"
                  >
                    Ignore
                  </button>
                )}
                <ProfileFriendButton
                  otherUserId={profile.id}
                  initialStatus={ready.friendStatus}
                  initialEdgeId={ready.friendEdgeId}
                  initialBlockedByThem={restricted}
                />
                {isFriend && (
                  <button
                    type="button"
                    disabled={favoriteBusy}
                    onClick={() => void toggleFavorite()}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                      isFavorite
                        ? "bg-accent-muted text-accent ring-1 ring-accent/40"
                        : "bg-[#3f4147] text-white hover:bg-[#4e5058]"
                    }`}
                    aria-pressed={isFavorite}
                  >
                    <Star
                      className="h-4 w-4"
                      strokeWidth={1.75}
                      fill={isFavorite ? "currentColor" : "none"}
                    />
                    {isFavorite ? "Favorited" : "Favorite"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onMessage}
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
                >
                  <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
                  Message
                </button>
              </>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-b-2xl px-6 pb-6 pt-3">
          <div className="rounded-xl border border-white/[0.04] bg-[#1e1f22] p-4">
            {/* Content-hugging row — pills sit immediately after the name, not far right. */}
            <div className="inline-flex max-w-full items-center gap-2">
              <h2
                id="big-profile-title"
                className={`min-w-0 truncate text-2xl font-bold tracking-tight ${
                  nameColor ? "" : "text-white"
                }`}
                style={
                  nameColor
                    ? { color: nameColor, WebkitTextFillColor: nameColor }
                    : undefined
                }
              >
                {shownName}
              </h2>
              <ProfileTagsPills tags={profile.profile_tags} size="md" />
            </div>
            {shownName !== profile.username && (
              <p className="mt-0.5 text-sm text-[#6d6f78]">@{profile.username}</p>
            )}
            {!restricted ? (
              <PresenceCaption
                userId={profile.id}
                status={liveStatus}
                lastSeenAt={liveLastSeen}
                customStatus={statusText || null}
                className="mt-1"
              />
            ) : null}
            {roles.length > 0 && (
              <div className="mt-3">
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                  Roles
                </h3>
                <RolePills roles={roles} size="md" />
              </div>
            )}
            {isSelf && (presenceExpiryLabel || customExpiryLabel) ? (
              <div className="mt-2 space-y-0.5 text-[11px] leading-snug text-[#949ba4]">
                {presenceExpiryLabel ? (
                  <p>Online status · {presenceExpiryLabel}</p>
                ) : null}
                {customExpiryLabel ? (
                  <p>Custom status · {customExpiryLabel}</p>
                ) : null}
              </div>
            ) : null}
            {!isSelf && !restricted && onSaveNickname && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                    Nickname
                  </h3>
                  {!editingNick && (
                    <button
                      type="button"
                      onClick={() => {
                        setNickDraft(nickname ?? "");
                        setEditingNick(true);
                      }}
                      className="text-xs font-medium text-[#949ba4] hover:text-white"
                    >
                      Edit Nickname
                    </button>
                  )}
                </div>
                {editingNick ? (
                  <div className="mt-2 space-y-2">
                    <input
                      value={nickDraft}
                      maxLength={NICKNAME_MAX}
                      onChange={(event) => setNickDraft(event.target.value)}
                      placeholder="Add a nickname"
                      className="w-full rounded-md border border-white/10 bg-[#111214] px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    />
                    {nickError && (
                      <p className="text-xs text-accent">{nickError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={nickBusy}
                        onClick={() => void saveNickname()}
                        className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={nickBusy}
                        onClick={() => {
                          setNickDraft("");
                          void onSaveNickname("").then(() =>
                            setEditingNick(false),
                          );
                        }}
                        className="rounded-md bg-[#3f4147] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4e5058] disabled:opacity-50"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        disabled={nickBusy}
                        onClick={() => {
                          setEditingNick(false);
                          setNickDraft(nickname ?? "");
                          setNickError(null);
                        }}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-[#949ba4] hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-[#dbdee1]">
                    {nickname?.trim() || "No nickname set"}
                  </p>
                )}
              </div>
            )}
            {!isSelf && !restricted && isFriend && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                    Note
                  </h3>
                  {!editingNote && (
                    <button
                      type="button"
                      onClick={() => {
                        setNoteDraft(note);
                        setEditingNote(true);
                        setNoteError(null);
                      }}
                      className="text-xs font-medium text-[#949ba4] hover:text-white"
                    >
                      {note ? "Edit Note" : "Add Note"}
                    </button>
                  )}
                </div>
                {editingNote ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={noteDraft}
                      maxLength={NOTE_MAX}
                      rows={3}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      onBlur={() => {
                        if (noteBusy) return;
                        if (noteDraft.trim() === note.trim()) {
                          setEditingNote(false);
                          return;
                        }
                        void persistNote(noteDraft);
                      }}
                      placeholder="Add a note…"
                      className="w-full resize-y rounded-md border border-white/10 bg-[#111214] px-3 py-2 text-sm text-white outline-none focus:border-accent"
                    />
                    {noteError && (
                      <p className="text-xs text-accent">{noteError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={noteBusy}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => void persistNote(noteDraft)}
                        className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={noteBusy}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setNoteDraft("");
                          void persistNote("");
                        }}
                        className="rounded-md bg-[#3f4147] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4e5058] disabled:opacity-50"
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        disabled={noteBusy}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setEditingNote(false);
                          setNoteDraft(note);
                          setNoteError(null);
                        }}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-[#949ba4] hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setNoteDraft(note);
                      setEditingNote(true);
                    }}
                    className="mt-1 block w-full rounded-md px-0 py-1 text-left text-sm text-[#dbdee1] hover:text-white"
                  >
                    {note || (
                      <span className="text-[#6d6f78]">Add a note…</span>
                    )}
                  </button>
                )}
              </div>
            )}
            {!isSelf && isBlocked && (
              <p className="mt-3 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-[#f2b8b5]">
                You have blocked this user. They cannot message you, send friend
                requests, or interact with you until you unblock them.
              </p>
            )}
            {!isSelf && !isBlocked && restricted && (
              <p className="mt-3 rounded-md border border-white/10 bg-[#111214] px-3 py-2 text-sm text-[#b5bac1]">
                This user has blocked you. About me, mutual friends, and mutual
                servers are hidden.
              </p>
            )}

            {(memberSince || (!isSelf && !restricted && friendsSince)) && (
              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/10 pt-4">
                {memberSince && (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                      Member Since
                    </h3>
                    <p className="mt-1 text-sm text-[#dbdee1]">{memberSince}</p>
                  </div>
                )}
                {!isSelf && !restricted && friendsSince && (
                  <div>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                      Friends Since
                    </h3>
                    <p className="mt-1 text-sm text-[#dbdee1]">
                      {formatSinceDate(friendsSince)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {!restricted && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                About Me
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#dbdee1]">
                {bio || "No bio yet."}
              </p>
            </div>
            )}

            {!isSelf && !restricted && (
              <>
                <div
                  ref={friendsSectionRef}
                  id="mutual-friends-section"
                  className={`mt-4 rounded-md border-t border-white/10 pt-4 transition-colors ${
                    highlight === "friends" ? "bg-accent/10 ring-1 ring-accent/40" : ""
                  }`}
                >
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                    Mutual Friends
                    <span className="ml-1 text-[#6d6f78]">
                      — {mutualFriends.length}
                    </span>
                  </h3>
                  {mutualFriends.length === 0 ? (
                    <p className="mt-2 text-sm text-[#6d6f78]">No mutual friends</p>
                  ) : (
                    <>
                      <ul className="mt-2 space-y-1">
                        {visibleFriends.map((friend) => (
                          <li key={friend.id}>
                            <button
                              type="button"
                              onClick={() => onOpenProfile?.(friend.id)}
                              className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-white/5"
                            >
                              <span className="relative shrink-0">
                                <UserAvatar
                                  username={friend.username}
                                  avatarUrl={friend.avatar_url}
                                  size="sm"
                                  className="!h-8 !w-8"
                                />
                                <LiveStatusDot
                                  userId={friend.id}
                                  status={friend.status}
                                  ringClassName="ring-[#1e1f22]"
                                  className="!h-2 !w-2"
                                />
                              </span>
                              <HoverTip
                                label={friend.username}
                                onlyIfTruncated
                                delayMs={40}
                                className="min-w-0 flex-1"
                              >
                                <span className="block truncate text-sm text-[#dbdee1]">
                                  {friend.username}
                                </span>
                              </HoverTip>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {mutualFriends.length > VISIBLE_LIMIT && (
                        <button
                          type="button"
                          onClick={() => setShowAllFriends((prev) => !prev)}
                          className="mt-1 inline-flex items-center gap-1 px-1.5 text-xs font-medium text-[#949ba4] hover:text-white"
                        >
                          {showAllFriends ? (
                            <>
                              Show less <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                            </>
                          ) : (
                            <>
                              Show {mutualFriends.length - VISIBLE_LIMIT} more{" "}
                              <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div
                  ref={serversSectionRef}
                  id="mutual-servers-section"
                  className={`mt-4 rounded-md border-t border-white/10 pt-4 transition-colors ${
                    highlight === "servers" ? "bg-accent/10 ring-1 ring-accent/40" : ""
                  }`}
                >
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
                    Mutual Servers
                    <span className="ml-1 text-[#6d6f78]">
                      — {mutualServers.length}
                    </span>
                  </h3>
                  {mutualServers.length === 0 ? (
                    <p className="mt-2 text-sm text-[#6d6f78]">No mutual servers</p>
                  ) : (
                    <>
                      <ul className="mt-2 space-y-1">
                        {visibleServers.map((server) => (
                          <li key={server.id}>
                            <HoverTip
                              label={server.name}
                              onlyIfTruncated
                              delayMs={40}
                              className="block w-full"
                            >
                            <button
                              type="button"
                              disabled={jumpBusyId === server.id}
                              onClick={() => void jumpToMutualServer(server.id)}
                              className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
                            >
                              {server.icon_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={server.icon_url}
                                  alt=""
                                  className="h-8 w-8 shrink-0 rounded-md object-cover"
                                />
                              ) : (
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#313338] text-xs font-bold text-accent">
                                  {avatarLetter(server.name)}
                                </span>
                              )}
                              <span className="truncate text-sm text-[#dbdee1] group-hover:text-white">
                                {server.name}
                              </span>
                            </button>
                            </HoverTip>
                          </li>
                        ))}
                      </ul>
                      {mutualServers.length > VISIBLE_LIMIT && (
                        <button
                          type="button"
                          onClick={() => setShowAllServers((prev) => !prev)}
                          className="mt-1 inline-flex items-center gap-1 px-1.5 text-xs font-medium text-[#949ba4] hover:text-white"
                        >
                          {showAllServers ? (
                            <>
                              Show less <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                            </>
                          ) : (
                            <>
                              Show {mutualServers.length - VISIBLE_LIMIT} more{" "}
                              <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
