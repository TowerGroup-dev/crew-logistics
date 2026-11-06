/**
 * Rotation-centred ops store.
 * Schedule stretches still come from the sheet / roster plans;
 * confirmations (travel, stay, replacement, actuals) live on each rotation.
 */

import { addDays, daysBetween } from "@/lib/dates";
import type { FlightBook, FlightBooking, FlightSegment } from "@/lib/crew-flights";
import type { CrewOpsBook } from "@/lib/crew-ops";
import { opsFor } from "@/lib/crew-ops";
import { DEFAULT_ROTATION_DAYS, type CrewPerson, type CrewStint } from "@/lib/crew-schedule";

export type TravelDirection = "outbound" | "return";

export type RotationDoc = {
  name: string;
  dataUrl: string;
};

export type RotationTravel = {
  direction: TravelDirection;
  airline: string;
  pnr: string;
  fromAirport: string;
  toAirport: string;
  departDate: string | null;
  departTime: string;
  arriveDate: string | null;
  arriveTime: string;
  segments: FlightSegment[];
  /** Explicit confirmation, PNR alone is not enough. */
  confirmed: boolean;
  /** When the flight was booked (ISO date). Hypothetical if assumed. */
  bookedOn: string | null;
  document: RotationDoc | null;
  notes: string;
};

export type RotationStay = {
  site: string;
  room: string;
  checkIn: string | null;
  checkOut: string | null;
  /** Explicit confirmation, room alone is not enough. */
  confirmed: boolean;
  document: RotationDoc | null;
  notes: string;
};

export type CrewRotation = {
  id: string;
  personId: string;
  role: string;
  site: string;
  /** Inclusive planned arrival. */
  plannedIn: string;
  /** Exclusive planned departure (matches stint.out). */
  plannedOut: string;
  actualIn: string | null;
  actualOut: string | null;
  actualInTime: string;
  actualOutTime: string;
  rotationDays: number;
  outbound: RotationTravel;
  returnTravel: RotationTravel;
  stay: RotationStay;
  /** This rotation continues / replaces that outgoing rotation. */
  replacesRotationId: string | null;
  replacedByRotationId: string | null;
  /** When false, no next worker is required for this rotation. */
  replacementNeeded: boolean;
  handoverFrom: string | null;
  handoverTo: string | null;
  notes: string;
  source: "sheet" | "app";
};

export type RotationBook = {
  version: 1;
  rotations: CrewRotation[];
};

export type ReminderThresholds = {
  planDays: number;
  returnBookDay: number;
  escalateDays: number;
};

export const DEFAULT_THRESHOLDS: ReminderThresholds = {
  planDays: 14,
  /** Book return ~4 weeks into a 42-day stay (day 28). */
  returnBookDay: 28,
  escalateDays: 3,
};

const STORAGE_KEY = "tower-arctic-crew-rotations-v1";

export function emptyTravel(direction: TravelDirection): RotationTravel {
  return {
    direction,
    airline: "Canadian North",
    pnr: "",
    fromAirport: "",
    toAirport: "",
    departDate: null,
    departTime: "",
    arriveDate: null,
    arriveTime: "",
    segments: [],
    confirmed: false,
    bookedOn: null,
    document: null,
    notes: "",
  };
}

export function emptyStay(site = ""): RotationStay {
  return {
    site,
    room: "",
    checkIn: null,
    checkOut: null,
    confirmed: false,
    document: null,
    notes: "",
  };
}

export function emptyRotationBook(): RotationBook {
  return { version: 1, rotations: [] };
}

function sheetRotationId(personId: string, from: string) {
  return `sheet:${personId}:${from}`;
}

function appRotationId(personId: string, from: string) {
  return `app:${personId}:${from}`;
}

