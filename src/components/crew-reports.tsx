"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Database, Download, Printer } from "lucide-react";
import type { CrewActivityLog } from "@/lib/crew-activity-log";
import { buildZip, csvBytes, downloadFile, toCsv } from "@/lib/crew-export";
import {
  buildReportTables,
  summarisePeriod,
  type BookingStatus,
  type PeriodSummary,
  type ReportTables,
} from "@/lib/crew-report-data";
import type { RotationBook } from "@/lib/crew-rotations";
import { sortSitesForDisplay, type CrewSite } from "@/lib/crew-sites";
import { cn } from "@/lib/cn";
import type { FlightBook } from "@/lib/crew-flights";
import { opsFor, type CrewOpsBook } from "@/lib/crew-ops";
import { siteLabel, type CrewPerson, type CrewSnapshot } from "@/lib/crew-schedule";
import type { CrewStopoverBook } from "@/lib/crew-stopovers";
import type { TravelHub } from "@/lib/crew-travel-hubs";
import { formatDate, formatMedium, formatShort, parseISODate, toISODate } from "@/lib/dates";

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

/* ------------------------------------------------------------------ */
/* Reports page: month or full-year report + Power BI data pack.       */
/* ------------------------------------------------------------------ */

const PERIOD_OPTIONS = [{ value: 0, label: "Full year" }, ...MONTH_OPTIONS];

/** Tailwind 500 shades for the site colour ids used in Settings. */
const SITE_HEX: Record<string, string> = {
  sky: "#0ea5e9",
  emerald: "#10b981",
  amber: "#f59e0b",
  violet: "#8b5cf6",
  rose: "#f43f5e",
  teal: "#14b8a6",
  orange: "#f97316",
  stone: "#78716c",
};
const FALLBACK_HEX = ["#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#f43f5e", "#14b8a6", "#f97316", "#78716c"];

const STATUS_TONE: Record<BookingStatus, string> = {
  Confirmed: "text-slate-600",
  Booked: "text-sky-700",
  "Not booked": "text-rose-700",
  "No record": "bg-stone-100 text-stone-600",
};

function shortDay(iso: string) {
  return iso ? formatShort(iso) : "";
}

