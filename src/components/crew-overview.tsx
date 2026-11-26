"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { RotationBook } from "@/lib/crew-rotations";
import type { CrewOpsBook } from "@/lib/crew-ops";
import type { CrewSnapshot } from "@/lib/crew-schedule";
import {
  buildOverview,
  buildWeekStory,
  type BookingState,
  type OnSiteRow,
  type WeekStoryLine,
} from "@/lib/crew-overview-model";
import {
  buildSituationReminders,
  type ReminderSectionGroup,
  type SituationReminder,
  type SituationReminderBoard,
} from "@/lib/crew-situation-reminders";
import {
  emptyChecklistDone,
  isChecklistDone,
  isChecklistDoneExpired,
  isChecklistDoneVisible,
  loadChecklistDone,
  markChecklistDone,
  saveChecklistDone,
  unmarkChecklistDone,
  type ChecklistDoneBook,
} from "@/lib/crew-checklist-done";
import { formatShort, parseISODate, todayInZone } from "@/lib/dates";
import { cn } from "@/lib/cn";

function emptyDoneSafe() {
  if (typeof window === "undefined") return emptyChecklistDone();
  return loadChecklistDone();
}

function reminderStillOpen(doneBook: ChecklistDoneBook, id: string, asOf: string) {
  return !isChecklistDoneExpired(doneBook, id, asOf) && !isChecklistDone(doneBook, id);
}

