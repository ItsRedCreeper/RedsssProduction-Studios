"use client";

import type { ReactNode } from "react";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Dismiss"
        onClick={onCancel}
        disabled={busy}
      />
      <div className="relative w-full max-w-md rounded-lg border border-border bg-[#111214] p-5 shadow-2xl shadow-black/50">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description && (
          <div className="mt-2 text-sm text-[#b5bac1]">{description}</div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-2 text-sm font-medium text-[#dbdee1] hover:bg-white/5 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              danger
                ? "bg-accent hover:bg-accent-hover"
                : "bg-[#3f4147] hover:bg-[#4e5058]"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
