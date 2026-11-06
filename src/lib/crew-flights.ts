/** Canadian North flight booking records, no airline API, no costs. */

import type { CrewBookingStatus, CrewOpsBook, CrewPersonOps } from "@/lib/crew-ops";
import { emptyCrewOps, opsFor } from "@/lib/crew-ops";

export const CANADIAN_NORTH_URL = "https://canadiannorth.com/";

export type FlightDirection = "outbound" | "return";

export type FlightSegment = {
  fromAirport: string;
  toAirport: string;
  departDate: string;
  departTime: string;
  arriveDate: string;
  arriveTime: string;
  flightNumber: string;
};

export type FlightRecordStatus =
  | "pending_booking"
  | "booked"
  | "confirmed"
  | "changed"
  | "cancelled"
  | "completed";

export type FlightBooking = {
  id: string;
  personId: string;
  direction: FlightDirection;
  /** Links to planned IN (outbound) or OUT (return). */
  rotationDate: string | null;
  airline: string;
  pnr: string;
  ticketNumber: string;
  segments: FlightSegment[];
  status: FlightRecordStatus;
  bookedOn: string | null;
  enteredBy: string;
  enteredAt: string;
  confirmationName: string;
  /** data: URL for PDF/image stored locally, keep small. */
  confirmationDataUrl: string;
  notes: string;
  history: { at: string; by: string; text: string }[];
};

export type FlightBook = {
  bookings: FlightBooking[];
};

const STORAGE_KEY = "tower-arctic-crew-flights";

export function emptyFlightBook(): FlightBook {
  return { bookings: [] };
}

function isDirection(value: unknown): value is FlightDirection {
  return value === "outbound" || value === "return";
}

function isFlightStatus(value: unknown): value is FlightRecordStatus {
  return (
    value === "pending_booking" ||
    value === "booked" ||
    value === "confirmed" ||
    value === "changed" ||
    value === "cancelled" ||
    value === "completed"
  );
}

function readSegment(value: unknown): FlightSegment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<FlightSegment>;
  return {
    fromAirport: typeof row.fromAirport === "string" ? row.fromAirport : "",
    toAirport: typeof row.toAirport === "string" ? row.toAirport : "",
    departDate: typeof row.departDate === "string" ? row.departDate.slice(0, 10) : "",
    departTime: typeof row.departTime === "string" ? row.departTime : "",
    arriveDate: typeof row.arriveDate === "string" ? row.arriveDate.slice(0, 10) : "",
    arriveTime: typeof row.arriveTime === "string" ? row.arriveTime : "",
    flightNumber: typeof row.flightNumber === "string" ? row.flightNumber : "",
  };
}

function readBooking(value: unknown): FlightBooking | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<FlightBooking>;
  if (typeof row.id !== "string" || typeof row.personId !== "string") return null;
  if (!isDirection(row.direction)) return null;
  return {
    id: row.id,
    personId: row.personId,
    direction: row.direction,
    rotationDate: typeof row.rotationDate === "string" ? row.rotationDate.slice(0, 10) : null,
    airline: typeof row.airline === "string" && row.airline ? row.airline : "Canadian North",
    pnr: typeof row.pnr === "string" ? row.pnr : "",
    ticketNumber: typeof row.ticketNumber === "string" ? row.ticketNumber : "",
    segments: Array.isArray(row.segments)
      ? row.segments.map(readSegment).filter((item): item is FlightSegment => Boolean(item))
      : [],
    status: isFlightStatus(row.status) ? row.status : "booked",
    bookedOn: typeof row.bookedOn === "string" ? row.bookedOn.slice(0, 10) : null,
    enteredBy: typeof row.enteredBy === "string" ? row.enteredBy : "",
    enteredAt: typeof row.enteredAt === "string" ? row.enteredAt : new Date().toISOString(),
    confirmationName: typeof row.confirmationName === "string" ? row.confirmationName : "",
    confirmationDataUrl: typeof row.confirmationDataUrl === "string" ? row.confirmationDataUrl : "",
    notes: typeof row.notes === "string" ? row.notes : "",
    history: Array.isArray(row.history)
      ? row.history
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const item = entry as { at?: string; by?: string; text?: string };
            if (typeof item.at !== "string" || typeof item.by !== "string" || typeof item.text !== "string") {
              return null;
            }
            return { at: item.at, by: item.by, text: item.text };
          })
          .filter((item): item is { at: string; by: string; text: string } => Boolean(item))
      : [],
  };
}

