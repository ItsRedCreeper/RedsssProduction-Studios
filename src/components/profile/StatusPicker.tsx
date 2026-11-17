"use client";

import { useEffect, useRef, useState } from "react";
import { statusDotClass, statusLabel } from "@/components/messenger/data";
import {
  STATUS_CLEAR_AFTER_OPTIONS,
  clearAfterToMinutes,
  setManualStatus,
  type ManualStatus,
  type StatusClearAfter,
} from "@/lib/presence";

const STATUSES: ManualStatus[] = ["online", "idle", "dnd", "offline"];

type StatusPickerProps = {
  open: boolean;
  status: string | null | undefined;
  /** Preferred: the user's chosen status (manual_status). Falls back to status. */
  manualStatus?: string | null | undefined;
  statusText: string | null | undefined;
  onClose: () => void;
  onSaved?: (next: { status: string; statusText: string | null }) => void;
  /** Anchor panel above (sidebar) or below (navbar / big profile). */
  placement?: "above" | "below";
};

export function StatusPicker({
  open,
  status,
  manualStatus,
  statusText,
  onClose,
  onSaved,
  placement = "above",
}: StatusPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [draftStatus, setDraftStatus] = useState<ManualStatus>("online");
  const [draftText, setDraftText] = useState("");
  const [clearAfter, setClearAfter] = useState<StatusClearAfter>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const value = (manualStatus ?? status ?? "online").toLowerCase();
    setDraftStatus(
      (STATUSES.includes(value as ManualStatus)
        ? value
        : "online") as ManualStatus,
    );
    setDraftText(statusText ?? "");
    setClearAfter(null);
    setError(null);
  }, [open, status, manualStatus, statusText]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function save(nextStatus?: ManualStatus, clearText = false) {
    setBusy(true);
    setError(null);
    const statusToSave = nextStatus ?? draftStatus;
    // Presence-only clicks keep existing custom status + timer untouched.
    const presenceOnly = nextStatus !== undefined && !clearText;
    const { error: saveError } = await setManualStatus({
      manualStatus: statusToSave,
      ...(clearText
        ? { statusText: null, clearStatusText: true, clearAfterMinutes: 0 }
        : presenceOnly
          ? {}
          : {
              statusText: draftText,
              clearAfterMinutes: clearAfterToMinutes(clearAfter),
            }),
    });
    setBusy(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    const cleaned = clearText
      ? null
      : presenceOnly
        ? (statusText?.trim() || null)
        : draftText.trim() || null;
    setDraftStatus(statusToSave);
    if (clearText) setDraftText("");
    onSaved?.({ status: statusToSave, statusText: cleaned });
    onClose();
  }

  return (
    <div
      ref={rootRef}
      className={`absolute z-50 w-72 overflow-visible rounded-md border border-[#1e1f22] bg-[#111214] py-2 shadow-xl shadow-black/50 ${
        placement === "above"
          ? "bottom-full left-0 mb-2"
          : "top-full right-0 mt-2"
      }`}
      role="dialog"
      aria-label="Set status"
    >
      <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
        Status
      </p>
      <ul>
        {STATUSES.map((value) => {
          const active = draftStatus === value;
          return (
            <li key={value}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(value)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
                  active
                    ? "bg-accent/15 text-white"
                    : "text-[#dbdee1] hover:bg-white/5"
                }`}
              >
                <span
                  className={`h-3 w-3 shrink-0 rounded-full ${statusDotClass(value)}`}
                />
                <span className="font-medium">{statusLabel(value)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mx-2 my-2 border-t border-white/10" />
      <div className="px-3 pb-2">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
          Custom status
        </label>
        <input
          value={draftText}
          maxLength={128}
          disabled={busy}
          onChange={(event) => setDraftText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
          placeholder="What's on your mind?"
          className="w-full rounded-md bg-[#1e1f22] px-2.5 py-2 text-sm text-white outline-none ring-1 ring-[#3f4147] placeholder:text-[#6d6f78] focus:ring-accent"
        />
        <label className="mb-1 mt-2 block text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
          Clear after
        </label>
        <select
          value={
            clearAfter === null
              ? "none"
              : clearAfter === "today" || clearAfter === "week"
                ? clearAfter
                : String(clearAfter)
          }
          disabled={busy || !draftText.trim()}
          onChange={(event) => {
            const v = event.target.value;
            if (v === "none") setClearAfter(null);
            else if (v === "today" || v === "week") setClearAfter(v);
            else setClearAfter(Number(v));
          }}
          className="w-full rounded-md bg-[#1e1f22] px-2.5 py-2 text-sm text-white outline-none ring-1 ring-[#3f4147] focus:ring-accent disabled:opacity-40"
        >
          {STATUS_CLEAR_AFTER_OPTIONS.map((opt) => (
            <option
              key={opt.label}
              value={
                opt.minutes === null
                  ? "none"
                  : typeof opt.minutes === "string"
                    ? opt.minutes
                    : String(opt.minutes)
              }
            >
              {opt.label}
            </option>
          ))}
        </select>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={busy || (!draftText && !statusText)}
            onClick={() => void save(undefined, true)}
            className="text-xs font-medium text-[#949ba4] hover:text-white disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Save
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-accent">{error}</p>}
      </div>
    </div>
  );
}
