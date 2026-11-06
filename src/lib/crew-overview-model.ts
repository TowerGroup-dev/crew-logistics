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
import { roleLabel, type CrewSnapshot } from "@/lib/crew-schedule";
import { addDays, daysBetween } from "@/lib/dates";

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
  if (travel.confirmed) return "confirmed";
  if (travel.pnr.trim()) return "booked";
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

export function buildOverview({
  rows,
  book,
  asOf,
  horizonDays,
  thresholds,
}: {
  rows: CrewSnapshot[];
  book: RotationBook;
  asOf: string;
  horizonDays: number;
  thresholds: ReminderThresholds;
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
      const totalDays =
        row.plannedIn && row.expectedOut
          ? Math.max(1, daysBetween(row.plannedIn, row.expectedOut))
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
  const checklist = buildKatrinaChecklist(book, names, asOf, thresholds).filter((item) =>
    activeIds.has(item.personId),
  );
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
