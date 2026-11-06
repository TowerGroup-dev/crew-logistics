"use client";

import { bookingLabel, bookingNeedsAttention, opsFor, type CrewOpsBook } from "@/lib/crew-ops";
import {
  activeBookingFor,
  flightIsArranged,
  flightStatusLabel,
  type FlightBook,
} from "@/lib/crew-flights";
import { RETURN_SOON_DAYS, siteLabel, type CrewSnapshot } from "@/lib/crew-schedule";
import { addDays, formatMedium } from "@/lib/dates";
import { cn } from "@/lib/cn";

function withinSoon(date: string | null, today: string) {
  return Boolean(date && date >= today && date <= addDays(today, RETURN_SOON_DAYS));
}

export function CrewTravelDesk({
  rows,
  opsBook,
  flightBook,
  today,
  onOpen,
}: {
  rows: CrewSnapshot[];
  opsBook: CrewOpsBook;
  flightBook: FlightBook;
  today: string;
  onOpen: (personId: string) => void;
}) {
  const outbound = rows.filter((row) => {
    const live = row.duty === "in_transit" || withinSoon(row.plannedIn, today);
    if (!live) return false;
    if (flightIsArranged(activeBookingFor(flightBook, row.person.id, "outbound"))) return false;
    const ops = opsFor(opsBook, row.person.id);
    return bookingNeedsAttention(ops.outboundFlight);
  });

  const inbound = rows.filter((row) => {
    const live =
      row.duty === "on_site" && (row.dueSoon || row.overdue || withinSoon(row.plannedOut, today));
    if (!live) return false;
    if (flightIsArranged(activeBookingFor(flightBook, row.person.id, "return"))) return false;
    const ops = opsFor(opsBook, row.person.id);
    return bookingNeedsAttention(ops.returnFlight) || row.dueSoon || row.overdue;
  });

  const booked = rows.filter((row) => {
    const live =
      row.duty === "on_site" ||
      row.duty === "in_transit" ||
      withinSoon(row.plannedIn, today) ||
      withinSoon(row.plannedOut, today);
    if (!live) return false;
    const out = flightIsArranged(activeBookingFor(flightBook, row.person.id, "outbound"));
    const ret = flightIsArranged(activeBookingFor(flightBook, row.person.id, "return"));
    return out || ret;
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-2xl tracking-tight">Travel</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Current moves only: arrivals and returns in the next 2 weeks. Arrange on Canadian North, then add the confirmation on the crew profile.
        </p>
      </div>

      <Queue
        title={`Outbound to site (${outbound.length})`}
        empty="None right now."
        rows={outbound}
        opsBook={opsBook}
        flightBook={flightBook}
        onOpen={onOpen}
        direction="outbound"
      />
      <Queue
        title={`Return home (${inbound.length})`}
        empty="None right now."
        rows={inbound}
        opsBook={opsBook}
        flightBook={flightBook}
        onOpen={onOpen}
        direction="return"
        urgent
      />
      <Queue
        title={`On file now (${booked.length})`}
        empty="No live bookings on file."
        rows={booked}
        opsBook={opsBook}
        flightBook={flightBook}
        onOpen={onOpen}
        direction="either"
      />
    </div>
  );
}

function Queue({
  title,
  empty,
  rows,
  opsBook,
  flightBook,
  onOpen,
  direction,
  urgent,
}: {
  title: string;
  empty: string;
  rows: CrewSnapshot[];
  opsBook: CrewOpsBook;
  flightBook: FlightBook;
  onOpen: (personId: string) => void;
  direction: "outbound" | "return" | "either";
  urgent?: boolean;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border bg-card", urgent ? "border-amber-300" : "border-border")}>
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-heading text-lg tracking-tight">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="max-h-[min(40vh,20rem)] divide-y divide-border overflow-y-auto">
          {rows.map((row) => {
            const ops = opsFor(opsBook, row.person.id);
            const outBooking = activeBookingFor(flightBook, row.person.id, "outbound");
            const retBooking = activeBookingFor(flightBook, row.person.id, "return");
            const booking =
              direction === "outbound" ? outBooking : direction === "return" ? retBooking : outBooking || retBooking;
            const status = booking
              ? `${flightStatusLabel(booking.status)}${booking.pnr ? ` · ${booking.pnr}` : ""}`
              : direction === "outbound"
                ? bookingLabel(ops.outboundFlight)
                : direction === "return"
                  ? bookingLabel(ops.returnFlight)
                  : "On file";
            return (
              <li key={row.person.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <button type="button" onClick={() => onOpen(row.person.id)} className="min-w-0 text-left hover:text-primary">
                  <p className="font-semibold">{row.person.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.site ? siteLabel(row.site) : "-"}
                    {direction === "outbound" && row.plannedIn ? ` · in ${formatMedium(row.plannedIn)}` : ""}
                    {direction === "return" && row.plannedOut ? ` · out ${formatMedium(row.plannedOut)}` : ""}
                    {direction === "either" && row.plannedIn ? ` · in ${formatMedium(row.plannedIn)}` : ""}
                    {` · ${status}`}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onOpen(row.person.id)}
                  className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  Open
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
