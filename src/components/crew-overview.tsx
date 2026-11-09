"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  PlaneLanding,
  PlaneTakeoff,
  X,
} from "lucide-react";
import type { ChecklistItem, RotationBook } from "@/lib/crew-rotations";
import type { CrewOpsBook } from "@/lib/crew-ops";
import type { CrewSnapshot } from "@/lib/crew-schedule";
import {
  buildOverview,
  buildWeekStory,
  type ActionGroup,
  type ArrivingRow,
  type BookingState,
  type LeavingRow,
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
import { daysBetween, formatMedium, parseISODate } from "@/lib/dates";
import { cn } from "@/lib/cn";

function emptyDoneSafe() {
  if (typeof window === "undefined") return emptyChecklistDone();
  return loadChecklistDone();
}

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

  const count = board.week.length + board.lookahead.length;

  useEffect(() => {
    onCountChange?.(count);
  }, [count, onCountChange]);

  function open(rotationId: string | null, personId: string) {
    if (rotationId) onOpenRotation(rotationId);
    else onOpenPerson(personId);
    onClose?.();
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
            {count ? `${board.week.length} this week · ${board.lookahead.length} next` : "Clear"}
          </span>
        </div>
        <RemindersList board={board} onOpen={(item) => open(item.rotationId, item.personId)} />
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
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                <Bell className="size-4" />
              </span>
              <h2 id="crew-reminders-title" className="font-heading text-xl font-medium tracking-tight text-stone-900">
                Reminders
              </h2>
            </div>
            <p className="mt-1.5 pl-10 text-xs text-stone-500">
              {count
                ? `${board.week.length} this week · ${board.lookahead.length} next week`
                : "Nothing pressing right now"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
          <RemindersSheet board={board} onOpen={(item) => open(item.rotationId, item.personId)} />
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
  const [horizon, setHorizon] = useState<14 | 30>(14);
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

  const data = useMemo(
    () => buildOverview({ rows, book: rotationBook, asOf, horizonDays: horizon, thresholds, opsBook }),
    [asOf, horizon, opsBook, rotationBook, rows, thresholds],
  );

  const weekStory = useMemo(
    () => buildWeekStory({ rows, book: rotationBook, asOf, opsBook }),
    [asOf, opsBook, rotationBook, rows],
  );

  const openCount = useMemo(() => {
    let count = 0;
    for (const group of data.groups) {
      for (const item of group.items) {
        if (isChecklistDoneExpired(doneBook, item.id, asOf)) continue;
        if (!isChecklistDone(doneBook, item.id) && item.priority !== "normal") count += 1;
      }
    }
    return count;
  }, [asOf, data.groups, doneBook]);

  function open(rotationId: string | null, personId: string) {
    if (rotationId) onOpenRotation(rotationId);
    else onOpenPerson(personId);
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

  const onSitePanel = (
    <Panel
      title="On site now"
      accent="sky"
      expanded={onSiteOpen}
      onExpandedChange={setOnSiteOpen}
      aside={`${data.onSite.length} · leaving first`}
    >
      <OnSiteTable rows={data.onSite} onOpen={open} />
    </Panel>
  );

  return (
    <div className="space-y-10">
      <div className="grid items-start gap-8 xl:grid-cols-2">
        <div className="space-y-8">
          <Panel
            title="This week"
            accent="sky"
            defaultOpen
            aside={`${formatMedium(weekStory.weekStart)} – ${formatMedium(weekStory.weekEnd)}`}
          >
            <WeekStoryList
              lines={weekStory.lines}
              onOpen={(line) => {
                if (line.personId) open(line.rotationId, line.personId);
              }}
            />
          </Panel>

          <Panel
            title="Flights"
            accent="indigo"
            defaultOpen={false}
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

          {!onSiteOpen ? onSitePanel : null}
        </div>

        <Panel title="To do" accent="amber" defaultOpen aside={openCount ? `${openCount} open` : "Clear"}>
          <ActionList
            groups={data.groups}
            asOf={asOf}
            doneBook={doneBook}
            onToggleDone={toggleDone}
            onOpen={onOpenRotation}
          />
        </Panel>
      </div>

      {onSiteOpen ? onSitePanel : null}
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
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

/** Flat sheet for the popup — one scroll, no nested expanders. */
function RemindersSheet({
  board,
  onOpen,
}: {
  board: SituationReminderBoard;
  onOpen: (item: SituationReminder) => void;
}) {
  if (!board.week.length && !board.lookahead.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <CircleCheck className="size-8 text-emerald-600/80" />
        <p className="text-sm font-medium text-stone-800">All clear</p>
        <p className="text-xs text-stone-500">Nothing pressing this week or next.</p>
      </div>
    );
  }

  const windows: { label: string; range: string; sections: ReminderSectionGroup[] }[] = [
    {
      label: "This week",
      range: `${formatMedium(board.weekStart)} – ${formatMedium(board.weekEnd)}`,
      sections: board.weekSections,
    },
    {
      label: "Next week",
      range: `${formatMedium(board.lookaheadStart)} – ${formatMedium(board.lookaheadEnd)}`,
      sections: board.lookaheadSections,
    },
  ];

  return (
    <div className="space-y-4">
      {windows.map((window) =>
        window.sections.length ? (
          <div key={window.label} className="space-y-2">
            <div className="px-2 pt-1">
              <p className="text-[13px] font-semibold tracking-[0.12em] text-foreground uppercase">{window.label}</p>
              <p className="text-[13px] text-foreground/70">{window.range}</p>
            </div>
            {window.sections.map((section) => (
              <div key={`${window.label}-${section.key}`} className="overflow-hidden rounded-xl border border-border/70">
                <p className="border-b border-border/70 bg-muted/40 px-3 py-1.5 text-[13px] font-semibold text-foreground">
                  {section.label}
                </p>
                <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] gap-x-3 border-b border-border/60 px-3 py-1.5 text-[12px] font-semibold tracking-wide text-foreground uppercase">
                  <span>Date</span>
                  <span>Description</span>
                </div>
                <ul>
                  {section.items.map((item) => (
                    <li key={item.id} className="border-b border-border/50 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => onOpen(item)}
                        className="grid w-full grid-cols-[6.75rem_minmax(0,1fr)] gap-x-3 px-3 py-2.5 text-left transition hover:bg-muted/50"
                      >
                        <span className="min-w-0 break-words text-xs font-medium tabular-nums text-muted-foreground">
                          {item.dateLabel}
                        </span>
                        <span className="min-w-0 break-words text-sm leading-snug text-foreground">{item.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
}

function RemindersList({
  board,
  onOpen,
}: {
  board: SituationReminderBoard;
  onOpen: (item: SituationReminder) => void;
}) {
  if (!board.week.length && !board.lookahead.length) {
    return (
      <p className="flex items-center gap-2 px-4 py-7 text-sm text-muted-foreground">
        <CircleCheck className="size-4" /> Nothing pressing this week or next week.
      </p>
    );
  }
  return (
    <div className="divide-y divide-border">
      <ReminderWindow
        label="This week"
        range={`${formatMedium(board.weekStart)} to ${formatMedium(board.weekEnd)}`}
        sections={board.weekSections}
        count={board.week.length}
        onOpen={onOpen}
        defaultOpen
      />
      <ReminderWindow
        label="Next week"
        range={`${formatMedium(board.lookaheadStart)} to ${formatMedium(board.lookaheadEnd)}`}
        sections={board.lookaheadSections}
        count={board.lookahead.length}
        onOpen={onOpen}
        defaultOpen={board.week.length === 0}
      />
    </div>
  );
}

function ReminderWindow({
  label,
  range,
  sections,
  count,
  onOpen,
  defaultOpen,
}: {
  label: string;
  range: string;
  sections: ReminderSectionGroup[];
  count: number;
  onOpen: (item: SituationReminder) => void;
  defaultOpen: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-muted/40"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold tracking-wide text-foreground uppercase">{label}</span>
          <span className="block text-[13px] font-medium text-foreground/75">
            {range}
            {count ? ` · ${count}` : " · clear"}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", !expanded && "-rotate-90")} />
      </button>
      {expanded ? (
        sections.length ? (
          <div className="border-t border-border/70">
            {sections.map((section) => (
              <div key={section.key} className="border-b border-border/60 last:border-b-0">
                <p className="px-4 pt-3 pb-1 text-[13px] font-semibold tracking-wide text-foreground uppercase">
                  {section.label}
                </p>
                <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] gap-x-3 px-4 pb-1 text-[12px] font-semibold tracking-wide text-foreground uppercase">
                  <span>Date</span>
                  <span>Description</span>
                </div>
                <ul>
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(item)}
                        className="grid w-full grid-cols-[6.75rem_minmax(0,1fr)] gap-x-3 px-4 py-2.5 text-left hover:bg-muted/40"
                      >
                        <span className="min-w-0 break-words text-xs font-medium tabular-nums text-muted-foreground">
                          {item.dateLabel}
                        </span>
                        <span className="min-w-0 break-words text-sm text-foreground">{item.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="border-t border-border/70 px-4 py-3 text-sm text-muted-foreground">Nothing in this window.</p>
        )
      ) : null}
    </div>
  );
}

/* ---------- This week story ---------- */

function weekKindLabel(kind: WeekStoryLine["kind"]) {
  switch (kind) {
    case "arriving":
      return "Arrive";
    case "leaving":
      return "Leave";
    case "travelling":
      return "Travel";
    case "move":
      return "Move";
    case "here":
      return "Here";
    case "flight":
      return "Flight";
    case "stay":
      return "Stay";
  }
}

function WeekStoryList({
  lines,
  onOpen,
}: {
  lines: WeekStoryLine[];
  onOpen: (line: WeekStoryLine) => void;
}) {
  if (!lines.length) {
    return (
      <p className="px-4 py-7 text-sm text-muted-foreground">
        Quiet week so far — nothing on the move and nobody flagged as still on site.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border">
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
                "mt-0.5 w-14 shrink-0 text-[12px] font-semibold tracking-wide uppercase",
                line.kind === "here" && "text-emerald-700",
                line.kind === "arriving" && "text-teal-700",
                line.kind === "leaving" && "text-indigo-700",
                line.kind === "travelling" && "text-amber-700",
                line.kind === "move" && "text-sky-700",
                line.kind === "flight" && "text-rose-700",
                line.kind === "stay" && "text-orange-700",
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

/* ---------- To do ---------- */

function ActionList({
  groups,
  asOf,
  doneBook,
  onToggleDone,
  onOpen,
}: {
  groups: ActionGroup[];
  asOf: string;
  doneBook: ChecklistDoneBook;
  onToggleDone: (id: string) => void;
  onOpen: (rotationId: string) => void;
}) {
  const visible = groups
    .map((group) => {
      // Crossed-off items leave the list after a week.
      const items = group.items.filter((item) => !isChecklistDoneExpired(doneBook, item.id, asOf));
      return {
        ...group,
        items,
        openCount: items.filter((item) => !isChecklistDone(doneBook, item.id)).length,
      };
    })
    .filter((group) => group.items.length);
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
        <ActionGroupBlock
          key={group.key}
          group={group}
          asOf={asOf}
          doneBook={doneBook}
          onToggleDone={onToggleDone}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function ActionGroupBlock({
  group,
  asOf,
  doneBook,
  onToggleDone,
  onOpen,
}: {
  group: ActionGroup & { openCount: number };
  asOf: string;
  doneBook: ChecklistDoneBook;
  onToggleDone: (id: string) => void;
  onOpen: (rotationId: string) => void;
}) {
  const collapsedByDefault = group.key === "housekeeping";
  const [expanded, setExpanded] = useState(!collapsedByDefault || group.key === "overdue");
  const [showAll, setShowAll] = useState(group.key === "overdue");
  const byDate = (a: (typeof group.items)[number], b: (typeof group.items)[number]) =>
    (a.dueOn || "9999-12-31").localeCompare(b.dueOn || "9999-12-31") ||
    a.personName.localeCompare(b.personName);
  const openItems = group.items.filter((item) => !isChecklistDone(doneBook, item.id)).sort(byDate);
  // Crossed out for up to a week, then they drop off.
  const doneItems = group.items.filter((item) => isChecklistDoneVisible(doneBook, item.id, asOf)).sort(byDate);
  const ordered = [...openItems, ...doneItems];
  const limit = group.key === "overdue" ? 100 : 8;
  const items = showAll || group.key === "overdue" ? ordered : ordered.slice(0, limit);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-muted/40"
      >
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-foreground uppercase">{group.label}</span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {group.openCount} open
            {doneItems.length ? ` · ${doneItems.length} crossed out` : ""}
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition", !expanded && "-rotate-90")} />
      </button>
      {expanded ? (
        <ul className="divide-y divide-border border-t border-border/70">
          {items.map((item) => (
            <ActionRow
              key={item.id}
              item={item}
              asOf={asOf}
              done={isChecklistDoneVisible(doneBook, item.id, asOf)}
              onToggleDone={() => onToggleDone(item.id)}
              onOpen={() => onOpen(item.rotationId)}
            />
          ))}
          {ordered.length > limit ? (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="w-full px-4 py-2 text-left text-sm font-medium text-primary hover:bg-muted/50"
              >
                {showAll ? "Show fewer" : `Show all ${ordered.length}`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function ActionRow({
  item,
  asOf,
  done,
  onToggleDone,
  onOpen,
}: {
  item: ChecklistItem;
  asOf: string;
  done: boolean;
  onToggleDone: () => void;
  onOpen: () => void;
}) {
  const due = dueText(item.dueOn, asOf);
  return (
    <li className={cn("flex items-stretch", done && "bg-muted/15")}>
      <button
        type="button"
        title={done ? "Undo cross out" : "Cross out"}
        aria-label={done ? "Undo cross out" : "Cross out"}
        onClick={onToggleDone}
        className={cn(
          "flex w-11 shrink-0 items-center justify-center border-r border-border/70 transition hover:bg-muted/50",
          done ? "text-emerald-700" : "text-muted-foreground",
        )}
      >
        {done ? <Check className="size-4 stroke-[2.5]" /> : <span className="size-4 rounded border border-border" />}
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted/40"
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-sm font-medium",
              done && "text-muted-foreground line-through decoration-foreground/40",
            )}
          >
            {item.title}
          </span>
          <span className={cn("block truncate text-xs text-muted-foreground", done && "line-through")}>
            {item.personName}
          </span>
        </span>
        {!done ? (
          <span className={cn("shrink-0 text-xs", due.late ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {due.text}
          </span>
        ) : null}
      </button>
    </li>
  );
}

/* ---------- On site ---------- */

function OnSiteTable({ rows, onOpen }: { rows: OnSiteRow[]; onOpen: (rotationId: string | null, personId: string) => void }) {
  if (!rows.length) return <p className="px-4 py-7 text-sm text-muted-foreground">Nobody on site right now.</p>;
  return (
    <div>
      <div className="hidden grid-cols-[minmax(12rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(7rem,0.85fr)_minmax(7rem,0.85fr)_minmax(7rem,0.85fr)] gap-4 border-b border-border px-4 py-2 text-[13px] font-medium tracking-wide text-muted-foreground uppercase lg:grid">
        <span>Crew</span>
        <span>Time in</span>
        <span>To go</span>
        <span>Flight in</span>
        <span>Flight home</span>
        <span>Room</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.personId}>
            <button
              type="button"
              onClick={() => onOpen(row.rotationId, row.personId)}
              className="grid w-full grid-cols-1 gap-3 px-4 py-3 text-left transition hover:bg-muted/40 lg:grid-cols-[minmax(12rem,1.4fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(7rem,0.85fr)_minmax(7rem,0.85fr)_minmax(7rem,0.85fr)] lg:items-center lg:gap-4"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{row.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.role}
                  {row.site ? ` · ${row.site}` : ""}
                </span>
              </span>
              <TimeIn row={row} />
              <ToGo row={row} />
              <Labelled label="Flight in">
                <Mark state={row.flightToSite} />
              </Labelled>
              <Labelled label="Flight home">
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
            ? " · extend or add person"
            : ""}
      </span>
    </span>
  );
}

function Mark({ state }: { state: BookingState }) {
  if (state === "none") return <span className="text-xs text-muted-foreground">—</span>;
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
                    <span className="block truncate text-sm font-medium">{row.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {shortDate(row.inDate)} · {whenText(row.daysUntil)}
                      {row.site ? ` · ${row.site}` : ""}
                      {row.replacing ? ` · for ${row.replacing}` : ""}
                    </span>
                  </span>
                  <Mark state={row.flightIn} />
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
                    <span className="block truncate text-sm font-medium">{row.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {shortDate(row.outDate)} · {whenText(row.daysUntil)}
                      {row.site ? ` · ${row.site}` : ""}
                      {row.replacement
                        ? ` · ${row.replacement}`
                        : row.replacementNeeded
                          ? " · extend or add person"
                          : " · no one else needed"}
                    </span>
                  </span>
                  <Labelled label="Home">
                    <Mark state={row.flightHome} />
                  </Labelled>
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
