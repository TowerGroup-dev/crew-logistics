/**
 * Short, plain-language reminders so Katrina sees what’s going on
 * without digging into each rotation.
 *
 * This week + next week lookahead, grouped by section.
 */

import { bookingNeedsAttention, opsFor, type CrewOpsBook } from "@/lib/crew-ops";
import type { RotationBook } from "@/lib/crew-rotations";
import type { CrewSnapshot } from "@/lib/crew-schedule";
import { addDays, daysBetween, formatMedium, weekBounds } from "@/lib/dates";

export type ReminderSection = "leaving" | "accommodation" | "flights" | "check_in";

export type SituationReminder = {
  id: string;
  section: ReminderSection;
  text: string;
  /** Short date for one-look scanning. */
  dateLabel: string;
  personId: string;
  rotationId: string | null;
  dueOn: string | null;
  urgency: "now" | "soon" | "watch";
  bucket: "week" | "lookahead";
};

export type ReminderSectionGroup = {
  key: ReminderSection;
  label: string;
  items: SituationReminder[];
};

export type SituationReminderBoard = {
  week: SituationReminder[];
  lookahead: SituationReminder[];
  weekSections: ReminderSectionGroup[];
  lookaheadSections: ReminderSectionGroup[];
  weekStart: string;
  weekEnd: string;
  lookaheadStart: string;
  lookaheadEnd: string;
};

export const REMINDER_SECTION_ORDER: { key: ReminderSection; label: string }[] = [
  { key: "leaving", label: "Leaving" },
  { key: "accommodation", label: "Accommodation" },
  { key: "flights", label: "Flights" },
  { key: "check_in", label: "Check in" },
];

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function leavePhrase(days: number | null) {
  if (days == null) return null;
  if (days < 0) return `overdue by ${plural(-days, "day")}`;
  if (days === 0) return "leaves today";
  if (days === 1) return "leaves tomorrow";
  return `leaves in ${plural(days, "day")}`;
}

function shortDate(iso: string | null) {
  if (!iso) return "No date";
  return formatMedium(iso);
}

function bucketForDate(
  dueOn: string | null,
  asOf: string,
  weekStart: string,
  weekEnd: string,
  lookaheadStart: string,
  lookaheadEnd: string,
): "week" | "lookahead" | null {
  if (!dueOn) return "week";
  if (dueOn < asOf || (dueOn >= weekStart && dueOn <= weekEnd)) return "week";
  if (dueOn >= lookaheadStart && dueOn <= lookaheadEnd) return "lookahead";
  return null;
}

function sortReminders(items: SituationReminder[]) {
  const rank = { now: 0, soon: 1, watch: 2 };
  return [...items].sort(
    (a, b) =>
      rank[a.urgency] - rank[b.urgency] ||
      (a.dueOn || "9999").localeCompare(b.dueOn || "9999") ||
      a.text.localeCompare(b.text),
  );
}

