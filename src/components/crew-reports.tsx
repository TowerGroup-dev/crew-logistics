"use client";

import { opsFor, type CrewOpsBook } from "@/lib/crew-ops";
import { siteLabel, type CrewSnapshot } from "@/lib/crew-schedule";
import { formatMedium } from "@/lib/dates";

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

function ReportStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
      <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}
