"use client";

import { Suspense, useMemo } from "react";
import { usePathname } from "next/navigation";
import { CrewBoard, type CrewBoardView } from "@/components/crew-board";
import { CrewNav } from "@/components/crew-nav";

function viewFromPath(pathname: string): CrewBoardView {
  if (pathname.startsWith("/month")) return "month";
  if (pathname.startsWith("/year")) return "year";
  if (pathname.startsWith("/list")) return "list";
  if (pathname.startsWith("/employees")) return "employees";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/travel")) return "travel";
  if (pathname.startsWith("/accommodation")) return "accommodation";
  if (pathname.startsWith("/alerts")) return "alerts";
  return "overview";
}

/** Board reads the route so a shared layout can keep it mounted across Schedule views. */
export function CrewWorkspace() {
  const pathname = usePathname();
  const view = useMemo(() => viewFromPath(pathname), [pathname]);

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={<div className="h-9 animate-pulse rounded-md bg-muted" />}>
        <CrewNav />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <CrewBoard view={view} />
      </Suspense>
    </div>
  );
}