export function readFlightBook(value: unknown): FlightBook {
  if (!value || typeof value !== "object") return emptyFlightBook();
  const raw = value as Partial<FlightBook>;
  return {
    bookings: Array.isArray(raw.bookings)
      ? raw.bookings.map(readBooking).filter((item): item is FlightBooking => Boolean(item))
      : [],
  };
}

export function loadFlights(): FlightBook {
  if (typeof window === "undefined") return emptyFlightBook();
  try {
    return readFlightBook(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return emptyFlightBook();
  }
}

export function saveFlights(book: FlightBook) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

export function emptySegment(): FlightSegment {
  return {
    fromAirport: "",
    toAirport: "",
    departDate: "",
    departTime: "",
    arriveDate: "",
    arriveTime: "",
    flightNumber: "",
  };
}

export function flightStatusLabel(status: FlightRecordStatus) {
  if (status === "pending_booking") return "Pending booking";
  if (status === "booked") return "Booked";
  if (status === "confirmed") return "Confirmed";
  if (status === "changed") return "Changed";
  if (status === "cancelled") return "Cancelled";
  return "Completed";
}

/** Live booking for a direction, ignore cancelled. Prefer confirmed > booked > changed > pending. */
export function activeBookingFor(
  book: FlightBook,
  personId: string,
  direction: FlightDirection,
): FlightBooking | null {
  const rank = (status: FlightRecordStatus) => {
    if (status === "confirmed") return 0;
    if (status === "booked") return 1;
    if (status === "changed") return 2;
    if (status === "pending_booking") return 3;
    if (status === "completed") return 4;
    return 9;
  };
  const matches = book.bookings
    .filter((row) => row.personId === personId && row.direction === direction && row.status !== "cancelled")
    .sort((a, b) => rank(a.status) - rank(b.status) || b.enteredAt.localeCompare(a.enteredAt));
  return matches[0] ?? null;
}

export function flightIsArranged(booking: FlightBooking | null) {
  if (!booking) return false;
  return booking.status === "booked" || booking.status === "confirmed" || booking.status === "changed" || booking.status === "completed";
}

export function opsStatusFromFlight(booking: FlightBooking | null): CrewBookingStatus {
  if (!booking) return "not_started";
  if (booking.status === "cancelled") return "cancelled";
  if (booking.status === "confirmed" || booking.status === "completed") return "confirmed";
  if (booking.status === "booked" || booking.status === "changed") return "booked";
  if (booking.status === "pending_booking") return "needed";
  return "not_started";
}

/** Keep crew-ops flight flags in sync with the latest booking record. */
export function syncOpsFromFlights(opsBook: CrewOpsBook, flightBook: FlightBook, personId: string): CrewPersonOps {
  const current = opsFor(opsBook, personId);
  const outbound = activeBookingFor(flightBook, personId, "outbound");
  const inbound = activeBookingFor(flightBook, personId, "return");
  const nextOutbound = outbound ? opsStatusFromFlight(outbound) : current.outboundFlight;
  const nextReturn = inbound ? opsStatusFromFlight(inbound) : current.returnFlight;
  const pnr = outbound?.pnr || inbound?.pnr || current.confirmation;
  return {
    ...current,
    outboundFlight: nextOutbound,
    returnFlight: nextReturn,
    confirmation: pnr,
  };
}

export function upsertFlightBooking(book: FlightBook, booking: FlightBooking): FlightBook {
  const existing = book.bookings.findIndex((row) => row.id === booking.id);
  if (existing >= 0) {
    const bookings = [...book.bookings];
    bookings[existing] = booking;
    return { bookings };
  }
  return { bookings: [booking, ...book.bookings] };
}

export function applyFlightToOpsBook(
  opsBook: CrewOpsBook,
  flightBook: FlightBook,
  personId: string,
): CrewOpsBook {
  const next = syncOpsFromFlights(opsBook, flightBook, personId);
  return { ...opsBook, [personId]: next || emptyCrewOps(personId) };
}
