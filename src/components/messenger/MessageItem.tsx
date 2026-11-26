"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Copy,
  Forward,
  Link2,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  PhoneMissed,
  Pin,
  PinOff,
  Plus,
  Reply,
  SmilePlus,
  Trash2,
  VideoOff,
  X,
} from "lucide-react";
import { PollCard, type PollData } from "@/components/messenger/PollCard";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { HoverTip } from "@/components/ui/HoverTip";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  formatMessageTime,
  formatTimestamp,
} from "@/components/messenger/data";
import { formatMessageContent } from "@/components/messenger/formatMessageContent";
import { LinkEmbeds } from "@/components/messenger/LinkEmbeds";
import { MessageMedia } from "@/components/messenger/MessageMedia";
import { EmojiPicker } from "@/components/messenger/EmojiPicker";
import { ReactionEmoji } from "@/components/messenger/CustomEmoji";
import { ReactionInfoTip } from "@/components/messenger/EmojiInfo";
import { useOptionalProfileUi } from "@/components/profile/ProfileProvider";
import { displayMentionText, type MentionMaps } from "@/lib/mentions";
import { MESSAGE_MAX, MESSAGE_MAX_REACHED } from "@/lib/field-limits";
import {
  QUICK_REACTION_EMOJIS,
  type ServerEmoji,
} from "@/lib/emoji";
import {
  formatMissedCallLabel,
  isMissedCallPayload,
} from "@/lib/missed-call";
import {
  type ChatMessage,
  type ReactionGroup,
} from "@/components/messenger/types";

/** Fixed portal menu so dropdowns never stretch the chat scroll area. */
function MessageFloatingMenu({
  open,
  anchorRef,
  menuRef,
  estimatedHeight,
  className,
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  estimatedHeight: number;
  className?: string;
  children: ReactNode;
}) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setStyle(null);
      return;
    }
    function place() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const openUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
      setStyle({
        position: "fixed",
        right: Math.max(8, window.innerWidth - rect.right),
        zIndex: 80,
        ...(openUp
          ? { bottom: Math.max(8, window.innerHeight - rect.top + gap) }
          : { top: Math.min(window.innerHeight - 8, rect.bottom + gap) }),
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef, estimatedHeight]);

  if (!open || !style || typeof document === "undefined") return null;

  return createPortal(
    <div ref={menuRef} style={style} className={className}>
      {children}
    </div>,
    document.body,
  );
}

type MessageItemProps = {
  message: ChatMessage;
  isOwn: boolean;
  /**
   * Discord consecutive-message grouping: hide avatar + username and show a
   * hover timestamp in the left gutter instead.
   */
  compact?: boolean;
  reactions?: ReactionGroup[];
  currentUserId?: string | null;
  currentUsername?: string | null;
  roleNames?: string[];
  channelNames?: string[];
  mentionMaps?: MentionMaps;
  canDeleteOthers?: boolean;
  /** Discord: friend nicknames only in DMs, never in server channels. */
  preferFriendNickname?: boolean;
  /** Server nicknames keyed by user id (channel messages). */
  serverNickByUserId?: Record<string, string>;
  /** Highest-role username colors keyed by user id (server channels). */
  roleColorByUserId?: Record<string, string>;
  /** Discover preview: look around only — no reply/edit/react/delete. */
  readOnly?: boolean;
  customEmojis?: ServerEmoji[];
  emojiCatalog?: Map<string, ServerEmoji>;
  serverNamesById?: Record<string, string>;
  /** Prefer this server when resolving typed `:name:` collisions. */
  preferredServerId?: string | null;
  reactorNamesById?: Record<string, string>;
  onReply: (message: ChatMessage) => void;
  onEdit: (messageId: string, content: string) => Promise<boolean>;
  onDelete: (messageId: string) => Promise<void>;
  onJumpToReply?: (messageId: string) => void;
  onReact?: (emoji: string) => void;
  onTogglePin?: () => void;
  onForward?: (message: ChatMessage) => void;
  onMarkUnread?: (message: ChatMessage) => void;
  onCreateThread?: (message: ChatMessage) => void;
  onCopyLink?: (message: ChatMessage) => void;
  pollVotes?: { user_id: string; option_index: number }[];
  onPollVote?: (messageId: string, optionIndex: number) => void;
};

