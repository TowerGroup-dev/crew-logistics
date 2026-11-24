/**
 * Rotation-centred ops store.
 * Schedule stretches still come from the sheet / roster plans;
 * confirmations (travel, stay, replacement, actuals) live on each rotation.
 */

import { addDays, daysBetween } from "@/lib/dates";
import type { FlightBook, FlightBooking, FlightHotel, FlightSegment } from "@/lib/crew-flights";

/**
 * Stays that started before this date are treated as already booked and done.
 * They vanish from To do (not shown greyed).
 */
export const ASSUMED_BOOKED_BEFORE = "2026-10-15";

/** Book outbound / confirm tentatives this many days before arrival. */
export const BOOK_BEFORE_ARRIVAL_DAYS = 14;
import { flightPlaceOnDay } from "@/lib/crew-routes";
import type { CrewOpsBook } from "@/lib/crew-ops";
import { opsFor } from "@/lib/crew-ops";
import {
  DEFAULT_ROTATION_DAYS,
  scheduleYearLastDay,
  scheduleYearOutExclusive,
  type CrewPerson,
  type CrewStint,
  type CrewStintSegment,
} from "@/lib/crew-schedule";

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
  /** When the flight was booked (ISO date). */
  bookedOn: string | null;
  document: RotationDoc | null;
  notes: string;
  /** Hotels for overnight stopovers on this trip. */
  hotels: FlightHotel[];
  /** Car service: who picks up, where and when (blank when not needed). */
  carService: string;
};

/** Placeholder PNR used when a flight is assumed booked, not a real ticket. */
export const ASSUMED_PNR = "ASSUMED";

/** True once real booking details are on file (not the "assumed booked" placeholder). */
export function travelIsBooked(travel: RotationTravel) {
  if (travel.pnr && travel.pnr !== ASSUMED_PNR) return true;
  return travel.segments.some((row) => row.flightNumber || row.departTime);
}

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
  /** Flights between sites during this stay (e.g. Iqaluit to Pond). */
  moves: RotationMove[];
  /** To-do items ticked off in the side panel (by id). */
  todoDone?: string[];
};

/** A flight between two sites up north, partway through a stay. */
export type RotationMove = {
  id: string;
  fromSite: string;
  toSite: string;
  /** Travel day. */
  date: string;
  travel: RotationTravel;
};

export function newMove(fromSite: string, toSite: string, date: string): RotationMove {
  return {
    id: `move-${fromSite}-${toSite}-${date}`,
    fromSite,
    toSite,
    date,
    travel: emptyTravel("outbound"),
  };
}

function readMove(value: unknown): RotationMove | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<RotationMove>;
  if (typeof row.fromSite !== "string" || typeof row.toSite !== "string" || typeof row.date !== "string") return null;
  return {
    id: typeof row.id === "string" ? row.id : `move-${row.fromSite}-${row.toSite}-${row.date}`,
    fromSite: row.fromSite,
    toSite: row.toSite,
    date: row.date.slice(0, 10),
    travel: readTravel(row.travel, "outbound"),
  };
}

/**
 * Moves between sites the Excel shows inside a stay (site A, travel days, site B).
 * Travel day = first day after leaving A.
 */
export function movesFromStint(stint: CrewStint | null | undefined): { fromSite: string; toSite: string; date: string }[] {
  const sites = (stint?.excelSegments || stint?.segments || []).filter((row) => row.kind === "site" && row.site);
  const moves: { fromSite: string; toSite: string; date: string }[] = [];
  for (let i = 1; i < sites.length; i += 1) {
    const prev = sites[i - 1]!;
    const next = sites[i]!;
    if (prev.site === next.site) continue;
    moves.push({ fromSite: prev.site!, toSite: next.site!, date: prev.out || next.from });
  }
  return moves;
}

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
    hotels: [],
    carService: "",
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
    hotels: Array.isArray(row.hotels)
      ? row.hotels
          .filter((item): item is FlightHotel => Boolean(item) && typeof item === "object")
          .map((item) => ({
            place: String(item.place || ""),
            name: String(item.name || ""),
            confirmation: String(item.confirmation || ""),
            checkIn: String(item.checkIn || "").slice(0, 10),
            checkOut: String(item.checkOut || "").slice(0, 10),
          }))
      : [],
    carService: typeof row.carService === "string" ? row.carService : "",
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
    moves: Array.isArray(row.moves)
      ? row.moves.map(readMove).filter((item): item is RotationMove => Boolean(item))
      : [],
    todoDone: Array.isArray(row.todoDone) ? row.todoDone.filter((item): item is string => typeof item === "string") : [],
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
  // No sheet Out → exclusive Jan 1 so Dec 31 stays on site; UI shows Out as Dec 31.
  const out = stint.out || scheduleYearOutExclusive();
  const days = Math.max(1, daysBetween(from, addDays(out, -1)) + 1);
  const site = stint.site || stint.sites[0] || "";
  const role = stint.role || person.role;
  const source = stint.arrival === "app" ? "app" : "sheet";
  // Ids follow the stay's first start, so dragging its IN keeps bookings, transfers and to-dos.
  const idFrom = stint.idFrom ?? from;
  const id = source === "app" ? appRotationId(person.id, idFrom) : sheetRotationId(person.id, idFrom);
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
    moves: [],
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
      // Place end is Out: always take In/Out from the live stint (extensions included).
      // Keep confirmations from storage; never keep a stale check-out after an extend.
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
          checkIn: seed.stay.checkIn,
          checkOut: seed.stay.checkOut,
        },
        replacesRotationId: prev.replacesRotationId,
        replacedByRotationId: prev.replacedByRotationId,
        replacementNeeded: prev.replacementNeeded,
        handoverFrom: prev.handoverFrom,
        handoverTo: prev.handoverTo,
        notes: prev.notes,
        source: seed.source,
        moves: prev.moves ?? [],
        todoDone: prev.todoDone ?? [],
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
    hotels: booking.hotels ?? [],
    carService: booking.carService ?? "",
  };
}

