"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Reply,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { formatTimestamp } from "@/components/messenger/data";
import { formatMessageContent } from "@/components/messenger/formatMessageContent";
import { useOptionalProfileUi } from "@/components/profile/ProfileProvider";
import type { MentionMaps } from "@/lib/mentions";
import {
  QUICK_REACTIONS,
  type ChatMessage,
  type ReactionGroup,
} from "@/components/messenger/types";

type MessageItemProps = {
  message: ChatMessage;
  isOwn: boolean;
  reactions?: ReactionGroup[];
  currentUserId?: string | null;
  currentUsername?: string | null;
  roleNames?: string[];
  channelNames?: string[];
  mentionMaps?: MentionMaps;
  canDeleteOthers?: boolean;
  onReply: (message: ChatMessage) => void;
  onEdit: (messageId: string, content: string) => Promise<boolean>;
  onDelete: (messageId: string) => Promise<void>;
  onJumpToReply?: (messageId: string) => void;
  onReact?: (emoji: string) => void;
  onTogglePin?: () => void;
};

function isImageAttachment(message: ChatMessage) {
  if (!message.attachment_url) return false;
  if (message.attachment_type?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(message.attachment_url);
}

export function MessageItem({
  message,
  isOwn,
  reactions = [],
  currentUserId = null,
  currentUsername,
  roleNames,
  channelNames,
  mentionMaps,
  canDeleteOthers = false,
  onReply,
  onEdit,
  onDelete,
  onJumpToReply,
  onReact,
  onTogglePin,
}: MessageItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const profileUi = useOptionalProfileUi();
  const author = message.profiles?.username ?? "Unknown";
  const reply = message.reply_to;
  const replyAuthor = reply?.profiles?.username ?? "Unknown";
  const showToolbar = !message.optimistic && !editing;

  function openAuthorProfile(element: HTMLElement) {
    void profileUi?.openSmallProfile(message.user_id, element);
  }

  useEffect(() => {
    if (!menuOpen && !pickerOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setPickerOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen, pickerOpen]);

  async function saveEdit() {
    const next = editDraft.trim();
    if (!next || next === message.content) {
      setEditing(false);
      setEditDraft(message.content);
      return;
    }
    setSaving(true);
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

  return (
    <article
      id={`message-${message.id}`}
      className={`group relative flex gap-4 px-4 py-0.5 transition-colors hover:bg-white/[0.03] ${
        message.optimistic ? "opacity-70" : ""
      } ${message.failed ? "bg-accent-muted/40" : ""}`}
    >
      <button
        type="button"
        className="mt-0.5 shrink-0 rounded-full"
        onClick={(event) => openAuthorProfile(event.currentTarget)}
        aria-label={`Open ${author}'s profile`}
      >
        <UserAvatar
          username={author}
          avatarUrl={message.profiles?.avatar_url}
          size="md"
        />
      </button>

      <div className="min-w-0 flex-1 py-0.5 pr-2">
        {reply && (
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
            <span className="shrink-0 text-xs font-medium text-accent hover:underline">
              {replyAuthor}
            </span>
            <span className="min-w-0 truncate text-xs text-muted">
              {reply.content || "Attachment"}
            </span>
          </button>
        )}

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <button
            type="button"
            onClick={(event) => openAuthorProfile(event.currentTarget)}
            className="text-[0.95rem] font-medium text-foreground hover:underline"
          >
            {author}
          </button>
          <time className="text-[11px] text-muted">
            {formatTimestamp(message.created_at)}
          </time>
          {message.edited_at && (
            <span className="text-[11px] text-muted">(edited)</span>
          )}
          {message.pinned && (
            <span className="inline-flex items-center gap-1 text-[11px] text-accent">
              <Pin className="h-3 w-3" strokeWidth={2} />
              Pinned
            </span>
          )}
          {message.optimistic && !message.failed && (
            <span className="text-[11px] text-muted">Sending…</span>
          )}
          {message.failed && (
            <span className="text-[11px] text-accent">Failed to send</span>
          )}
        </div>

        {editing ? (
          <div className="mt-1 space-y-2">
            <textarea
              value={editDraft}
              onChange={(event) => setEditDraft(event.target.value)}
              rows={2}
              className="w-full resize-y rounded-md border border-border bg-[#1e1f22] px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent-ring"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setEditing(false);
                  setEditDraft(message.content);
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void saveEdit();
                }
              }}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveEdit()}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
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
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
                Cancel
              </button>
              <span className="text-[10px] text-muted">
                escape to cancel · enter to save
              </span>
            </div>
          </div>
        ) : (
          <>
            {message.content && (
              <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed text-[#dbdee1]">
                {formatMessageContent(message.content, {
                  currentUserId,
                  currentUsername,
                  roleNames,
                  channelNames,
                  mentionMaps,
                })}
              </p>
            )}
            {message.attachment_url && isImageAttachment(message) && (
              <a
                href={message.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={message.attachment_url}
                  alt=""
                  className="max-h-80 max-w-md rounded-md object-contain"
                />
              </a>
            )}
            {message.attachment_url && !isImageAttachment(message) && (
              <a
                href={message.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex max-w-full items-center gap-2 rounded-md bg-[#2b2d31] px-3 py-2 text-sm text-[#dbdee1] hover:bg-[#35373c]"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
                <span className="truncate">Open attachment</span>
              </a>
            )}
          </>
        )}

        {reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => onReact?.(reaction.emoji)}
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ${
                  reaction.reacted
                    ? "border-accent bg-accent-muted text-white"
                    : "border-transparent bg-[#2b2d31] text-[#dbdee1] hover:border-[#4e5058]"
                }`}
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showToolbar && (
        <div
          ref={menuRef}
          className={`absolute -top-3 right-4 z-10 items-center overflow-visible rounded-md border border-[#1e1f22] bg-[#111214] shadow-lg shadow-black/40 ${
            menuOpen || pickerOpen
              ? "flex"
              : "hidden group-hover:flex group-focus-within:flex"
          }`}
        >
          {onReact && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setPickerOpen((open) => !open);
                  setMenuOpen(false);
                }}
                className="p-1.5 text-[#b5bac1] transition-colors hover:bg-[#2b2d31] hover:text-foreground"
                aria-label="Add reaction"
                title="Add Reaction"
              >
                <SmilePlus className="h-4 w-4" strokeWidth={1.75} />
              </button>
              {pickerOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 flex gap-0.5 rounded-md border border-[#1e1f22] bg-[#111214] p-1 shadow-xl">
                  {QUICK_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(emoji);
                        setPickerOpen(false);
                      }}
                      className="rounded-md px-1.5 py-1 text-base hover:bg-white/10"
                      aria-label={`React with ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => onReply(message)}
            className="p-1.5 text-[#b5bac1] transition-colors hover:bg-[#2b2d31] hover:text-foreground"
            aria-label="Reply"
            title="Reply"
          >
            <Reply className="h-4 w-4" strokeWidth={1.75} />
          </button>
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              className="p-1.5 text-[#b5bac1] transition-colors hover:bg-[#2b2d31] hover:text-foreground"
              aria-label={message.pinned ? "Unpin message" : "Pin message"}
              title={message.pinned ? "Unpin" : "Pin"}
            >
              {message.pinned ? (
                <PinOff className="h-4 w-4" strokeWidth={1.75} />
              ) : (
                <Pin className="h-4 w-4" strokeWidth={1.75} />
              )}
            </button>
          )}
          {isOwn && (
            <button
              type="button"
              onClick={() => {
                setEditDraft(message.content);
                setEditing(true);
                setMenuOpen(false);
                setPickerOpen(false);
              }}
              className="p-1.5 text-[#b5bac1] transition-colors hover:bg-[#2b2d31] hover:text-foreground"
              aria-label="Edit"
              title="Edit"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setMenuOpen((open) => !open);
                setPickerOpen(false);
              }}
              className="p-1.5 text-[#b5bac1] transition-colors hover:bg-[#2b2d31] hover:text-foreground"
              aria-label="More"
              title="More"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] overflow-hidden rounded-md border border-border bg-[#111214] py-1.5 shadow-xl shadow-black/50">
                <button
                  type="button"
                  onClick={() => void copyText()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent hover:text-white"
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
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent hover:text-white"
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
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent hover:text-white"
                  >
                    {message.pinned ? (
                      <PinOff className="h-4 w-4" strokeWidth={1.75} />
                    ) : (
                      <Pin className="h-4 w-4" strokeWidth={1.75} />
                    )}
                    {message.pinned ? "Unpin Message" : "Pin Message"}
                  </button>
                )}
                {onReact && (
                  <div className="flex gap-1 px-3 py-2">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          onReact(emoji);
                          setMenuOpen(false);
                        }}
                        className="rounded-md px-1 py-0.5 text-base hover:bg-white/10"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                {isOwn && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditDraft(message.content);
                      setEditing(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent hover:text-white"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.75} />
                    Edit Message
                  </button>
                )}
                {(isOwn || canDeleteOthers) && (
                  <>
                    <div className="my-1 border-t border-border" />
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void onDelete(message.id);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-accent hover:bg-accent hover:text-white"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      Delete Message
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
