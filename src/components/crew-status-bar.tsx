"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  bookingNeedsAttention,
  bookingWindowActive,
  opsFor,
  type CrewOpsBook,
} from "@/lib/crew-ops";
import { activeBookingFor, flightIsArranged, type FlightBook } from "@/lib/crew-flights";
import {
  emptyReminders,
  loadReminders,
  openReminderCount,
  saveReminders,
  type CrewReminder,
  type CrewRemindersBook,
} from "@/lib/crew-reminders";
import type { CrewSnapshot } from "@/lib/crew-schedule";
import { formatMedium, weekBounds } from "@/lib/dates";
import { cn } from "@/lib/cn";

export function CrewStatusBar({
  today,
  yearQuery,
  rows,
  opsBook,
  flightBook,
}: {
  today: string;
  yearQuery: string;
  rows: CrewSnapshot[];
  opsBook: CrewOpsBook;
  flightBook: FlightBook;
}) {
  const week = weekBounds(today);
  const [reminders, setReminders] = useState<CrewRemindersBook>(emptyReminders);
  const [bellOpen, setBellOpen] = useState(false);
  const [reminderText, setReminderText] = useState("");
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setReminders(loadReminders());
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (bellRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setBellOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const pulse = useMemo(() => {
    let outbound = 0;
    let inbound = 0;
    for (const row of rows) {
      const ops = opsFor(opsBook, row.person.id);
      const outOpen =
        !flightIsArranged(activeBookingFor(flightBook, row.person.id, "outbound")) &&
        bookingNeedsAttention(ops.outboundFlight);
      const inOpen =
        !flightIsArranged(activeBookingFor(flightBook, row.person.id, "return")) &&
        bookingNeedsAttention(ops.returnFlight);
      if (outOpen && bookingWindowActive(ops.outboundBookFrom, ops.outboundBookTo, week.start, week.end)) {
        outbound += 1;
      }
      if (inOpen && bookingWindowActive(ops.returnBookFrom, ops.returnBookTo, week.start, week.end)) {
        inbound += 1;
      }
    }
    return {
      outbound,
      inbound,
      open: outbound + inbound,
      onSite: rows.filter((row) => row.duty === "on_site" || row.duty === "in_transit").length,
    };
  }, [flightBook, opsBook, rows, week.end, week.start]);

  const bellCount = openReminderCount(reminders);

  function patchReminders(recipe: (current: CrewRemindersBook) => CrewRemindersBook) {
    setReminders((prev) => {
      const next = recipe(prev);
      saveReminders(next);
      return next;
    });
  }

  function addReminder() {
    const text = reminderText.trim();
    if (!text) return;
    const entry: CrewReminder = {
      id: `r-${Date.now()}`,
      text,
      dueOn: today,
      personId: null,
      personName: null,
      done: false,
      createdAt: new Date().toISOString(),
      doneAt: null,
    };
    patchReminders((current) => ({ reminders: [entry, ...current.reminders] }));
    setReminderText("");
  }

  function openBell() {
    const next = !bellOpen;
    if (next && bellButtonRef.current) {
      const rect = bellButtonRef.current.getBoundingClientRect();
      const width = Math.min(352, window.innerWidth - 16);
      let left = rect.right - width;
      if (left < 8) left = 8;
      setPanelPos({ top: rect.bottom + 8, left });
    }
    setBellOpen(next);
  }

  return (
    <section className="rounded-2xl border border-border bg-card px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Weekly action list
          </p>
          <p className="text-sm font-medium">
            {formatMedium(week.start)} – {formatMedium(week.end)}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <StatChip label="Tickets to buy" value={pulse.open} hot={pulse.open > 0} />
          <StatChip label="To go" value={pulse.outbound} />
          <StatChip label="Come back" value={pulse.inbound} />
          <StatChip label="On site" value={pulse.onSite} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative" ref={bellRef}>
            <button
              ref={bellButtonRef}
              type="button"
              onClick={openBell}
              className="relative inline-flex size-10 items-center justify-center rounded-full border border-input bg-card hover:bg-muted"
              aria-label="Reminders"
              aria-expanded={bellOpen}
            >
              <Bell className="size-5" />
              {bellCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-semibold text-white">
                  {bellCount}
                </span>
              ) : null}
            </button>
          </div>
          <Link
            href={`/actions${yearQuery}`}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium",
              pulse.open > 0
                ? "bg-primary text-primary-foreground"
                : "border border-input hover:bg-muted",
            )}
          >
            Open actions{pulse.open > 0 ? ` (${pulse.open})` : ""}
          </Link>
        </div>
      </div>

      {bellOpen && panelPos ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Reminders"
          className="fixed z-[80] w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
          style={{ top: panelPos.top, left: panelPos.left }}
        >
          <div className="border-b border-border px-4 py-3">
            <p className="font-heading text-lg tracking-tight">Reminders</p>
          </div>
          <div className="flex gap-2 border-b border-border px-4 py-3">
            <input
              value={reminderText}
              onChange={(event) => setReminderText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addReminder();
                }
              }}
              placeholder="Book return for Bryan…"
              className="h-9 flex-1 rounded-lg border border-input px-2 text-sm"
            />
            <button
              type="button"
              onClick={addReminder}
              className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Add
            </button>
          </div>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto">
            {reminders.reminders.length === 0 ? (
              <li className="px-4 py-6 text-sm text-muted-foreground">No reminders yet.</li>
            ) : (
              reminders.reminders.map((row) => (
                <li key={row.id} className="flex items-start gap-2 px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={row.done}
                    onChange={() =>
                      patchReminders((current) => ({
                        reminders: current.reminders.map((item) =>
                          item.id === row.id
                            ? { ...item, done: !item.done, doneAt: !item.done ? new Date().toISOString() : null }
                            : item,
                        ),
                      }))
                    }
                  />
                  <p className={cn("flex-1 text-sm", row.done && "text-muted-foreground line-through")}>{row.text}</p>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function StatChip({ label, value, hot }: { label: string; value: number; hot?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-1.5",
        hot ? "border-rose-300 bg-rose-50 text-rose-950" : "border-border bg-muted/40",
      )}
    >
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="font-heading text-lg leading-none tabular-nums">{value}</p>
    </div>
  );
}
