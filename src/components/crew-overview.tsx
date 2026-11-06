"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  PlaneLanding,
  PlaneTakeoff,
  X,
} from "lucide-react";
import type { ChecklistItem, RotationBook } from "@/lib/crew-rotations";
import type { CrewSnapshot } from "@/lib/crew-schedule";
import {
  buildOverview,
  type ActionGroup,
  type ArrivingRow,
  type BookingState,
  type LeavingRow,
  type OnSiteRow,
} from "@/lib/crew-overview-model";
import { daysBetween, parseISODate } from "@/lib/dates";
import { cn } from "@/lib/cn";

function shortDate(iso: string | null) {
  if (!iso) return "";
  return parseISODate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function dueText(dueOn: string | null, asOf: string) {
  if (!dueOn) return { text: "No date", late: false };
  const diff = daysBetween(asOf, dueOn);
  if (diff < 0) return { text: `${plural(-diff, "day")} late`, late: true };
  if (diff === 0) return { text: "Due today", late: true };
  if (diff === 1) return { text: "Due tomorrow", late: false };
  if (diff <= 7) return { text: `Due in ${diff} days`, late: false };
  return { text: `Due ${shortDate(dueOn)}`, late: false };
}

export function CrewOverview({
  rows,
  rotationBook,
  asOf,
  reminders,
  onOpenPerson,
  onOpenRotation,
}: {
  rows: CrewSnapshot[];
  rotationBook: RotationBook;
  asOf: string;
  reminders?: { planDays?: number; checkDays?: number; escalateDays?: number };
  onOpenPerson: (personId: string) => void;
  onOpenRotation: (rotationId: string) => void;
}) {
  const [horizon, setHorizon] = useState<14 | 30>(14);

  const thresholds = useMemo(
    () => ({
      planDays: reminders?.planDays ?? 14,
      returnBookDay: Math.max(21, (reminders?.planDays ?? 14) + 14),
      escalateDays: reminders?.escalateDays ?? 3,
    }),
    [reminders?.escalateDays, reminders?.planDays],
  );

  const data = useMemo(
    () => buildOverview({ rows, book: rotationBook, asOf, horizonDays: horizon, thresholds }),
    [asOf, horizon, rotationBook, rows, thresholds],
  );

  function open(rotationId: string | null, personId: string) {
    if (rotationId) onOpenRotation(rotationId);
    else onOpenPerson(personId);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Overdue" value={data.overdueCount} />
        <Stat label="To do" value={data.openActions} />
        <Stat label="Flights open" value={data.flightsToBook} />
        <Stat label="On site" value={data.onSite.length} />
        <Stat label={`In / out · ${horizon}d`} value={`${data.arriving.length} / ${data.leaving.length}`} />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
        <Panel title="To do" accent="amber" aside={data.openActions ? `${data.openActions} open` : "Clear"}>
          <ActionList groups={data.groups} asOf={asOf} onOpen={onOpenRotation} />
        </Panel>

        <div className="space-y-4">
          <Panel title="On site now" accent="sky" aside={`${data.onSite.length} · leaving first`}>
            <OnSiteTable rows={data.onSite} onOpen={open} />
          </Panel>

          <Panel
            title="Flights"
            accent="indigo"
            aside={
              <span className="inline-flex rounded-md bg-muted p-0.5">
                {([14, 30] as const).map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setHorizon(days)}
                    className={cn(
                      "rounded px-2.5 py-1 text-xs font-medium transition",
                      horizon === days ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {days}d
                  </button>
                ))}
              </span>
            }
          >
            <Movement arriving={data.arriving} leaving={data.leaving} onOpen={onOpenRotation} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1.5 font-heading text-3xl leading-none tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

function Panel({
  title,
  aside,
  children,
  accent,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  accent: "amber" | "sky" | "indigo";
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "h-4 w-1 rounded-full",
              accent === "amber" && "bg-amber-500",
              accent === "sky" && "bg-sky-500",
              accent === "indigo" && "bg-indigo-500",
            )}
            aria-hidden
          />
          <h2 className="font-heading text-xl tracking-tight">{title}</h2>
        </div>
        {typeof aside === "string" ? (
          <span className="text-xs text-muted-foreground">{aside}</span>
        ) : (
          aside
        )}
      </div>
      {children}
    </section>
  );
}

/* ---------- To do ---------- */

