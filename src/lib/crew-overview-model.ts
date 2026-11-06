/**
 * Data for the Overview page: what needs doing, who is on site (how long in,
 * how long to go, whether the flight home is booked) and who is arriving.
 */

import {
  buildKatrinaChecklist,
  inclusiveOut,
  type ChecklistItem,
  type CrewRotation,
  type ReminderThresholds,
  type RotationBook,
  type RotationTravel,
} from "@/lib/crew-rotations";
import { bookingNeedsAttention, opsFor, type CrewOpsBook } from "@/lib/crew-ops";
import {
  isOffRotation,
  roleLabel,
  type CrewSnapshot,
} from "@/lib/crew-schedule";
import { addDays, daysBetween, formatMedium, weekBounds } from "@/lib/dates";

export type WeekStoryKind =
  | "arriving"
  | "leaving"
  | "travelling"
  | "move"
  | "here"
  | "flight"
  | "stay";

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

/**
 * Everything happening this week: arrivals, leaves, travel, site moves,
 * who’s still here, and booking gaps tied to those moves.
 */
export function buildWeekStory({
  rows,
  book,
  asOf,
  opsBook = {},
}: {
  rows: CrewSnapshot[];
  book: RotationBook;
  asOf: string;
  opsBook?: CrewOpsBook;
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

    if (rotation.plannedIn >= weekStart && rotation.plannedIn <= weekEnd) {
      movedThisWeek.add(rotation.personId);
      const when = whenPhrase(rotation.plannedIn, asOf);
      push({
        id: `${rotation.id}:arrive`,
        kind: "arriving",
        sortDate: rotation.plannedIn,
        text: rotation.site
          ? `${name} arrives ${when} at ${rotation.site}.`
          : `${name} arrives ${when}.`,
        personId: rotation.personId,
        rotationId: rotation.id,
      });
      if (bookingNeedsAttention(ops.outboundFlight)) {
        push({
          id: `${rotation.id}:arrive-flight`,
          kind: "flight",
          sortDate: rotation.plannedIn,
          text: `Flight to site for ${name} is not booked yet (${when}).`,
          personId: rotation.personId,
          rotationId: rotation.id,
        });
      }
      if (bookingNeedsAttention(ops.accommodation)) {
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

    const out = inclusiveOut(rotation);
    if (out >= weekStart && out <= weekEnd) {
      movedThisWeek.add(rotation.personId);
      const when = whenPhrase(out, asOf);
      push({
        id: `${rotation.id}:leave`,
        kind: "leaving",
        sortDate: out,
        text: rotation.site
          ? `${name} leaves ${rotation.site} ${when}.`
          : `${name} leaves ${when}.`,
        personId: rotation.personId,
        rotationId: rotation.id,
      });
      if (bookingNeedsAttention(ops.returnFlight)) {
        push({
          id: `${rotation.id}:leave-flight`,
          kind: "flight",
          sortDate: out,
          text: `Return flight for ${name} is not booked yet (leaves ${when}).`,
          personId: rotation.personId,
          rotationId: rotation.id,
        });
      }
    }
  }

  // Sheet events this week: site changes, Out marks, transfers.
  for (const row of rows) {
    if (row.person.active === false) continue;
    const name = row.person.name;
    const rotation = latestStartedRotation(book, row.person.id, asOf);
    const events = [...(row.person.events || [])].sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 0; i < events.length; i += 1) {
      const event = events[i]!;
      if (event.date < weekStart || event.date > weekEnd) continue;
      const mark = event.mark;
      const prev = events[i - 1];
      if (isOffRotation(mark)) {
        // Covered by rotation leave when possible; still note sheet Out if no leave line.
        if (!seen.has(`${rotation?.id || row.person.id}:leave`)) {
          movedThisWeek.add(row.person.id);
          push({
            id: `${row.person.id}:event-out-${event.date}`,
            kind: "leaving",
            sortDate: event.date,
            text: `${name} goes Out ${whenPhrase(event.date, asOf)}.`,
            personId: row.person.id,
            rotationId: rotation?.id ?? null,
          });
        }
        continue;
      }
      const key = mark.toLowerCase();
      if (
        key.includes("transfer") ||
        key === "in" ||
        key.includes("yf") ||
        key.includes("yeg") ||
        key.includes("yk")
      ) {
        movedThisWeek.add(row.person.id);
        push({
          id: `${row.person.id}:event-travel-${event.date}`,
          kind: "travelling",
          sortDate: event.date,
          text: `${name} is travelling (${mark}) ${whenPhrase(event.date, asOf)}.`,
          personId: row.person.id,
          rotationId: rotation?.id ?? null,
        });
        continue;
      }
      // Site / camp mark change within the week.
      if (prev && prev.date < event.date && !isOffRotation(prev.mark) && prev.mark !== mark) {
        movedThisWeek.add(row.person.id);
        push({
          id: `${row.person.id}:event-move-${event.date}`,
          kind: "move",
          sortDate: event.date,
          text: `${name} moves ${prev.mark} → ${mark} ${whenPhrase(event.date, asOf)}.`,
          personId: row.person.id,
          rotationId: rotation?.id ?? null,
        });
      }
    }

    if (row.duty === "in_transit") {
      movedThisWeek.add(row.person.id);
      push({
        id: `${row.person.id}:transit-now`,
        kind: "travelling",
        sortDate: asOf,
        text: row.site
          ? `${name} is on the way to ${row.site}.`
          : `${name} is travelling right now.`,
        personId: row.person.id,
        rotationId: rotation?.id ?? null,
      });
    }
  }

  // Who stays put this week (still here), grouped by site.
  const stillHere = new Map<string, { name: string; personId: string; rotationId: string | null }[]>();
  for (const row of rows) {
    if (row.person.active === false) continue;
    if (row.duty !== "on_site" || !row.site) continue;
    if (movedThisWeek.has(row.person.id)) continue;
    const list = stillHere.get(row.site) ?? [];
    list.push({
      name: row.person.name,
      personId: row.person.id,
      rotationId: latestStartedRotation(book, row.person.id, asOf)?.id ?? null,
    });
    stillHere.set(row.site, list);
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

function travelState(travel: RotationTravel, due: boolean): BookingState {
  if (travel.confirmed || travel.bookedOn || travel.pnr.trim()) {
    return travel.confirmed ? "confirmed" : "booked";
  }
  return due ? "todo" : "later";
}

function stayState(rotation: CrewRotation): BookingState {
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
        title: "Booking window set: book return flight",
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
        title: "Booking window set: book flight to site",
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

  // On site now: driven by the schedule snapshot, bookings come from the rotation.
  const onSite: OnSiteRow[] = rows
    .filter((row) => Boolean(row.site))
    .map((row) => {
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
      return {
        personId: row.person.id,
        name: row.person.name,
        role: roleLabel(row.person),
        site: row.site,
        rotationId: rotation?.id ?? null,
        inSince: row.arrivedOn,
        day: row.rotationDay,
        totalDays,
        daysLeft,
        outDate: row.expectedOut,
        flightToSite: rotation ? travelState(rotation.outbound, true) : "none",
        flightHome: rotation ? travelState(rotation.returnTravel, returnDue) : "none",
        stay: rotation ? stayState(rotation) : "none",
        replacement: incoming ? nameOf(incoming.personId) : null,
        needsReplacement: Boolean(
          rotation &&
            rotation.replacementNeeded !== false &&
            !incoming &&
            daysLeft != null &&
            daysLeft <= thresholds.planDays,
        ),
      };
    })
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.name.localeCompare(b.name));

  // Arriving: rotations that start between tomorrow and the horizon.
  const arriving: ArrivingRow[] = book.rotations
    .filter((rotation) => activeIds.has(rotation.personId) && rotation.plannedIn > asOf && rotation.plannedIn <= horizonEnd)
    .map((rotation) => {
      const replaced = rotation.replacesRotationId ? rotationById.get(rotation.replacesRotationId) : null;
      return {
        personId: rotation.personId,
        name: nameOf(rotation.personId) || rotation.personId,
        role: roles.get(rotation.personId) || rotation.role,
        site: rotation.site,
        rotationId: rotation.id,
        inDate: rotation.plannedIn,
        daysUntil: daysBetween(asOf, rotation.plannedIn),
        flightIn: travelState(rotation.outbound, true),
        stay: stayState(rotation),
        replacing: replaced ? nameOf(replaced.personId) : null,
      };
    })
    .sort((a, b) => a.inDate.localeCompare(b.inDate) || a.name.localeCompare(b.name));

  // Leaving: rotations whose last day falls between today and the horizon.
  const leaving: LeavingRow[] = book.rotations
    .filter((rotation) => {
      const out = inclusiveOut(rotation);
      return activeIds.has(rotation.personId) && out >= asOf && out <= horizonEnd;
    })
    .map((rotation) => {
      const incoming = rotation.replacedByRotationId ? rotationById.get(rotation.replacedByRotationId) : null;
      return {
        personId: rotation.personId,
        name: nameOf(rotation.personId) || rotation.personId,
        role: roles.get(rotation.personId) || rotation.role,
        site: rotation.site,
        rotationId: rotation.id,
        outDate: inclusiveOut(rotation),
        daysUntil: daysBetween(asOf, inclusiveOut(rotation)),
        flightHome: travelState(rotation.returnTravel, true),
        replacement: incoming ? nameOf(incoming.personId) : null,
        replacementNeeded: rotation.replacementNeeded !== false,
      };
    })
    .sort((a, b) => a.outDate.localeCompare(b.outDate));

  // Action list, grouped by when it is due.
  const checklist = [
    ...bookingWindowItems(opsBook, book, names, asOf),
    ...buildKatrinaChecklist(book, names, asOf, thresholds),
  ].filter((item) => activeIds.has(item.personId));
  const weekEnd = addDays(asOf, 7);
  const groups: ActionGroup[] = [
    { key: "overdue", label: "Overdue", items: [] },
    { key: "week", label: "Due this week", items: [] },
    { key: "later", label: "Coming up", items: [] },
    { key: "housekeeping", label: "Confirm arrivals", items: [] },
  ];
  for (const item of checklist) {
    if (item.priority === "normal") groups[3].items.push(item);
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
