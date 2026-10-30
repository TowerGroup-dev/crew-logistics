/** Editable crew ops layered on top of the spreadsheet schedule.
 *  Planned dates come from the sheet; actual dates, travel, lodging, and updates live here.
 */

export type CrewBookingStatus = "not_started" | "needed" | "booked" | "confirmed" | "cancelled";

export type CrewUpdate = {
  id: string;
  text: string;
  by: string;
  at: string;
};

export type CrewPersonOps = {
  personId: string;
  /** When they actually arrived on site (In). */
  actualIn: string | null;
  /** When they actually left the site (Out). */
  actualOut: string | null;
  plannedInOverride: string | null;
  plannedOutOverride: string | null;
  outboundFlight: CrewBookingStatus;
  returnFlight: CrewBookingStatus;
  flightNotes: string;
  accommodation: CrewBookingStatus;
  accommodationNotes: string;
  confirmation: string;
  updates: CrewUpdate[];
};

export type CrewOpsBook = Record<string, CrewPersonOps>;

export const CREW_BOOKING_STATUSES: { value: CrewBookingStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "needed", label: "Action needed" },
  { value: "booked", label: "Booked" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
];

const STORAGE_KEY = "tower-arctic-crew-ops";

export function emptyCrewOps(personId: string): CrewPersonOps {
  return {
    personId,
    actualIn: null,
    actualOut: null,
    plannedInOverride: null,
    plannedOutOverride: null,
    outboundFlight: "not_started",
    returnFlight: "not_started",
    flightNotes: "",
    accommodation: "not_started",
    accommodationNotes: "",
    confirmation: "",
    updates: [],
  };
}

function isStatus(value: unknown): value is CrewBookingStatus {
  return (
    value === "not_started" ||
    value === "needed" ||
    value === "booked" ||
    value === "confirmed" ||
    value === "cancelled"
  );
}

function readUpdate(value: unknown): CrewUpdate | null {
  if (!value || typeof value !== "object") return null;
  const row = value as CrewUpdate;
  if (typeof row.id !== "string" || typeof row.text !== "string") return null;
  if (typeof row.by !== "string" || typeof row.at !== "string") return null;
  return { id: row.id, text: row.text, by: row.by, at: row.at };
}

export function readCrewOps(value: unknown): CrewOpsBook {
  if (!value || typeof value !== "object") return {};
  const book: CrewOpsBook = {};
  for (const [personId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<CrewPersonOps>;
    const base = emptyCrewOps(personId);
    book[personId] = {
      ...base,
      actualIn: typeof row.actualIn === "string" ? row.actualIn.slice(0, 10) : null,
      actualOut: typeof row.actualOut === "string" ? row.actualOut.slice(0, 10) : null,
      plannedInOverride: typeof row.plannedInOverride === "string" ? row.plannedInOverride.slice(0, 10) : null,
      plannedOutOverride: typeof row.plannedOutOverride === "string" ? row.plannedOutOverride.slice(0, 10) : null,
      outboundFlight: isStatus(row.outboundFlight) ? row.outboundFlight : "not_started",
      returnFlight: isStatus(row.returnFlight) ? row.returnFlight : "not_started",
      flightNotes: typeof row.flightNotes === "string" ? row.flightNotes : "",
      accommodation: isStatus(row.accommodation) ? row.accommodation : "not_started",
      accommodationNotes: typeof row.accommodationNotes === "string" ? row.accommodationNotes : "",
      confirmation: typeof row.confirmation === "string" ? row.confirmation : "",
      updates: Array.isArray(row.updates)
        ? row.updates.map(readUpdate).filter((item): item is CrewUpdate => Boolean(item))
        : [],
    };
  }
  return book;
}

export function loadCrewOps(): CrewOpsBook {
  if (typeof window === "undefined") return {};
  try {
    return readCrewOps(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return {};
  }
}

export function saveCrewOps(book: CrewOpsBook) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

export function opsFor(book: CrewOpsBook, personId: string) {
  return book[personId] ?? emptyCrewOps(personId);
}

export function bookingNeedsAttention(status: CrewBookingStatus) {
  return status === "not_started" || status === "needed";
}

export function bookingLabel(status: CrewBookingStatus) {
  return CREW_BOOKING_STATUSES.find((row) => row.value === status)?.label ?? status;
}
