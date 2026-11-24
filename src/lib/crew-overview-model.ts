/**
 * Data for the Overview page: what needs doing, who is on site (how long in,
 * how long to go, whether the flight home is booked) and who is arriving.
 */

import {
  ASSUMED_BOOKED_BEFORE,
  BOOK_BEFORE_ARRIVAL_DAYS,
  buildKatrinaChecklist,
  inclusiveOut,
  type ChecklistItem,
  type CrewRotation,
  type ReminderThresholds,
  type RotationBook,
  type RotationTravel,
} from "@/lib/crew-rotations";
import { bookingNeedsAttention, opsFor, type CrewOpsBook } from "@/lib/crew-ops";
import { roleLabel, type CrewPerson, type CrewSnapshot, type CrewStint } from "@/lib/crew-schedule";
import { siteOnDay } from "@/lib/crew-site-days";
import { addDays, daysBetween, formatMedium, weekBounds } from "@/lib/dates";

export { ASSUMED_BOOKED_BEFORE, BOOK_BEFORE_ARRIVAL_DAYS };

export function isAssumedBookedDone(iso: string | null | undefined) {
  return Boolean(iso && iso < ASSUMED_BOOKED_BEFORE);
}

export type WeekStoryKind =
  | "arriving"
  | "leaving"
  | "travelling"
  | "move"
  | "here"
  | "flight"
  | "stay"
  | "confirm";

export type WeekStoryLine = {
  id: string;
  text: string;
  personId: string | null;
  rotationId: string | null;
  kind: WeekStoryKind;
  /** For chronological ordering within the week. */
  sortDate: string;
};

function whenPhrase(iso: string, asOf: string) {
  if (iso === asOf) return "today";
  if (iso === addDays(asOf, 1)) return "tomorrow";
  return formatMedium(iso);
}

/** Calendar stint for this rotation (live Month grid beats a stale travel-desk site). */
function stintForRotation(row: CrewSnapshot | undefined, rotation: CrewRotation): CrewStint | null {
  const stints = row?.person.stints || [];
  const exact = stints.find((stint) => stint.from === rotation.plannedIn);
  if (exact) return exact;
  // Desk IN date landed mid-stay — still use the covering calendar stay.
  return (
    stints.find(
      (stint) => stint.from <= rotation.plannedIn && (!stint.out || rotation.plannedIn < stint.out),
    ) || null
  );
}

/** Last camp site on a stay (end of leave), ignoring TRV / hub travel pieces. */
function leaveSiteFromStint(stint: CrewStint): string {
  const segments = stint.segments || [];
  for (let i = segments.length - 1; i >= 0; i--) {
    const piece = segments[i]!;
    if (piece.kind === "site" && piece.site) return piece.site;
  }
  return stint.site || "";
}

/** Inclusive last on-site day from the calendar stay, or null if open-ended. */
function inclusiveOutFromStint(stint: CrewStint): string | null {
  return stint.out ? addDays(stint.out.slice(0, 10), -1) : null;
}

/**
 * Leave date + site for Overview. Calendar stays win.
 * If this person has Month stays, never invent a leave from a stale desk rotation alone.
 */
function resolveLeaveFromCalendar(
  row: CrewSnapshot | undefined,
  rotation: CrewRotation,
): { out: string; site: string } | null {
  const calendarStint = stintForRotation(row, rotation);
  if (calendarStint) {
    const out = inclusiveOutFromStint(calendarStint);
    if (!out) return null;
    return { out, site: leaveSiteFromStint(calendarStint) || rotation.site || "" };
  }
  if ((row?.person.stints || []).length > 0) return null;
  const out = inclusiveOut(rotation);
  if (!out) return null;
  return { out, site: rotation.site || "" };
}

/** Live camp under the person today (Month colours), else snapshot mark. */
function liveSite(person: CrewPerson, asOf: string, fallback: string | null) {
  return siteOnDay(person, asOf) || fallback;
}

/**
 * Everything happening this week: arrivals, leaves, travel, site moves,
 * who’s still here, and booking gaps tied to those moves.
 */