function shortDate(iso: string | null) {
  if (!iso) return "";
  return formatShort(iso);
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function CrewReminders({
  rows,
  rotationBook,
  opsBook,
  asOf,
  planDays = 14,
  onOpenPerson,
  onOpenRotation,
  onClose,
  onCountChange,
}: {
  rows: CrewSnapshot[];
  rotationBook: RotationBook;
  opsBook?: CrewOpsBook;
  asOf: string;
  planDays?: number;
  onOpenPerson: (personId: string) => void;
  onOpenRotation: (rotationId: string) => void;
  onClose?: () => void;
  onCountChange?: (count: number) => void;
}) {
  const [doneBook, setDoneBook] = useState<ChecklistDoneBook>(() => emptyDoneSafe());

  useEffect(() => {
    setDoneBook(loadChecklistDone());
  }, []);

  const board = useMemo(
    () =>
      buildSituationReminders({
        rows,
        opsBook: opsBook || {},
        book: rotationBook,
        asOf,
        planDays,
      }),
    [asOf, opsBook, planDays, rotationBook, rows],
  );

  const openWeek = useMemo(
    () => board.week.filter((item) => reminderStillOpen(doneBook, item.id, asOf)),
    [asOf, board.week, doneBook],
  );
  const openNext = useMemo(
    () => board.lookahead.filter((item) => reminderStillOpen(doneBook, item.id, asOf)),
    [asOf, board.lookahead, doneBook],
  );
  const count = openWeek.length + openNext.length;

  useEffect(() => {
    onCountChange?.(count);
  }, [count, onCountChange]);

  function open(rotationId: string | null, personId: string) {
    if (rotationId) onOpenRotation(rotationId);
    else onOpenPerson(personId);
    onClose?.();
  }

  function toggleDone(id: string) {
    setDoneBook((current) => {
      const next = isChecklistDone(current, id)
        ? unmarkChecklistDone(current, id)
        : markChecklistDone(current, id, asOf);
      saveChecklistDone(next);
      return next;
    });
  }

  if (!onClose) {
    return (
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="size-4" />
            <h2 className="text-base font-semibold tracking-tight">Reminders</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {count ? `${openWeek.length} this week · ${openNext.length} next` : "None"}
          </span>
        </div>
        <RemindersList
          board={board}
          doneBook={doneBook}
          asOf={asOf}
          onToggleDone={toggleDone}
          onOpen={(item) => open(item.rotationId, item.personId)}
        />
      </section>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close reminders"
        className="absolute inset-0 bg-stone-900/35 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crew-reminders-title"
        className="relative flex max-h-[min(90vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_64px_-16px_rgba(28,25,23,0.35)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id="crew-reminders-title" className="text-base font-semibold tracking-tight">
            Reminders
            {count ? (
              <span className="ml-2 text-sm font-medium text-muted-foreground">{count}</span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-3">
          <RemindersSheet
            board={board}
            doneBook={doneBook}
            asOf={asOf}
            onToggleDone={toggleDone}
            onOpen={(item) => open(item.rotationId, item.personId)}
          />
        </div>
      </div>
    </div>
  );
}

export function CrewOverview({
  rows,
  rotationBook,
  opsBook,
  asOf,
  reminders,
  onOpenPerson,
  onOpenRotation,
}: {
  rows: CrewSnapshot[];
  rotationBook: RotationBook;
  opsBook?: CrewOpsBook;
  asOf: string;
  reminders?: { planDays?: number; checkDays?: number; escalateDays?: number };
  onOpenPerson: (personId: string) => void;
  onOpenRotation: (rotationId: string) => void;
}) {
  const today = todayInZone();
  // Future year (e.g. 2027 while still in 2026): planning desk, not a live ops day.
  const planning = asOf > today;
  const [onSiteOpen, setOnSiteOpen] = useState(false);
  const [doneBook, setDoneBook] = useState<ChecklistDoneBook>(() => emptyDoneSafe());

  useEffect(() => {
    setDoneBook(loadChecklistDone());
  }, []);

  const thresholds = useMemo(
    () => ({
      planDays: reminders?.planDays ?? 14,
      returnBookDay: Math.max(21, (reminders?.planDays ?? 14) + 14),
      escalateDays: reminders?.escalateDays ?? 3,
    }),
    [reminders?.escalateDays, reminders?.planDays],
  );

  const planningYear = planning ? Number(asOf.slice(0, 4)) : null;

  const data = useMemo(
    () =>
      buildOverview({
        rows,
        book: rotationBook,
        asOf,
        horizonDays: 14,
        thresholds,
        opsBook,
        includeArrivalDay: planning,
        planningYear,
        clockAsOf: planning ? today : asOf,
      }),
    [asOf, opsBook, planning, planningYear, rotationBook, rows, thresholds, today],
  );

  const confirmedTentativeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of Object.keys(doneBook.done)) {
      if (id.includes(":tentative:")) ids.add(id);
    }
    return ids;
  }, [doneBook]);

  const weekStory = useMemo(
    () =>
      buildWeekStory({
        rows,
        book: rotationBook,
        asOf,
        opsBook,
        confirmedTentativeIds,
        planningYear,
      }),
    [asOf, confirmedTentativeIds, opsBook, planningYear, rotationBook, rows],
  );

  function open(rotationId: string | null, personId: string) {
    if (rotationId) onOpenRotation(rotationId);
    else onOpenPerson(personId);
  }

  const asOfLabel = (() => {
    try {
      return new Date(`${asOf}T12:00:00`).toLocaleDateString("en-CA", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return asOf;
    }
  })();

  const hasOnSite = data.onSite.length > 0;

  // Future year: keep Overview quiet — place stays on Calendar first.
  if (planning) {
    return (
      <div className="space-y-6">
        <header className="min-w-0">
          <p className="text-base font-semibold tracking-tight text-foreground">{asOfLabel}</p>
        </header>
        <p className="text-sm text-muted-foreground">
          Place arrivals and departures on Calendar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="min-w-0">
        <p className="text-base font-semibold tracking-tight text-foreground">{asOfLabel}</p>
      </header>

      <Panel
        title="This week"
        accent="sky"
        defaultOpen
        aside={`${formatShort(weekStory.weekStart)} – ${formatShort(weekStory.weekEnd)}`}
      >
        <WeekStoryList
          lines={weekStory.lines}
          onOpen={(line) => {
            if (line.personId) open(line.rotationId, line.personId);
          }}
        />
      </Panel>

      <Panel
        title="On site now"
        accent="sky"
        expanded={onSiteOpen}
        onExpandedChange={setOnSiteOpen}
        aside={hasOnSite ? "Next to leave first" : "Nobody on site"}
      >
        <OnSiteTable rows={data.onSite} onOpen={open} emptyLabel="Nobody on site right now." />
      </Panel>
    </div>
  );
}

function Panel({
  title,
  icon,
  aside,
  children,
  accent,
  defaultOpen = true,
  expanded: expandedControlled,
  onExpandedChange,
  grow = false,
}: {
  title: string;
  icon?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  accent: "amber" | "sky" | "indigo";
  defaultOpen?: boolean;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
  grow?: boolean;
}) {
  const [expandedLocal, setExpandedLocal] = useState(defaultOpen);
  const expanded = expandedControlled ?? expandedLocal;
  function setExpanded(next: boolean) {
    onExpandedChange?.(next);
    if (expandedControlled === undefined) setExpandedLocal(next);
  }
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card transition-[box-shadow,border-color]",
        grow && expanded && "border-amber-300 shadow-sm ring-1 ring-amber-200/70",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:opacity-90"
          aria-expanded={expanded}
        >
          <span
            className={cn(
              "h-4 w-1 rounded-full",
              accent === "amber" && "bg-amber-500",
              accent === "sky" && "bg-sky-500",
              accent === "indigo" && "bg-indigo-500",
            )}
            aria-hidden
          />
          {icon}
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", !expanded && "-rotate-90")} />
        </button>
        {aside ? (
          typeof aside === "string" ? (
            <span className="text-xs text-muted-foreground">{aside}</span>
          ) : (
            aside
          )
        ) : null}
      </div>
      {expanded ? (
        <div className={cn(grow && "max-h-[min(75vh,44rem)] overflow-y-auto")}>{children}</div>
      ) : null}
    </section>
  );
}

/* ---------- Reminders ---------- */

function filterReminderSections(
  sections: ReminderSectionGroup[],
  doneBook: ChecklistDoneBook,
  asOf: string,
) {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !isChecklistDoneExpired(doneBook, item.id, asOf)),
    }))
    .filter((section) => section.items.length);
}

