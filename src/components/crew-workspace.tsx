"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { CrewBoardView } from "@/components/crew-board";
import { CrewNav } from "@/components/crew-nav";
import { startSync } from "@/lib/crew-sync";

/**
 * Board loads immediately; sync runs in parallel so Calendar is not blank while waiting.
 */
const CrewBoard = dynamic(
  () => {
    void startSync();
    return import("@/components/crew-board").then((mod) => mod.CrewBoard);
  },
  { ssr: false },
);

function viewFromPath(pathname: string): CrewBoardView {
  if (pathname.startsWith("/month")) return "month";
  if (pathname.startsWith("/year")) return "year";
  if (pathname.startsWith("/list")) return "list";
  if (pathname.startsWith("/employees")) return "employees";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/planning")) return "planning";
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
  const routeView = viewFromPath(pathname);
  // Instant Month/Year/List (and Calendar) switches — do not wait on the router.
  const [pendingView, setPendingView] = useState<CrewBoardView | null>(null);
  const view = pendingView ?? routeView;
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [reminderCount, setReminderCount] = useState(0);

  useEffect(() => {
    if (pendingView != null && routeView === pendingView) setPendingView(null);
  }, [pendingView, routeView]);

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
        <CrewNav
          view={view}
          onNavigateView={setPendingView}
          onOpenReminders={() => setRemindersOpen(true)}
          reminderCount={reminderCount}
        />
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
