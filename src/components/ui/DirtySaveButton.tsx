"use client";

type DirtySaveButtonProps = {
  dirty: boolean;
  saving?: boolean;
  /** Extra disable (e.g. invalid form), independent of dirty */
  disabled?: boolean;
  label?: string;
  savingLabel?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
  size?: "sm" | "md";
};

/**
 * Site-wide save control for settings editors:
 * gray + disabled until there are unsaved changes, then accent/red and clickable.
 * After a successful save (dirty clears), it returns to gray/disabled.
 */
export function DirtySaveButton({
  dirty,
  saving = false,
  disabled = false,
  label = "Save",
  savingLabel = "Saving…",
  type = "button",
  onClick,
  className = "",
  size = "md",
}: DirtySaveButtonProps) {
  const canSave = dirty && !saving && !disabled;
  const sizeClass =
    size === "sm"
      ? "rounded-md px-2.5 py-1.5 text-xs font-semibold"
      : "rounded-md px-4 py-2 text-sm font-semibold";

  return (
    <button
      type={type}
      disabled={!canSave}
      onClick={onClick}
      aria-disabled={!canSave}
      title={
        saving
          ? savingLabel
          : dirty
            ? "Save changes"
            : "No unsaved changes"
      }
      className={`${sizeClass} transition-colors ${
        canSave
          ? "bg-accent text-white hover:bg-accent-hover"
          : "cursor-not-allowed bg-[#3f4147] text-[#949ba4]"
      } ${className}`}
    >
      {saving ? savingLabel : label}
    </button>
  );
}