function readTravel(value: unknown, direction: TravelDirection): RotationTravel {
  const base = emptyTravel(direction);
  if (!value || typeof value !== "object") return base;
  const row = value as Partial<RotationTravel>;
  return {
    ...base,
    airline: typeof row.airline === "string" && row.airline ? row.airline : base.airline,
    pnr: typeof row.pnr === "string" ? row.pnr : "",
    fromAirport: typeof row.fromAirport === "string" ? row.fromAirport : "",
    toAirport: typeof row.toAirport === "string" ? row.toAirport : "",
    departDate: typeof row.departDate === "string" ? row.departDate.slice(0, 10) : null,
    departTime: typeof row.departTime === "string" ? row.departTime : "",
    arriveDate: typeof row.arriveDate === "string" ? row.arriveDate.slice(0, 10) : null,
    arriveTime: typeof row.arriveTime === "string" ? row.arriveTime : "",
    segments: Array.isArray(row.segments) ? (row.segments as FlightSegment[]) : [],
    confirmed: Boolean(row.confirmed),
    bookedOn: typeof row.bookedOn === "string" ? row.bookedOn.slice(0, 10) : null,
    document:
      row.document && typeof row.document === "object" && typeof (row.document as RotationDoc).dataUrl === "string"
        ? {
            name: String((row.document as RotationDoc).name || "confirmation"),
            dataUrl: (row.document as RotationDoc).dataUrl,
          }
        : null,
    notes: typeof row.notes === "string" ? row.notes : "",
  };
}

function readStay(value: unknown, site = ""): RotationStay {
  const base = emptyStay(site);
  if (!value || typeof value !== "object") return base;
  const row = value as Partial<RotationStay>;
  return {
    ...base,
    site: typeof row.site === "string" && row.site ? row.site : site,
    room: typeof row.room === "string" ? row.room : "",
    checkIn: typeof row.checkIn === "string" ? row.checkIn.slice(0, 10) : null,
    checkOut: typeof row.checkOut === "string" ? row.checkOut.slice(0, 10) : null,
    confirmed: Boolean(row.confirmed),
    document:
      row.document && typeof row.document === "object" && typeof (row.document as RotationDoc).dataUrl === "string"
        ? {
            name: String((row.document as RotationDoc).name || "confirmation"),
            dataUrl: (row.document as RotationDoc).dataUrl,
          }
        : null,
    notes: typeof row.notes === "string" ? row.notes : "",
  };
}

function readRotation(value: unknown): CrewRotation | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<CrewRotation>;
  if (typeof row.id !== "string" || typeof row.personId !== "string") return null;
  if (typeof row.plannedIn !== "string" || typeof row.plannedOut !== "string") return null;
  const site = typeof row.site === "string" ? row.site : "";
  return {
    id: row.id,
    personId: row.personId,
    role: typeof row.role === "string" ? row.role : "Crew",
    site,
    plannedIn: row.plannedIn.slice(0, 10),
    plannedOut: row.plannedOut.slice(0, 10),
    actualIn: typeof row.actualIn === "string" ? row.actualIn.slice(0, 10) : null,
    actualOut: typeof row.actualOut === "string" ? row.actualOut.slice(0, 10) : null,
    actualInTime: typeof row.actualInTime === "string" ? row.actualInTime : "",
    actualOutTime: typeof row.actualOutTime === "string" ? row.actualOutTime : "",
    rotationDays: typeof row.rotationDays === "number" ? row.rotationDays : DEFAULT_ROTATION_DAYS,
    outbound: readTravel(row.outbound, "outbound"),
    returnTravel: readTravel(row.returnTravel, "return"),
    stay: readStay(row.stay, site),
    replacesRotationId: typeof row.replacesRotationId === "string" ? row.replacesRotationId : null,
    replacedByRotationId: typeof row.replacedByRotationId === "string" ? row.replacedByRotationId : null,
    replacementNeeded: row.replacementNeeded !== false,
    handoverFrom: typeof row.handoverFrom === "string" ? row.handoverFrom.slice(0, 10) : null,
    handoverTo: typeof row.handoverTo === "string" ? row.handoverTo.slice(0, 10) : null,
    notes: typeof row.notes === "string" ? row.notes : "",
    source: row.source === "app" ? "app" : "sheet",
  };
}