function ReminderRow({
  item,
  done,
  onToggleDone,
  onOpen,
}: {
  item: SituationReminder;
  done: boolean;
  onToggleDone: () => void;
  onOpen: () => void;
}) {
  const urgent = !done && item.urgency === "now";
  const soon = !done && item.urgency === "soon";
  return (
    <li className={cn("flex items-stretch", done && "opacity-60")}>
      <button
        type="button"
        title={done ? "Mark not done" : "Mark done"}
        aria-label={done ? "Mark not done" : "Mark done"}
        onClick={onToggleDone}
        className={cn(
          "flex w-9 shrink-0 items-center justify-center transition hover:bg-muted/50",
          done ? "text-emerald-700" : "text-muted-foreground",
        )}
      >
        {done ? (
          <Check className="size-3.5 stroke-[2.5]" />
        ) : (
          <span className="size-3.5 rounded border border-border bg-card" />
        )}
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="grid min-w-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-2 py-1.5 pr-3 text-left transition hover:bg-muted/40"
      >
        <span
          className={cn(
            "min-w-0 truncate text-xs tabular-nums",
            done && "text-muted-foreground line-through",
            urgent && "font-semibold text-rose-700",
            soon && "font-semibold text-amber-800",
            !done && !urgent && !soon && "text-muted-foreground",
          )}
        >
          {item.dateLabel}
        </span>
        <span
          className={cn(
            "min-w-0 break-words text-sm leading-snug text-foreground",
            done && "text-muted-foreground line-through decoration-foreground/40",
          )}
        >
          {item.text}
        </span>
      </button>
    </li>
  );
}

