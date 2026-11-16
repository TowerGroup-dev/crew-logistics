"use client";

import type { ReactNode } from "react";
import { CrewAuthBar } from "@/components/crew-auth-bar";
import { CrewUndoProvider } from "@/components/crew-undo-provider";

export function CrewAppShell({ children }: { children: ReactNode }) {
  return (
    <CrewUndoProvider>
      <header className="border-b border-border bg-card">
        <div
          className="mx-auto flex w-full items-center gap-3 px-5 py-4 sm:px-8 xl:px-10"
          style={{ maxWidth: "var(--app-shell-max)" }}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Tower Arctic</p>
            <p className="font-heading text-3xl tracking-tight sm:text-4xl">Crew Schedule</p>
          </div>
          <CrewAuthBar />
        </div>
      </header>
      <main
        className="mx-auto w-full flex-1 px-5 pb-8 sm:px-8 xl:px-10"
        style={{ maxWidth: "var(--app-shell-max)" }}
      >
        {children}
      </main>
    </CrewUndoProvider>
  );
}