/**
 * Real trips typed on rotations, as flight records, so the Month calendar can draw them
 * (assumed placeholders with no legs are skipped).
 */
export function bookingsFromRotations(book: RotationBook): FlightBooking[] {
  const rows: FlightBooking[] = [];
  for (const rotation of book.rotations) {
    const trips = [
      { key: "outbound", travel: rotation.outbound },
      { key: "return", travel: rotation.returnTravel },
      ...(rotation.moves ?? []).map((move) => ({ key: move.id, travel: move.travel })),
    ];
    for (const { key, travel } of trips) {
      const legs = travel.segments.filter((row) => row.departDate && (row.fromAirport || row.toAirport));
      if (!legs.length) continue;
      rows.push({
        id: `rotation:${rotation.id}:${key}`,
        personId: rotation.personId,
        direction: travel.direction,
        rotationDate: travel.direction === "outbound" ? rotation.plannedIn : addDays(rotation.plannedOut, -1),
        airline: travel.airline,
        pnr: travel.pnr === ASSUMED_PNR ? "" : travel.pnr,
        ticketNumber: "",
        segments: legs,
        status: travel.confirmed && travelIsBooked(travel) ? "confirmed" : travelIsBooked(travel) ? "booked" : "pending_booking",
        bookedOn: travel.bookedOn,
        enteredBy: "",
        enteredAt: "",
        confirmationName: travel.document?.name || "",
        confirmationDataUrl: "",
        notes: travel.notes,
        hotels: travel.hotels,
        carService: travel.carService,
        history: [],
      });
    }
  }
  return rows;
}

/**
 * No assumptions: a flight is only booked when real details are on file.
 * Clears the old "assumed booked" placeholders (PNR ASSUMED) that earlier versions saved.
 */
