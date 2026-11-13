"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Hash, Paperclip, Plus, Reply, Shield, User, X } from "lucide-react";

export type MentionSuggestion = {
  id: string;
  label: string;
  kind: "user" | "role" | "channel";
};

type MessageComposerProps = {
  placeholder: string;
  draft: string;
  replyAuthor: string | null;
  replyContent: string | null;
  pendingFileName: string | null;
  sending: boolean;
  allowAttach: boolean;
  disabled?: boolean;
  mentionSuggestions?: MentionSuggestion[];
  typingLabel?: string | null;
  onDraft: (value: string) => void;
  onCancelReply: () => void;
  onFile: (file: File) => void;
  onClearFile: () => void;
  onSubmit: () => void;
  onTyping?: () => void;
};

export function MessageComposer({
  placeholder,
  draft,
  replyAuthor,
  replyContent,
  pendingFileName,
  sending,
  allowAttach,
  disabled,
  mentionSuggestions = [],
  typingLabel,
  onDraft,
  onCancelReply,
  onFile,
  onClearFile,
  onSubmit,
  onTyping,
}: MessageComposerProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const replying = !!replyAuthor;

  const mentionQuery = useMemo(() => {
    const cursor = inputRef.current?.selectionStart ?? draft.length;
    const before = draft.slice(0, cursor);
    const match = before.match(/(^|[\s])([@#])([A-Za-z0-9_.-]*)$/);
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
        : (item: MentionSuggestion) => item.kind === "user" || item.kind === "role";
    return mentionSuggestions
      .filter(kindFilter)
      .filter((item) => item.label.toLowerCase().includes(mentionQuery.query))
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
    onDraft(next);
    requestAnimationFrame(() => {
      const pos = before.length + prefix.length + item.label.length + 1;
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <div className="shrink-0 px-4 pb-6 pt-2">
      {typingLabel && (
        <p className="mb-1.5 px-1 text-xs text-muted">{typingLabel}</p>
      )}
      {replying && (
        <div className="flex items-center gap-2 rounded-t-md border-l-4 border-accent bg-[#2b2d31] px-4 py-2">
          <Reply className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-accent">
              Replying to {replyAuthor}
            </p>
            <p className="truncate text-xs text-muted">{replyContent}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="rounded-md p-1 text-muted hover:bg-white/10 hover:text-foreground"
            aria-label="Cancel reply"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      )}
      {pendingFileName && (
        <div
          className={`flex items-center gap-2 bg-[#2b2d31] px-4 py-2 ${
            replying ? "" : "rounded-t-md"
          }`}
        >
          <Paperclip className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.75} />
          <p className="min-w-0 flex-1 truncate text-xs text-[#dbdee1]">
            {pendingFileName}
          </p>
          <button
            type="button"
            onClick={onClearFile}
            className="rounded-md p-1 text-muted hover:bg-white/10 hover:text-white"
            aria-label="Remove attachment"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      )}
      <div className="relative">
        {filteredMentions.length > 0 && (
          <ul className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-full overflow-y-auto rounded-md border border-[#1e1f22] bg-[#111214] py-1 shadow-xl">
            {filteredMentions.map((item, index) => {
              const Icon =
                item.kind === "channel" ? Hash : item.kind === "role" ? Shield : User;
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
          className={`flex items-center gap-3 bg-[#383a40] px-4 py-3 ${
            replying || pendingFileName ? "rounded-b-md" : "rounded-md"
          }`}
        >
          {allowAttach && (
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) onFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={disabled || sending}
                className="shrink-0 rounded-full bg-[#4e5058] p-1 text-[#dbdee1] hover:bg-[#5c5e66] hover:text-white disabled:opacity-40"
                aria-label="Attach file"
              >
                <Plus className="h-5 w-5" strokeWidth={2.25} />
              </button>
            </>
          )}
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(event) => {
              onDraft(event.target.value);
              onTyping?.();
            }}
            onKeyDown={(event) => {
              if (filteredMentions.length === 0) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setMentionIndex((i) => (i + 1) % filteredMentions.length);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setMentionIndex(
                  (i) => (i - 1 + filteredMentions.length) % filteredMentions.length,
                );
              } else if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                applyMention(filteredMentions[mentionIndex] ?? filteredMentions[0]);
              } else if (event.key === "Escape") {
                onDraft(draft + " ");
              }
            }}
            placeholder={placeholder}
            disabled={disabled || sending}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[#dbdee1] outline-none placeholder:text-[#6d6f78]"
          />
          <button
            type="submit"
            disabled={disabled || sending || (!draft.trim() && !pendingFileName)}
            className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
