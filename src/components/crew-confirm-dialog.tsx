"use client";

import { cn } from "@/lib/cn";

/** In-app yes/no — replaces window.confirm so the browser dialog never pops. */
export function CrewConfirmDialog({
  title,
  message,
  confirmLabel = "Remove",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/30 p-3 sm:items-center"
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="text-lg font-semibold tracking-tight">{title}</p>
        {message ? <p className="mt-1.5 text-sm text-muted-foreground">{message}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-lg border border-input px-3 text-sm font-medium hover:bg-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={cn(
              "h-9 rounded-lg px-3 text-sm font-semibold",
              danger
                ? "bg-rose-700 text-white hover:bg-rose-800"
                : "bg-stone-900 text-white hover:bg-stone-800",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
