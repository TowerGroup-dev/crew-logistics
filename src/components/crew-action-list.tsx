"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import {
  bookingLabel,
  bookingNeedsAttention,
  bookingWindowActive,
  opsFor,
  type CrewOpsBook,
} from "@/lib/crew-ops";
import {
  activeBookingFor,
  flightIsArranged,
  flightStatusLabel,
  type FlightBook,
} from "@/lib/crew-flights";
import {
  emptyReminders,
  loadReminders,
  openReminderCount,
  saveReminders,
  type CrewReminder,
  type CrewRemindersBook,
} from "@/lib/crew-reminders";
import { siteLabel, type CrewSnapshot } from "@/lib/crew-schedule";
import { formatMedium, shiftWeek, weekBounds } from "@/lib/dates";
import { cn } from "@/lib/cn";

type PersonCard = {
  personId: string;
  personName: string;
  role: string;
  site: string | null;
  plannedIn: string | null;
  plannedOut: string | null;
  travel: {
    outbound: {
      status: string;
      done: boolean;
      overdue: boolean;
      bookFrom: string | null;
      bookTo: string | null;
      show: boolean;
    };
    inbound: {
      status: string;
      done: boolean;
      overdue: boolean;
      bookFrom: string | null;
      bookTo: string | null;
      show: boolean;
    };
  };
  accommodation: {
    status: string;
    done: boolean;
    overdue: boolean;
    notes: string;
    show: boolean;
  };
};