/** Tentative arrivals that still need a confirm-before-booking step. */
export function tentativeConfirmItems(
  rows: CrewSnapshot[],
  book: RotationBook,
  asOf: string,
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.person.active === false) continue;
    for (const stint of row.person.stints || []) {
      if (!stint.tentative || !stint.from) continue;
      if (isAssumedBookedDone(stint.from)) continue;
      if (stint.from < asOf) continue;
      const id = `${row.person.id}:tentative:${stint.from}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const rotation =
        book.rotations.find((r) => r.personId === row.person.id && r.plannedIn === stint.from) ||
        latestStartedRotation(book, row.person.id, stint.from);
      items.push({
        id,
        rotationId: rotation?.id || `tentative:${row.person.id}:${stint.from}`,
        personId: row.person.id,
        personName: row.person.name,
        title: `Confirm arrival · ${formatMedium(stint.from)}`,
        detail: stint.site
          ? `Tentative at ${stint.site} · book by ${formatMedium(addDays(stint.from, -BOOK_BEFORE_ARRIVAL_DAYS))}`
          : `Tentative date · book by ${formatMedium(addDays(stint.from, -BOOK_BEFORE_ARRIVAL_DAYS))}`,
        dueOn: addDays(stint.from, -BOOK_BEFORE_ARRIVAL_DAYS),
        priority: addDays(stint.from, -BOOK_BEFORE_ARRIVAL_DAYS) <= asOf ? "urgent" : "normal",
      });
    }
  }
  return items;
}

export function buildWeekStory({
  rows,
  book,
  asOf,
  opsBook = {},
  confirmedTentativeIds = new Set<string>(),
}: {
  rows: CrewSnapshot[];
  book: RotationBook;
  asOf: string;
  opsBook?: CrewOpsBook;
  /** Checklist ids marked confirmed (tentative:…); those arrivals show in This week. */
  confirmedTentativeIds?: Set<string>;
}): { weekStart: string; weekEnd: string; lines: WeekStoryLine[] } {
  const { start: weekStart, end: weekEnd } = weekBounds(asOf);
  const names = new Map(rows.map((row) => [row.person.id, row.person.name]));
  const nameOf = (id: string) => names.get(id) || id;
  const lines: WeekStoryLine[] = [];
  const seen = new Set<string>();
  const movedThisWeek = new Set<string>();

  function push(line: WeekStoryLine) {
    if (seen.has(line.id)) return;
    seen.add(line.id);
    lines.push(line);
  }

  // Rotations: arrive / leave this week.
  for (const rotation of book.rotations) {
    if (!names.has(rotation.personId)) continue;
    const name = nameOf(rotation.personId);
    const ops = opsFor(opsBook, rotation.personId);
    const tentativeId = `${rotation.personId}:tentative:${rotation.plannedIn}`;
    const row = rows.find((r) => r.person.id === rotation.personId);
    const stintTentative = (row?.person.stints || []).some(
      (stint) => stint.from === rotation.plannedIn && stint.tentative,
    );
    // Unconfirmed tentatives stay in To do only; confirmed ones appear here.
    const showArrival = !stintTentative || confirmedTentativeIds.has(tentativeId);

    const calendarStint = stintForRotation(row, rotation);
    const arriveSite = calendarStint?.site || rotation.site;

    if (showArrival && rotation.plannedIn >= weekStart && rotation.plannedIn <= weekEnd) {
      movedThisWeek.add(rotation.personId);
      const when = whenPhrase(rotation.plannedIn, asOf);
      push({
        id: `${rotation.id}:arrive`,
        kind: "arriving",
        sortDate: rotation.plannedIn,
        text: arriveSite
          ? `${name} arrives ${when} at ${arriveSite}.`
          : `${name} arrives ${when}.`,
        personId: rotation.personId,
        rotationId: rotation.id,
      });
      if (!isAssumedBookedDone(rotation.plannedIn) && bookingNeedsAttention(ops.outboundFlight)) {
        push({
          id: `${rotation.id}:arrive-flight`,
          kind: "flight",
          sortDate: rotation.plannedIn,
          text: `Flight to site for ${name} is not booked yet (${when}).`,
          personId: rotation.personId,
          rotationId: rotation.id,
        });
      }
      if (!isAssumedBookedDone(rotation.plannedIn) && bookingNeedsAttention(ops.accommodation)) {
        push({
          id: `${rotation.id}:arrive-stay`,
          kind: "stay",
          sortDate: rotation.plannedIn,
          text: `${name} arrives ${when}, and the accommodation is not confirmed.`,
          personId: rotation.personId,
          rotationId: rotation.id,
        });
      }
    }

    // Leave date + site from the Month calendar — never a stale desk POND when the grid says IQA.
    const leave = resolveLeaveFromCalendar(row, rotation);
    if (leave && leave.out >= weekStart && leave.out <= weekEnd) {
      movedThisWeek.add(rotation.personId);
      const when = whenPhrase(leave.out, asOf);
      push({
        id: `${rotation.id}:leave`,
        kind: "leaving",
        sortDate: leave.out,
        text: leave.site
          ? `${name} leaves ${leave.site} ${when}.`
          : `${name} leaves ${when}.`,
        personId: rotation.personId,
        rotationId: rotation.id,
      });
      if (bookingNeedsAttention(ops.returnFlight)) {
        push({
          id: `${rotation.id}:leave-flight`,
          kind: "flight",
          sortDate: leave.out,
          text: `Return flight for ${name} is not booked yet (leaves ${when}).`,
          personId: rotation.personId,
          rotationId: rotation.id,
        });
      }
    }
  }

  // Live calendar only — do not invent week lines from old Excel day marks.
  for (const row of rows) {
    if (row.person.active === false) continue;
    if (row.duty !== "in_transit") continue;
    const rotation = latestStartedRotation(book, row.person.id, asOf);
    movedThisWeek.add(row.person.id);
    push({
      id: `${row.person.id}:transit-now`,
      kind: "travelling",
      sortDate: asOf,
      text: row.site
        ? `${row.person.name} is on the way to ${row.site}.`
        : `${row.person.name} is travelling right now.`,
      personId: row.person.id,
      rotationId: rotation?.id ?? null,
    });
  }

  // Who stays put this week (still here), grouped by live calendar site.
  const stillHere = new Map<string, { name: string; personId: string; rotationId: string | null }[]>();
  for (const row of rows) {
    if (row.person.active === false) continue;
    if (row.duty !== "on_site") continue;
    const site = liveSite(row.person, asOf, row.site);
    if (!site) continue;
    if (movedThisWeek.has(row.person.id)) continue;
    const list = stillHere.get(site) ?? [];
    list.push({
      name: row.person.name,
      personId: row.person.id,
      rotationId: latestStartedRotation(book, row.person.id, asOf)?.id ?? null,
    });
    stillHere.set(site, list);
  }
  for (const [site, people] of [...stillHere.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    people.sort((a, b) => a.name.localeCompare(b.name));
    const namesList = people.map((p) => p.name).join(", ");
    push({
      id: `here:${site}`,
      kind: "here",
      sortDate: weekStart,
      text:
        people.length === 1
          ? `${namesList} is at ${site} all week.`
          : `At ${site} all week: ${namesList}.`,
      personId: people.length === 1 ? people[0]!.personId : null,
      rotationId: people.length === 1 ? people[0]!.rotationId : null,
    });
  }

  lines.sort(
    (a, b) =>
      a.sortDate.localeCompare(b.sortDate) ||
      a.kind.localeCompare(b.kind) ||
      a.text.localeCompare(b.text),
  );

  return { weekStart, weekEnd, lines };
}

/** confirmed: done. booked: PNR saved, not confirmed. todo: should be booked now. later: not due yet. */
export type BookingState = "confirmed" | "booked" | "todo" | "later" | "none";

export type OnSiteRow = {
  personId: string;
  name: string;
  role: string;
  site: string | null;
  rotationId: string | null;
  inSince: string | null;
  day: number | null;
  totalDays: number | null;
  daysLeft: number | null;
  outDate: string | null;
  /** Outbound flight used to get on site. */
  flightToSite: BookingState;
  flightHome: BookingState;
  stay: BookingState;
  replacement: string | null;
  needsReplacement: boolean;
};

export type ArrivingRow = {
  personId: string;
  name: string;
  role: string;
  site: string;
  rotationId: string;
  inDate: string;
  daysUntil: number;
  flightIn: BookingState;
  stay: BookingState;
  replacing: string | null;
};

export type LeavingRow = {
  personId: string;
  name: string;
  role: string;
  site: string;
  rotationId: string;
  outDate: string;
  daysUntil: number;
  flightHome: BookingState;
  replacement: string | null;
  /** False when Katrina marked no next worker needed. */
  replacementNeeded: boolean;
};

export type ActionGroup = {
  key: "overdue" | "week" | "later" | "housekeeping";
  label: string;
  items: ChecklistItem[];
};

function travelState(travel: RotationTravel, due: boolean, stayStart?: string | null): BookingState {
  if (isAssumedBookedDone(stayStart)) return "confirmed";
  if (travel.confirmed || travel.bookedOn || travel.pnr.trim()) {
    return travel.confirmed ? "confirmed" : "booked";
  }
  return due ? "todo" : "later";
}

function stayState(rotation: CrewRotation): BookingState {
  if (isAssumedBookedDone(rotation.plannedIn)) return "confirmed";
  if (rotation.stay.confirmed) return "confirmed";
  if (rotation.stay.room.trim() || rotation.stay.notes.trim()) return "booked";
  return "todo";
}

/** The rotation a person is on (or most recently started) as of a date. */
function latestStartedRotation(book: RotationBook, personId: string, asOf: string) {
  let best: CrewRotation | null = null;
  for (const rotation of book.rotations) {
    if (rotation.personId !== personId || rotation.plannedIn > asOf) continue;
    if (!best || rotation.plannedIn > best.plannedIn) best = rotation;
  }
  return best;
}

function flightArranged(status: string) {
  return status === "booked" || status === "confirmed";
}

/** Painted yellow booking windows that still need a real ticket. */
function bookingWindowItems(
  opsBook: CrewOpsBook | undefined,
  book: RotationBook,
  names: Map<string, string>,
  asOf: string,
): ChecklistItem[] {
  if (!opsBook) return [];
  const items: ChecklistItem[] = [];
  for (const personId of Object.keys(opsBook)) {
    const ops = opsFor(opsBook, personId);
    const name = names.get(personId) || personId;
    const rotation = latestStartedRotation(book, personId, asOf);
    const rotationId = rotation?.id || `ops:${personId}`;

    if (
      ops.returnWindowPainted &&
      ops.returnBookFrom &&
      ops.returnBookTo &&
      !flightArranged(ops.returnFlight)
    ) {
      items.push({
        id: `${personId}:return-window`,
        rotationId,
        personId,
        personName: name,
        title: "Return window set: book return flight",
        detail: `Window ${ops.returnBookFrom} → ${ops.returnBookTo}`,
        // Sort/show by window start (travel date), not the later end bound.
        dueOn: ops.returnBookFrom,
        priority: ops.returnBookTo < asOf ? "urgent" : "high",
      });
    }
    if (
      ops.outboundWindowPainted &&
      ops.outboundBookFrom &&
      ops.outboundBookTo &&
      !flightArranged(ops.outboundFlight)
    ) {
      items.push({
        id: `${personId}:outbound-window`,
        rotationId,
        personId,
        personName: name,
        title: "Outbound window set: book flight to site",
        detail: `Window ${ops.outboundBookFrom} → ${ops.outboundBookTo}`,
        dueOn: ops.outboundBookFrom,
        priority: ops.outboundBookTo < asOf ? "urgent" : "high",
      });
    }
  }
  return items;
}

export function buildOverview({
  rows,
  book,
  asOf,
  horizonDays,
  thresholds,
  opsBook,
}: {
  rows: CrewSnapshot[];
  book: RotationBook;
  asOf: string;
  horizonDays: number;
  thresholds: ReminderThresholds;
  opsBook?: CrewOpsBook;
}) {
  const names = new Map(rows.map((row) => [row.person.id, row.person.name]));
  const roles = new Map(rows.map((row) => [row.person.id, roleLabel(row.person)]));
  const activeIds = new Set(rows.map((row) => row.person.id));
  const nameOf = (id: string | null | undefined) => (id ? names.get(id) || id : null);
  const rotationById = new Map(book.rotations.map((rotation) => [rotation.id, rotation]));
  const horizonEnd = addDays(asOf, horizonDays);

  // On site now: live Month camp colour for the day, bookings from the rotation.
  const onSite: OnSiteRow[] = [];
  for (const row of rows) {
    const site = liveSite(row.person, asOf, row.site);
    if (!site) continue;
    const rotation = latestStartedRotation(book, row.person.id, asOf);
    // expectedOut is the place end (inclusive Out). Duration = days on site through that date.
    const totalDays =
      row.plannedIn && row.expectedOut
        ? Math.max(1, daysBetween(row.plannedIn, row.expectedOut) + 1)
        : row.rotationDays || null;
    const daysLeft = row.daysUntilOut;
    const returnDue =
      (row.daysOnSite ?? 0) >= thresholds.returnBookDay ||
      (daysLeft != null && daysLeft <= thresholds.planDays);
    const incoming = rotation?.replacedByRotationId ? rotationById.get(rotation.replacedByRotationId) : null;
    onSite.push({
      personId: row.person.id,
      name: row.person.name,
      role: roleLabel(row.person),
      site,
      rotationId: rotation?.id ?? null,
      inSince: row.arrivedOn,
      day: row.rotationDay,
      totalDays,
      daysLeft,
      outDate: row.expectedOut,
      flightToSite: rotation ? travelState(rotation.outbound, true, rotation.plannedIn) : "none",
      flightHome: rotation ? travelState(rotation.returnTravel, returnDue, rotation.plannedIn) : "none",
      stay: rotation ? stayState(rotation) : "none",
      replacement: incoming ? nameOf(incoming.personId) : null,
      needsReplacement: Boolean(
        rotation &&
          rotation.replacementNeeded !== false &&
          !incoming &&
          daysLeft != null &&
          daysLeft <= thresholds.planDays,
      ),
    });
  }
  onSite.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.name.localeCompare(b.name));

  // Arriving: rotations that start between tomorrow and the horizon (camp from calendar when known).
  const arriving: ArrivingRow[] = book.rotations
    .filter((rotation) => activeIds.has(rotation.personId) && rotation.plannedIn > asOf && rotation.plannedIn <= horizonEnd)
    .map((rotation) => {
      const replaced = rotation.replacesRotationId ? rotationById.get(rotation.replacesRotationId) : null;
      const row = rows.find((r) => r.person.id === rotation.personId);
      const calendarStint = stintForRotation(row, rotation);
      const site = calendarStint?.site || rotation.site;
      return {
        personId: rotation.personId,
        name: nameOf(rotation.personId) || rotation.personId,
        role: roles.get(rotation.personId) || rotation.role,
        site,
        rotationId: rotation.id,
        inDate: rotation.plannedIn,
        daysUntil: daysBetween(asOf, rotation.plannedIn),
        flightIn: travelState(rotation.outbound, true, rotation.plannedIn),
        stay: stayState(rotation),
        replacing: replaced ? nameOf(replaced.personId) : null,
      };
    })
    .sort((a, b) => a.inDate.localeCompare(b.inDate) || a.name.localeCompare(b.name));

  // Leaving: calendar stay OUT / site only (never a stale desk POND over the Month grid).
  const leaving: LeavingRow[] = book.rotations
    .map((rotation) => {
      if (!activeIds.has(rotation.personId)) return null;
      const row = rows.find((r) => r.person.id === rotation.personId);
      const leave = resolveLeaveFromCalendar(row, rotation);
      if (!leave || leave.out < asOf || leave.out > horizonEnd) return null;
      return { rotation, out: leave.out, site: leave.site };
    })
    .filter((row): row is { rotation: CrewRotation; out: string; site: string } => Boolean(row))
    .map(({ rotation, out, site }) => {
      const incoming = rotation.replacedByRotationId ? rotationById.get(rotation.replacedByRotationId) : null;
      return {
        personId: rotation.personId,
        name: nameOf(rotation.personId) || rotation.personId,
        role: roles.get(rotation.personId) || rotation.role,
        site,
        rotationId: rotation.id,
        outDate: out,
        daysUntil: daysBetween(asOf, out),
        flightHome: travelState(rotation.returnTravel, true, rotation.plannedIn),
        replacement: incoming ? nameOf(incoming.personId) : null,
        replacementNeeded: rotation.replacementNeeded !== false,
      };
    })
    .sort((a, b) => a.outDate.localeCompare(b.outDate));

  // Action list, grouped by when it is due. Pre–Oct 15 stays are assumed done — vanish.
  const checklist = [
    ...bookingWindowItems(opsBook, book, names, asOf),
    ...buildKatrinaChecklist(book, names, asOf, thresholds),
    ...tentativeConfirmItems(rows, book, asOf),
  ].filter((item) => activeIds.has(item.personId) && !isAssumedBookedDone(item.dueOn));
  const weekEnd = addDays(asOf, 7);
  const groups: ActionGroup[] = [
    { key: "overdue", label: "Overdue", items: [] },
    { key: "week", label: "Due this week", items: [] },
    { key: "later", label: "Coming up", items: [] },
    { key: "housekeeping", label: "Confirm arrivals", items: [] },
  ];
  for (const item of checklist) {
    if (item.id.includes(":tentative") || item.priority === "normal") groups[3].items.push(item);
    else if (item.dueOn && item.dueOn < asOf) groups[0].items.push(item);
    else if (item.priority === "urgent" && (!item.dueOn || item.dueOn <= asOf)) groups[0].items.push(item);
    else if (!item.dueOn || item.dueOn <= weekEnd) groups[1].items.push(item);
    else groups[2].items.push(item);
  }
  for (const group of groups) {
    group.items.sort(
      (a, b) =>
        (a.dueOn || "9999-12-31").localeCompare(b.dueOn || "9999-12-31") ||
        a.personName.localeCompare(b.personName) ||
        a.title.localeCompare(b.title),
    );
  }

  const flightsToBook =
    onSite.filter((row) => row.flightHome === "todo").length +
    arriving.filter((row) => row.flightIn === "todo").length;

  const overdueCount = groups[0].items.length;

  return {
    onSite,
    arriving,
    leaving,
    groups,
    openActions: checklist.filter((item) => item.priority !== "normal").length,
    flightsToBook,
    overdueCount,
  };
}
