"use client";

import {
  FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  Film,
  Hash,
  Image as ImageIcon,
  Plus,
  Reply,
  Shield,
  Smile,
  User,
  X,
} from "lucide-react";
import {
  TypingIndicator,
  type TypingPerson,
} from "@/components/messenger/TypingIndicator";
import { EmojiPicker, type EmojiPick } from "@/components/messenger/EmojiPicker";
import { GifPicker, type GifResult } from "@/components/messenger/GifPicker";
import { ComposerDraftMirror } from "@/components/messenger/ComposerDraftMirror";
import { CustomEmoji } from "@/components/messenger/CustomEmoji";
import { HoverTip } from "@/components/ui/HoverTip";
import { MESSAGE_MAX, MESSAGE_MAX_REACHED } from "@/lib/field-limits";
import {
  customEmojiToken,
  expandComposerDraft,
  findEmojiByName,
  findEmojisByNamePrefix,
  isComposerEmojiSlot,
  type ServerEmoji,
} from "@/lib/emoji";
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
  customEmojis?: ServerEmoji[];
  serverNamesById?: Record<string, string>;
  /** Prefer this server when `:name:` collides across servers. */
  preferredServerId?: string | null;
  onDraft: (value: string) => void;
  onCancelReply: () => void;
  onFiles: (files: File[]) => void;
  onRemoveFile: (id: string) => void;
  onPickGif?: (gif: GifResult) => void;
  /** Optional expanded content (emoji slots → tokens) for send. */
  onSubmit: (content?: string) => void;
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
  customEmojis = [],
  serverNamesById = {},
  preferredServerId = null,
  onDraft,
  onCancelReply,
  onFiles,
  onRemoveFile,
  onPickGif,
  onSubmit,
  onTyping,
  onTypingStop,
  onLimitReached,
}: MessageComposerProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const gifBtnRef = useRef<HTMLButtonElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const typingStopTimer = useRef<number | null>(null);
  const slotMapRef = useRef(new Map<string, string>());
  const slotSeqRef = useRef(0);
  const [slotVersion, setSlotVersion] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [emojiSuggestIndex, setEmojiSuggestIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [pickerStyle, setPickerStyle] = useState<CSSProperties | null>(null);
  const replying = !!replyAuthor;

  const emojiCatalog = useMemo(() => {
    const map = new Map<string, ServerEmoji>();
    for (const emoji of customEmojis) map.set(emoji.id, emoji);
    return map;
  }, [customEmojis]);

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const emoji of customEmojis) {
      const key = emoji.name.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [customEmojis]);

  function allocEmojiSlot(emoji: ServerEmoji) {
    const code = 0xe000 + (slotSeqRef.current % 6400);
    slotSeqRef.current += 1;
    const slot = String.fromCharCode(code);
    slotMapRef.current.set(slot, customEmojiToken(emoji));
    setSlotVersion((value) => value + 1);
    return slot;
  }

  function expandForSend(value: string) {
    return expandComposerDraft(
      value,
      slotMapRef.current,
      customEmojis,
      preferredServerId,
    );
  }

  /** Collapse completed `:name:` shortcodes into emoji chips (prefer current server). */
  function collapseShortcodes(value: string, cursor: number) {
    const re = /(?<![<a]):([a-zA-Z0-9_]{2,32}):/g;
    let out = "";
    let last = 0;
    let nextCursor = cursor;
    let match: RegExpExecArray | null;
    while ((match = re.exec(value))) {
      const name = match[1];
      const hit = findEmojiByName(name, customEmojis, preferredServerId);
      if (!hit) continue;
      const slot = allocEmojiSlot(hit);
      out += value.slice(last, match.index) + slot;
      if (cursor > match.index) {
        const removed = match[0].length - 1;
        nextCursor = Math.max(match.index + 1, nextCursor - removed);
      }
      last = match.index + match[0].length;
    }
    out += value.slice(last);
    return { value: out, cursor: nextCursor };
  }

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

  useEffect(() => {
    if (!emojiOpen && !gifOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        pickerRef.current?.contains(target) ||
        emojiBtnRef.current?.contains(target) ||
        gifBtnRef.current?.contains(target)
      ) {
        return;
      }
      setEmojiOpen(false);
      setGifOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [emojiOpen, gifOpen]);

  useLayoutEffect(() => {
    if (!emojiOpen && !gifOpen) {
      setPickerStyle(null);
      return;
    }
    function place() {
      const anchor = emojiOpen ? emojiBtnRef.current : gifBtnRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const height = emojiOpen ? 360 : 400;
      const spaceAbove = rect.top - 8;
      const openUp = spaceAbove >= height || spaceAbove > window.innerHeight - rect.bottom;
      setPickerStyle({
        position: "fixed",
        right: Math.max(8, window.innerWidth - rect.right),
        zIndex: 80,
        ...(openUp
          ? { bottom: Math.max(8, window.innerHeight - rect.top + 6) }
          : { top: Math.min(window.innerHeight - 8, rect.bottom + 6) }),
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [emojiOpen, gifOpen]);

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

  function setDraftValue(value: string, cursor?: number) {
    const collapsed = collapseShortcodes(
      value,
      cursor ?? value.length,
    );
    let next = collapsed.value;
    if (next.length > MESSAGE_MAX) {
      next = next.slice(0, MESSAGE_MAX);
      onLimitReached?.(MESSAGE_MAX_REACHED);
    }
    onDraft(next);
    return collapsed.cursor;
  }

  function insertAtCursor(text: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${text}${draft.slice(end)}`;
    const cursor = setDraftValue(next, start + text.length);
    bumpTyping();
    requestAnimationFrame(() => {
      const pos = Math.min(cursor, MESSAGE_MAX);
      el?.setSelectionRange(pos, pos);
      el?.focus();
      resizeTextarea(el);
    });
  }

  function insertCustomEmoji(emoji: ServerEmoji) {
    insertAtCursor(allocEmojiSlot(emoji));
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

  const emojiQuery = useMemo(() => {
    if (mentionQuery) return null;
    const cursor = inputRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    // Don't treat <:name… as a typed shortcode query.
    if (/<[a]?$/.test(before) || /<[a]?:[a-zA-Z0-9_]*$/.test(before)) {
      return null;
    }
    const match = before.match(/:([a-zA-Z0-9_]{0,32})$/);
    if (!match) return null;
    return {
      query: match[1].toLowerCase(),
      start: before.length - match[0].length,
    };
  }, [draft, mentionQuery]);

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

  const filteredEmojiSuggestions = useMemo(() => {
    if (!emojiQuery) return [];
    return findEmojisByNamePrefix(
      emojiQuery.query,
      customEmojis,
      preferredServerId,
    );
  }, [emojiQuery, customEmojis, preferredServerId]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery?.query, mentionQuery?.trigger]);

  useEffect(() => {
    setEmojiSuggestIndex(0);
  }, [emojiQuery?.query]);

  function applyMention(item: MentionSuggestion) {
    if (!mentionQuery) return;
    const prefix = item.kind === "channel" ? "#" : "@";
    const before = draft.slice(0, mentionQuery.start);
    const after = draft.slice(inputRef.current?.selectionStart ?? draft.length);
    const next = `${before}${prefix}${item.label} ${after}`;
    const cursor = setDraftValue(
      next,
      before.length + prefix.length + item.label.length + 1,
    );
    requestAnimationFrame(() => {
      const pos = Math.min(cursor, MESSAGE_MAX);
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    });
  }

  function applyEmojiSuggestion(emoji: ServerEmoji) {
    if (!emojiQuery) return;
    const before = draft.slice(0, emojiQuery.start);
    const after = draft.slice(inputRef.current?.selectionStart ?? draft.length);
    const slot = allocEmojiSlot(emoji);
    const next = `${before}${slot}${after}`;
    const cursor = setDraftValue(next, before.length + 1);
    bumpTyping();
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(cursor, cursor);
      inputRef.current?.focus();
      resizeTextarea(inputRef.current);
    });
  }

  function handleEmojiPick(pick: EmojiPick) {
    if (pick.kind === "custom") insertCustomEmoji(pick.emoji);
    else insertAtCursor(pick.char);
    setEmojiOpen(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    clearTypingSoon();
    onSubmit(expandForSend(draft));
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
                      <ImageIcon className="h-5 w-5" strokeWidth={1.75} />
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
        {filteredMentions.length === 0 && filteredEmojiSuggestions.length > 0 && (
          <ul className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-full overflow-y-auto rounded-md border border-[#1e1f22] bg-[#111214] py-1 shadow-xl">
            {filteredEmojiSuggestions.map((emoji, index) => {
              const duplicate =
                (nameCounts.get(emoji.name.toLowerCase()) ?? 0) > 1;
              const serverLabel =
                serverNamesById[emoji.server_id] ?? "Server";
              const isPreferred =
                !!preferredServerId && emoji.server_id === preferredServerId;
              return (
                <li key={emoji.id}>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applyEmojiSuggestion(emoji);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                      index === emojiSuggestIndex
                        ? "bg-accent/20 text-white"
                        : "text-[#dbdee1] hover:bg-white/5"
                    }`}
                  >
                    <CustomEmoji emoji={emoji} size={22} title="" />
                    <span className="font-medium">:{emoji.name}:</span>
                    {duplicate && (
                      <span className="truncate text-xs text-[#949ba4]">
                        {serverLabel}
                        {isPreferred ? " · this server" : ""}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <form
          onSubmit={handleSubmit}
          className={`flex items-end gap-2 bg-[#383a40] px-3 py-3 sm:gap-3 sm:px-4 ${
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
          <div className="relative min-h-[24px] min-w-0 flex-1">
            <div
              ref={mirrorRef}
              className="pointer-events-none absolute inset-0 overflow-y-auto text-[15px] leading-6 text-[#dbdee1]"
            >
              {/* slotVersion keeps mirror in sync when chip map changes */}
              <span className="sr-only">{slotVersion}</span>
              <ComposerDraftMirror
                draft={draft}
                slots={slotMapRef.current}
                catalog={emojiCatalog}
                customEmojis={customEmojis}
                preferredServerId={preferredServerId}
              />
            </div>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(event) => {
                const el = event.currentTarget;
                const cursor = setDraftValue(
                  event.target.value,
                  el.selectionStart,
                );
                if (event.target.value.trim()) bumpTyping();
                else clearTypingSoon();
                requestAnimationFrame(() => {
                  el.setSelectionRange(cursor, cursor);
                  resizeTextarea(el);
                });
              }}
              onScroll={(event) => {
                if (mirrorRef.current) {
                  mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
                }
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
                if (filteredEmojiSuggestions.length > 0) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setEmojiSuggestIndex(
                      (i) => (i + 1) % filteredEmojiSuggestions.length,
                    );
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setEmojiSuggestIndex(
                      (i) =>
                        (i - 1 + filteredEmojiSuggestions.length) %
                        filteredEmojiSuggestions.length,
                    );
                    return;
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    event.preventDefault();
                    applyEmojiSuggestion(
                      filteredEmojiSuggestions[emojiSuggestIndex] ??
                        filteredEmojiSuggestions[0],
                    );
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onDraft(`${draft} `);
                    return;
                  }
                }
                if (event.key === "Escape" && (emojiOpen || gifOpen)) {
                  setEmojiOpen(false);
                  setGifOpen(false);
                  return;
                }
                // Backspace deletes a whole emoji chip in one go.
                if (
                  event.key === "Backspace" &&
                  !event.shiftKey &&
                  !event.metaKey &&
                  !event.ctrlKey
                ) {
                  const el = event.currentTarget;
                  const start = el.selectionStart;
                  const end = el.selectionEnd;
                  if (start === end && start > 0) {
                    const ch = draft[start - 1]!;
                    if (isComposerEmojiSlot(ch)) {
                      event.preventDefault();
                      const next = `${draft.slice(0, start - 1)}${draft.slice(end)}`;
                      slotMapRef.current.delete(ch);
                      setSlotVersion((value) => value + 1);
                      onDraft(next);
                      requestAnimationFrame(() => {
                        el.setSelectionRange(start - 1, start - 1);
                        resizeTextarea(el);
                      });
                      return;
                    }
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
                    onSubmit(expandForSend(draft));
                  }
                }
              }}
              placeholder={
                dragging ? "Drop files to attach…" : placeholder
              }
              disabled={disabled || sending}
              className="relative z-10 max-h-40 min-h-[24px] w-full resize-none overflow-y-auto bg-transparent text-[15px] leading-6 text-transparent caret-[#dbdee1] outline-none placeholder:text-[#6d6f78] selection:bg-accent/35 [overflow-wrap:anywhere] whitespace-pre-wrap"
            />
          </div>
          <HoverTip label="Emoji" delayMs={40}>
            <button
              ref={emojiBtnRef}
              type="button"
              disabled={disabled || sending}
              onClick={() => {
                setEmojiOpen((open) => !open);
                setGifOpen(false);
              }}
              className={`mb-0.5 shrink-0 rounded-md p-1.5 text-[#b5bac1] hover:bg-white/10 hover:text-white disabled:opacity-40 ${
                emojiOpen ? "bg-white/10 text-white" : ""
              }`}
              aria-label="Emoji picker"
            >
              <Smile className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </HoverTip>
          {allowAttach && onPickGif && (
            <HoverTip label="GIF" delayMs={40}>
              <button
                ref={gifBtnRef}
                type="button"
                disabled={
                  disabled ||
                  sending ||
                  pendingFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE
                }
                onClick={() => {
                  setGifOpen((open) => !open);
                  setEmojiOpen(false);
                }}
                className={`mb-0.5 shrink-0 rounded-md px-1.5 py-1 text-xs font-bold tracking-wide text-[#b5bac1] hover:bg-white/10 hover:text-white disabled:opacity-40 ${
                  gifOpen ? "bg-white/10 text-white" : ""
                }`}
                aria-label="GIF picker"
              >
                GIF
              </button>
            </HoverTip>
          )}
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
      {(emojiOpen || gifOpen) &&
        pickerStyle &&
        typeof document !== "undefined" &&
        createPortal(
          <div ref={pickerRef} style={pickerStyle}>
            {emojiOpen ? (
              <EmojiPicker
                customEmojis={customEmojis}
                serverNamesById={serverNamesById}
                onPick={handleEmojiPick}
              />
            ) : (
              <GifPicker
                onPick={(gif) => {
                  onPickGif?.(gif);
                  setGifOpen(false);
                }}
              />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