/** Flat sheet for the popup, one scroll, no nested expanders. */
function RemindersSheet({
  board,
  doneBook,
  asOf,
  onToggleDone,
  onOpen,
}: {
  board: SituationReminderBoard;
  doneBook: ChecklistDoneBook;
  asOf: string;
  onToggleDone: (id: string) => void;
  onOpen: (item: SituationReminder) => void;
}) {
  const windows: {
    label: string;
    tone: "week" | "next";
    sections: ReminderSectionGroup[];
  }[] = [
    {
      label: "This week",
      tone: "week",
      sections: filterReminderSections(board.weekSections, doneBook, asOf),
    },
    {
      label: "Next week",
      tone: "next",
      sections: filterReminderSections(board.lookaheadSections, doneBook, asOf),
    },
  ];
  const any = windows.some((window) => window.sections.length);

  if (!any) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <CircleCheck className="size-8 text-emerald-600/80" />
        <p className="text-sm font-medium text-stone-800">Nothing due</p>
        <p className="text-xs text-stone-500">No open items this week or next.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {windows.map((window) => {
        if (!window.sections.length) return null;
        const openCount = window.sections.reduce(
          (n, section) => n + section.items.filter((item) => !isChecklistDone(doneBook, item.id)).length,
          0,
        );
        return (
          <div key={window.label} className="py-2">
            <p
              className={cn(
                "px-3 pb-1 text-sm font-medium",
                window.tone === "week" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {window.label}
              <span className="ml-1.5 tabular-nums text-muted-foreground">{openCount}</span>
            </p>
            {window.sections.map((section) => (
              <div key={`${window.label}-${section.key}`}>
                <p className="px-3 pt-2 pb-0.5 text-xs font-medium text-muted-foreground">
                  {section.label}
                </p>
                <ul>
                  {section.items.map((item) => (
                    <ReminderRow
                      key={item.id}
                      item={item}
                      done={isChecklistDoneVisible(doneBook, item.id, asOf)}
                      onToggleDone={() => onToggleDone(item.id)}
                      onOpen={() => onOpen(item)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function RemindersList({
  board,
  doneBook,
  asOf,
  onToggleDone,
  onOpen,
}: {
  board: SituationReminderBoard;
  doneBook: ChecklistDoneBook;
  asOf: string;
  onToggleDone: (id: string) => void;
  onOpen: (item: SituationReminder) => void;
}) {
  const weekSections = filterReminderSections(board.weekSections, doneBook, asOf);
  const nextSections = filterReminderSections(board.lookaheadSections, doneBook, asOf);
  const weekCount = weekSections.reduce((n, section) => n + section.items.filter((item) => !isChecklistDone(doneBook, item.id)).length, 0);
  const nextCount = nextSections.reduce((n, section) => n + section.items.filter((item) => !isChecklistDone(doneBook, item.id)).length, 0);

  if (!weekSections.length && !nextSections.length) {
    return (
      <p className="flex items-center gap-2 px-4 py-7 text-sm text-muted-foreground">
        <CircleCheck className="size-4" /> No open items this week or next.
      </p>
    );
  }
  return (
    <div className="divide-y divide-border">
      <ReminderWindow
        label="This week"
        sections={weekSections}
        count={weekCount}
        tone="week"
        doneBook={doneBook}
        asOf={asOf}
        onToggleDone={onToggleDone}
        onOpen={onOpen}
        defaultOpen
      />
      <ReminderWindow
        label="Next week"
        sections={nextSections}
        count={nextCount}
        tone="next"
        doneBook={doneBook}
        asOf={asOf}
        onToggleDone={onToggleDone}
        onOpen={onOpen}
        defaultOpen={weekCount === 0}
      />
    </div>
  );
}

function ReminderWindow({
  label,
  sections,
  count,
  tone,
  doneBook,
  asOf,
  onToggleDone,
  onOpen,
  defaultOpen,
}: {
  label: string;
  sections: ReminderSectionGroup[];
  count: number;
  tone: "week" | "next";
  doneBook: ChecklistDoneBook;
  asOf: string;
  onToggleDone: (id: string) => void;
  onOpen: (item: SituationReminder) => void;
  defaultOpen: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        <span
          className={cn(
            "text-sm font-medium",
            tone === "week" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
          <span className="ml-1.5 tabular-nums text-muted-foreground">{count || "clear"}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", !expanded && "-rotate-90")} />
      </button>
      {expanded ? (
        sections.length ? (
          <div>
            {sections.map((section) => (
              <div key={section.key}>
                <p className="px-3 pt-1.5 pb-0.5 text-xs font-medium text-muted-foreground">
                  {section.label}
                </p>
                <ul>
                  {section.items.map((item) => (
                    <ReminderRow
                      key={item.id}
                      item={item}
                      done={isChecklistDoneVisible(doneBook, item.id, asOf)}
                      onToggleDone={() => onToggleDone(item.id)}
                      onOpen={() => onOpen(item)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-3 py-2 text-sm text-muted-foreground">Nothing in this window.</p>
        )
      ) : null}
    </div>
  );
}

/* ---------- This week story ---------- */

function weekKindLabel(kind: WeekStoryLine["kind"]) {
  switch (kind) {
    case "arriving":
      return "Arrival";
    case "leaving":
      return "Departure";
    case "travelling":
      return "Travel";
    case "move":
      return "Move";
    case "here":
      return "On site";
    case "flight":
      return "Flight";
    case "stay":
      return "Stay";
    case "confirm":
      return "Confirm";
  }
}

function WeekStoryList({
  lines,
  onOpen,
  planning = false,
}: {
  lines: WeekStoryLine[];
  onOpen: (line: WeekStoryLine) => void;
  planning?: boolean;
}) {
  if (!lines.length) {
    return (
      <p className="px-4 py-7 text-sm text-muted-foreground">
        {planning
          ? "No arrivals or departures in the opening week yet."
          : "No arrivals, departures, or people on site in this window."}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-slate-300">
      {lines.map((line) => (
        <li key={line.id}>
          <button
            type="button"
            onClick={() => onOpen(line)}
            disabled={!line.personId}
            className={cn(
              "flex w-full items-start gap-3 px-4 py-2.5 text-left",
              line.personId ? "hover:bg-muted/40" : "cursor-default",
            )}
          >
            <span
              className={cn(
                "mt-0.5 w-[4.75rem] shrink-0 text-xs font-semibold tracking-wide uppercase",
                line.kind === "here" && "text-emerald-700",
                line.kind === "arriving" && "text-teal-700",
                line.kind === "leaving" && "text-indigo-700",
                line.kind === "travelling" && "text-amber-700",
                line.kind === "move" && "text-sky-700",
                line.kind === "flight" && "text-rose-700",
                line.kind === "stay" && "text-orange-700",
                line.kind === "confirm" && "text-amber-800",
              )}
            >
              {weekKindLabel(line.kind)}
            </span>
            <span className="min-w-0 flex-1 break-words text-sm leading-snug text-foreground">{line.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- On site ---------- */

function OnSiteTable({
  rows,
  onOpen,
  emptyLabel = "Nobody on site right now.",
}: {
  rows: OnSiteRow[];
  onOpen: (rotationId: string | null, personId: string) => void;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [site, setSite] = useState("");
  const [role, setRole] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sites = useMemo(
    () =>
      [...new Set(rows.map((row) => row.site).filter((value): value is string => Boolean(value)))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [rows],
  );
  const roles = useMemo(
    () => [...new Set(rows.map((row) => row.role).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (site && row.site !== site) return false;
      if (role && row.role !== role) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.role.toLowerCase().includes(q) ||
        (row.site || "").toLowerCase().includes(q)
      );
    });
  }, [query, role, rows, site]);

  if (!rows.length) return <p className="px-4 py-7 text-sm text-muted-foreground">{emptyLabel}</p>;

  const cols =
    "lg:grid-cols-[minmax(11rem,1.3fr)_minmax(4.5rem,0.65fr)_minmax(7.5rem,1fr)_minmax(7.5rem,1fr)_minmax(6.5rem,0.8fr)_minmax(6.5rem,0.8fr)_minmax(6.5rem,0.8fr)]";

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2 border-b border-border px-2 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <label className="grid min-w-0 flex-1 gap-1 text-sm text-muted-foreground sm:flex-none">
          <span className="hidden sm:inline">Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or role"
            aria-label="Search"
            type="search"
            className="h-10 w-full rounded-lg border border-input bg-card px-2 text-sm text-foreground sm:h-9 sm:w-44"
          />
        </label>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          className={cn(
            "flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium sm:hidden",
            filtersOpen || role || site
              ? "border-primary bg-primary/10 text-primary"
              : "border-input bg-card text-foreground",
          )}
        >
          <SlidersHorizontal className="size-4" />
          Filters{role || site ? ` · ${[role, site].filter(Boolean).length}` : ""}
        </button>
        <label
          className={cn(
            "gap-1 text-sm text-muted-foreground sm:grid",
            filtersOpen ? "grid flex-1" : "hidden",
          )}
        >
          <span>Role</span>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
          >
            <option value="">All roles</option>
            {roles.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label
          className={cn(
            "gap-1 text-sm text-muted-foreground sm:grid",
            filtersOpen ? "grid flex-1" : "hidden",
          )}
        >
          <span>Site</span>
          <select
            value={site}
            onChange={(event) => setSite(event.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
          >
            <option value="">All sites</option>
            {sites.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <div
          className={cn(
            "ml-auto flex-wrap items-end gap-2 pb-0.5 sm:flex",
            filtersOpen ? "flex w-full justify-between sm:w-auto" : "hidden",
          )}
        >
          <p className="pb-2 text-sm text-muted-foreground">{filtered.length} people</p>
        </div>
      </div>

      <div
        className={cn(
          "hidden gap-4 border-b border-border px-4 py-2 text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase lg:grid",
          cols,
        )}
      >
        <span>Employee</span>
        <span>Location</span>
        <span>Time in</span>
        <span>To go</span>
        <span>Outbound</span>
        <span>Return</span>
        <span>Stay</span>
      </div>
      {filtered.length ? (
        <ul>
          {filtered.map((row) => (
            <li key={row.personId}>
              <button
                type="button"
                onClick={() => onOpen(row.rotationId, row.personId)}
                className={cn(
                  "grid w-full grid-cols-1 gap-3 px-4 py-3 text-left transition hover:bg-muted/40 lg:items-center lg:gap-4",
                  cols,
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{row.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{row.role}</span>
                </span>
                <Labelled label="Location">
                  {row.site ? (
                    <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-950">
                      {row.site}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </Labelled>
                <TimeIn row={row} />
                <ToGo row={row} />
                <Labelled label="Outbound">
                  <Mark state={row.flightToSite} />
                </Labelled>
                <Labelled label="Return">
                  <Mark state={row.flightHome} />
                </Labelled>
                <Labelled label="Stay">
                  <Mark state={row.stay} />
                </Labelled>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-7 text-sm text-muted-foreground">No one matches these filters.</p>
      )}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2 lg:block">
      <span className="shrink-0 text-xs text-muted-foreground lg:hidden">{label}</span>
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
        <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
      </span>
      {row.inSince ? (
        <span className="mt-1 block text-xs text-muted-foreground">Arrival {shortDate(row.inSince)}</span>
      ) : null}
    </span>
  );
}

function ToGo({ row }: { row: OnSiteRow }) {
  if (row.daysLeft == null) {
    return <span className="text-sm text-muted-foreground">No departure date</span>;
  }
  const left = row.daysLeft;
  return (
    <span className="min-w-0">
      <span className={cn("text-sm tabular-nums", left <= 7 ? "font-semibold" : "")}>
        {left < 0
          ? `${plural(-left, "day")} over`
          : left === 0
            ? "Departs today"
            : `${plural(left, "day")} left`}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">
        {row.outDate ? `Departure ${shortDate(row.outDate)}` : ""}
        {row.replacement
          ? ` · ${row.replacement}`
          : row.needsReplacement
            ? " · Extend stay or arrange replacement"
            : ""}
      </span>
    </span>
  );
}

function Mark({ state }: { state: BookingState }) {
  if (state === "none") return <span className="text-xs text-muted-foreground">-</span>;
  if (state === "confirmed" || state === "booked") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-foreground">
        <Check className="size-3.5 shrink-0 stroke-[2.5] text-emerald-700" />
        Booked
      </span>
    );
  }
  if (state === "todo") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-foreground">
        <X className="size-3.5 shrink-0 stroke-[2.5] text-rose-700" />
        Not booked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
      <Clock3 className="size-3.5 shrink-0" />
      Later
    </span>
  );
}

