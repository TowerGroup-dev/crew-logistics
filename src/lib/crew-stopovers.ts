/** Painted travel stopovers on the Month calendar (Excel-style cell marks). */

import {
  DEFAULT_TRAVEL_HUBS,
  formatJourneyPath,
  isTravelHubCode,
  normalizeHubCode,
} from "@/lib/crew-travel-hubs";

/** Short hub code painted on a day (YK, YOW, YYZ, …). */
export type StopoverHub = string;

/** personId → date (YYYY-MM-DD) → hub */
export type CrewStopoverBook = Record<string, Record<string, StopoverHub>>;

const STORAGE_KEY = "tower-arctic-crew-stopovers-v1";

export function emptyStopoverBook(): CrewStopoverBook {
  return {};
}

function readHub(value: unknown): StopoverHub | null {
  if (typeof value !== "string") return null;
  const code = normalizeHubCode(value);
  // Accept known defaults or any 2–8 letter custom code the user painted.
  if (/^[A-Z0-9]{2,8}$/.test(code)) return code;
  return null;
}

function readBook(raw: unknown): CrewStopoverBook {
  if (!raw || typeof raw !== "object") return emptyStopoverBook();
  const out: CrewStopoverBook = {};
  for (const [personId, dates] of Object.entries(raw as Record<string, unknown>)) {
    if (!dates || typeof dates !== "object") continue;
    const row: Record<string, StopoverHub> = {};
    for (const [date, hub] of Object.entries(dates as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const code = readHub(hub);
      if (code) row[date] = code;
    }
    if (Object.keys(row).length) out[personId] = row;
  }
  return out;
}

export function loadStopovers(): CrewStopoverBook {
  if (typeof window === "undefined") return emptyStopoverBook();
  try {
    return readBook(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return emptyStopoverBook();
  }
}

export function saveStopovers(book: CrewStopoverBook) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

export function stopoverOnDay(book: CrewStopoverBook, personId: string, iso: string): StopoverHub | null {
  return book[personId]?.[iso] ?? null;
}

export function toggleStopover(
  book: CrewStopoverBook,
  personId: string,
  iso: string,
  hub: StopoverHub = "YK",
): CrewStopoverBook {
  const nextHub = normalizeHubCode(hub);
  if (!/^[A-Z0-9]{2,8}$/.test(nextHub)) return book;
  const current = book[personId]?.[iso];
  const nextDates = { ...(book[personId] || {}) };
  if (current === nextHub) {
    delete nextDates[iso];
  } else {
    nextDates[iso] = nextHub;
  }
  const next = { ...book };
  if (Object.keys(nextDates).length === 0) delete next[personId];
  else next[personId] = nextDates;
  return next;
}

/** Set a stopover hub on a day (or clear when hub is empty). */
export function setStopover(
  book: CrewStopoverBook,
  personId: string,
  iso: string,
  hub: StopoverHub | null,
): CrewStopoverBook {
  const nextDates = { ...(book[personId] || {}) };
  if (!hub) {
    delete nextDates[iso];
  } else {
    const nextHub = normalizeHubCode(hub);
    if (!/^[A-Z0-9]{2,8}$/.test(nextHub)) return book;
    nextDates[iso] = nextHub;
  }
  const next = { ...book };
  if (Object.keys(nextDates).length === 0) delete next[personId];
  else next[personId] = nextDates;
  return next;
}

/** Drop all painted stopovers for a person (discard / delete hire). */
export function clearStopoversForPerson(book: CrewStopoverBook, personId: string): CrewStopoverBook {
  if (!book[personId]) return book;
  const next = { ...book };
  delete next[personId];
  return next;
}

/** Paint the same pass-through hub on each listed day (legend Travel brush). */
export function paintStopoverDays(
  book: CrewStopoverBook,
  personId: string,
  dates: string[],
  hub: StopoverHub,
): CrewStopoverBook {
  const nextHub = normalizeHubCode(hub);
  if (!/^[A-Z0-9]{2,8}$/.test(nextHub) || !dates.length) return book;
  let next = book;
  for (const iso of dates) {
    next = setStopover(next, personId, iso.slice(0, 10), nextHub);
  }
  return next;
}

/** Clear grey travel marks on an inclusive date range (edit/delete journey). */
export function clearStopoversInRange(
  book: CrewStopoverBook,
  personId: string,
  from: string,
  to: string,
): CrewStopoverBook {
  const start = from.slice(0, 10);
  const end = to.slice(0, 10);
  const dates = book[personId];
  if (!dates) return book;
  let next = book;
  for (const iso of Object.keys(dates)) {
    if (iso >= start && iso <= end) next = setStopover(next, personId, iso, null);
  }
  return next;
}

/** Paint per-day hubs from a journey (each travel day can show a different city). */
export function paintStopoverDayMap(
  book: CrewStopoverBook,
  personId: string,
  days: { iso: string; hub: string }[],
): CrewStopoverBook {
  let next = book;
  for (const row of days) {
    next = setStopover(next, personId, row.iso.slice(0, 10), row.hub);
  }
  return next;
}

/** Sorted stopover dates for a person (optional year filter). */
export function stopoverDatesFor(book: CrewStopoverBook, personId: string, year?: number) {
  const dates = Object.keys(book[personId] || {}).sort();
  if (year == null) return dates;
  const prefix = `${year}-`;
  return dates.filter((date) => date.startsWith(prefix));
}

/**
 * Travel plan for a stay: stopovers from 2 weeks before IN through the stay,
 * then the destination site (e.g. YOW → YK → IQA).
 */
export function travelPlanForStay(
  book: CrewStopoverBook,
  personId: string,
  stayFrom: string,
  stayOutExclusive: string | null,
  destinationSite?: string | null,
): string {
  const from = stayFrom.slice(0, 10);
  const [y, m, d] = from.split("-").map(Number);
  const start = new Date(y, (m ?? 1) - 1, (d ?? 1) - 14);
  const windowStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const end = stayOutExclusive?.slice(0, 10) || "9999-12-31";
  const hubs = Object.entries(book[personId] || {})
    .filter(([iso]) => iso >= windowStart && iso < end)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, hub]) => hub);
  const path = [...hubs];
  if (destinationSite) path.push(destinationSite.trim().toUpperCase());
  return formatJourneyPath(path);
}

export function knownStopoverHub(code: string) {
  return isTravelHubCode(code, DEFAULT_TRAVEL_HUBS) || /^[A-Z0-9]{2,8}$/.test(normalizeHubCode(code));
}
