"use client";

import { bookingLabel, bookingNeedsAttention, opsFor, type CrewOpsBook } from "@/lib/crew-ops";
import { RETURN_SOON_DAYS, siteLabel, type CrewSnapshot } from "@/lib/crew-schedule";
import { addDays, formatMedium } from "@/lib/dates";
import { cn } from "@/lib/cn";

function isLiveNow(row: CrewSnapshot, today: string) {
  if (row.duty === "on_site" || row.duty === "in_transit") return true;
  if (row.duty === "upcoming" && row.plannedIn && row.plannedIn <= addDays(today, RETURN_SOON_DAYS)) {
    return true;
  }
  return false;
}

export function CrewAccommodationDesk({
  rows,
  opsBook,
  today,
  onOpen,
  onMarkBooked,
}: {
  rows: CrewSnapshot[];
  opsBook: CrewOpsBook;
  today: string;
  onOpen: (personId: string) => void;
  onMarkBooked: (personId: string) => void;
}) {
  const live = rows.filter((row) => isLiveNow(row, today));

  const needsAttention = live.filter((row) => {
    const ops = opsFor(opsBook, row.person.id);
    return bookingNeedsAttention(ops.accommodation);
  });
  const booked = live.filter((row) => {
    const ops = opsFor(opsBook, row.person.id);
    return ops.accommodation === "booked" || ops.accommodation === "confirmed";
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-2xl tracking-tight">Accommodation</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only people on site, in transit, or arriving within 2 weeks.</p>
      </div>

      <Queue
        title={`Needs booking (${needsAttention.length})`}
        empty="None right now."
        rows={needsAttention}
        opsBook={opsBook}
        onOpen={onOpen}
        onMarkBooked={onMarkBooked}
        urgent
      />
      <Queue
        title={`Booked now (${booked.length})`}
        empty="None right now."
        rows={booked}
        opsBook={opsBook}
        onOpen={onOpen}
      />
    </div>
  );
}

function Queue({
  title,
  empty,
  rows,
  opsBook,
  onOpen,
  onMarkBooked,
  urgent,
}: {
  title: string;
  empty: string;
  rows: CrewSnapshot[];
  opsBook: CrewOpsBook;
  onOpen: (personId: string) => void;
  onMarkBooked?: (personId: string) => void;
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
            return (
              <li key={row.person.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <button type="button" onClick={() => onOpen(row.person.id)} className="min-w-0 text-left hover:text-primary">
                  <p className="font-semibold">{row.person.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.site ? siteLabel(row.site) : "-"}
                    {row.plannedIn ? ` · in ${formatMedium(row.plannedIn)}` : ""}
                    {row.plannedOut ? ` · out ${formatMedium(row.plannedOut)}` : ""}
                    {` · ${bookingLabel(ops.accommodation)}`}
                    {ops.accommodationNotes ? ` · ${ops.accommodationNotes}` : ""}
                  </p>
                </button>
                {onMarkBooked ? (
                  <button
                    type="button"
                    onClick={() => onMarkBooked(row.person.id)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Mark booked
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpen(row.person.id)}
                    className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted"
                  >
                    Open
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