export function dropAssumedFlights(book: RotationBook): RotationBook {
  let changed = false;
  const clean = (travel: RotationTravel): RotationTravel => {
    const placeholderNote = travel.notes.startsWith("Assumed booked");
    if (travel.pnr !== ASSUMED_PNR && !placeholderNote) return travel;
    changed = true;
    if (travel.pnr === ASSUMED_PNR && !travelIsBooked(travel)) {
      const legs = travel.segments;
      return {
        ...travel,
        pnr: "",
        confirmed: false,
        bookedOn: null,
        departDate: legs[0]?.departDate || null,
        arriveDate: legs[legs.length - 1]?.arriveDate || null,
        notes: placeholderNote ? "" : travel.notes,
      };
    }
    return { ...travel, pnr: travel.pnr === ASSUMED_PNR ? "" : travel.pnr, notes: placeholderNote ? "" : travel.notes };
  };
  const rotations = book.rotations.map((rotation) => {
    const outbound = clean(rotation.outbound);
    const returnTravel = clean(rotation.returnTravel);
    return outbound === rotation.outbound && returnTravel === rotation.returnTravel
      ? rotation
      : { ...rotation, outbound, returnTravel };
  });
  return changed ? { ...book, rotations } : book;
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

/** Push planned OUT later (exclusive out date). */
export function extendRotationOut(book: RotationBook, rotationId: string, newOutExclusive: string): RotationBook {
  const rotation = book.rotations.find((row) => row.id === rotationId);
  if (!rotation) return book;
  const out = newOutExclusive.slice(0, 10);
  if (!out || out <= rotation.plannedIn) return book;
  // Shortening is allowed too (drag the OUT earlier).
  if (rotation.plannedOut === out) return book;
  const endInclusive = addDays(out, -1);
  return upsertRotation(book, {
    ...rotation,
    plannedOut: out,
    rotationDays: Math.max(1, daysBetween(rotation.plannedIn, endInclusive) + 1),
    stay: {
      ...rotation.stay,
      checkOut: endInclusive,
    },
  });
}

/**
 * Move planned IN later/earlier; OUT stays put (stay shortens/lengthens at the front).
 * Same booking: travel dates stay put — only Confirm arrival shifts the journey.
 */
export function moveRotationIn(book: RotationBook, rotationId: string, newIn: string): RotationBook {
  const rotation = book.rotations.find((row) => row.id === rotationId);
  if (!rotation) return book;
  const nextIn = newIn.slice(0, 10);
  if (!nextIn || nextIn === rotation.plannedIn || nextIn >= rotation.plannedOut) return book;
  const endInclusive = addDays(rotation.plannedOut, -1);
  return upsertRotation(book, {
    ...rotation,
    plannedIn: nextIn,
    rotationDays: Math.max(1, daysBetween(nextIn, endInclusive) + 1),
    stay: {
      ...rotation.stay,
      checkIn: nextIn,
    },
  });
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

/** Current stay on `asOf`, else the next upcoming stay. Never falls back to a past rotation. */
export function currentRotationForPerson(book: RotationBook, personId: string, asOf: string) {
  return (
    rotationForPersonOnDay(book, personId, asOf) ||
    book.rotations
      .filter((row) => row.personId === personId && row.plannedIn > asOf)
      .sort((a, b) => a.plannedIn.localeCompare(b.plannedIn))[0] ||
    null
  );
}

/** Most recent stay by planned In (including past). For history / list views only. */
export function latestRotationForPerson(book: RotationBook, personId: string) {
  return (
    book.rotations
      .filter((row) => row.personId === personId)
      .sort((a, b) => b.plannedIn.localeCompare(a.plannedIn))[0] || null
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

  // Booked = confirmed, or real booking details on file (same rule as the Travel tab).
  const travelOutbound = rotation.outbound.confirmed || travelIsBooked(rotation.outbound);
  const travelReturn = !returnDue ? true : rotation.returnTravel.confirmed || travelIsBooked(rotation.returnTravel);
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
  // A stay that has already ended can't be "at risk"; at most it has gaps on record.
  if (!onOrUpcoming && overall === "at_risk") overall = "incomplete";

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
    // Pre–Oct 15 stays: assumed booked and done — skip entirely.
    if (rotation.plannedIn < ASSUMED_BOOKED_BEFORE) continue;
    const bookBy = addDays(rotation.plannedIn, -BOOK_BEFORE_ARRIVAL_DAYS);
    const activeOrSoon =
      (rotation.plannedIn <= addDays(asOf, thresholds.planDays) && asOf < rotation.plannedOut) ||
      (asOf < rotation.plannedIn && rotation.plannedIn <= addDays(asOf, thresholds.planDays));

    if (!activeOrSoon && left > thresholds.planDays) continue;
    // Finished more than a week ago: history, not a to-do.
    if (left < -7) continue;

    // Outbound + accommodation: due 2 weeks before arrival.
    if (asOf <= addDays(rotation.plannedIn, 3) || (day > 0 && day < thresholds.returnBookDay)) {
      if (!rotation.outbound.confirmed) {
        items.push({
          id: `${rotation.id}:outbound`,
          rotationId: rotation.id,
          personId: rotation.personId,
          personName: name,
          title: "Book outbound flight",
          detail: `To site · arrives ${rotation.plannedIn}`,
          dueOn: bookBy,
          priority: asOf >= bookBy ? "urgent" : "high",
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
          dueOn: bookBy,
          priority: asOf >= bookBy ? "urgent" : "high",
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
          detail: `4 weeks in · departs ${endInclusive}`,
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
          title: "Extend stay or arrange replacement",
          detail: `Departure ${endInclusive}`,
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
        detail: `Planned departure ${endInclusive}`,
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
        detail: `Planned arrival ${rotation.plannedIn}`,
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
  const last = addDays(rotation.plannedOut, -1);
  // Never show past the season end of the year the stay ENDS in. (Using the start
  // year cut Dec→Jan stays off at 18 Dec of the old year.)
  const seasonEnd = scheduleYearLastDay(Number(last.slice(0, 4)));
  return last > seasonEnd ? seasonEnd : last;
}


type DayState = { kind: "site" | "travel"; site?: string; label?: string; route?: string };

/**
 * Booked moves change where the person is: grey travel days while flying (and on a
 * stopover night), then the new site from the day they land until the next move or OUT.
 * A move with no flights yet that the Excel already shows leaves the Excel as it is.
 */
export function applyRotationMoves(people: CrewPerson[], book: RotationBook): CrewPerson[] {
  const byStay = new Map<string, RotationMove[]>();
  for (const rotation of book.rotations) {
    if (!rotation.moves?.length) continue;
    // Key by current IN and by rotation id suffix so colours stay put after IN edge drag.
    byStay.set(`${rotation.personId}|${rotation.plannedIn}`, rotation.moves);
    const idFrom = rotation.id?.includes(":") ? rotation.id.split(":").pop() : "";
    if (idFrom && idFrom !== rotation.plannedIn) {
      byStay.set(`${rotation.personId}|${idFrom}`, rotation.moves);
    }
  }
  if (!byStay.size) return people;
  return people.map((person) => {
    let changed = false;
    const stints = (person.stints || []).map((stint) => {
      // The stay's IN may have been dragged: its transfers stay on its first start.
      const moves =
        byStay.get(`${person.id}|${stint.from}`) ??
        (stint.idFrom ? byStay.get(`${person.id}|${stint.idFrom}`) : undefined);
      if (!moves?.length) return stint;
      const rewritten = rewriteStint(stint, moves);
      if (rewritten !== stint) changed = true;
      return rewritten;
    });
    return changed ? { ...person, stints } : person;
  });
}

function rewriteStint(stint: CrewStint, moves: RotationMove[]): CrewStint {
  const excel = stint.excelSegments || stint.segments || [];
  const end = stint.out || scheduleYearOutExclusive(Number(stint.from.slice(0, 4)));
  const excelMoves = movesFromStint({ ...stint, excelSegments: excel });
  const days: string[] = [];
  for (let d = stint.from; d < end; d = addDays(d, 1)) days.push(d);
  if (!days.length) return stint;

  // Start from the Excel, day by day.
  const states: DayState[] = days.map((iso) => {
    const piece = excel.find((row) => row.from <= iso && iso < row.out);
    if (piece) return { kind: piece.kind, site: piece.site, label: piece.label, route: piece.route };
    return { kind: "site", site: stint.site || stint.sites[0] };
  });

  let touched = false;
  const sorted = [...moves].sort((a, b) => a.date.localeCompare(b.date));
  sorted.forEach((move, index) => {
    const legs = move.travel.segments.filter((row) => row.departDate);
    const onExcel = excelMoves.some(
      (row) => row.fromSite === move.fromSite && row.toSite === move.toSite && Math.abs(daysBetween(row.date, move.date)) <= 3,
    );
    if (!legs.length && onExcel) return;
    const depart = legs[0]?.departDate || move.date;
    const last = legs[legs.length - 1];
    const arrive = last ? last.arriveDate || last.departDate : move.date;
    const until = sorted[index + 1]?.date || end;
    // Hover text: the chain of places, saying which legs are by road.
    const route = !legs.length
      ? `${move.fromSite} → ${move.toSite}`
      : legs.some((row) => row.mode === "road")
        ? legs.map((row) => `${row.fromAirport} → ${row.toAirport} (${row.mode === "road" ? "road" : "flight"})`).join(", ")
        : [legs[0]!.fromAirport, ...legs.map((row) => row.toAirport)].filter(Boolean).join(" → ");
    days.forEach((iso, i) => {
      if (iso < depart || iso >= until) return;
      if (iso < arrive) {
        // Flying, or a night at a stopover on the way.
        const place = flightPlaceOnDay(legs, iso) || move.toSite;
        states[i] = { kind: "travel", label: place, route };
      } else {
        states[i] = { kind: "site", site: move.toSite };
      }
      touched = true;
    });
  });
  if (!touched) return stint;

  // Back into pieces: one per run of the same place.
  const segments: CrewStintSegment[] = [];
  days.forEach((iso, i) => {
    const state = states[i]!;
    const prev = segments[segments.length - 1];
    const same =
      prev &&
      prev.kind === state.kind &&
      (state.kind === "site" ? prev.site === state.site : prev.label === state.label && prev.route === state.route);
    if (same) {
      prev.out = addDays(iso, 1);
    } else {
      segments.push({ from: iso, out: addDays(iso, 1), kind: state.kind, site: state.site, label: state.label, route: state.route });
    }
  });
  const sites = [...new Set(segments.filter((row) => row.kind === "site" && row.site).map((row) => row.site!))];
  return { ...stint, segments, excelSegments: excel, sites: sites.length ? sites : stint.sites };
}