function plural(count: number, word: string, many = `${word}s`) {
  return `${count.toLocaleString("en-CA")} ${count === 1 ? word : many}`;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

/** Full who / where / how-long report, for one month or the whole schedule year. */
export function CrewMonthlyReportPanel({
  year,
  month,
  people,
  flightBook,
  rotationBook,
  activityLog,
  travelHubs,
  sites = [],
  onOpen,
}: {
  year: number;
  month: number;
  people: CrewPerson[];
  opsBook?: CrewOpsBook;
  flightBook: FlightBook;
  rotationBook: RotationBook;
  stopoverBook?: CrewStopoverBook;
  activityLog: CrewActivityLog;
  travelHubs?: TravelHub[];
  sites?: CrewSite[];
  onOpen?: (personId: string) => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState(() => Math.min(12, Math.max(1, month)));

  useEffect(() => {
    setSelectedMonth(Math.min(12, Math.max(1, month)));
  }, [month, year]);

  const reportPeople = useMemo(
    () => people.filter((person) => person.active !== false && !person.provisional),
    [people],
  );

  const tables = useMemo(
    () =>
      buildReportTables({
        year,
        people: reportPeople,
        flightBook,
        rotationBook,
        activityLog,
        travelHubs,
      }),
    [activityLog, flightBook, reportPeople, rotationBook, travelHubs, year],
  );

  const siteOrder = useMemo(() => sortSitesForDisplay(sites).map((site) => site.code), [sites]);
  const siteColours = useMemo(() => {
    const map: Record<string, string> = {};
    sites.forEach((site, index) => {
      map[site.code] = SITE_HEX[site.colourId] || FALLBACK_HEX[index % FALLBACK_HEX.length]!;
    });
    return map;
  }, [sites]);

  const summary = useMemo(
    () =>
      summarisePeriod(tables, { year, month: selectedMonth || null }, rotationBook, siteOrder),
    [rotationBook, selectedMonth, siteOrder, tables, year],
  );

  const colourFor = (site: string, index: number) =>
    siteColours[site] || FALLBACK_HEX[index % FALLBACK_HEX.length]!;

  return (
    <div className="crew-report space-y-5 p-4 sm:p-5" data-print-root>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Tower Arctic Ltd. · Crew report</p>
          <h2 className="mt-1 font-heading text-2xl tracking-tight">{summary.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatMedium(summary.from)} to {formatMedium(summary.last)} · active crew only · produced{" "}
            {formatMedium(toISODate(new Date()))}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 print:hidden">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Period</span>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
              className="h-9 min-w-[11rem] rounded-lg border border-input bg-card px-2 text-sm font-medium"
            >
              {PERIOD_OPTIONS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.value ? `${entry.label} ${year}` : `${entry.label} ${year}`}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-medium hover:bg-muted"
          >
            <Printer className="size-4" /> Print / PDF
          </button>
          <button
            type="button"
            onClick={() => downloadPowerBiPack(tables)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Download className="size-4" /> Power BI data pack
          </button>
        </div>
      </header>

      <ReportNarrative summary={summary} />

      {/* Figures in a row, split by thin rules (no tiles). */}
      <div className="grid grid-cols-2 gap-y-3 border-y border-border py-3 md:grid-cols-3 md:divide-x md:divide-border xl:grid-cols-6">
        <Kpi label="People on site" value={summary.peopleOnSite.toLocaleString("en-CA")} hint="at least one day" />
        <Kpi label="Person-days" value={summary.personDays.toLocaleString("en-CA")} hint="days on site, all crew" />
        <Kpi label="Average per day" value={summary.averageHeadcount.toFixed(1)} hint="people on site" />
        <Kpi
          label="Busiest day"
          value={String(summary.peak.count)}
          hint={summary.personDays ? shortDay(summary.peak.date) : "no one on site"}
        />
        <Kpi
          label="Arrivals / departures"
          value={`${summary.arrivals.length} / ${summary.departures.length}`}
          hint="stays starting / ending"
        />
        <Kpi
          label="Open items"
          value={String(summary.openItems.length)}
          hint="flights or rooms to book"
          tone={summary.openItems.length ? "alert" : "ok"}
        />
      </div>

      <ReportSection
        title="Daily headcount"
        note="People on site each day, split by site. This is the same count shown under each day on the Month calendar."
      >
        <HeadcountChart summary={summary} colourFor={colourFor} />
      </ReportSection>

      {summary.byMonth.length ? (
        <ReportSection title="Month by month" note="How the year breaks down. Click a month in the Period list for its full report.">
          <SimpleTable
            headers={["Month", "People", "Person-days", "Avg per day", "Busiest day", "Arrivals", "Departures"]}
            align={["left", "right", "right", "right", "right", "right", "right"]}
            rows={summary.byMonth.map((row) => [
              <span key="m" className="font-medium">{row.label}</span>,
              row.people,
              row.personDays.toLocaleString("en-CA"),
              row.averageHeadcount.toFixed(1),
              row.peak,
              row.arrivals,
              row.departures,
            ])}
            empty="No data."
          />
        </ReportSection>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <ReportSection title="By site" note="Share of all time on site in this period.">
          <SimpleTable
            headers={["Site", "People", "Person-days", "Busiest day", "Share"]}
            align={["left", "right", "right", "right", "right"]}
            rows={summary.bySite.map((row, index) => [
              <span key="s" className="inline-flex items-center gap-2 font-medium">
                <span className="size-2.5 rounded-sm" style={{ background: colourFor(row.site, index) }} />
                {row.site}
              </span>,
              row.people,
              row.personDays.toLocaleString("en-CA"),
              row.peak,
              percent(row.share),
            ])}
            empty="No one on site in this period."
          />
        </ReportSection>
        <ReportSection title="By role" note="Role held on the day (a stay can carry its own role).">
          <SimpleTable
            headers={["Role", "People", "Person-days", "Avg per day"]}
            align={["left", "right", "right", "right"]}
            rows={summary.byRole.map((row) => [
              <span key="r" className="font-medium">{row.role}</span>,
              row.people,
              row.personDays.toLocaleString("en-CA"),
              (row.personDays / summary.days.length).toFixed(1),
            ])}
            empty="No one on site in this period."
          />
          {summary.byCategory.length ? (
            <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              By hire type:{" "}
              {summary.byCategory
                .map((row) => `${row.category} ${plural(row.people, "person", "people")}, ${row.personDays} days`)
                .join(" · ")}
            </p>
          ) : null}
        </ReportSection>
      </div>

      <ReportSection
        title="Crew in this period"
        note="Everyone with at least one day on site, longest stay first. Bookings are for the stay that covers their first day in the period."
      >
        <SimpleTable
          headers={["Name", "Role", "Type", "Site", "Days", "First day", "Last day", "Flight in", "Flight home", "Room"]}
          align={["left", "left", "left", "left", "right", "left", "left", "left", "left", "left"]}
          rows={summary.crew.map((row) => [
            <NameCell key="n" name={row.name} personId={row.personId} onOpen={onOpen} />,
            row.role,
            row.category,
            row.sites,
            row.daysOnSite,
            shortDay(row.firstDay),
            shortDay(row.lastDay),
            <StatusBadge key="a" status={row.flightToSite} />,
            <StatusBadge key="b" status={row.flightHome} />,
            <StatusBadge key="c" status={row.room} />,
          ])}
          empty="No one on site in this period."
        />
      </ReportSection>

      <div className="grid gap-5 lg:grid-cols-2">
        <ReportSection title={`Arrivals (${summary.arrivals.length})`} note="Stays that start in this period.">
          <SimpleTable
            scroll
            headers={["Date", "Name", "Site", "Flight in", "Room"]}
            align={["left", "left", "left", "left", "left"]}
            rows={summary.arrivals.map((row) => [
              shortDay(row.date),
              <NameCell key="n" name={row.name} personId={row.personId} onOpen={onOpen} />,
              row.site,
              <StatusBadge key="f" status={row.flight} />,
              <StatusBadge key="r" status={row.room} />,
            ])}
            empty="No arrivals."
          />
        </ReportSection>
        <ReportSection title={`Departures (${summary.departures.length})`} note="Last day on site falls in this period.">
          <SimpleTable
            scroll
            headers={["Last day", "Name", "Site", "Flight home", "Replaced by"]}
            align={["left", "left", "left", "left", "left"]}
            rows={summary.departures.map((row) => [
              shortDay(row.date),
              <NameCell key="n" name={row.name} personId={row.personId} onOpen={onOpen} />,
              row.site,
              <StatusBadge key="f" status={row.flight} />,
              row.replacement || <span key="x" className="text-muted-foreground">None set</span>,
            ])}
            empty="No departures."
          />
        </ReportSection>
      </div>

      <ReportSection
        title={`Open items (${summary.openItems.length})`}
        note="Movements in this period that still need a flight or a room."
      >
        {summary.openItems.length ? (
          <ul className="divide-y divide-border">
            {summary.openItems.map((row, index) => (
              <li key={`${row.personId}-${row.item}-${index}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{shortDay(row.date)}</span>
                <span className="min-w-0 flex-1">
                  <NameCell name={row.name} personId={row.personId} onOpen={onOpen} />
                  <span className="text-muted-foreground"> · {row.item}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-sm text-emerald-800">Everything moving in this period has its flights and rooms.</p>
        )}
      </ReportSection>

      <ReportSection
        title={`Flights (${summary.flightsInPeriod.length})`}
        note="Bookings entered in the app plus flights recorded on the schedule sheet."
      >
        <SimpleTable
          scroll
          headers={["Date", "Name", "Direction", "Route", "PNR", "Status", "Source"]}
          align={["left", "left", "left", "left", "left", "left", "left"]}
          rows={summary.flightsInPeriod.map((row) => [
            shortDay(row.DepartDate || row.ArriveDate),
            <NameCell key="n" name={row.Name} personId={row.PersonId} onOpen={onOpen} />,
            row.Direction,
            row.Route || [row.FromAirport, row.ToAirport].filter(Boolean).join(" → ") || row.Reference,
            row.PNR,
            row.Status,
            row.Source,
          ])}
          empty="No flights recorded for this period."
        />
      </ReportSection>

      <ReportSection
        title={`Planning log (${summary.activity.length})`}
        note="Changes made in the app: stays placed, extended or cleared, role moves, bookings."
      >
        {summary.activity.length ? (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto print:max-h-none print:overflow-visible">
            {summary.activity.map((row) => (
              <li key={row.ActivityId} className="flex gap-3 px-4 py-2.5 text-sm">
                <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{shortDay(row.Date)}</span>
                <span className="min-w-0 flex-1">{row.Detail}</span>
                <span className="shrink-0 text-xs text-muted-foreground capitalize">{row.Kind}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-sm text-muted-foreground">No changes logged in this period.</p>
        )}
      </ReportSection>

      <PowerBiPanel tables={tables} />
    </div>
  );
}

function ReportNarrative({ summary }: { summary: PeriodSummary }) {
  if (!summary.personDays) {
    return (
      <p className="max-w-4xl text-sm leading-relaxed text-foreground/90">
        No one was scheduled on site in {summary.label}.
      </p>
    );
  }
  const topSite = [...summary.bySite].sort((a, b) => b.personDays - a.personDays)[0];
  const topRole = summary.byRole[0];
  const sentences = [
    `In ${summary.label.replace(" (full year)", "")}, ${plural(summary.peopleOnSite, "person", "people")} spent ${plural(summary.personDays, "person-day")} on site.`,
    `On an average day ${summary.averageHeadcount.toFixed(1)} people were on site. The busiest day was ${formatMedium(summary.peak.date)} with ${summary.peak.count}; the quietest was ${formatMedium(summary.low.date)} with ${summary.low.count}.`,
    topSite
      ? summary.bySite.length > 1
        ? `${topSite.site} accounted for ${percent(topSite.share)} of the time on site (${plural(topSite.people, "person", "people")}), across ${summary.bySite.length} sites in total.`
        : `All time on site was at ${topSite.site}.`
      : "",
    topRole ? `${topRole.role} was the largest role, at ${plural(topRole.personDays, "person-day")}.` : "",
    `${plural(summary.arrivals.length, "arrival")} and ${plural(summary.departures.length, "departure")} were scheduled.`,
    summary.openItems.length
      ? `${plural(summary.openItems.length, "item")} still need booking (see Open items).`
      : "Every arrival and departure has its flights and rooms recorded.",
  ].filter(Boolean);
  return (
    <p className="max-w-4xl text-sm leading-relaxed text-foreground/90">
      {sentences.join(" ")}
    </p>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "alert" | "ok" }) {
  return (
    <div className="px-4 py-2 break-inside-avoid first:pl-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "alert" && "text-rose-700",
          tone === "ok" && "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ReportSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    // Open section: a heading with a rule, no box.
    <section className="break-inside-avoid">
      <div className="border-b border-foreground/15 py-2.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={cn("tag whitespace-nowrap", STATUS_TONE[status])}>
      {status}
    </span>
  );
}

function NameCell({ name, personId, onOpen }: { name: string; personId: string; onOpen?: (personId: string) => void }) {
  if (!onOpen) return <span className="font-medium">{name}</span>;
  return (
    <button type="button" onClick={() => onOpen(personId)} className="font-medium text-left hover:text-primary hover:underline">
      {name}
    </button>
  );
}

function SimpleTable({
  headers,
  rows,
  align,
  empty,
  scroll,
}: {
  headers: string[];
  rows: ReactNode[][];
  align: ("left" | "right")[];
  empty: string;
  scroll?: boolean;
}) {
  if (!rows.length) return <p className="px-4 py-5 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className={cn("overflow-x-auto", scroll && "max-h-96 overflow-y-auto print:max-h-none print:overflow-visible")}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            {headers.map((header, index) => (
              <th
                key={header}
                className={cn("px-4 py-2 font-medium whitespace-nowrap", align[index] === "right" && "text-right")}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((cells, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-muted/30">
              {cells.map((cell, index) => (
                <td
                  key={index}
                  className={cn(
                    "px-4 py-2 align-middle whitespace-nowrap",
                    align[index] === "right" && "text-right tabular-nums",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeadcountChart({
  summary,
  colourFor,
}: {
  summary: PeriodSummary;
  colourFor: (site: string, index: number) => string;
}) {
  const count = summary.days.length;
  const max = Math.max(1, ...summary.headcount);
  const niceMax = max <= 5 ? max : Math.ceil(max / 5) * 5;
  const width = 1000;
  const height = 220;
  const left = 34;
  const bottom = 24;
  const top = 8;
  const plotW = width - left - 8;
  const plotH = height - top - bottom;
  const barW = plotW / count;
  const gap = count > 40 ? 0 : Math.min(3, barW * 0.2);
  const y = (value: number) => top + plotH - (value / niceMax) * plotH;
  const ticks = [0, Math.round(niceMax / 2), niceMax];
  const yearView = count > 40;

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {summary.sites.map((site, index) => (
          <span key={site} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: colourFor(site, index) }} />
            {site}
          </span>
        ))}
        <span className="ml-auto">Average {summary.averageHeadcount.toFixed(1)} · busiest {summary.peak.count}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full" role="img" aria-label={`Daily headcount, ${summary.label}`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - 8} y1={y(tick)} y2={y(tick)} stroke="currentColor" className="text-border" strokeWidth={1} />
            <text x={left - 6} y={y(tick) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {tick}
            </text>
          </g>
        ))}
        <line
          x1={left}
          x2={width - 8}
          y1={y(summary.averageHeadcount)}
          y2={y(summary.averageHeadcount)}
          stroke="#1b2433"
          strokeDasharray="4 4"
          strokeOpacity={0.45}
        />
        {summary.days.map((iso, i) => {
          let base = 0;
          const x = left + i * barW + gap / 2;
          const w = Math.max(0.5, barW - gap);
          return (
            <g key={iso}>
              <title>
                {`${formatMedium(iso)}: ${summary.headcount[i]} on site${summary.sites
                  .map((site) => (summary.headcountBySite[site]![i] ? ` · ${site} ${summary.headcountBySite[site]![i]}` : ""))
                  .join("")}`}
              </title>
              {summary.sites.map((site, siteIndex) => {
                const value = summary.headcountBySite[site]![i]!;
                if (!value) return null;
                const y0 = y(base + value);
                const h = y(base) - y0;
                base += value;
                return <rect key={site} x={x} y={y0} width={w} height={h} fill={colourFor(site, siteIndex)} />;
              })}
              <rect x={left + i * barW} y={top} width={barW} height={plotH} fill="transparent" />
            </g>
          );
        })}
        {summary.days.map((iso, i) => {
          const day = Number(iso.slice(8, 10));
          const show = yearView ? day === 1 : day === 1 || day % 5 === 0;
          if (!show) return null;
          const label = yearView ? formatDate(parseISODate(iso), "en-CA", { month: "short" }) : String(day);
          return (
            <text
              key={`l-${iso}`}
              x={left + i * barW + (yearView ? 2 : barW / 2)}
              y={height - 6}
              textAnchor={yearView ? "start" : "middle"}
              className="fill-muted-foreground text-[11px]"
            >
              {label}
            </text>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-muted-foreground">Dashed line: average per day. Hover a bar for that day&apos;s split.</p>
    </div>
  );
}

/* ---------------------------------------------------------- Power BI */

type ExportTable = { file: string; title: string; description: string; rows: number; csv: () => string };

function exportTables(tables: ReportTables): ExportTable[] {
  const y = tables.year;
  return [
    {
      file: `crew_people_${y}.csv`,
      title: "People",
      description: "One row per person: home role, hire type, status, days on site this year. PersonId is the key.",
      rows: tables.people.length,
      csv: () =>
        toCsv(tables.people, [
          { header: "PersonId", value: (r) => r.PersonId },
          { header: "Name", value: (r) => r.Name },
          { header: "HomeRole", value: (r) => r.HomeRole },
          { header: "Category", value: (r) => r.Category },
          { header: "Status", value: (r) => r.Status },
          { header: "HomeSites", value: (r) => r.HomeSites },
          { header: "DaysOnSiteInYear", value: (r) => r.DaysOnSiteInYear },
        ]),
    },
    {
      file: `crew_daily_onsite_${y}.csv`,
      title: "Daily on site",
      description: "One row per person per day on site (Date, PersonId, Role, Site). Count rows for headcount; sum for person-days.",
      rows: tables.daily.length,
      csv: () =>
        toCsv(tables.daily, [
          { header: "Date", value: (r) => r.Date },
          { header: "PersonId", value: (r) => r.PersonId },
          { header: "Name", value: (r) => r.Name },
          { header: "Role", value: (r) => r.Role },
          { header: "Category", value: (r) => r.Category },
          { header: "Site", value: (r) => r.Site },
        ]),
    },
    {
      file: `crew_stays_${y}.csv`,
      title: "Stays",
      description: "One row per stay: site, role, first and last day, length, whether it came from the sheet or the app.",
      rows: tables.stays.length,
      csv: () =>
        toCsv(tables.stays, [
          { header: "StayId", value: (r) => r.StayId },
          { header: "PersonId", value: (r) => r.PersonId },
          { header: "Name", value: (r) => r.Name },
          { header: "Role", value: (r) => r.Role },
          { header: "Site", value: (r) => r.Site },
          { header: "FirstDay", value: (r) => r.FirstDay },
          { header: "LastDay", value: (r) => r.LastDay },
          { header: "Days", value: (r) => r.Days },
          { header: "OpenEnded", value: (r) => r.OpenEnded },
          { header: "Source", value: (r) => r.Source },
          { header: "Note", value: (r) => r.Note },
        ]),
    },
    {
      file: `crew_rotations_${y}.csv`,
      title: "Rotations and bookings",
      description: "One row per rotation: planned and actual dates, flight to site, flight home, room, replacement.",
      rows: tables.rotations.length,
      csv: () =>
        toCsv(tables.rotations, [
          { header: "RotationId", value: (r) => r.RotationId },
          { header: "PersonId", value: (r) => r.PersonId },
          { header: "Name", value: (r) => r.Name },
          { header: "Role", value: (r) => r.Role },
          { header: "Site", value: (r) => r.Site },
          { header: "PlannedIn", value: (r) => r.PlannedIn },
          { header: "PlannedLastDay", value: (r) => r.PlannedLastDay },
          { header: "PlannedDays", value: (r) => r.PlannedDays },
          { header: "ActualIn", value: (r) => r.ActualIn },
          { header: "ActualOut", value: (r) => r.ActualOut },
          { header: "FlightToSite", value: (r) => r.FlightToSite },
          { header: "FlightHome", value: (r) => r.FlightHome },
          { header: "Room", value: (r) => r.Room },
          { header: "ReplacedBy", value: (r) => r.ReplacedBy },
          { header: "Replaces", value: (r) => r.Replaces },
        ]),
    },
    {
      file: `crew_flights_${y}.csv`,
      title: "Flights",
      description: "Every flight booking and sheet flight: direction, route, PNR, status, dates.",
      rows: tables.flights.length,
      csv: () =>
        toCsv(tables.flights, [
          { header: "FlightId", value: (r) => r.FlightId },
          { header: "PersonId", value: (r) => r.PersonId },
          { header: "Name", value: (r) => r.Name },
          { header: "Direction", value: (r) => r.Direction },
          { header: "Status", value: (r) => r.Status },
          { header: "Source", value: (r) => r.Source },
          { header: "Airline", value: (r) => r.Airline },
          { header: "PNR", value: (r) => r.PNR },
          { header: "TicketNumber", value: (r) => r.TicketNumber },
          { header: "DepartDate", value: (r) => r.DepartDate },
          { header: "ArriveDate", value: (r) => r.ArriveDate },
          { header: "FromAirport", value: (r) => r.FromAirport },
          { header: "ToAirport", value: (r) => r.ToAirport },
          { header: "Route", value: (r) => r.Route },
          { header: "Legs", value: (r) => r.Legs },
          { header: "BookedOn", value: (r) => r.BookedOn },
          { header: "EnteredBy", value: (r) => r.EnteredBy },
          { header: "Reference", value: (r) => r.Reference },
        ]),
    },
    {
      file: `crew_activity_${y}.csv`,
      title: "Planning log",
      description: "Every change logged in the app with its timestamp and person.",
      rows: tables.activity.length,
      csv: () =>
        toCsv(tables.activity, [
          { header: "ActivityId", value: (r) => r.ActivityId },
          { header: "Timestamp", value: (r) => r.Timestamp },
          { header: "Date", value: (r) => r.Date },
          { header: "Kind", value: (r) => r.Kind },
          { header: "PersonId", value: (r) => r.PersonId },
          { header: "Name", value: (r) => r.Name },
          { header: "Detail", value: (r) => r.Detail },
        ]),
    },
  ];
}

function downloadPowerBiPack(tables: ReportTables) {
  const files = exportTables(tables).map((table) => ({ name: table.file, bytes: csvBytes(table.csv()) }));
  files.push({ name: "README.txt", bytes: new TextEncoder().encode(powerBiReadme(tables.year)) });
  downloadFile(`crew-logistics-powerbi-${tables.year}.zip`, buildZip(files));
}

function powerBiReadme(year: number) {
  return [
    `Crew Schedule data pack for ${year}`,
    `Exported ${new Date().toISOString()}`,
    "",
    "Tables (CSV, UTF-8, dates as YYYY-MM-DD):",
    "  crew_people           one row per person (key: PersonId)",
    "  crew_daily_onsite     one row per person per day on site",
    "  crew_stays            one row per stay",
    "  crew_rotations        one row per rotation, with flight and room status",
    "  crew_flights          one row per flight booking or sheet flight",
    "  crew_activity         planning log",
    "",
    "Power BI setup (once):",
    "  1. Unzip into a OneDrive or SharePoint folder, e.g. Crew Schedule/Power BI.",
    "  2. Power BI Desktop: Get data > Text/CSV, load each file (or SharePoint folder and filter by name).",
    "  3. Model view: link crew_people[PersonId] one-to-many to PersonId in every other table.",
    "  4. Add a date table and link it to crew_daily_onsite[Date].",
    "  5. Useful measures:",
    "       Person-days = COUNTROWS(crew_daily_onsite)",
    "       Headcount = DISTINCTCOUNT(crew_daily_onsite[PersonId])   (per day on a date axis)",
    "       Flights not booked = COUNTROWS(FILTER(crew_rotations, crew_rotations[FlightHome] = \"Not booked\"))",
    "",
    "To refresh: export a new pack, replace the files in the same folder (keep the file names), then Refresh in Power BI.",
    "",
  ].join("\r\n");
}

function PowerBiPanel({ tables }: { tables: ReportTables }) {
  const list = exportTables(tables);
  return (
    <section className="overflow-hidden rounded-xl border border-primary/30 bg-card print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-primary/5 px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Database className="size-4 text-primary" /> Data for Power BI and Excel
          </h3>
          <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
            Six tables for the whole of {tables.year}, linked by PersonId. Download the pack, unzip it into a
            OneDrive or SharePoint folder, and point Power BI at that folder. To refresh, export again, replace the
            files (same names), and press Refresh in Power BI. A README with setup steps and ready-made measures is
            included.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadPowerBiPack(tables)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Download className="size-4" /> Download all (.zip)
        </button>
      </div>
      <ul className="divide-y divide-border">
        {list.map((table) => (
          <li key={table.file} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {table.title}{" "}
                <span className="font-normal text-muted-foreground">
                  · {table.file} · {table.rows.toLocaleString("en-CA")} rows
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{table.description}</p>
            </div>
            <button
              type="button"
              onClick={() => downloadFile(table.file, csvBytes(table.csv()))}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
            >
              <Download className="size-3.5" /> CSV
            </button>
          </li>
        ))}
      </ul>
      <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        Bookings and placements are saved in this browser, so export from the computer where they are entered.
      </p>
    </section>
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
