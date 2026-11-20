/**
 * Usual routes to each camp: the stopovers between the south and the site.
 * Editable in Settings; used to prefill flight legs (From → stops → site, and back).
 */

import type { FlightBook, FlightDirection, FlightSegment } from "@/lib/crew-flights";

export type SiteRoute = {
  /** Camp code: IQA, POND, KUG, ALRT. */
  site: string;
  /** Stopovers in travel order going north (e.g. ["YK"] for Kugluktuk). */
  via: string[];
};

export type CrewRoutesBook = {
  version: 1;
  routes: SiteRoute[];
};

const STORAGE_KEY = "tower-arctic-crew-routes-v1";

export const ROUTE_SITES = ["IQA", "POND", "KUG", "ALRT"] as const;

/**
 * Seeded only from what the 2026 Excel shows (Kugluktuk through Yellowknife).
 * The others start direct until the office fills them in under Settings.
 */
export const DEFAULT_ROUTES: SiteRoute[] = [
  { site: "IQA", via: [] },
  { site: "POND", via: [] },
  { site: "KUG", via: ["YK"] },
  { site: "ALRT", via: [] },
];

export function emptyRoutesBook(): CrewRoutesBook {
  return { version: 1, routes: DEFAULT_ROUTES.map((row) => ({ ...row, via: [...row.via] })) };
}

function cleanCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function readRoutesBook(raw: unknown): CrewRoutesBook {
  const base = emptyRoutesBook();
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as CrewRoutesBook).routes)) return base;
  const saved = new Map<string, string[]>();
  for (const row of (raw as CrewRoutesBook).routes) {
    if (!row || typeof row !== "object") continue;
    const site = cleanCode((row as SiteRoute).site);
    if (!site) continue;
    const via = Array.isArray((row as SiteRoute).via) ? (row as SiteRoute).via.map(cleanCode).filter(Boolean) : [];
    saved.set(site, via);
  }
  const routes = base.routes.map((row) => (saved.has(row.site) ? { site: row.site, via: saved.get(row.site)! } : row));
  for (const [site, via] of saved) {
    if (!routes.some((row) => row.site === site)) routes.push({ site, via });
  }
  return { version: 1, routes };
}

export function loadRoutes(): CrewRoutesBook {
  if (typeof window === "undefined") return emptyRoutesBook();
  try {
    return readRoutesBook(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return emptyRoutesBook();
  }
}

export function saveRoutes(book: CrewRoutesBook) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
  } catch {
    // Storage full or blocked, keep working in memory.
  }
}

export function setRouteVia(book: CrewRoutesBook, site: string, via: string[]): CrewRoutesBook {
  const key = cleanCode(site);
  const clean = via.map(cleanCode).filter(Boolean);
  const exists = book.routes.some((row) => row.site === key);
  return {
    ...book,
    routes: exists
      ? book.routes.map((row) => (row.site === key ? { site: key, via: clean } : row))
      : [...book.routes, { site: key, via: clean }],
  };
}

export function routeFor(book: CrewRoutesBook, site: string | null | undefined) {
  if (!site) return null;
  const key = cleanCode(site);
  return book.routes.find((row) => row.site === key) ?? null;
}

/** Airport chain for a trip: outbound From → stops → site, return site → stops (reversed) → From. */
export function routeAirports(book: CrewRoutesBook, site: string, from: string, direction: FlightDirection) {
  const via = routeFor(book, site)?.via ?? [];
  const start = cleanCode(from);
  const chain = direction === "outbound" ? [start, ...via, cleanCode(site)] : [cleanCode(site), ...[...via].reverse(), start];
  // Drop blanks and accidental repeats (e.g. From is YK and the route also goes through YK).
  return chain.filter((code, index) => code && code !== chain[index - 1]);
}

/** One flight leg per hop, dated on the travel day so the office only fills times and flight numbers. */
export function legsForRoute(airports: string[], travelDate: string | null): FlightSegment[] {
  const legs: FlightSegment[] = [];
  for (let i = 0; i < airports.length - 1; i += 1) {
    legs.push({
      fromAirport: airports[i]!,
      toAirport: airports[i + 1]!,
      departDate: travelDate ?? "",
      departTime: "",
      arriveDate: travelDate ?? "",
      arriveTime: "",
      flightNumber: "",
    });
  }
  return legs;
}

/** Where this person usually starts from: the first airport of their latest outbound booking. */
export function lastStartAirport(flightBook: FlightBook | undefined, personId: string) {
  if (!flightBook) return "";
  const rows = flightBook.bookings
    .filter((row) => row.personId === personId && row.status !== "cancelled" && row.segments.length)
    .sort((a, b) => (b.enteredAt || "").localeCompare(a.enteredAt || ""));
  for (const row of rows) {
    const code =
      row.direction === "outbound"
        ? row.segments[0]?.fromAirport
        : row.segments[row.segments.length - 1]?.toAirport;
    if (code) return code;
  }
  return "";
}

/**
 * Where the person is on a day during a booked trip (the airport they depart from,
 * arrive at, or sleep over in between legs). Null outside the trip.
 */
export function flightPlaceOnDay(segments: FlightSegment[], iso: string): string | null {
  const legs = segments
    .filter((row) => row.departDate && (row.fromAirport || row.toAirport))
    .slice()
    .sort((a, b) => (a.departDate + a.departTime).localeCompare(b.departDate + b.departTime));
  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i]!;
    const arrive = leg.arriveDate || leg.departDate;
    if (iso === leg.departDate && iso !== arrive) return leg.fromAirport || null;
    if (iso >= leg.departDate && iso <= arrive) {
      // Lands the same day: the day belongs to where they end up, unless they fly on again.
      const next = legs[i + 1];
      if (next && next.departDate === iso) continue;
      return leg.toAirport || leg.fromAirport || null;
    }
    const next = legs[i + 1];
    if (next && iso > arrive && iso < next.departDate) return leg.toAirport || null;
  }
  return null;
}