function ActionList({
  groups,
  asOf,
  onOpen,
}: {
  groups: ActionGroup[];
  asOf: string;
  onOpen: (rotationId: string) => void;
}) {
  const visible = groups.filter((group) => group.items.length);
  if (!visible.length) {
    return (
      <p className="flex items-center gap-2 px-4 py-7 text-sm text-muted-foreground">
        <CircleCheck className="size-4" /> All caught up. Flights and rooms are covered.
      </p>
    );
  }
  return (
    <div className="divide-y divide-border">
      {visible.map((group) => (
        <ActionGroupBlock key={group.key} group={group} asOf={asOf} onOpen={onOpen} />
      ))}
    </div>
  );
}

function ActionGroupBlock({
  group,
  asOf,
  onOpen,
}: {
  group: ActionGroup;
  asOf: string;
  onOpen: (rotationId: string) => void;
}) {
  const collapsedByDefault = group.key === "housekeeping";
  const [expanded, setExpanded] = useState(!collapsedByDefault || group.key === "overdue");
  const [showAll, setShowAll] = useState(group.key === "overdue");
  const limit = group.key === "overdue" ? 100 : 8;
  const items = showAll || group.key === "overdue" ? group.items : group.items.slice(0, limit);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-muted/40"
      >
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-foreground uppercase">{group.label}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{group.items.length}</span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition", !expanded && "-rotate-90")} />
      </button>
      {expanded ? (
        <ul className="divide-y divide-border border-t border-border/70">
          {items.map((item) => (
            <ActionRow key={item.id} item={item} asOf={asOf} onOpen={() => onOpen(item.rotationId)} />
          ))}
          {group.items.length > limit ? (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="w-full px-4 py-2 text-left text-sm font-medium text-primary hover:bg-muted/50"
              >
                {showAll ? "Show fewer" : `Show all ${group.items.length}`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function ActionRow({ item, asOf, onOpen }: { item: ChecklistItem; asOf: string; onOpen: () => void }) {
  const due = dueText(item.dueOn, asOf);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-muted/40"
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            item.priority === "urgent" ? "bg-foreground" : "bg-muted-foreground/40",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          <span className="block truncate text-sm text-muted-foreground">{item.personName}</span>
        </span>
        <span className={cn("shrink-0 text-xs", due.late ? "font-semibold text-foreground" : "text-muted-foreground")}>
          {due.text}
        </span>
      </button>
    </li>
  );
}

/* ---------- On site ---------- */

function OnSiteTable({ rows, onOpen }: { rows: OnSiteRow[]; onOpen: (rotationId: string | null, personId: string) => void }) {
  if (!rows.length) return <p className="px-4 py-7 text-sm text-muted-foreground">Nobody on site right now.</p>;
  return (
    <div>
      <div className="hidden grid-cols-[minmax(10rem,1.4fr)_minmax(9rem,1.3fr)_minmax(7rem,1fr)_minmax(5.5rem,0.9fr)_minmax(5.5rem,0.9fr)] gap-3 border-b border-border px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:grid">
        <span>Crew</span>
        <span>Time in</span>
        <span>To go</span>
        <span>Flight home</span>
        <span>Room</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.personId}>
            <button
              type="button"
              onClick={() => onOpen(row.rotationId, row.personId)}
              className="grid w-full grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 text-left transition hover:bg-muted/40 md:grid-cols-[minmax(10rem,1.4fr)_minmax(9rem,1.3fr)_minmax(7rem,1fr)_minmax(5.5rem,0.9fr)_minmax(5.5rem,0.9fr)] md:items-center"
            >
              <span className="col-span-2 min-w-0 md:col-span-1">
                <span className="block truncate font-medium">{row.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.role}
                  {row.site ? ` · ${row.site}` : ""}
                </span>
              </span>
              <TimeIn row={row} />
              <ToGo row={row} />
              <Labelled label="Flight">
                <Mark state={row.flightHome} />
              </Labelled>
              <Labelled label="Room">
                <Mark state={row.stay} />
              </Labelled>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 md:block">
      <span className="text-xs text-muted-foreground md:hidden">{label}</span>
      {children}
    </span>
  );
}

function TimeIn({ row }: { row: OnSiteRow }) {
  if (row.day == null) return <span className="text-sm text-muted-foreground">No dates</span>;
  const pct = row.totalDays ? Math.min(100, Math.round((row.day / row.totalDays) * 100)) : 0;
  return (
    <span className="min-w-0">
      <span className="block text-sm tabular-nums">
        <span className="font-medium">{plural(row.day, "day")}</span>
        {row.totalDays ? <span className="text-muted-foreground"> / {row.totalDays}</span> : null}
      </span>
      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-foreground/50" style={{ width: `${pct}%` }} />
      </span>
      {row.inSince ? <span className="mt-1 block text-xs text-muted-foreground">In {shortDate(row.inSince)}</span> : null}
    </span>
  );
}

function ToGo({ row }: { row: OnSiteRow }) {
  if (row.daysLeft == null) return <span className="text-sm text-muted-foreground">No out date</span>;
  const left = row.daysLeft;
  return (
    <span className="min-w-0">
      <span className={cn("text-sm tabular-nums", left <= 7 ? "font-semibold" : "")}>
        {left < 0 ? `${plural(-left, "day")} over` : left === 0 ? "Leaves today" : `${plural(left, "day")} left`}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">
        {row.outDate ? `Out ${shortDate(row.outDate)}` : ""}
        {row.replacement
          ? ` · ${row.replacement}`
          : row.needsReplacement
            ? " · no replacement"
            : ""}
      </span>
    </span>
  );
}

function Mark({ state }: { state: BookingState }) {
  if (state === "none") return <span className="text-xs text-muted-foreground">—</span>;
  if (state === "confirmed" || state === "booked") {
    return (
      <span
        title={state === "confirmed" ? "Confirmed" : "Booked"}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground"
      >
        <Check className="size-3.5 stroke-[2.5] text-emerald-700" />
        {state === "confirmed" ? "OK" : "Booked"}
      </span>
    );
  }
  if (state === "todo") {
    return (
      <span title="Not booked" className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground">
        <X className="size-3.5 stroke-[2.5] text-rose-700" />
        Need
      </span>
    );
  }
  return (
    <span title="Not due yet" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Clock3 className="size-3.5" />
      Later
    </span>
  );
}

/* ---------- Flights ---------- */

function Movement({
  arriving,
  leaving,
  onOpen,
}: {
  arriving: ArrivingRow[];
  leaving: LeavingRow[];
  onOpen: (rotationId: string) => void;
}) {
  if (!arriving.length && !leaving.length) {
    return <p className="px-4 py-7 text-sm text-muted-foreground">Nobody arriving or leaving in this window.</p>;
  }
  const whenText = (days: number) => (days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);
  return (
    <div className="grid md:grid-cols-2">
      <div className="border-b border-border md:border-r md:border-b-0">
        <p className="flex items-center gap-2 border-b border-border bg-teal-50/60 px-4 py-2.5 text-xs font-semibold tracking-wide text-teal-950 uppercase">
          <PlaneLanding className="size-3.5 text-teal-700" />
          Arriving
          <span className="ml-auto tabular-nums text-teal-800/80">{arriving.length}</span>
        </p>
        {arriving.length ? (
          <ul className="divide-y divide-border">
            {arriving.map((row) => (
              <li key={row.rotationId}>
                <button
                  type="button"
                  onClick={() => onOpen(row.rotationId)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {shortDate(row.inDate)} · {whenText(row.daysUntil)}
                      {row.site ? ` · ${row.site}` : ""}
                      {row.replacing ? ` · for ${row.replacing}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Mark state={row.flightIn} />
                    <Mark state={row.stay} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-sm text-muted-foreground">None arriving</p>
        )}
      </div>
      <div>
        <p className="flex items-center gap-2 border-b border-border bg-indigo-50/60 px-4 py-2.5 text-xs font-semibold tracking-wide text-indigo-950 uppercase">
          <PlaneTakeoff className="size-3.5 text-indigo-700" />
          Leaving
          <span className="ml-auto tabular-nums text-indigo-800/80">{leaving.length}</span>
        </p>
        {leaving.length ? (
          <ul className="divide-y divide-border">
            {leaving.map((row) => (
              <li key={row.rotationId}>
                <button
                  type="button"
                  onClick={() => onOpen(row.rotationId)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {shortDate(row.outDate)} · {whenText(row.daysUntil)}
                      {row.site ? ` · ${row.site}` : ""}
                      {row.replacement
                        ? ` · ${row.replacement}`
                        : row.replacementNeeded
                          ? " · no replacement"
                          : " · none necessary"}
                    </span>
                  </span>
                  <Mark state={row.flightHome} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-sm text-muted-foreground">None leaving</p>
        )}
      </div>
    </div>
  );
}
