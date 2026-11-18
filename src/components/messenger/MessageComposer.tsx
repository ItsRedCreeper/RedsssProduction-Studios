"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Film,
  Hash,
  Paperclip,
  Plus,
  Reply,
  Shield,
  User,
  X,
} from "lucide-react";
import {
  TypingIndicator,
  type TypingPerson,
} from "@/components/messenger/TypingIndicator";
import { HoverTip } from "@/components/ui/HoverTip";
import { MESSAGE_MAX, MESSAGE_MAX_REACHED } from "@/lib/field-limits";
import {
  formatFileSize,
  isImageMime,
  isVideoMime,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from "@/lib/message-media";

export type MentionSuggestion = {
  id: string;
  label: string;
  kind: "user" | "role" | "channel";
};

export type PendingAttachment = {
  id: string;
  file: File;
  previewUrl: string | null;
};

type MessageComposerProps = {
  placeholder: string;
  draft: string;
  replyAuthor: string | null;
  replyContent: string | null;
  pendingFiles: PendingAttachment[];
  sending: boolean;
  allowAttach: boolean;
  disabled?: boolean;
  mentionSuggestions?: MentionSuggestion[];
  typingPeople?: TypingPerson[];
  onDraft: (value: string) => void;
  onCancelReply: () => void;
  onFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  onSubmit: () => void;
  onTyping?: () => void;
  onTypingStop?: () => void;
  onLimitReached?: (message: string) => void;
};

function resizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "0px";
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

export function MessageComposer({
  placeholder,
  draft,
  replyAuthor,
  replyContent,
  pendingFiles,
  sending,
  allowAttach,
  disabled,
  mentionSuggestions = [],
  typingPeople = [],
  onDraft,
  onCancelReply,
  onFiles,
  onRemoveFile,
  onSubmit,
  onTyping,
  onTypingStop,
  onLimitReached,
}: MessageComposerProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const typingStopTimer = useRef<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const replying = !!replyAuthor;

  useEffect(() => {
    return () => {
      if (typingStopTimer.current != null) {
        window.clearTimeout(typingStopTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    resizeTextarea(inputRef.current);
  }, [draft]);

  function bumpTyping() {
    onTyping?.();
    if (typingStopTimer.current != null) {
      window.clearTimeout(typingStopTimer.current);
    }
    typingStopTimer.current = window.setTimeout(() => {
      typingStopTimer.current = null;
      onTypingStop?.();
    }, 1100);
  }

  function clearTypingSoon() {
    if (typingStopTimer.current != null) {
      window.clearTimeout(typingStopTimer.current);
      typingStopTimer.current = null;
    }
    onTypingStop?.();
  }

  function setDraftValue(value: string) {
    if (value.length > MESSAGE_MAX) {
      onDraft(value.slice(0, MESSAGE_MAX));
      onLimitReached?.(MESSAGE_MAX_REACHED);
      return;
    }
    onDraft(value);
  }

  function takeFiles(list: FileList | File[] | null) {
    if (!list || !allowAttach) return;
    onFiles(Array.from(list));
  }

  const mentionQuery = useMemo(() => {
    const cursor = inputRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    const match = before.match(/(^|[\s])([@#])([^\n@#]*)$/);
    if (!match) return null;
    return {
      trigger: match[2] as "@" | "#",
      query: match[3].toLowerCase(),
      start: before.length - match[2].length - match[3].length,
    };
  }, [draft]);

  const filteredMentions = useMemo(() => {
    if (!mentionQuery) return [];
    const kindFilter =
      mentionQuery.trigger === "#"
        ? (item: MentionSuggestion) => item.kind === "channel"
        : (item: MentionSuggestion) =>
            item.kind === "user" || item.kind === "role";
    const query = mentionQuery.query.trim();
    const queryCompact = query.replace(/\s+/g, " ");
    return mentionSuggestions
      .filter(kindFilter)
      .filter((item) => {
        const label = item.label.toLowerCase();
        if (!queryCompact) return true;
        if (label.includes(queryCompact)) return true;
        const parts = queryCompact.split(" ").filter(Boolean);
        return parts.every((part) => label.includes(part));
      })
      .slice(0, 8);
  }, [mentionQuery, mentionSuggestions]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery?.query, mentionQuery?.trigger]);

  function applyMention(item: MentionSuggestion) {
    if (!mentionQuery) return;
    const prefix = item.kind === "channel" ? "#" : "@";
    const before = draft.slice(0, mentionQuery.start);
    const after = draft.slice(inputRef.current?.selectionStart ?? draft.length);
    const next = `${before}${prefix}${item.label} ${after}`;
    setDraftValue(next);
    requestAnimationFrame(() => {
      const pos = Math.min(
        before.length + prefix.length + item.label.length + 1,
        MESSAGE_MAX,
      );
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    clearTypingSoon();
    onSubmit();
  }

  return (
    <div
      className="shrink-0 px-4 pb-6 pt-2"
      onDragEnter={(event) => {
        if (!allowAttach) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!allowAttach) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!allowAttach) return;
        event.preventDefault();
        setDragging(false);
        takeFiles(event.dataTransfer.files);
      }}
    >
      <TypingIndicator people={typingPeople} className="mb-1.5 px-1" />
      {replying && (
        <div className="flex items-center gap-2 rounded-t-md border-l-4 border-accent bg-[#2b2d31] px-4 py-2">
          <Reply className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-accent">
              Replying to {replyAuthor}
            </p>
            <HoverTip
              label={replyContent}
              onlyIfTruncated
              delayMs={40}
              className="block min-w-0"
            >
              <p className="truncate text-xs text-muted">{replyContent}</p>
            </HoverTip>
          </div>
          <HoverTip label="Cancel Reply" delayMs={40}>
            <button
              type="button"
              onClick={onCancelReply}
              className="rounded-md p-1 text-muted hover:bg-white/10 hover:text-foreground"
              aria-label="Cancel reply"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </HoverTip>
        </div>
      )}
      {pendingFiles.length > 0 && (
        <div
          className={`flex flex-wrap gap-2 bg-[#2b2d31] px-3 py-2 ${
            replying ? "" : "rounded-t-md"
          }`}
        >
          {pendingFiles.map((item) => {
            const image = isImageMime(item.file.type);
            const video = isVideoMime(item.file.type);
            return (
              <div
                key={item.id}
                className="relative w-28 overflow-hidden rounded-md border border-[#3f4147] bg-[#1e1f22]"
              >
                {image && item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="h-20 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-20 flex-col items-center justify-center gap-1 px-2 text-[#949ba4]">
                    {video ? (
                      <Film className="h-5 w-5" strokeWidth={1.75} />
                    ) : item.file.type.startsWith("text/") ||
                      item.file.type.includes("pdf") ? (
                      <FileText className="h-5 w-5" strokeWidth={1.75} />
                    ) : (
                      <Paperclip className="h-5 w-5" strokeWidth={1.75} />
                    )}
                  </div>
                )}
                <div className="space-y-0.5 px-1.5 py-1">
                  <p className="truncate text-[10px] text-[#dbdee1]">
                    {item.file.name}
                  </p>
                  <p className="text-[10px] text-[#949ba4]">
                    {formatFileSize(item.file.size)}
                    {item.file.size > MAX_ATTACHMENT_BYTES ? " · too large" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveFile(item.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white hover:bg-black"
                  aria-label={`Remove ${item.file.name}`}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="relative">
        {filteredMentions.length > 0 && (
          <ul className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-full overflow-y-auto rounded-md border border-[#1e1f22] bg-[#111214] py-1 shadow-xl">
            {filteredMentions.map((item, index) => {
              const Icon =
                item.kind === "channel"
                  ? Hash
                  : item.kind === "role"
                    ? Shield
                    : User;
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applyMention(item);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                      index === mentionIndex
                        ? "bg-accent/20 text-white"
                        : "text-[#dbdee1] hover:bg-white/5"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
                    <span className="font-medium">
                      {item.kind === "channel" ? "#" : "@"}
                      {item.label}
                    </span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted">
                      {item.kind}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <form
          onSubmit={handleSubmit}
          className={`flex items-end gap-3 bg-[#383a40] px-4 py-3 ${
            dragging ? "ring-2 ring-accent/60" : ""
          } ${
            replying || pendingFiles.length > 0 ? "rounded-b-md" : "rounded-md"
          }`}
        >
          {allowAttach && (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  takeFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <HoverTip label="Upload a File" delayMs={40}>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={
                    disabled ||
                    sending ||
                    pendingFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE
                  }
                  className="mb-0.5 shrink-0 rounded-full bg-[#4e5058] p-1 text-[#dbdee1] hover:bg-[#5c5e66] hover:text-white disabled:opacity-40"
                  aria-label="Attach file"
                >
                  <Plus className="h-5 w-5" strokeWidth={2.25} />
                </button>
              </HoverTip>
            </>
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(event) => {
              setDraftValue(event.target.value);
              if (event.target.value.trim()) bumpTyping();
              else clearTypingSoon();
              resizeTextarea(event.currentTarget);
            }}
            onKeyDown={(event) => {
              if (filteredMentions.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setMentionIndex((i) => (i + 1) % filteredMentions.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setMentionIndex(
                    (i) =>
                      (i - 1 + filteredMentions.length) %
                      filteredMentions.length,
                  );
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  applyMention(
                    filteredMentions[mentionIndex] ?? filteredMentions[0],
                  );
                  return;
                }
                if (event.key === "Escape") {
                  onDraft(`${draft} `);
                  return;
                }
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (
                  !disabled &&
                  !sending &&
                  (draft.trim() || pendingFiles.length > 0)
                ) {
                  clearTypingSoon();
                  onSubmit();
                }
              }
            }}
            placeholder={
              dragging ? "Drop files to attach…" : placeholder
            }
            disabled={disabled || sending}
            className="max-h-40 min-h-[24px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent text-[15px] leading-6 text-[#dbdee1] outline-none placeholder:text-[#6d6f78] [overflow-wrap:anywhere] whitespace-pre-wrap"
          />
          <button
            type="submit"
            disabled={
              disabled ||
              sending ||
              (!draft.trim() && pendingFiles.length === 0)
            }
            className="mb-0.5 shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
