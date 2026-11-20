"use client";

import type { ReactNode } from "react";
import { CrewAuthBar } from "@/components/crew-auth-bar";
import { CrewUndoProvider } from "@/components/crew-undo-provider";

export function CrewAppShell({ children }: { children: ReactNode }) {
  return (
    <CrewUndoProvider>
      <header className="border-b border-border bg-card">
        <div
          className="mx-auto flex w-full items-center gap-3 px-3 py-2 sm:px-8 sm:py-4 xl:px-10"
          style={{ maxWidth: "var(--app-shell-max)" }}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-primary uppercase sm:text-xs">Tower Arctic</p>
            <p className="font-heading text-xl leading-tight tracking-tight sm:text-4xl">Crew Schedule</p>
          </div>
          <CrewAuthBar />
        </div>
      </header>
      <main
        // Phones: room at the bottom for the tab bar (and the home bar).
        className="mx-auto w-full flex-1 px-2 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-8 sm:pb-8 xl:px-10"
        style={{ maxWidth: "var(--app-shell-max)" }}
      >
        {children}
      </main>
    </CrewUndoProvider>
  );
}
