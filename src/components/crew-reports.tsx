"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Database, Download, Printer } from "lucide-react";
import type { CrewActivityLog } from "@/lib/crew-activity-log";
import { buildZip, csvBytes, downloadFile } from "@/lib/crew-export";
import {
  exportPowerBiTables,
  powerBiZipReadme,
} from "@/lib/crew-powerbi-export";
import {
  buildReportTables,
  summarisePeriod,
  type ActivityRow,
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
import {
  addDays,
  formatDate,
  formatMedium,
  formatShort,
  parseISODate,
  todayInZone,
} from "@/lib/dates";

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
  Confirmed: "bg-slate-100 text-slate-800",
  Booked: "bg-sky-100 text-sky-900",
  "Not booked": "bg-rose-100 text-rose-900",
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

  const priorSummary = useMemo(() => {
    if (!selectedMonth || selectedMonth < 2) return null;
    return summarisePeriod(tables, { year, month: selectedMonth - 1 }, rotationBook, siteOrder);
  }, [rotationBook, selectedMonth, siteOrder, tables, year]);

  const outlook = useMemo(() => buildStaffingOutlook(tables, year, summary.averageHeadcount), [summary.averageHeadcount, tables, year]);

  const colourFor = (site: string, index: number) =>
    siteColours[site] || FALLBACK_HEX[index % FALLBACK_HEX.length]!;

  const flightOpen = summary.openItems.filter((row) => /flight/i.test(row.item));
  const roomOpen = summary.openItems.filter((row) => /room/i.test(row.item));
  const bookingReady =
    summary.arrivals.length + summary.departures.length === 0
      ? 1
      : 1 -
        summary.openItems.length /
          Math.max(1, summary.arrivals.length * 2 + summary.departures.length);

  return (
    <div className="crew-report space-y-8 p-4 sm:p-6" data-print-root>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Tower Arctic Ltd. · Crew report</p>
          <h2 className="mt-1 font-heading text-2xl tracking-tight">{summary.label} operations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Report updated · {formatMedium(todayInZone())} · {formatMedium(summary.from)} to{" "}
            {formatMedium(summary.last)} · active crew only
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

      <OpsHero
        summary={summary}
        flightOpen={flightOpen.length}
        roomOpen={roomOpen.length}
        bookingReady={bookingReady}
      />

      {priorSummary ? <MonthComparison current={summary} prior={priorSummary} /> : null}

      <ReportSection
        title="Staffing outlook"
        note="Daily headcount for the next 30 days. Dashed line is this period’s average — a simple planning target."
      >
        <StaffingOutlookChart outlook={outlook} />
      </ReportSection>

      <ActionItemsPanel
        openItems={summary.openItems}
        flightOpen={flightOpen}
        roomOpen={roomOpen}
        onOpen={onOpen}
      />

      <ReportSection
        title="Daily headcount"
        note="People on site each day in this period, split by site. Same counts as under each day on the Month calendar."
      >
        <HeadcountChart summary={summary} colourFor={colourFor} />
      </ReportSection>

      {summary.byMonth.length ? (
        <ReportSection title="Month by month" note="How the year breaks down. Pick a month in Period for its full report.">
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

      <div className="grid gap-8 lg:grid-cols-2">
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
              (row.personDays / Math.max(1, summary.days.length)).toFixed(1),
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

      <div className="grid gap-8 lg:grid-cols-2">
        <MovementList
          title={`Arrivals (${summary.arrivals.length})`}
          note="Stays that start in this period."
          kind="arrival"
          rows={summary.arrivals}
          onOpen={onOpen}
        />
        <MovementList
          title={`Departures (${summary.departures.length})`}
          note="Last day on site falls in this period."
          kind="departure"
          rows={summary.departures}
          onOpen={onOpen}
        />
      </div>

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

      <PlanningLogPanel activity={summary.activity} onOpen={onOpen} />

      <PowerBiPanel tables={tables} />
    </div>
  );
}

type OpenItem = PeriodSummary["openItems"][number];

type StaffingOutlook = {
  days: string[];
  headcount: number[];
  target: number;
  belowTarget: number;
  start: string;
};

function buildStaffingOutlook(tables: ReportTables, year: number, averageHeadcount: number): StaffingOutlook {
  const today = todayInZone();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const start = today < yearStart ? yearStart : today > yearEnd ? yearEnd : today;
  const days: string[] = [];
  for (let i = 0; i < 30; i += 1) {
    const iso = addDays(start, i);
    if (iso > yearEnd) break;
    days.push(iso);
  }
  const byDate = new Map<string, number>();
  for (const row of tables.daily) {
    byDate.set(row.Date, (byDate.get(row.Date) ?? 0) + 1);
  }
  const headcount = days.map((iso) => byDate.get(iso) ?? 0);
  const target = Math.max(1, Math.round(averageHeadcount || 0));
  return {
    days,
    headcount,
    target,
    belowTarget: headcount.filter((count) => count < target).length,
    start,
  };
}

function OpsHero({
  summary,
  flightOpen,
  roomOpen,
  bookingReady,
}: {
  summary: PeriodSummary;
  flightOpen: number;
  roomOpen: number;
  bookingReady: number;
}) {
  const topSite = [...summary.bySite].sort((a, b) => b.personDays - a.personDays)[0];
  const siteLine = !summary.personDays
    ? "No one scheduled on site in this period."
    : summary.bySite.length === 1 && topSite
      ? `All ${plural(summary.personDays, "person-day")} are at ${topSite.site}`
      : topSite
        ? `${plural(summary.personDays, "person-day")} across ${summary.bySite.length} sites · ${topSite.site} leads at ${percent(topSite.share)}`
        : plural(summary.personDays, "person-day");
  const open = summary.openItems.length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6 p-5 sm:p-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {summary.label.replace(" (full year)", "")} operations
            </p>
            <h3 className="font-heading text-2xl tracking-tight sm:text-3xl">
              {plural(summary.peopleOnSite, "crew member")}
            </h3>
            <p className="text-base text-muted-foreground">
              across {plural(summary.bySite.length || 0, "site")}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{siteLine}</p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <OpsMetric label="Daily crew average" value={summary.averageHeadcount.toFixed(1)} />
            <OpsMetric
              label="Peak crew"
              value={String(summary.peak.count)}
              hint={summary.personDays ? shortDay(summary.peak.date) : undefined}
            />
            <OpsMetric label="Arrivals" value={String(summary.arrivals.length)} hint="Scheduled this period" />
            <OpsMetric label="Departures" value={String(summary.departures.length)} hint="Scheduled this period" />
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Booking readiness {percent(bookingReady)}</p>
            {summary.bySite.length > 1 ? (
              <p>
                Sites: {summary.bySite.map((row) => `${row.site} ${percent(row.share)}`).join(" · ")}
              </p>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "flex flex-col justify-between gap-6 border-t border-border p-5 sm:p-6 lg:border-t-0 lg:border-l",
            open ? "bg-rose-50/80" : "bg-emerald-50/70",
          )}
        >
          {open ? (
            <>
              <div className="space-y-3">
                <p className="text-xs font-semibold tracking-wide text-rose-800 uppercase">Needs attention</p>
                <p className="font-heading text-3xl tracking-tight text-rose-950 tabular-nums">
                  {open}
                </p>
                <p className="text-base font-medium text-rose-950">outstanding bookings</p>
                <p className="text-sm text-rose-900/80">Flights and rooms still need attention</p>
                <ul className="space-y-2 pt-1 text-sm text-rose-950">
                  {flightOpen ? (
                    <li className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full bg-rose-600" aria-hidden />
                      {plural(flightOpen, "flight")} to book
                    </li>
                  ) : null}
                  {roomOpen ? (
                    <li className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                      {plural(roomOpen, "room")} to confirm
                    </li>
                  ) : null}
                </ul>
              </div>
              <a
                href="#open-items"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-900 hover:underline"
              >
                View open items <ArrowRight className="size-4" aria-hidden />
              </a>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold tracking-wide text-emerald-800 uppercase">Bookings</p>
              <p className="font-heading text-2xl tracking-tight text-emerald-950">All clear</p>
              <p className="text-sm leading-relaxed text-emerald-900/80">
                Every arrival and departure in this period has flights and rooms recorded.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function OpsMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function MonthComparison({ current, prior }: { current: PeriodSummary; prior: PeriodSummary }) {
  const deltas = [
    { label: "Headcount", value: current.peopleOnSite - prior.peopleOnSite, format: (n: number) => String(Math.abs(n)) },
    { label: "Person-days", value: current.personDays - prior.personDays, format: (n: number) => String(Math.abs(n)) },
    {
      label: "Average crew",
      value: current.averageHeadcount - prior.averageHeadcount,
      format: (n: number) => Math.abs(n).toFixed(1),
    },
    {
      label: "Open bookings",
      value: current.openItems.length - prior.openItems.length,
      format: (n: number) => String(Math.abs(n)),
    },
  ];
  return (
    <section className="rounded-xl border border-border bg-card px-4 py-4 sm:px-5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        vs {prior.label.replace(" (full year)", "")}
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {deltas.map((row) => {
          const up = row.value > 0;
          const flat = row.value === 0;
          return (
            <li key={row.label} className="flex items-baseline justify-between gap-4 tabular-nums">
              <span className="text-muted-foreground">{row.label}</span>
              <span className={cn("font-semibold", flat ? "text-muted-foreground" : up ? "text-sky-800" : "text-amber-800")}>
                {flat ? "—" : `${up ? "↑" : "↓"} ${row.format(row.value)}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ActionItemsPanel({
  openItems,
  flightOpen,
  roomOpen,
  onOpen,
}: {
  openItems: OpenItem[];
  flightOpen: OpenItem[];
  roomOpen: OpenItem[];
  onOpen?: (personId: string) => void;
}) {
  return (
    <section id="open-items" className="scroll-mt-24 overflow-hidden rounded-xl border border-border bg-card">
      <div className="space-y-1.5 border-b border-border px-4 py-4 sm:px-5">
        <h3 className="text-sm font-semibold tracking-tight">
          Action list
        </h3>
        <p className="text-sm text-muted-foreground">
          {plural(openItems.length, "open item")}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Flights to book and rooms to confirm.
          <br />
          Click a name to open their record.
        </p>
      </div>
      {!openItems.length ? (
        <p className="px-4 py-5 text-sm text-emerald-800 sm:px-5">Nothing outstanding — bookings are complete for this period.</p>
      ) : (
        <div className="grid gap-0 lg:grid-cols-2">
          <ActionGroup
            title="Flights to book"
            tone="flight"
            rows={flightOpen}
            empty="No flights outstanding."
            onOpen={onOpen}
          />
          <ActionGroup
            title="Rooms to confirm"
            tone="room"
            rows={roomOpen}
            empty="No rooms outstanding."
            onOpen={onOpen}
            border
          />
        </div>
      )}
    </section>
  );
}

function ActionGroup({
  title,
  tone,
  rows,
  empty,
  onOpen,
  border,
}: {
  title: string;
  tone: "flight" | "room";
  rows: OpenItem[];
  empty: string;
  onOpen?: (personId: string) => void;
  border?: boolean;
}) {
  return (
    <div className={cn(border && "border-t border-border lg:border-t-0 lg:border-l")}>
      <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2.5 sm:px-5">
        <span
          className={cn("size-2.5 rounded-full", tone === "flight" ? "bg-rose-600" : "bg-amber-500")}
          aria-hidden
        />
        <p className="text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground">({rows.length})</span>
        </p>
      </div>
      {rows.length ? (
        <ul className="divide-y divide-border">
          {rows.map((row, index) => (
            <li key={`${row.personId}-${row.item}-${index}`}>
              <button
                type="button"
                disabled={!onOpen}
                onClick={() => onOpen?.(row.personId)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/50 disabled:cursor-default sm:px-5"
              >
                <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{shortDay(row.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{row.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{row.item}</span>
                </span>
                {onOpen ? <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm text-muted-foreground sm:px-5">{empty}</p>
      )}
    </div>
  );
}

function MovementList({
  title,
  note,
  kind,
  rows,
  onOpen,
}: {
  title: string;
  note: string;
  kind: "arrival" | "departure";
  rows: PeriodSummary["arrivals"] | PeriodSummary["departures"];
  onOpen?: (personId: string) => void;
}) {
  const sorted = [...rows].sort((a, b) => {
    const aOpen = [a.flight, "room" in a ? a.room : "Confirmed"].some((s) => s === "Not booked") ? 0 : 1;
    const bOpen = [b.flight, "room" in b ? b.room : "Confirmed"].some((s) => s === "Not booked") ? 0 : 1;
    return aOpen - bOpen || a.date.localeCompare(b.date) || a.name.localeCompare(b.name);
  });

  return (
    <ReportSection title={title} note={note}>
      {sorted.length ? (
        <ul className="max-h-96 divide-y divide-border overflow-y-auto print:max-h-none print:overflow-visible">
          {sorted.map((row) => {
            const needs =
              kind === "arrival"
                ? [
                    row.flight === "Not booked" ? "Flight" : null,
                    "room" in row && row.room === "Not booked" ? "Room" : null,
                  ].filter(Boolean)
                : [row.flight === "Not booked" ? "Flight home" : null].filter(Boolean);
            return (
              <li key={`${row.personId}-${row.date}-${kind}`}>
                <button
                  type="button"
                  disabled={!onOpen}
                  onClick={() => onOpen?.(row.personId)}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left text-sm hover:bg-muted/50 disabled:cursor-default"
                >
                  <span className="w-16 shrink-0 pt-0.5 tabular-nums text-muted-foreground">{shortDay(row.date)}</span>
                  <span className="min-w-0 flex-1 space-y-2">
                    <span className="block">
                      <span className="font-semibold">{row.name}</span>
                    </span>
                    <span className="block text-muted-foreground">{row.site}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={row.flight} />
                      {"room" in row ? <StatusBadge status={row.room} /> : null}
                      {needs.length ? (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-900">
                          Needs {needs.join(" + ")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                          Ready
                        </span>
                      )}
                    </span>
                    {"replacement" in row ? (
                      <span className="block text-xs text-muted-foreground">
                        {row.replacement ? `Replaced by ${row.replacement}` : "No replacement set"}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-5 text-sm text-muted-foreground">None.</p>
      )}
    </ReportSection>
  );
}

const ACTIVITY_KIND_LABELS: Record<string, string> = {
  role_section_move: "Role move",
  stay_place: "Stay placed",
  stay_clear: "Stay cleared",
  stay_extend: "Stay extended",
  stay_role: "Stay role",
  employee_edit: "Employee edit",
  flight_booking: "Flight booking",
  accommodation: "Accommodation",
  other: "Other",
};

function PlanningLogPanel({
  activity,
  onOpen,
}: {
  activity: ActivityRow[];
  onOpen?: (personId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const kinds = useMemo(() => [...new Set(activity.map((row) => row.Kind))].sort(), [activity]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activity.filter((row) => {
      if (kind !== "all" && row.Kind !== kind) return false;
      if (!q) return true;
      return (
        row.Name.toLowerCase().includes(q) ||
        row.Detail.toLowerCase().includes(q) ||
        (ACTIVITY_KIND_LABELS[row.Kind] || row.Kind).toLowerCase().includes(q)
      );
    });
  }, [activity, kind, query]);
  const visible = expanded ? filtered : filtered.slice(0, 10);

  return (
    <ReportSection
      title={`Planning log (${activity.length})`}
      note="Changes made in the app. Latest ten shown; search or expand for the rest."
    >
      <div className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3 print:hidden">
        <label className="grid min-w-[12rem] flex-1 gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Search employee or detail</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or text…"
            className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Action type</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="h-9 min-w-[10rem] rounded-lg border border-input bg-card px-2 text-sm"
          >
            <option value="all">All types</option>
            {kinds.map((value) => (
              <option key={value} value={value}>
                {ACTIVITY_KIND_LABELS[value] || value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filtered.length ? (
        <>
          <ul className="divide-y divide-border">
            {visible.map((row) => (
              <li key={row.ActivityId} className="flex gap-3 px-4 py-2.5 text-sm">
                <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{shortDay(row.Date)}</span>
                <span className="min-w-0 flex-1">
                  {row.PersonId && onOpen ? (
                    <button
                      type="button"
                      onClick={() => onOpen(row.PersonId)}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {row.Name || "Unknown"}
                    </button>
                  ) : row.Name ? (
                    <span className="font-medium">{row.Name}</span>
                  ) : null}
                  {row.Name ? <span className="text-muted-foreground"> · </span> : null}
                  <span>{row.Detail}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {ACTIVITY_KIND_LABELS[row.Kind] || row.Kind}
                </span>
              </li>
            ))}
          </ul>
          {filtered.length > 10 ? (
            <div className="border-t border-border px-4 py-2.5 print:hidden">
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="text-sm font-medium text-primary hover:underline"
              >
                {expanded ? "Show latest 10" : `Show all ${filtered.length} entries`}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="px-4 py-5 text-sm text-muted-foreground">
          {activity.length ? "No entries match this search." : "No changes logged in this period."}
        </p>
      )}
    </ReportSection>
  );
}

function StaffingOutlookChart({ outlook }: { outlook: StaffingOutlook }) {
  const count = outlook.days.length;
  if (!count) {
    return <p className="px-4 py-5 text-sm text-muted-foreground">No outlook days in this schedule year.</p>;
  }
  const max = Math.max(1, outlook.target, ...outlook.headcount);
  const niceMax = max <= 5 ? max : Math.ceil(max / 5) * 5;
  const width = 1000;
  const height = 180;
  const left = 34;
  const bottom = 24;
  const top = 8;
  const plotW = width - left - 8;
  const plotH = height - top - bottom;
  const barW = plotW / count;
  const y = (value: number) => top + plotH - (value / niceMax) * plotH;
  const ticks = [0, Math.round(niceMax / 2), niceMax];

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          From {formatMedium(outlook.start)} · target {outlook.target} (period average)
        </span>
        <span className="ml-auto">
          {outlook.belowTarget
            ? `${plural(outlook.belowTarget, "day")} below target`
            : "At or above target every day"}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full"
        role="img"
        aria-label="Staffing outlook, next 30 days"
      >
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
          y1={y(outlook.target)}
          y2={y(outlook.target)}
          stroke="#b45309"
          strokeDasharray="5 4"
          strokeWidth={1.5}
        />
        {outlook.days.map((iso, i) => {
          const value = outlook.headcount[i]!;
          const h = y(0) - y(value);
          const below = value < outlook.target;
          return (
            <g key={iso}>
              <title>{`${formatMedium(iso)}: ${value} on site`}</title>
              <rect
                x={left + i * barW + 1}
                y={y(value)}
                width={Math.max(1, barW - 2)}
                height={Math.max(0, h)}
                fill={below ? "#f43f5e" : "#0ea5e9"}
                opacity={0.85}
              />
            </g>
          );
        })}
        {outlook.days.map((iso, i) => {
          const day = Number(iso.slice(8, 10));
          if (day !== 1 && day % 5 !== 0 && i !== 0) return null;
          return (
            <text
              key={`l-${iso}`}
              x={left + i * barW + barW / 2}
              y={height - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[11px]"
            >
              {String(day)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function ReportSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="space-y-1 border-b border-border px-4 py-3.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {note ? <p className="text-xs leading-relaxed text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[status])}>
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

function downloadPowerBiPack(tables: ReportTables) {
  const files = exportPowerBiTables(tables).map((table) => ({
    name: table.file,
    bytes: csvBytes(table.csv()),
  }));
  files.push({ name: "README.txt", bytes: new TextEncoder().encode(powerBiZipReadme(tables.year)) });
  downloadFile(`crew-logistics-powerbi-${tables.year}.zip`, buildZip(files));
}

function PowerBiPanel({ tables }: { tables: ReportTables }) {
  const list = exportPowerBiTables(tables);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-app.example";
  const exampleDaily = `${origin}/api/powerbi/daily.csv?year=${tables.year}&key=YOUR_KEY`;
  const exampleCatalog = `${origin}/api/powerbi?year=${tables.year}&key=YOUR_KEY`;
  return (
    <section className="overflow-hidden rounded-xl border border-primary/30 bg-card print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-primary/5 px-4 py-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Database className="size-4 text-primary" /> Data for Power BI and Excel
          </h3>
          <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
            Six tables for {tables.year}, linked by PersonId. Prefer the live API so Power BI refreshes without a
            zip: set CREW_POWERBI_KEY on the server, then in Power BI use Get data → Web with the URLs below. Zip
            download remains as an offline backup.
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
      <div className="space-y-2 border-b border-border px-4 py-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Live API (Power BI Get data → Web)</p>
        <p>
          Example:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem] break-all text-foreground">
            {exampleDaily}
          </code>
        </p>
        <p>
          Catalog:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[0.7rem] break-all text-foreground">
            {exampleCatalog}
          </code>
        </p>
        <p>
          Tables: people, daily, stays, rotations, flights, activity. Replace YOUR_KEY with the server
          CREW_POWERBI_KEY (never shown here). Model: relate PersonId; date table → daily[Date]. Schedule Refresh
          in Power BI Service.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {list.map((table) => (
          <li key={table.file} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {table.title}{" "}
                <span className="font-normal text-muted-foreground">
                  · {table.slug}.csv · {table.file} · {table.rows.toLocaleString("en-CA")} rows
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
        Live API reads the shared server copy. Zip export uses this browser&apos;s current view of the data.
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