export function CrewActionList({
  today,
  rows,
  opsBook,
  flightBook,
  onOpen,
  onSetOutboundStatus,
  onSetInboundStatus,
  onSetAccommodationStatus,
}: {
  today: string;
  rows: CrewSnapshot[];
  opsBook: CrewOpsBook;
  flightBook: FlightBook;
  onOpen: (personId: string) => void;
  onSetOutboundStatus: (personId: string, booked: boolean) => void;
  onSetInboundStatus: (personId: string, booked: boolean) => void;
  onSetAccommodationStatus: (personId: string, booked: boolean) => void;
}) {
  const [weekAnchor, setWeekAnchor] = useState(today);
  const week = useMemo(() => weekBounds(weekAnchor), [weekAnchor]);
  const thisWeek = weekBounds(today);
  const [reminders, setReminders] = useState<CrewRemindersBook>(emptyReminders);
  const [bellOpen, setBellOpen] = useState(false);
  const [reminderText, setReminderText] = useState("");
  const [reminderDue, setReminderDue] = useState(today);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setReminders(loadReminders());
  }, []);

  useEffect(() => {
    function placePanel() {
      const button = bellButtonRef.current;
      if (!button || !bellOpen) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(352, window.innerWidth - 16);
      const estimatedHeight = Math.min(420, window.innerHeight - 24);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
      if (left < 8) left = 8;
      let top = rect.bottom + 8;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - 8);
      }
      setPanelPos({ top, left });
    }

    placePanel();
    if (!bellOpen) return;
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", placePanel, true);
    return () => {
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("scroll", placePanel, true);
    };
  }, [bellOpen]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (bellRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setBellOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function patchReminders(recipe: (current: CrewRemindersBook) => CrewRemindersBook) {
    setReminders((prev) => {
      const next = recipe(prev);
      saveReminders(next);
      return next;
    });
  }

  const cards = useMemo(() => {
    const list: PersonCard[] = [];

    for (const row of rows) {
      const ops = opsFor(opsBook, row.person.id);
      const outboundBooking = activeBookingFor(flightBook, row.person.id, "outbound");
      const inboundBooking = activeBookingFor(flightBook, row.person.id, "return");

      const outboundDone = flightIsArranged(outboundBooking);
      const outboundOpen = !outboundDone && bookingNeedsAttention(ops.outboundFlight);
      const outboundInWeek = bookingWindowActive(ops.outboundBookFrom, ops.outboundBookTo, week.start, week.end);
      const showOutbound = (outboundOpen || outboundDone) && outboundInWeek;

      const inboundDone = flightIsArranged(inboundBooking);
      const inboundOpen = !inboundDone && bookingNeedsAttention(ops.returnFlight);
      const inboundInWeek = bookingWindowActive(ops.returnBookFrom, ops.returnBookTo, week.start, week.end);
      const showInbound = (inboundOpen || inboundDone) && inboundInWeek;

      const lodgeOpen = bookingNeedsAttention(ops.accommodation);
      const lodgeDone = ops.accommodation === "booked" || ops.accommodation === "confirmed";
      let showLodge = false;
      if (
        (lodgeOpen || lodgeDone) &&
        (row.duty === "on_site" || row.duty === "in_transit" || row.duty === "upcoming")
      ) {
        const lodgeAnchor = row.plannedIn || today;
        const lodgeWeek = weekBounds(lodgeAnchor);
        const onSiteNow = row.duty === "on_site" || row.duty === "in_transit";
        showLodge =
          (lodgeWeek.start === week.start && lodgeWeek.end === week.end) ||
          (onSiteNow && week.start === thisWeek.start);
      }

      if (!showOutbound && !showInbound && !showLodge) continue;

      list.push({
        personId: row.person.id,
        personName: row.person.name,
        role: row.person.role,
        site: row.site,
        plannedIn: row.plannedIn,
        plannedOut: row.plannedOut,
        travel: {
          outbound: {
            status: outboundBooking
              ? `${flightStatusLabel(outboundBooking.status)}${outboundBooking.pnr ? ` · ${outboundBooking.pnr}` : ""}`
              : bookingLabel(ops.outboundFlight),
            done: outboundDone,
            overdue: Boolean(ops.outboundBookTo && ops.outboundBookTo < today && outboundOpen),
            bookFrom: ops.outboundBookFrom,
            bookTo: ops.outboundBookTo,
            show: showOutbound,
          },
          inbound: {
            status: inboundBooking
              ? `${flightStatusLabel(inboundBooking.status)}${inboundBooking.pnr ? ` · ${inboundBooking.pnr}` : ""}`
              : bookingLabel(ops.returnFlight),
            done: inboundDone,
            overdue: Boolean((row.overdue || (ops.returnBookTo && ops.returnBookTo < today)) && inboundOpen),
            bookFrom: ops.returnBookFrom,
            bookTo: ops.returnBookTo,
            show: showInbound,
          },
        },
        accommodation: {
          status: bookingLabel(ops.accommodation),
          done: lodgeDone,
          overdue: Boolean(row.plannedIn && row.plannedIn < today && lodgeOpen),
          notes: ops.accommodationNotes,
          show: showLodge,
        },
      });
    }

    return list.sort((a, b) => a.personName.localeCompare(b.personName));
  }, [flightBook, opsBook, rows, today, week.end, week.start, thisWeek.start]);

  const openReminders = reminders.reminders.filter((row) => !row.done);
  const doneReminders = reminders.reminders.filter((row) => row.done);
  const bellCount = openReminderCount(reminders);
  const isCurrentWeek = week.start === thisWeek.start;

  function addReminder() {
    const text = reminderText.trim();
    if (!text) return;
    const entry: CrewReminder = {
      id: `r-${Date.now()}`,
      text,
      dueOn: reminderDue || null,
      personId: null,
      personName: null,
      done: false,
      createdAt: new Date().toISOString(),
      doneAt: null,
    };
    patchReminders((current) => ({ reminders: [entry, ...current.reminders] }));
    setReminderText("");
    setReminderDue(today);
  }

  function toggleReminder(id: string) {
    patchReminders((current) => ({
      reminders: current.reminders.map((row) =>
        row.id === id
          ? {
              ...row,
              done: !row.done,
              doneAt: !row.done ? new Date().toISOString() : null,
            }
          : row,
      ),
    }));
  }

  function removeReminder(id: string) {
    patchReminders((current) => ({
      reminders: current.reminders.filter((row) => row.id !== id),
    }));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Action list</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Week of {formatMedium(week.start)} – {formatMedium(week.end)}
              {isCurrentWeek ? " · this week" : ""}
            </p>
          </div>

          <div className="relative" ref={bellRef}>
            <button
              ref={bellButtonRef}
              type="button"
              onClick={() => {
                const next = !bellOpen;
                if (next && bellButtonRef.current) {
                  const rect = bellButtonRef.current.getBoundingClientRect();
                  const width = Math.min(352, window.innerWidth - 16);
                  const estimatedHeight = Math.min(420, window.innerHeight - 24);
                  let left = rect.left;
                  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
                  if (left < 8) left = 8;
                  let top = rect.bottom + 8;
                  if (top + estimatedHeight > window.innerHeight - 8) {
                    top = Math.max(8, rect.top - estimatedHeight - 8);
                  }
                  setPanelPos({ top, left });
                }
                setBellOpen(next);
              }}
              className="relative inline-flex size-10 items-center justify-center rounded-full border border-input bg-card hover:bg-muted"
              aria-label="Reminders"
              title="Reminders"
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
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWeekAnchor((current) => shiftWeek(weekBounds(current).start, -1))}
            className="rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            Prev week
          </button>
          <button
            type="button"
            onClick={() => setWeekAnchor(today)}
            className="rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => setWeekAnchor((current) => shiftWeek(weekBounds(current).start, 1))}
            className="rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            Next week
          </button>
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
            <p className="text-base font-semibold tracking-tight">Reminders</p>
          </div>
          <div className="space-y-2 border-b border-border px-4 py-3">
            <input
              value={reminderText}
              onChange={(event) => setReminderText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addReminder();
                }
              }}
              placeholder="e.g. Book Bryan outbound · Confirm lodging"
              className="h-9 w-full rounded-lg border border-input px-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={reminderDue}
                onChange={(event) => setReminderDue(event.target.value)}
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
          </div>
          <div className="max-h-[min(18rem,calc(100vh-12rem))] overflow-y-auto">
            {reminders.reminders.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No reminders yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {[...openReminders, ...doneReminders].map((row) => (
                  <li key={row.id} className="flex items-start gap-2 px-4 py-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={row.done}
                      onChange={() => toggleReminder(row.id)}
                      aria-label={row.done ? "Undo reminder" : "Mark reminder done"}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", row.done && "text-muted-foreground line-through")}>{row.text}</p>
                      {row.dueOn ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">Due {formatMedium(row.dueOn)}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeReminder(row.id)}
                      className="text-xs text-muted-foreground hover:text-rose-700"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {cards.length === 0 ? (
        <section className="rounded-2xl border border-border bg-card px-4 py-8 text-sm text-muted-foreground">
          No travel or accommodation actions this week.
        </section>
      ) : (
        <ul className="space-y-4">
          {cards.map((card) => (
            <li key={card.personId} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                <button type="button" onClick={() => onOpen(card.personId)} className="min-w-0 text-left hover:text-primary">
                  <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Employee</p>
                  <p className="text-base font-semibold tracking-tight">{card.personName}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {card.role}
                    {card.site ? ` · ${siteLabel(card.site)}` : ""}
                    {card.plannedIn ? ` · IN ${formatMedium(card.plannedIn)}` : ""}
                    {card.plannedOut ? ` · OUT ${formatMedium(card.plannedOut)}` : ""}
                  </p>
                </button>
              </div>

              <div className="grid gap-0 lg:grid-cols-2">
                <section className="border-b border-border p-4 lg:border-b-0 lg:border-r">
                  <h3 className="text-sm font-semibold tracking-tight">Travel details</h3>

                  {card.travel.outbound.show || card.travel.inbound.show ? (
                    <div className="mt-3 space-y-3">
                      {card.travel.outbound.show ? (
                        <TravelTask
                          title="Outbound (to site)"
                          bookFrom={card.travel.outbound.bookFrom}
                          bookTo={card.travel.outbound.bookTo}
                          travelDate={card.plannedIn}
                          travelLabel="IN"
                          status={card.travel.outbound.status}
                          done={card.travel.outbound.done}
                          overdue={card.travel.outbound.overdue}
                          onOpen={() => onOpen(card.personId)}
                          onToggle={() => onSetOutboundStatus(card.personId, !card.travel.outbound.done)}
                        />
                      ) : null}
                      {card.travel.inbound.show ? (
                        <TravelTask
                          title="Inbound (return home)"
                          bookFrom={card.travel.inbound.bookFrom}
                          bookTo={card.travel.inbound.bookTo}
                          travelDate={card.plannedOut}
                          travelLabel="OUT"
                          status={card.travel.inbound.status}
                          done={card.travel.inbound.done}
                          overdue={card.travel.inbound.overdue}
                          onOpen={() => onOpen(card.personId)}
                          onToggle={() => onSetInboundStatus(card.personId, !card.travel.inbound.done)}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No travel booking this week.</p>
                  )}
                </section>

                <section className="p-4">
                  <h3 className="text-sm font-semibold tracking-tight">Accommodation details</h3>
                  {card.accommodation.show ? (
                    <div
                      className={cn(
                        "mt-3 rounded-xl border border-border px-3 py-3",
                        card.accommodation.overdue && !card.accommodation.done && "border-rose-200 bg-rose-50/50",
                        card.accommodation.done && "bg-muted/30",
                      )}
                    >
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 size-4"
                          checked={card.accommodation.done}
                          onChange={() => onSetAccommodationStatus(card.personId, !card.accommodation.done)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block font-semibold", card.accommodation.done && "text-muted-foreground line-through")}>
                            Confirm accommodation
                            {card.accommodation.overdue && !card.accommodation.done ? (
                              <span className="ml-2 text-xs font-semibold text-rose-800">Overdue</span>
                            ) : null}
                          </span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            Status: {card.accommodation.status}
                            {card.plannedIn ? ` · for IN ${formatMedium(card.plannedIn)}` : ""}
                            {card.plannedOut ? ` · through OUT ${formatMedium(card.plannedOut)}` : ""}
                          </span>
                          {card.accommodation.notes ? (
                            <span className="mt-1 block text-sm">{card.accommodation.notes}</span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          onClick={() => onSetAccommodationStatus(card.personId, !card.accommodation.done)}
                          className="rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted"
                        >
                          {card.accommodation.done ? "Undo" : "Done"}
                        </button>
                      </label>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No accommodation action this week.</p>
                  )}
                </section>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TravelTask({
  title,
  bookFrom,
  bookTo,
  travelDate,
  travelLabel,
  status,
  done,
  overdue,
  onOpen,
  onToggle,
}: {
  title: string;
  bookFrom: string | null;
  bookTo: string | null;
  travelDate: string | null;
  travelLabel: string;
  status: string;
  done: boolean;
  overdue: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border px-3 py-3",
        overdue && !done && "border-rose-200 bg-rose-50/50",
        done && "bg-muted/30",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className={cn("block font-semibold", done && "text-muted-foreground")}>
            {done ? "Flight on file" : "Arrange flight"} · {title}
            {overdue && !done ? <span className="ml-2 text-xs font-semibold text-rose-800">Overdue</span> : null}
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            Book on Canadian North{bookFrom || bookTo ? ` · window ${bookFrom ? formatMedium(bookFrom) : "-"} → ${bookTo ? formatMedium(bookTo) : "-"}` : ""}
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            Travel {travelLabel}: {travelDate ? formatMedium(travelDate) : "-"} · {status}
          </span>
        </span>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {done ? "Update" : "Add confirmation"}
          </button>
          {!done ? (
            <button type="button" onClick={onToggle} className="rounded-lg border border-input px-3 py-1.5 text-xs hover:bg-muted">
              Mark booked
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
