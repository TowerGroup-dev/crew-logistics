"use client";

import { useSyncExternalStore } from "react";
import { Cloud, CloudOff, FlaskConical, Loader2 } from "lucide-react";
import { getSyncStatus, subscribeSync, type SyncStatus } from "@/lib/crew-sync";
import { cn } from "@/lib/cn";

const SERVER_STATUS: SyncStatus = { state: "starting", savedAt: null, lastBy: null, lastAt: null, error: null };

function time(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
}

/** "Saved · 11:42" on the top bar: whether this computer's changes reached everyone. */
export function CrewSyncStatus() {
  const status = useSyncExternalStore(subscribeSync, getSyncStatus, () => SERVER_STATUS);
  const last = status.lastAt ? `Last change ${time(status.lastAt)}${status.lastBy && status.lastBy !== "Office" ? ` by ${status.lastBy}` : ""}` : "";
  const view =
    status.state === "test"
      ? { icon: <FlaskConical className="size-3.5" />, text: "Test Mode · not saved", tone: "border-amber-300 bg-amber-50 text-amber-900" }
      : status.state === "saving"
      ? { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving...", tone: "text-muted-foreground" }
      : status.state === "offline"
        ? { icon: <CloudOff className="size-3.5" />, text: "Offline, will sync", tone: "border-amber-300 bg-amber-50 text-amber-900" }
        : status.state === "error" || status.state === "starting"
          ? { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Syncing...", tone: "text-muted-foreground" }
          : { icon: <Cloud className="size-3.5" />, text: status.savedAt ? `Saved · ${time(status.savedAt)}` : "Up to date", tone: "text-emerald-800" };
  return (
    <span
      role="status"
      title={[status.error, last, "Changes are shared with everyone and checked every 15 seconds."].filter(Boolean).join("\n")}
      className={cn(
        // Fixed width so Saving ↔ Saved does not shove the year control / tabs sideways.
        "hidden h-8 w-[9.75rem] items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 text-xs font-medium sm:inline-flex",
        view.tone,
      )}
    >
      {view.icon}
      <span className="min-w-0 truncate">{view.text}</span>
    </span>
  );
}