function dedupe(items: SituationReminder[], limit: number) {
  const seen = new Set<string>();
  const out: SituationReminder[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function groupBySection(items: SituationReminder[]): ReminderSectionGroup[] {
  return REMINDER_SECTION_ORDER.map((section) => ({
    key: section.key,
    label: section.label,
    items: items.filter((item) => item.section === section.key),
  })).filter((group) => group.items.length > 0);
}

/**
 * This week’s reminders + next week only (lookahead).
 */
export function buildSituationReminders({
  rows,
  opsBook,
  book,
  asOf,
  limit = 24,
}: {
  rows: CrewSnapshot[];
  opsBook: CrewOpsBook;
  book: RotationBook;
  asOf: string;
  planDays?: number;
  limit?: number;
}): SituationReminderBoard {
  const { start: weekStart, end: weekEnd } = weekBounds(asOf);
  const lookaheadStart = addDays(weekEnd, 1);
  const lookaheadEnd = addDays(weekEnd, 7);
  const horizonEnd = lookaheadEnd;

  const items: SituationReminder[] = [];
  const rotationByPerson = new Map<string, string>();
  for (const rotation of book.rotations) {
    if (rotation.plannedIn <= asOf && asOf < rotation.plannedOut) {
      rotationByPerson.set(rotation.personId, rotation.id);
    }
  }

  function push(item: Omit<SituationReminder, "bucket">) {
    const bucket = bucketForDate(
      item.dueOn,
      asOf,
      weekStart,
      weekEnd,
      lookaheadStart,
      lookaheadEnd,
    );
    if (!bucket) return;
    items.push({ ...item, bucket });
  }

  for (const row of rows) {
    if (row.person.active === false) continue;
    const name = row.person.name;
    const ops = opsFor(opsBook, row.person.id);
    const rotationId = rotationByPerson.get(row.person.id) ?? null;
    const leave = leavePhrase(row.daysUntilOut);
    const leaveDue = row.expectedOut || row.plannedOut;
    const onSiteNow = row.duty === "on_site" || row.duty === "in_transit";

    if (leave && leaveDue && (row.overdue || (onSiteNow && leaveDue <= horizonEnd))) {
      const dueOn = row.overdue ? asOf : leaveDue;
      const siteBit = row.site ? ` (${row.site})` : "";
      push({
        id: `${row.person.id}:leave`,
        section: "leaving",
        text: `${name}${siteBit} ${leave}.`,
        dateLabel: shortDate(dueOn),
        personId: row.person.id,
        rotationId,
        dueOn,
        urgency: row.overdue || (row.daysUntilOut != null && row.daysUntilOut <= 3) ? "now" : "soon",
      });
    }

    if (
      bookingNeedsAttention(ops.accommodation) &&
      (row.duty === "on_site" || row.duty === "upcoming" || row.duty === "in_transit")
    ) {
      const arriveOn = row.arrivedOn || row.plannedIn;
      const dueOn =
        row.duty === "on_site" || row.duty === "in_transit" ? asOf : row.plannedIn;
      const arriveLabel = shortDate(arriveOn);
      const arrivePhrase =
        arriveOn && arriveOn > asOf
          ? `${name} arrives ${arriveLabel}`
          : arriveOn
            ? `${name} arrived ${arriveLabel}`
            : `${name} is on site`;
      push({
        id: `${row.person.id}:stay`,
        section: "accommodation",
        text: `${arrivePhrase}, and the accommodation is not confirmed.`,
        dateLabel: arriveLabel,
        personId: row.person.id,
        rotationId,
        dueOn,
        urgency: row.duty === "on_site" || row.duty === "in_transit" ? "now" : "soon",
      });
    }

    if (
      ops.returnWindowPainted &&
      ops.returnBookFrom &&
      ops.returnBookTo &&
      bookingNeedsAttention(ops.returnFlight)
    ) {
      push({
        id: `${row.person.id}:return-window`,
        section: "check_in",
        text: `Return flight for ${name} has a booking window but is not booked yet.`,
        dateLabel: `${shortDate(ops.returnBookFrom)}–${shortDate(ops.returnBookTo)}`,
        personId: row.person.id,
        rotationId,
        dueOn: ops.returnBookFrom,
        urgency: ops.returnBookTo < asOf ? "now" : "soon",
      });
    }

    if (
      ops.outboundWindowPainted &&
      ops.outboundBookFrom &&
      ops.outboundBookTo &&
      bookingNeedsAttention(ops.outboundFlight)
    ) {
      push({
        id: `${row.person.id}:outbound-window`,
        section: "check_in",
        text: `Flight to site for ${name} has a booking window but is not booked yet.`,
        dateLabel: `${shortDate(ops.outboundBookFrom)}–${shortDate(ops.outboundBookTo)}`,
        personId: row.person.id,
        rotationId,
        dueOn: ops.outboundBookFrom,
        urgency: ops.outboundBookTo < asOf ? "now" : "soon",
      });
    }

    const daysUntilIn = row.duty === "upcoming" && row.plannedIn ? daysBetween(asOf, row.plannedIn) : null;
    if (
      daysUntilIn != null &&
      daysUntilIn >= 0 &&
      row.plannedIn &&
      row.plannedIn <= horizonEnd &&
      bookingNeedsAttention(ops.outboundFlight) &&
      !ops.outboundWindowPainted
    ) {
      push({
        id: `${row.person.id}:arrive`,
        section: "flights",
        text: `Outbound flight for ${name} has not been booked (arrives in ${plural(daysUntilIn, "day")}).`,
        dateLabel: shortDate(row.plannedIn),
        personId: row.person.id,
        rotationId,
        dueOn: row.plannedIn,
        urgency: daysUntilIn <= 3 ? "now" : "soon",
      });
    }

    // Return flight attention when leaving within horizon and flight not arranged.
    if (
      onSiteNow &&
      leaveDue &&
      leaveDue <= horizonEnd &&
      bookingNeedsAttention(ops.returnFlight) &&
      !ops.returnWindowPainted
    ) {
      push({
        id: `${row.person.id}:return-flight`,
        section: "flights",
        text: `Return flight for ${name} has not been booked.`,
        dateLabel: shortDate(leaveDue),
        personId: row.person.id,
        rotationId,
        dueOn: leaveDue,
        urgency: row.daysUntilOut != null && row.daysUntilOut <= 3 ? "now" : "soon",
      });
    }
  }

  const week = dedupe(
    sortReminders(items.filter((item) => item.bucket === "week")),
    limit,
  );
  const lookahead = dedupe(
    sortReminders(items.filter((item) => item.bucket === "lookahead")),
    limit,
  );

  return {
    weekStart,
    weekEnd,
    lookaheadStart,
    lookaheadEnd,
    week,
    lookahead,
    weekSections: groupBySection(week),
    lookaheadSections: groupBySection(lookahead),
  };
}

/** Plain lines for Monday email. */
export function formatRemindersForMail(board: SituationReminderBoard) {
  const blocks: string[] = [];
  function addWindow(title: string, range: string, sections: ReminderSectionGroup[]) {
    blocks.push(title);
    blocks.push(range);
    if (!sections.length) {
      blocks.push("Clear.");
      blocks.push("");
      return;
    }
    for (const section of sections) {
      blocks.push(section.label);
      for (const item of section.items) {
        blocks.push(`- ${item.dateLabel}: ${item.text}`);
      }
      blocks.push("");
    }
  }
  addWindow(
    "This week",
    `${formatMedium(board.weekStart)} to ${formatMedium(board.weekEnd)}`,
    board.weekSections,
  );
  addWindow(
    "Next week",
    `${formatMedium(board.lookaheadStart)} to ${formatMedium(board.lookaheadEnd)}`,
    board.lookaheadSections,
  );
  return blocks;
}
