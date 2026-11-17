"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  cloneScheduleSnapshot,
  popUndoSnapshot,
  pushUndoSnapshot,
  type CrewScheduleSnapshot,
} from "@/lib/crew-undo";

type Restorer = (snapshot: CrewScheduleSnapshot) => void;

type CrewUndoContextValue = {
  canUndo: boolean;
  pushSnapshot: (snapshot: CrewScheduleSnapshot) => void;
  undo: () => void;
  registerRestorer: (restorer: Restorer | null) => void;
};

const CrewUndoContext = createContext<CrewUndoContextValue | null>(null);

export function CrewUndoProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<CrewScheduleSnapshot[]>([]);
  const restorerRef = useRef<Restorer | null>(null);

  const pushSnapshot = useCallback((snapshot: CrewScheduleSnapshot) => {
    setStack((prev) => pushUndoSnapshot(prev, snapshot));
  }, []);

  const registerRestorer = useCallback((restorer: Restorer | null) => {
    restorerRef.current = restorer;
  }, []);

  const undo = useCallback(() => {
    setStack((prev) => {
      const popped = popUndoSnapshot(prev);
      if (!popped) return prev;
      restorerRef.current?.(cloneScheduleSnapshot(popped.snapshot));
      return popped.stack;
    });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
      if (!key || !(event.ctrlKey || event.metaKey) || key !== "z" || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      if (stack.length === 0) return;
      event.preventDefault();
      undo();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stack.length, undo]);

  const value = useMemo(
    () => ({
      canUndo: stack.length > 0,
      pushSnapshot,
      undo,
      registerRestorer,
    }),
    [stack.length, pushSnapshot, undo, registerRestorer],
  );

  return <CrewUndoContext.Provider value={value}>{children}</CrewUndoContext.Provider>;
}

export function useCrewUndo() {
  const ctx = useContext(CrewUndoContext);
  if (!ctx) throw new Error("useCrewUndo must be used within CrewUndoProvider");
  return ctx;
}

/** Undo control for Month calendar edits — Excel-style step-back. */
export function CrewUndoButton({ className }: { className?: string } = {}) {
  const { canUndo, undo } = useCrewUndo();
  return (
    <button
      type="button"
      onClick={undo}
      disabled={!canUndo}
      title={canUndo ? "Undo last Month calendar change (Ctrl+Z)" : "Nothing to undo"}
      aria-label="Undo last Month calendar change"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground transition enabled:hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    >
      <Undo2 className="size-3.5" aria-hidden />
      Undo
    </button>
  );
}
