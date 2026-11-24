"use client";

import dynamic from "next/dynamic";
import { Suspense, startTransition, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { CrewBoardView } from "@/components/crew-board";
import { CrewNav } from "@/components/crew-nav";
import { startSync } from "@/lib/crew-sync";

/**
 * Client-only board: localStorage + schedule paint on first frame (no SSR empty → Loading flash).
 * Shared data is pulled from the server first (capped at a few seconds), so the board
 * opens on everyone's latest bookings, moves and notes.
 */
const CrewBoard = dynamic(
  () =>
    Promise.race([startSync(), new Promise((resolve) => setTimeout(resolve, 5000))]).then(() =>
      import("@/components/crew-board").then((mod) => mod.CrewBoard),
    ),
  { ssr: false },
);

function viewFromPath(pathname: string): CrewBoardView {
  if (pathname.startsWith("/month")) return "month";
  if (pathname.startsWith("/year")) return "year";
  if (pathname.startsWith("/list")) return "list";
  if (pathname.startsWith("/employees")) return "employees";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/settings")) return "settings";
  // Old Travel page → Month (travel is painted on the calendar).
  if (pathname.startsWith("/travel")) return "month";
  if (pathname.startsWith("/accommodation")) return "accommodation";
  if (pathname.startsWith("/alerts")) return "alerts";
  return "overview";
}

/** Board reads the route so a shared layout can keep it mounted across Schedule views. */
export function CrewWorkspace() {
  const pathname = usePathname();
  const router = useRouter();
  const [view, setView] = useState<CrewBoardView>(() => viewFromPath(pathname));
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [reminderCount, setReminderCount] = useState(0);

  // Defer heavy view swaps so the nav stays responsive while Month/Year catch up.
  useEffect(() => {
    const next = viewFromPath(pathname);
    startTransition(() => setView(next));
  }, [pathname]);

  // Old /reminders route → open the popup on Overview instead of a full page.
  useEffect(() => {
    if (pathname.startsWith("/reminders")) {
      setRemindersOpen(true);
      router.replace("/", { scroll: false });
    }
  }, [pathname, router]);

  // Old Travel tab → Month calendar (Excel-simple travel entry lives there).
  useEffect(() => {
    if (pathname.startsWith("/travel")) {
      router.replace("/month", { scroll: false });
    }
  }, [pathname, router]);

  return (
    <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden">
      <Suspense fallback={null}>
        <CrewNav onOpenReminders={() => setRemindersOpen(true)} reminderCount={reminderCount} />
      </Suspense>
      <Suspense fallback={null}>
        <CrewBoard
          view={view}
          remindersOpen={remindersOpen}
          onCloseReminders={() => setRemindersOpen(false)}
          onReminderCountChange={setReminderCount}
        />
      </Suspense>
    </div>
  );
}
