"use client";

import { useEffect, useRef, useState } from "react";
import { statusDotClass, statusLabel } from "@/components/messenger/data";
import {
  CUSTOM_STATUS_CLEAR_AFTER_OPTIONS,
  PRESENCE_CLEAR_AFTER_OPTIONS,
  clearAfterToMinutes,
  setManualStatus,
  type ManualStatus,
  type StatusClearAfter,
} from "@/lib/presence";

const STATUSES: ManualStatus[] = ["online", "idle", "dnd", "offline"];

type StatusPickerBase = {
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

export type StatusPickerProps = StatusPickerBase & {
  /** Presence = Online/Idle/DND/Offline. Custom = status text only. */
  mode: "presence" | "custom";
};

function clearAfterSelectValue(value: StatusClearAfter): string {
  if (value === null) return "none";
  if (value === "today" || value === "week") return value;
  return String(value);
}

function parseClearAfter(raw: string): StatusClearAfter {
  if (raw === "none") return null;
  if (raw === "today" || raw === "week") return raw;
  return Number(raw);
}

function panelClass(placement: "above" | "below") {
  return `absolute z-50 w-72 overflow-visible rounded-md border border-[#1e1f22] bg-[#111214] py-2 shadow-xl shadow-black/50 ${
    placement === "above"
      ? "bottom-full left-0 mb-2"
      : "top-full right-0 mt-2"
  }`;
}

export function StatusPicker({
  open,
  mode,
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
  // Presence defaults forever; custom defaults to 24h.
  const [presenceClearAfter, setPresenceClearAfter] =
    useState<StatusClearAfter>(null);
  const [customClearAfter, setCustomClearAfter] =
    useState<StatusClearAfter>(1440);
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
    setPresenceClearAfter(null);
    setCustomClearAfter(1440);
    setError(null);
  }, [open, status, manualStatus, statusText, mode]);

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

  const presenceMinutes = clearAfterToMinutes(presenceClearAfter);
  const customMinutes = clearAfterToMinutes(customClearAfter);
  const currentPresence = (manualStatus ?? status ?? "online").toLowerCase();

  async function savePresence(nextStatus: ManualStatus) {
    setBusy(true);
    setError(null);
    setDraftStatus(nextStatus);
    const { error: saveError } = await setManualStatus({
      manualStatus: nextStatus,
      // Presence timer only — leave custom text alone.
      manualClearAfterMinutes:
        nextStatus === "online" ? 0 : presenceMinutes ?? 0,
      clearAfterMinutes: null,
    });
    setBusy(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    onSaved?.({
      status: nextStatus,
      statusText: statusText?.trim() || null,
    });
    onClose();
  }

  async function saveCustom(clearText = false) {
    setBusy(true);
    setError(null);
    const presence =
      (STATUSES.includes(currentPresence as ManualStatus)
        ? currentPresence
        : "online") as ManualStatus;
    const { error: saveError } = await setManualStatus({
      // Keep current presence; only change custom text + its timer.
      manualStatus: presence,
      manualClearAfterMinutes: null,
      ...(clearText
        ? {
            statusText: null,
            clearStatusText: true,
            clearAfterMinutes: 0,
          }
        : {
            statusText: draftText,
            clearAfterMinutes: customMinutes ?? 0,
          }),
    });
    setBusy(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    const cleaned = clearText ? null : draftText.trim() || null;
    if (clearText) setDraftText("");
    onSaved?.({ status: presence, statusText: cleaned });
    onClose();
  }

  if (mode === "presence") {
    return (
      <div
        ref={rootRef}
        className={panelClass(placement)}
        role="dialog"
        aria-label="Set online status"
      >
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
          Online status
        </p>
        <ul>
          {STATUSES.map((value) => {
            const active = draftStatus === value;
            return (
              <li key={value}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void savePresence(value)}
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
        <div className="px-3 pb-2 pt-1">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
            Clear status after
          </label>
          <p className="mb-1 text-[10px] leading-snug text-[#6d6f78]">
            For Idle / DND / Offline — reverts to Online. Default is forever.
          </p>
          <select
            value={clearAfterSelectValue(presenceClearAfter)}
            disabled={busy}
            onChange={(event) =>
              setPresenceClearAfter(parseClearAfter(event.target.value))
            }
            className="w-full rounded-md bg-[#1e1f22] px-2.5 py-2 text-sm text-white outline-none ring-1 ring-[#3f4147] focus:ring-accent"
          >
            {PRESENCE_CLEAR_AFTER_OPTIONS.map((opt) => (
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
        </div>
        {error && (
          <p className="px-3 pb-1 text-xs text-accent">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={panelClass(placement)}
      role="dialog"
      aria-label="Set custom status"
    >
      <div className="px-3 pb-2 pt-1">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
          Custom status
        </label>
        <p className="mb-1 text-[10px] leading-snug text-[#6d6f78]">
          Separate from online status. Shows under your name; activity is
          hidden while this is set.
        </p>
        <input
          value={draftText}
          maxLength={128}
          disabled={busy}
          autoFocus
          onChange={(event) => setDraftText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void saveCustom();
            }
          }}
          placeholder="What's on your mind?"
          className="w-full rounded-md bg-[#1e1f22] px-2.5 py-2 text-sm text-white outline-none ring-1 ring-[#3f4147] placeholder:text-[#6d6f78] focus:ring-accent"
        />
        <label className="mb-1 mt-2 block text-[11px] font-semibold uppercase tracking-wide text-[#949ba4]">
          Clear custom after
        </label>
        <select
          value={clearAfterSelectValue(customClearAfter)}
          disabled={busy}
          onChange={(event) =>
            setCustomClearAfter(parseClearAfter(event.target.value))
          }
          className="w-full rounded-md bg-[#1e1f22] px-2.5 py-2 text-sm text-white outline-none ring-1 ring-[#3f4147] focus:ring-accent"
        >
          {CUSTOM_STATUS_CLEAR_AFTER_OPTIONS.map((opt) => (
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
            onClick={() => void saveCustom(true)}
            className="text-xs font-medium text-[#949ba4] hover:text-white disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={busy || !draftText.trim()}
            onClick={() => void saveCustom()}
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