export function MessageItem({
  message,
  isOwn,
  compact = false,
  reactions = [],
  currentUserId = null,
  currentUsername,
  roleNames,
  channelNames,
  mentionMaps,
  canDeleteOthers = false,
  preferFriendNickname = false,
  serverNickByUserId,
  roleColorByUserId,
  readOnly = false,
  customEmojis = [],
  emojiCatalog,
  serverNamesById = {},
  preferredServerId = null,
  reactorNamesById = {},
  onReply,
  onEdit,
  onDelete,
  onJumpToReply,
  onReact,
  onTogglePin,
  onForward,
  onMarkUnread,
  onCreateThread,
  onCopyLink,
  pollVotes = [],
  onPollVote,
}: MessageItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [fullPickerOpen, setFullPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const emojiMenuRef = useRef<HTMLDivElement | null>(null);
  const profileUi = useOptionalProfileUi();
  const authorBase = message.profiles?.username ?? "Unknown";
  const author = preferFriendNickname
    ? profileUi?.nicknameFor(message.user_id)?.trim() || authorBase
    : serverNickByUserId?.[message.user_id] || authorBase;
  const reply = message.reply_to;
  const replyBase = reply?.profiles?.username ?? "Unknown";
  const replyAuthor = !reply
    ? replyBase
    : preferFriendNickname
      ? profileUi?.nicknameFor(reply.user_id)?.trim() || replyBase
      : serverNickByUserId?.[reply.user_id] || replyBase;
  const authorRoleColor = roleColorByUserId?.[message.user_id] ?? null;
  const replyRoleColor = reply
    ? (roleColorByUserId?.[reply.user_id] ?? null)
    : null;
  const replyBlocked =
    !!reply && (profileUi?.blockedIds?.includes(reply.user_id) ?? false);
  const replyIgnored =
    !!reply && (profileUi?.ignoredIds?.includes(reply.user_id) ?? false);
  const replyHidden = replyBlocked || replyIgnored;
  const showToolbar = !readOnly && !message.optimistic && !editing;

  function openAuthorProfile(element: HTMLElement) {
    void profileUi?.openSmallProfile(message.user_id, element);
  }

  useEffect(() => {
    if (!menuOpen && !fullPickerOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        moreMenuRef.current?.contains(target) ||
        emojiMenuRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
      setFullPickerOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen, fullPickerOpen]);

  async function saveEdit() {
    const next = editDraft.trim();
    if (!next || next === message.content) {
      setEditing(false);
      setEditDraft(message.content);
      setEditError(null);
      return;
    }
    if (next.length > MESSAGE_MAX) {
      setEditError(MESSAGE_MAX_REACHED);
      return;
    }
    setSaving(true);
    setEditError(null);
    const ok = await onEdit(message.id, next);
    setSaving(false);
    if (ok) setEditing(false);
  }

  async function copyText() {
    const value = message.content || message.attachment_url || "";
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be blocked; the menu still closes.
    }
    setMenuOpen(false);
  }

  function react(emoji: string) {
    onReact?.(emoji);
    setFullPickerOpen(false);
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await onDelete(message.id);
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const statusBits = (
    <>
      {message.edited_at && (
        <span className="text-[11px] text-[var(--ms-text-muted)]">(edited)</span>
      )}
      {message.pinned && (
        <span className="inline-flex items-center gap-1 text-[11px] text-accent">
          <Pin className="h-3 w-3" strokeWidth={2} />
          Pinned
        </span>
      )}
      {message.optimistic && !message.failed && (
        <span className="text-[11px] text-[var(--ms-text-muted)]">Sending…</span>
      )}
      {message.failed && (
        <span className="text-[11px] text-accent">Failed to send</span>
      )}
    </>
  );

  const missedCall = formatMissedCallLabel(message.content, {
    currentUserId,
    messageUserId: message.user_id,
  });
  // Always render missed-call payloads as system notices (even if is_system
  // failed to persist), so the raw [[missed_call]]|… string never leaks.
  if (message.is_system || missedCall || isMissedCallPayload(message.content)) {
    const SystemIcon = missedCall
      ? missedCall.withVideo
        ? VideoOff
        : PhoneMissed
      : Pin;
    const label =
      missedCall?.text ??
      (isMissedCallPayload(message.content) ? "Missed call" : message.content);

    return (
      <article
        id={`message-${message.id}`}
        data-message-id={message.id}
        className="group relative flex items-center gap-3 px-2 py-1 sm:gap-4 sm:px-4"
      >
        <div className="flex w-10 shrink-0 justify-center">
          <SystemIcon
            className="h-4 w-4 text-[var(--ms-text-muted)]"
            strokeWidth={2}
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[var(--ms-text-muted)]">
            {label}
            <time
              dateTime={message.created_at}
              title={formatTimestamp(message.created_at)}
              className="ml-2 text-[11px] text-[var(--ms-text-muted)]/70"
            >
              {formatMessageTime(message.created_at)}
            </time>
          </p>
        </div>
      </article>
    );
  }

  return (
    <>
    <article
      id={`message-${message.id}`}
      data-message-id={message.id}
      className={`group relative flex gap-3 px-2 transition-colors hover:bg-white/[0.03] sm:gap-4 sm:px-4 ${
        compact ? "items-start py-0" : "items-start py-0.5"
      } ${message.optimistic ? "opacity-70" : ""} ${
        message.failed ? "bg-accent-muted/40" : ""
      }`}
    >
      {compact ? (
        // Match avatar column width; keep timestamp out of flow so it can't
        // wrap and invent blank lines under short messages.
        <div className="relative w-10 shrink-0 self-stretch">
          <time
            dateTime={message.created_at}
            title={formatTimestamp(message.created_at)}
            className="pointer-events-none absolute right-0 top-0 select-none whitespace-nowrap text-[10px] leading-[1.375rem] text-[var(--ms-text-muted)] opacity-0 transition-opacity group-hover:opacity-100"
          >
            {formatMessageTime(message.created_at)}
          </time>
        </div>
      ) : (
        <button
          type="button"
          className="mt-0.5 shrink-0 self-start rounded-full"
          onClick={(event) => openAuthorProfile(event.currentTarget)}
          aria-label={`Open ${author}'s profile`}
        >
          <UserAvatar
            username={author}
            avatarUrl={message.profiles?.avatar_url}
            size="md"
          />
        </button>
      )}

      <div className={`min-w-0 flex-1 pr-2 ${compact ? "py-0" : "py-0.5"}`}>
        {!compact &&
          reply &&
          (replyHidden ? (
            <div className="mb-1 flex max-w-full items-center gap-1.5 text-left">
              <span
                className="mb-1 ml-2 mr-0.5 h-2.5 w-7 shrink-0 rounded-tl-md border-l-2 border-t-2 border-[#4e5058]"
                aria-hidden
              />
              <span className="min-w-0 truncate text-xs italic text-[var(--ms-text-muted)]">
                {replyBlocked
                  ? "Original message was sent by a blocked user."
                  : "Original message was sent by an ignored user."}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onJumpToReply?.(reply.id)}
              className="mb-1 flex max-w-full items-center gap-1.5 text-left"
            >
              <span
                className="mb-1 ml-2 mr-0.5 h-2.5 w-7 shrink-0 rounded-tl-md border-l-2 border-t-2 border-[#4e5058]"
                aria-hidden
              />
              <UserAvatar
                username={replyAuthor}
                avatarUrl={reply.profiles?.avatar_url}
                size="sm"
                className="!h-4 !w-4 !text-[9px]"
              />
              <span
                className={`shrink-0 text-xs font-medium hover:underline ${
                  replyRoleColor ? "" : "text-[var(--ms-text)]"
                }`}
                style={replyRoleColor ? { color: replyRoleColor } : undefined}
              >
                {replyAuthor}
              </span>
              <span className="min-w-0 truncate text-xs text-[var(--ms-text-muted)]">
                {reply.content
                  ? displayMentionText(reply.content, mentionMaps)
                  : "Attachment"}
              </span>
            </button>
          ))}

        {!compact && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <button
              type="button"
              onClick={(event) => openAuthorProfile(event.currentTarget)}
              className={`text-[0.95rem] font-medium hover:underline ${
                authorRoleColor ? "" : "text-foreground"
              }`}
              style={authorRoleColor ? { color: authorRoleColor } : undefined}
            >
              {author}
            </button>
            <time className="text-[11px] text-[var(--ms-text-muted)]">
              {formatTimestamp(message.created_at)}
            </time>
            {statusBits}
          </div>
        )}

        {compact &&
          (message.edited_at ||
            message.pinned ||
            message.optimistic ||
            message.failed) && (
            <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {statusBits}
            </div>
          )}

        {editing ? (
          <div className="mt-1 space-y-2">
            <textarea
              value={editDraft}
              onChange={(event) => {
                const value = event.target.value;
                if (value.length > MESSAGE_MAX) {
                  setEditDraft(value.slice(0, MESSAGE_MAX));
                  setEditError(MESSAGE_MAX_REACHED);
                  return;
                }
                setEditError(null);
                setEditDraft(value);
              }}
              rows={2}
              className="w-full resize-y rounded-md border border-[var(--ms-border)] bg-[var(--ms-border)] px-3 py-2 text-sm text-foreground outline-none [overflow-wrap:anywhere] whitespace-pre-wrap focus:border-accent/60 focus:ring-1 focus:ring-accent/40"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setEditing(false);
                  setEditDraft(message.content);
                  setEditError(null);
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void saveEdit();
                }
              }}
            />
            {editError && <p className="text-xs text-accent">{editError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveEdit()}
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                Save
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setEditDraft(message.content);
                }}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[var(--ms-text-muted)] hover:bg-surface-hover hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
                Cancel
              </button>
              <span className="text-[10px] text-[var(--ms-text-muted)]">
                escape to cancel · enter to save
              </span>
            </div>
          </div>
        ) : (
          <>
            {message.forwarded_from &&
            typeof message.forwarded_from === "object" &&
            !Array.isArray(message.forwarded_from) ? (
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--ms-text-muted)]">
                Forwarded
                {(message.forwarded_from as { from?: string }).from
                  ? ` from ${(message.forwarded_from as { from?: string }).from}`
                  : ""}
              </p>
            ) : null}
            {message.content && message.message_kind !== "poll" && (
              <div className="break-words text-[0.95rem] leading-relaxed text-[var(--ms-text)] [overflow-wrap:anywhere] whitespace-pre-wrap">
                {formatMessageContent(message.content, {
                  currentUserId,
                  currentUsername,
                  roleNames,
                  channelNames,
                  mentionMaps,
                  emojiCatalog,
                  customEmojis,
                  preferredServerId,
                  serverNamesById,
                })}
              </div>
            )}
            {message.message_kind === "poll" &&
            message.poll &&
            typeof message.poll === "object" &&
            !Array.isArray(message.poll) ? (
              <PollCard
                poll={message.poll as unknown as PollData}
                votes={pollVotes}
                currentUserId={currentUserId}
                onVote={(index) => onPollVote?.(message.id, index)}
              />
            ) : null}
            <MessageMedia message={message} />
            {message.content && message.message_kind !== "poll" && (
              <LinkEmbeds content={message.content} />
            )}
          </>
        )}

        {reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {reactions.map((reaction) => {
              const pillClass = `inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition ${
                reaction.reacted
                  ? "border-accent/60 bg-accent/15 text-white shadow-[0_0_0_1px_rgba(220,38,38,0.12)]"
                  : "border-transparent bg-[var(--ms-sidebar)] text-[var(--ms-text)] hover:border-[#4e5058]"
              }`;
              const body = (
                <>
                  <ReactionEmoji
                    token={reaction.emoji}
                    catalog={emojiCatalog}
                    size={20}
                  />
                  <span>{reaction.count}</span>
                </>
              );
              return (
                <ReactionInfoTip
                  key={reaction.emoji}
                  reaction={reaction}
                  catalog={emojiCatalog}
                  reactorNamesById={reactorNamesById}
                  currentUserId={currentUserId}
                >
                  {readOnly ? (
                    <span className={pillClass}>{body}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onReact?.(reaction.emoji)}
                      className={pillClass}
                    >
                      {body}
                    </button>
                  )}
                </ReactionInfoTip>
              );
            })}
            {showToolbar && onReact && (
              <button
                type="button"
                onClick={() => {
                  setFullPickerOpen(true);
                  setMenuOpen(false);
                }}
                className="inline-flex items-center rounded-full border border-transparent bg-[var(--ms-sidebar)] px-1.5 py-0.5 text-[#b5bac1] opacity-0 transition group-hover:opacity-100 hover:border-[#4e5058] hover:text-white"
                aria-label="Add reaction"
              >
                <SmilePlus className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            )}
          </div>
        )}
      </div>

      {showToolbar && (
        <div
          ref={menuRef}
          className={`absolute -top-3 right-4 z-10 items-center overflow-visible rounded-xl border border-white/[0.08] bg-[#111214] shadow-lg shadow-black/40 ${
            menuOpen || fullPickerOpen
              ? "flex"
              : "hidden group-hover:flex group-focus-within:flex"
          }`}
        >
          {onReact && (
            <>
              {QUICK_REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => react(emoji)}
                  className="px-1.5 py-1 text-sm transition-colors hover:bg-[var(--ms-sidebar)]"
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
              <div className="relative">
                <HoverTip label="Add Reaction" delayMs={40}>
                  <button
                    ref={emojiBtnRef}
                    type="button"
                    onClick={() => {
                      setFullPickerOpen((open) => !open);
                      setMenuOpen(false);
                    }}
                    className="p-1.5 text-[#b5bac1] transition-colors hover:bg-[var(--ms-sidebar)] hover:text-foreground"
                    aria-label="More reactions"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                  </button>
                </HoverTip>
                <MessageFloatingMenu
                  open={fullPickerOpen}
                  anchorRef={emojiBtnRef}
                  menuRef={emojiMenuRef}
                  estimatedHeight={380}
                >
                  <EmojiPicker
                    customEmojis={customEmojis}
                    serverNamesById={serverNamesById}
                    onPick={(pick) =>
                      react(pick.kind === "custom" ? pick.token : pick.char)
                    }
                  />
                </MessageFloatingMenu>
              </div>
            </>
          )}
          <HoverTip label="Reply" delayMs={40}>
            <button
              type="button"
              onClick={() => onReply(message)}
              className="p-1.5 text-[#b5bac1] transition-colors hover:bg-[var(--ms-sidebar)] hover:text-foreground"
              aria-label="Reply"
            >
              <Reply className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </HoverTip>
          {onTogglePin && (
            <HoverTip
              label={message.pinned ? "Unpin Message" : "Pin Message"}
              delayMs={40}
            >
              <button
                type="button"
                onClick={onTogglePin}
                className="p-1.5 text-[#b5bac1] transition-colors hover:bg-[var(--ms-sidebar)] hover:text-foreground"
                aria-label={message.pinned ? "Unpin message" : "Pin message"}
              >
                {message.pinned ? (
                  <PinOff className="h-4 w-4" strokeWidth={1.75} />
                ) : (
                  <Pin className="h-4 w-4" strokeWidth={1.75} />
                )}
              </button>
            </HoverTip>
          )}
          {isOwn && (
            <HoverTip label="Edit" delayMs={40}>
              <button
                type="button"
                onClick={() => {
                  setEditDraft(message.content);
                  setEditing(true);
                  setMenuOpen(false);
                  setFullPickerOpen(false);
                }}
                className="p-1.5 text-[#b5bac1] transition-colors hover:bg-[var(--ms-sidebar)] hover:text-foreground"
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </HoverTip>
          )}
          <div className="relative">
            <HoverTip label="More" delayMs={40}>
              <button
                ref={moreBtnRef}
                type="button"
                onClick={() => {
                  setMenuOpen((open) => !open);
                  setFullPickerOpen(false);
                }}
                className="p-1.5 text-[#b5bac1] transition-colors hover:bg-[var(--ms-sidebar)] hover:text-foreground"
                aria-label="More"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </HoverTip>
            <MessageFloatingMenu
              open={menuOpen}
              anchorRef={moreBtnRef}
              menuRef={moreMenuRef}
              estimatedHeight={260}
              className="min-w-[11rem] overflow-hidden rounded-md border border-[var(--ms-border)] bg-[#111214] py-1.5 shadow-xl shadow-black/50"
            >
              <button
                type="button"
                onClick={() => void copyText()}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ms-text)] hover:bg-[#3a3c43] hover:text-white"
              >
                {copied ? (
                  <Check className="h-4 w-4" strokeWidth={2} />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={1.75} />
                )}
                {copied ? "Copied" : "Copy Text"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onReply(message);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ms-text)] hover:bg-[#3a3c43] hover:text-white"
              >
                <Reply className="h-4 w-4" strokeWidth={1.75} />
                Reply
              </button>
              {onTogglePin && (
                <button
                  type="button"
                  onClick={() => {
                    onTogglePin();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ms-text)] hover:bg-[#3a3c43] hover:text-white"
                >
                  {message.pinned ? (
                    <PinOff className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <Pin className="h-4 w-4" strokeWidth={1.75} />
                  )}
                  {message.pinned ? "Unpin Message" : "Pin Message"}
                </button>
              )}
              {onForward && !message.is_system && (
                <button
                  type="button"
                  onClick={() => {
                    onForward(message);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ms-text)] hover:bg-[#3a3c43] hover:text-white"
                >
                  <Forward className="h-4 w-4" strokeWidth={1.75} />
                  Forward
                </button>
              )}
              {onCreateThread && !message.is_system && !message.thread_id && (
                <button
                  type="button"
                  onClick={() => {
                    onCreateThread(message);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ms-text)] hover:bg-[#3a3c43] hover:text-white"
                >
                  <MessagesSquare className="h-4 w-4" strokeWidth={1.75} />
                  Create Thread
                </button>
              )}
              {onMarkUnread && (
                <button
                  type="button"
                  onClick={() => {
                    onMarkUnread(message);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ms-text)] hover:bg-[#3a3c43] hover:text-white"
                >
                  Mark Unread
                </button>
              )}
              {onCopyLink && (
                <button
                  type="button"
                  onClick={() => {
                    onCopyLink(message);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ms-text)] hover:bg-[#3a3c43] hover:text-white"
                >
                  <Link2 className="h-4 w-4" strokeWidth={1.75} />
                  Copy Message Link
                </button>
              )}
              {isOwn && (
                <button
                  type="button"
                  onClick={() => {
                    setEditDraft(message.content);
                    setEditing(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ms-text)] hover:bg-[#3a3c43] hover:text-white"
                >
                  <Pencil className="h-4 w-4" strokeWidth={1.75} />
                  Edit Message
                </button>
              )}
              {(isOwn || canDeleteOthers) && (
                <>
                  <div className="my-1 border-t border-[var(--ms-border)]" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteOpen(true);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ms-danger)] hover:bg-[#ed4245] hover:text-white"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    Delete Message
                  </button>
                </>
              )}
            </MessageFloatingMenu>
          </div>
        </div>
      )}
    </article>
    <ConfirmModal
      open={deleteOpen}
      title="Delete Message"
      description="Are you sure you want to delete this message? This can't be undone."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      danger
      busy={deleting}
      onConfirm={() => void confirmDelete()}
      onCancel={() => {
        if (!deleting) setDeleteOpen(false);
      }}
    />
    </>
  );
}
