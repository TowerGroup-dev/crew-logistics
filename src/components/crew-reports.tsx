"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMonthlyReport } from "@/lib/crew-monthly-report";
import type { CrewActivityLog } from "@/lib/crew-activity-log";
import type { FlightBook } from "@/lib/crew-flights";
import { opsFor, type CrewOpsBook } from "@/lib/crew-ops";
import { siteLabel, type CrewPerson, type CrewSnapshot } from "@/lib/crew-schedule";
import type { CrewStopoverBook } from "@/lib/crew-stopovers";
import type { TravelHub } from "@/lib/crew-travel-hubs";
import { formatMedium } from "@/lib/dates";

const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
] as const;

export function CrewReports({
  rows,
  opsBook,
  onOpen,
}: {
  rows: CrewSnapshot[];
  opsBook: CrewOpsBook;
  onOpen: (personId: string) => void;
}) {
  const updates = rows
    .flatMap((row) => {
      const ops = opsFor(opsBook, row.person.id);
      return ops.updates.map((update) => ({
        ...update,
        personId: row.person.id,
        personName: row.person.name,
        site: row.site,
      }));
    })
    .sort((a, b) => b.at.localeCompare(a.at));

  const dueSoon = rows.filter((row) => row.dueSoon || row.overdue);
  const fourWeek = rows.filter((row) => row.fourWeeksOut);
  const travel = rows.filter((row) =>
    row.alerts.some((alert) => alert === "return_flight" || alert === "outbound_flight" || alert === "accommodation"),
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight">Reports</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <ReportStat label="On site" value={rows.filter((r) => r.duty === "on_site").length} />
          <ReportStat label="Leaving soon / overdue" value={dueSoon.length} />
          <ReportStat label="4 weeks out" value={fourWeek.length} />
          <ReportStat label="Travel / lodging open" value={travel.length} />
        </dl>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold tracking-tight">Attention report</h3>
        </div>
        {dueSoon.length + fourWeek.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="divide-y divide-border">
            {[...dueSoon, ...fourWeek.filter((row) => !dueSoon.some((d) => d.person.id === row.person.id))].map((row) => (
              <li key={row.person.id}>
                <button type="button" onClick={() => onOpen(row.person.id)} className="w-full px-4 py-3 text-left hover:bg-muted/50">
                  <p className="font-semibold">{row.person.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {row.site ? siteLabel(row.site) : "-"}
                    {row.overdue
                      ? " · overdue out"
                      : row.dueSoon
                        ? ` · out in ${row.daysUntilOut}d`
                        : row.fourWeeksOut
                          ? " · 4 weeks out"
                          : ""}
                    {row.plannedOut ? ` · planned out ${formatMedium(row.plannedOut)}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold tracking-tight">Updates</h3>
        </div>
        {updates.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No updates yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {updates.map((update) => (
              <li key={update.id}>
                <button type="button" onClick={() => onOpen(update.personId)} className="w-full px-4 py-3 text-left hover:bg-muted/50">
                  <p className="font-semibold">{update.personName}</p>
                  <p className="mt-1 text-sm">{update.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {update.by} · {new Date(update.at).toLocaleString()}
                    {update.site ? ` · ${siteLabel(update.site)}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Full monthly who/what/where report — pick any month in the schedule year. */
export function CrewMonthlyReportPanel({
  year,
  month,
  people,
  opsBook,
  flightBook,
  stopoverBook,
  activityLog,
  travelHubs,
  onOpen,
}: {
  year: number;
  month: number;
  people: CrewPerson[];
  opsBook: CrewOpsBook;
  flightBook: FlightBook;
  stopoverBook: CrewStopoverBook;
  activityLog: CrewActivityLog;
  travelHubs?: TravelHub[];
  onOpen?: (personId: string) => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState(() => Math.min(12, Math.max(1, month)));

  useEffect(() => {
    setSelectedMonth(Math.min(12, Math.max(1, month)));
  }, [month, year]);

  const report = useMemo(
    () =>
      buildMonthlyReport({
        year,
        month: selectedMonth,
        people,
        opsBook,
        flightBook,
        stopoverBook,
        activityLog,
        travelHubs,
      }),
    [activityLog, flightBook, opsBook, people, selectedMonth, stopoverBook, travelHubs, year],
  );

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Monthly report</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Who / what / where for {year} · stays, flights, journeys, planning log
          </p>
        </div>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Month</span>
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(Number(event.target.value))}
            className="h-9 min-w-[11rem] rounded-lg border border-input bg-card px-2 text-sm font-medium"
          >
            {MONTH_OPTIONS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label} {year}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="overflow-hidden rounded-xl border border-border">
        <div className="border-b border-border bg-muted/30 px-4 py-2.5">
          <h3 className="text-sm font-semibold tracking-tight">{report.label}</h3>
          <p className="text-xs text-muted-foreground">{report.lines.length} line(s)</p>
        </div>
        {report.lines.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">Nothing recorded for this month yet.</p>
        ) : (
          <ul className="max-h-[min(70dvh,40rem)] divide-y divide-border overflow-y-auto">
            {report.lines.map((line) => (
              <li key={line.id}>
                {line.personId && onOpen ? (
                  <button
                    type="button"
                    onClick={() => onOpen(line.personId!)}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-muted/50"
                  >
                    {line.text}
                  </button>
                ) : (
                  <p className="px-4 py-2.5 text-sm">{line.text}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
      <dt className="text-[0.8125rem] font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}
