"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

type CreatePollModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (poll: {
    question: string;
    options: string[];
    allowMultiple: boolean;
  }) => void;
};

export function CreatePollModal({
  open,
  onClose,
  onCreate,
}: CreatePollModalProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuestion("");
    setOptions(["", ""]);
    setAllowMultiple(false);
  }, [open]);

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleaned = options.map((item) => item.trim()).filter(Boolean);
    if (!question.trim() || cleaned.length < 2) return;
    onCreate({
      question: question.trim(),
      options: cleaned.slice(0, 10),
      allowMultiple,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md rounded-md border border-[#1e1f22] bg-[#313338] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-black/30 px-4 py-3">
          <h2 className="text-base font-semibold text-white">Create Poll</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="space-y-3 px-4 py-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Question
            </span>
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={300}
              className="w-full rounded-md border border-[#3f4147] bg-[#1e1f22] px-3 py-2 text-sm outline-none focus:border-[#00a8fc]"
              autoFocus
            />
          </label>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Options
            </p>
            {options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={option}
                  onChange={(event) => {
                    const next = [...options];
                    next[index] = event.target.value;
                    setOptions(next);
                  }}
                  maxLength={100}
                  placeholder={`Option ${index + 1}`}
                  className="min-w-0 flex-1 rounded-md border border-[#3f4147] bg-[#1e1f22] px-3 py-2 text-sm outline-none focus:border-[#00a8fc]"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() =>
                      setOptions((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="rounded-md p-2 text-accent hover:bg-accent-muted"
                    aria-label="Remove option"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, ""])}
                className="inline-flex items-center gap-1 text-sm text-[#dbdee1] hover:text-white"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                Add option
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-[#dbdee1]">
            <input
              type="checkbox"
              checked={allowMultiple}
              onChange={(event) => setAllowMultiple(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Allow multiple answers
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm text-[#dbdee1] hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !question.trim() ||
                options.map((o) => o.trim()).filter(Boolean).length < 2
              }
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Post Poll
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