export function readRotationBook(value: unknown): RotationBook {
  if (!value || typeof value !== "object") return emptyRotationBook();
  const raw = value as Partial<RotationBook>;
  return {
    version: 1,
    rotations: Array.isArray(raw.rotations)
      ? raw.rotations.map(readRotation).filter((item): item is CrewRotation => Boolean(item))
      : [],
  };
}

export function loadRotations(): RotationBook {
  if (typeof window === "undefined") return emptyRotationBook();
  try {
    return readRotationBook(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return emptyRotationBook();
  }
}

export function saveRotations(book: RotationBook) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

function stintToSeed(person: CrewPerson, stint: CrewStint): CrewRotation {
  const from = stint.from;
  const out = stint.out || addDays(from, person.rotationDays || DEFAULT_ROTATION_DAYS);
  const days = Math.max(1, daysBetween(from, addDays(out, -1)) + 1);
  const site = stint.site || stint.sites[0] || "";
  const role = stint.role || person.role;
  const source = stint.arrival === "app" ? "app" : "sheet";
  const id = source === "app" ? appRotationId(person.id, from) : sheetRotationId(person.id, from);
  return {
    id,
    personId: person.id,
    role,
    site,
    plannedIn: from,
    plannedOut: out,
    actualIn: null,
    actualOut: null,
    actualInTime: "",
    actualOutTime: "",
    rotationDays: days,
    outbound: emptyTravel("outbound"),
    returnTravel: emptyTravel("return"),
    stay: { ...emptyStay(site), checkIn: from, checkOut: addDays(out, -1) },
    replacesRotationId: null,
    replacedByRotationId: null,
    replacementNeeded: true,
    handoverFrom: null,
    handoverTo: null,
    notes: "",
    source,
  };
}

/** Merge schedule-derived rotations with persisted confirmations. */
export function mergeRotationBook(people: CrewPerson[], stored: RotationBook): RotationBook {
  const byId = new Map(stored.rotations.map((row) => [row.id, row]));
  const derived: CrewRotation[] = [];

  for (const person of people) {
    const stints = person.stints?.length
      ? person.stints
      : [];
    for (const stint of stints) {
      if (!stint.from) continue;
      const seed = stintToSeed(person, stint);
      const prev = byId.get(seed.id);
      if (!prev) {
        derived.push(seed);
        continue;
      }
      derived.push({
        ...seed,
        role: prev.role || seed.role,
        site: prev.site || seed.site,
        plannedIn: seed.plannedIn,
        plannedOut: seed.plannedOut,
        rotationDays: seed.rotationDays,
        actualIn: prev.actualIn,
        actualOut: prev.actualOut,
        actualInTime: prev.actualInTime,
        actualOutTime: prev.actualOutTime,
        outbound: prev.outbound,
        returnTravel: prev.returnTravel,
        stay: {
          ...prev.stay,
          site: prev.stay.site || seed.site,
          checkIn: prev.stay.checkIn || seed.stay.checkIn,
          checkOut: prev.stay.checkOut || seed.stay.checkOut,
        },
        replacesRotationId: prev.replacesRotationId,
        replacedByRotationId: prev.replacedByRotationId,
        replacementNeeded: prev.replacementNeeded,
        handoverFrom: prev.handoverFrom,
        handoverTo: prev.handoverTo,
        notes: prev.notes,
        source: seed.source,
      });
      byId.delete(seed.id);
    }
  }

  // Keep orphaned persisted rotations (manual links) that weren't regenerated
  for (const leftover of byId.values()) {
    derived.push(leftover);
  }

  return {
    version: 1,
    rotations: derived.sort(
      (a, b) => a.plannedIn.localeCompare(b.plannedIn) || a.personId.localeCompare(b.personId),
    ),
  };
}

/** One-time migration from person-level ops + flights into rotation records. */
export function migrateOpsIntoRotations(
  book: RotationBook,
  opsBook: CrewOpsBook,
  flightBook: FlightBook,
): RotationBook {
  const rotations = book.rotations.map((rotation) => {
    const ops = opsFor(opsBook, rotation.personId);
    let next = { ...rotation };

    if (!next.actualIn && ops.actualIn) next = { ...next, actualIn: ops.actualIn };
    if (!next.actualOut && ops.actualOut) next = { ...next, actualOut: ops.actualOut };
    if (!next.handoverFrom && ops.handoverFrom) next = { ...next, handoverFrom: ops.handoverFrom };
    if (!next.handoverTo && ops.handoverTo) next = { ...next, handoverTo: ops.handoverTo };

    if (!next.stay.confirmed && (ops.accommodation === "confirmed" || ops.accommodation === "booked")) {
      next = {
        ...next,
        stay: {
          ...next.stay,
          confirmed: ops.accommodation === "confirmed",
          notes: ops.accommodationNotes || next.stay.notes,
          room: next.stay.room,
        },
      };
    }

    const outboundFlight = flightBook.bookings.find(
      (row) =>
        row.personId === rotation.personId &&
        row.direction === "outbound" &&
        (!row.rotationDate || row.rotationDate === rotation.plannedIn),
    );
    const returnFlight = flightBook.bookings.find(
      (row) =>
        row.personId === rotation.personId &&
        row.direction === "return" &&
        (!row.rotationDate || row.rotationDate === addDays(rotation.plannedOut, -1)),
    );

    if (outboundFlight) next = { ...next, outbound: travelFromFlight(outboundFlight, "outbound") };
    else if (ops.outboundFlight === "confirmed" || ops.outboundFlight === "booked") {
      next = {
        ...next,
        outbound: {
          ...next.outbound,
          confirmed: ops.outboundFlight === "confirmed",
          pnr: ops.confirmation || next.outbound.pnr,
          notes: ops.flightNotes || next.outbound.notes,
        },
      };
    }

    if (returnFlight) next = { ...next, returnTravel: travelFromFlight(returnFlight, "return") };
    else if (ops.returnFlight === "confirmed" || ops.returnFlight === "booked") {
      next = {
        ...next,
        returnTravel: {
          ...next.returnTravel,
          confirmed: ops.returnFlight === "confirmed",
          pnr: ops.confirmation || next.returnTravel.pnr,
          notes: ops.flightNotes || next.returnTravel.notes,
        },
      };
    }

    return next;
  });

  return { version: 1, rotations };
}

function travelFromFlight(booking: FlightBooking, direction: TravelDirection): RotationTravel {
  const first = booking.segments[0];
  const last = booking.segments[booking.segments.length - 1] || first;
  return {
    direction,
    airline: booking.airline || "Canadian North",
    pnr: booking.pnr,
    fromAirport: first?.fromAirport || "",
    toAirport: last?.toAirport || "",
    departDate: first?.departDate || booking.rotationDate,
    departTime: first?.departTime || "",
    arriveDate: last?.arriveDate || null,
    arriveTime: last?.arriveTime || "",
    segments: booking.segments,
    confirmed: booking.status === "confirmed" || booking.status === "completed",
    bookedOn: booking.status === "confirmed" || booking.status === "booked" || booking.status === "completed"
      ? first?.departDate || booking.rotationDate || null
      : null,
    document: booking.confirmationDataUrl
      ? { name: booking.confirmationName || "flight-confirmation", dataUrl: booking.confirmationDataUrl }
      : null,
    notes: booking.notes,
  };
}

/**
 * Treat missing flight confirmations as already booked with hypothetical dates
 * so the schedule is usable while real tickets are entered later.
 */
export function assumeFlightsBooked(book: RotationBook): RotationBook {
  const rotations = book.rotations.map((rotation) => {
    const outInclusive = addDays(rotation.plannedOut, -1);
    let next = rotation;

    if (!next.outbound.confirmed) {
      const bookedOn = addDays(rotation.plannedIn, -14);
      next = {
        ...next,
        outbound: {
          ...next.outbound,
          confirmed: true,
          bookedOn: next.outbound.bookedOn || bookedOn,
          departDate: next.outbound.departDate || rotation.plannedIn,
          arriveDate: next.outbound.arriveDate || rotation.plannedIn,
          pnr: next.outbound.pnr || "ASSUMED",
          airline: next.outbound.airline || "Canadian North",
          notes: next.outbound.notes || "Assumed booked — replace with real confirmation when available.",
        },
      };
    } else if (!next.outbound.bookedOn) {
      next = {
        ...next,
        outbound: {
          ...next.outbound,
          bookedOn: addDays(next.outbound.departDate || rotation.plannedIn, -14),
        },
      };
    }

    if (!next.returnTravel.confirmed) {
      const bookedOn = addDays(rotation.plannedIn, 28);
      next = {
        ...next,
        returnTravel: {
          ...next.returnTravel,
          confirmed: true,
          bookedOn: next.returnTravel.bookedOn || (bookedOn < outInclusive ? bookedOn : addDays(outInclusive, -14)),
          departDate: next.returnTravel.departDate || outInclusive,
          arriveDate: next.returnTravel.arriveDate || outInclusive,
          pnr: next.returnTravel.pnr || "ASSUMED",
          airline: next.returnTravel.airline || "Canadian North",
          notes: next.returnTravel.notes || "Assumed booked — replace with real confirmation when available.",
        },
      };
    } else if (!next.returnTravel.bookedOn) {
      next = {
        ...next,
        returnTravel: {
          ...next.returnTravel,
          bookedOn: addDays(next.returnTravel.departDate || outInclusive, -14),
        },
      };
    }

    return next;
  });

  return { version: 1, rotations };
}

export function upsertRotation(book: RotationBook, rotation: CrewRotation): RotationBook {
  const index = book.rotations.findIndex((row) => row.id === rotation.id);
  if (index >= 0) {
    const rotations = [...book.rotations];
    rotations[index] = rotation;
    return { version: 1, rotations };
  }
  return { version: 1, rotations: [...book.rotations, rotation] };
}

export function linkReplacement(
  book: RotationBook,
  outgoingId: string,
  incoming: CrewRotation,
  handoverFrom: string | null,
  handoverTo: string | null,
): RotationBook {
  const outgoing = book.rotations.find((row) => row.id === outgoingId);
  if (!outgoing) return upsertRotation(book, incoming);

  const linkedIncoming: CrewRotation = {
    ...incoming,
    replacesRotationId: outgoingId,
    handoverFrom,
    handoverTo,
  };
  const linkedOutgoing: CrewRotation = {
    ...outgoing,
    replacedByRotationId: incoming.id,
    replacementNeeded: true,
    handoverFrom,
    handoverTo,
  };

  let next = upsertRotation(book, linkedOutgoing);
  next = upsertRotation(next, linkedIncoming);
  return next;
}

/** Half-open windows [from, out) overlap. */
export function rotationsOverlap(aFrom: string, aOut: string, bFrom: string, bOut: string) {
  return aFrom < bOut && bFrom < aOut;
}

/** People with no scheduled stay overlapping the window (excluding one person). */
export function peopleFreeForWindow(
  book: RotationBook,
  people: { id: string; name: string }[],
  from: string,
  out: string,
  excludePersonId?: string,
) {
  if (!from || !out || from >= out) return [];
  return people.filter((person) => {
    if (excludePersonId && person.id === excludePersonId) return false;
    return !book.rotations.some(
      (row) => row.personId === person.id && rotationsOverlap(row.plannedIn, row.plannedOut, from, out),
    );
  });
}

export function rotationForPersonOnDay(book: RotationBook, personId: string, iso: string) {
  return (
    book.rotations.find(
      (row) => row.personId === personId && row.plannedIn <= iso && iso < row.plannedOut,
    ) ?? null
  );
}

export function currentRotationForPerson(book: RotationBook, personId: string, asOf: string) {
  return (
    rotationForPersonOnDay(book, personId, asOf) ||
    book.rotations
      .filter((row) => row.personId === personId && row.plannedIn > asOf)
      .sort((a, b) => a.plannedIn.localeCompare(b.plannedIn))[0] ||
    book.rotations
      .filter((row) => row.personId === personId)
      .sort((a, b) => b.plannedIn.localeCompare(a.plannedIn))[0] ||
    null
  );
}

export type RotationReadiness = {
  travelOutbound: boolean;
  travelReturn: boolean;
  stay: boolean;
  replacement: "assigned" | "missing" | "n/a";
  handover: "planned" | "not_planned" | "n/a";
  overall: "ready" | "incomplete" | "at_risk";
};

export function rotationDayNumber(rotation: CrewRotation, asOf: string) {
  if (asOf < rotation.plannedIn) return 0;
  const endInclusive = addDays(rotation.plannedOut, -1);
  if (asOf > endInclusive) return rotation.rotationDays;
  return daysBetween(rotation.plannedIn, asOf) + 1;
}

export function daysLeftOnRotation(rotation: CrewRotation, asOf: string) {
  const endInclusive = addDays(rotation.plannedOut, -1);
  return daysBetween(asOf, endInclusive);
}

export function evaluateReadiness(
  rotation: CrewRotation,
  asOf: string,
  thresholds: ReminderThresholds = DEFAULT_THRESHOLDS,
): RotationReadiness {
  const day = rotationDayNumber(rotation, asOf);
  const left = daysLeftOnRotation(rotation, asOf);
  const onOrUpcoming = asOf < rotation.plannedOut;
  const endingSoon = onOrUpcoming && left <= thresholds.planDays;
  const returnDue = day >= thresholds.returnBookDay || left <= thresholds.planDays;

  const travelOutbound = rotation.outbound.confirmed;
  const travelReturn = !returnDue ? true : rotation.returnTravel.confirmed;
  const stay = rotation.stay.confirmed;
  const replacement: RotationReadiness["replacement"] = endingSoon
    ? rotation.replacedByRotationId
      ? "assigned"
      : rotation.replacementNeeded === false
        ? "n/a"
        : "missing"
    : "n/a";
  const handover: RotationReadiness["handover"] =
    replacement === "assigned"
      ? rotation.handoverFrom && rotation.handoverTo
        ? "planned"
        : "not_planned"
      : replacement === "missing"
        ? "not_planned"
        : "n/a";

  const gaps = [
    !travelOutbound && (asOf <= addDays(rotation.plannedIn, thresholds.planDays) || day > 0),
    returnDue && !travelReturn,
    !stay,
    replacement === "missing",
  ].filter(Boolean).length;

  let overall: RotationReadiness["overall"] = "ready";
  if (gaps > 0) overall = "incomplete";
  if (gaps > 0 && (left <= thresholds.escalateDays || left < 0 || (!travelOutbound && asOf >= rotation.plannedIn))) {
    overall = "at_risk";
  }
  if (!onOrUpcoming && gaps === 0) overall = "ready";

  return { travelOutbound, travelReturn, stay, replacement, handover, overall };
}

export type ChecklistItem = {
  id: string;
  rotationId: string;
  personId: string;
  personName: string;
  title: string;
  detail: string;
  dueOn: string | null;
  priority: "urgent" | "high" | "normal";
};

export function buildKatrinaChecklist(
  book: RotationBook,
  peopleById: Map<string, string>,
  asOf: string,
  thresholds: ReminderThresholds = DEFAULT_THRESHOLDS,
): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  for (const rotation of book.rotations) {
    const name = peopleById.get(rotation.personId) || rotation.personId;
    const day = rotationDayNumber(rotation, asOf);
    const left = daysLeftOnRotation(rotation, asOf);
    const endInclusive = addDays(rotation.plannedOut, -1);
    const activeOrSoon =
      (rotation.plannedIn <= addDays(asOf, thresholds.planDays) && asOf < rotation.plannedOut) ||
      (asOf < rotation.plannedIn && rotation.plannedIn <= addDays(asOf, thresholds.planDays));

    if (!activeOrSoon && left > thresholds.planDays) continue;
    // Finished more than a week ago: history, not a to-do.
    if (left < -7) continue;

    // Outbound + accommodation before / at start
    if (asOf <= addDays(rotation.plannedIn, 3) || (day > 0 && day < thresholds.returnBookDay)) {
      if (!rotation.outbound.confirmed) {
        items.push({
          id: `${rotation.id}:outbound`,
          rotationId: rotation.id,
          personId: rotation.personId,
          personName: name,
          title: "Book outbound flight",
          detail: `To site · IN ${rotation.plannedIn}`,
          dueOn: rotation.plannedIn,
          priority: asOf >= addDays(rotation.plannedIn, -thresholds.escalateDays) ? "urgent" : "high",
        });
      }
      if (!rotation.stay.confirmed) {
        items.push({
          id: `${rotation.id}:stay`,
          rotationId: rotation.id,
          personId: rotation.personId,
          personName: name,
          title: "Book accommodation",
          detail: `Whole stay · ${rotation.plannedIn} → ${endInclusive}`,
          dueOn: rotation.plannedIn,
          priority: "high",
        });
      }
    }

    // ~4 weeks in: return flight
    if (day >= thresholds.returnBookDay || (left <= thresholds.planDays && left >= 0)) {
      if (!rotation.returnTravel.confirmed) {
        items.push({
          id: `${rotation.id}:return`,
          rotationId: rotation.id,
          personId: rotation.personId,
          personName: name,
          title: "Book return flight",
          detail: `4 weeks in · OUT ${endInclusive}`,
          dueOn: endInclusive,
          priority: left <= thresholds.escalateDays ? "urgent" : "high",
        });
      }
    }

    // Replacement for leaving worker
    if (left <= thresholds.planDays && left >= -7) {
      if (!rotation.replacedByRotationId && rotation.replacementNeeded !== false) {
        items.push({
          id: `${rotation.id}:replacement`,
          rotationId: rotation.id,
          personId: rotation.personId,
          personName: name,
          title: "Add worker to continue rotation",
          detail: `Leaving ${endInclusive}`,
          dueOn: endInclusive,
          priority: left <= thresholds.escalateDays ? "urgent" : "high",
        });
      } else if (rotation.replacedByRotationId) {
        const incoming = book.rotations.find((row) => row.id === rotation.replacedByRotationId);
        if (incoming && !incoming.outbound.confirmed) {
          items.push({
            id: `${incoming.id}:outbound`,
            rotationId: incoming.id,
            personId: incoming.personId,
            personName: peopleById.get(incoming.personId) || incoming.personId,
            title: "Book replacement outbound flight",
            detail: `Incoming for ${name}`,
            dueOn: incoming.plannedIn,
            priority: "high",
          });
        }
        if (incoming && !incoming.stay.confirmed) {
          items.push({
            id: `${incoming.id}:stay`,
            rotationId: incoming.id,
            personId: incoming.personId,
            personName: peopleById.get(incoming.personId) || incoming.personId,
            title: "Book replacement accommodation",
            detail: `Incoming for ${name}`,
            dueOn: incoming.plannedIn,
            priority: "high",
          });
        }
      }
    }

    // Actual departure overdue
    if (asOf > endInclusive && !rotation.actualOut) {
      items.push({
        id: `${rotation.id}:actual-out`,
        rotationId: rotation.id,
        personId: rotation.personId,
        personName: name,
        title: "Confirm actual departure",
        detail: `Planned OUT ${endInclusive}`,
        dueOn: asOf,
        priority: "urgent",
      });
    }

    // Actual arrival missing after planned in
    if (asOf >= rotation.plannedIn && asOf < rotation.plannedOut && !rotation.actualIn) {
      items.push({
        id: `${rotation.id}:actual-in`,
        rotationId: rotation.id,
        personId: rotation.personId,
        personName: name,
        title: "Confirm actual arrival",
        detail: `Planned IN ${rotation.plannedIn}`,
        dueOn: rotation.plannedIn,
        priority: "normal",
      });
    }
  }

  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => {
      const rank = (p: ChecklistItem["priority"]) => (p === "urgent" ? 0 : p === "high" ? 1 : 2);
      return rank(a.priority) - rank(b.priority) || (a.dueOn || "").localeCompare(b.dueOn || "");
    });
}

export function inclusiveOut(rotation: CrewRotation) {
  return addDays(rotation.plannedOut, -1);
}
