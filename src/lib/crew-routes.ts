/**
 * Usual routes to each camp: the stopovers between the south and the site.
 * Editable in Settings; used to prefill flight legs (From → stops → site, and back).
 */

import type { FlightBook, FlightDirection, FlightSegment } from "@/lib/crew-flights";
import { formatMedium } from "@/lib/dates";

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

// v2: Pond goes through Iqaluit by default (v1 saved it as direct).
const STORAGE_KEY = "tower-arctic-crew-routes-v2";

export const ROUTE_SITES = ["IQA", "POND", "KUG", "ALRT"] as const;

/**
 * From the office (20 Nov 2026): Ottawa to Iqaluit direct, Pond through Iqaluit, Alert set.
 * Kugluktuk through Yellowknife, as the 2026 Excel shows.
 */
export const DEFAULT_ROUTES: SiteRoute[] = [
  { site: "IQA", via: [] },
  { site: "POND", via: ["IQA"] },
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

/**
 * Site to site up north: back down the first site's route, then up the second's.
 * IQA → POND: IQA → POND. POND → IQA: POND → IQA. KUG → IQA: KUG → YK → IQA.
 */
export function routeBetweenSites(book: CrewRoutesBook, fromSite: string, toSite: string) {
  const from = cleanCode(fromSite);
  const to = cleanCode(toSite);
  const down = [...(routeFor(book, from)?.via ?? [])].reverse();
  const up = routeFor(book, to)?.via ?? [];
  // If the destination is already on the way down (POND → IQA), stop there.
  const stopAt = down.indexOf(to);
  if (stopAt >= 0) return [from, ...down.slice(0, stopAt), to];
  // If the start is on the way up (IQA → POND), start from there.
  const startAt = up.indexOf(from);
  const chain = startAt >= 0 ? [from, ...up.slice(startAt + 1), to] : [from, ...down, ...up, to];
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

export type TripStep =
  | { kind: "leg"; index: number; mode: "flight" | "road"; from: string; to: string; date: string; departTime: string; arriveTime: string; ref: string }
  | { kind: "stop"; place: string; from: string; to: string; nights: number; hotel: string | null };

/**
 * The whole journey in order: each flight or drive, and every stopover between them
 * (with the nights spent and the hotel booked there, if any).
 */
export function tripPlan(
  legs: FlightSegment[],
  hotels: { place: string; name: string; checkIn: string; checkOut: string }[] = [],
) {
  const sorted = legs
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (a.row.departDate + a.row.departTime).localeCompare(b.row.departDate + b.row.departTime) || a.index - b.index);
  const steps: TripStep[] = [];
  const warnings: string[] = [];
  sorted.forEach(({ row, index }, i) => {
    steps.push({
      kind: "leg",
      index,
      mode: row.mode === "road" ? "road" : "flight",
      from: row.fromAirport,
      to: row.toAirport,
      date: row.departDate,
      departTime: row.departTime,
      arriveTime: row.arriveTime,
      ref: row.flightNumber,
    });
    if (!row.departDate) warnings.push(`Leg ${i + 1} (${row.fromAirport || "?"} → ${row.toAirport || "?"}) has no date`);
    if (!row.fromAirport || !row.toAirport) warnings.push(`Leg ${i + 1} is missing where it starts or ends`);
    const next = sorted[i + 1]?.row;
    if (!next) return;
    if (row.toAirport && next.fromAirport && row.toAirport !== next.fromAirport) {
      warnings.push(`Leg ${i + 1} ends at ${row.toAirport} but the next leaves from ${next.fromAirport}`);
    }
    const landed = row.arriveDate || row.departDate;
    if (landed && next.departDate && next.departDate > landed) {
      const nights = Math.round((Date.parse(next.departDate) - Date.parse(landed)) / 86400000);
      const place = row.toAirport;
      const hotel = hotels.find((h) => h.place === place && (!h.checkIn || h.checkIn <= landed) && (!h.checkOut || h.checkOut >= next.departDate));
      steps.push({ kind: "stop", place, from: landed, to: next.departDate, nights, hotel: hotel ? hotel.name || "Hotel booked" : null });
      if (!hotel) warnings.push(`${nights} night${nights === 1 ? "" : "s"} in ${place} from ${formatMedium(landed)}, no hotel booked`);
    }
  });
  return { steps, warnings };
}

export type RouteSuggestion = {
  airports: string[];
  /** How each leg is travelled (one per hop). */
  modes: ("flight" | "road")[];
  /** How many past trips used it. */
  uses: number;
  usual: boolean;
};

const CODE = /^[A-Z]{2,5}$/;

/**
 * Ways to get from `from` to `to`, best first: the usual route, then routes people
 * actually took (from bookings, moves and the Excel's travel days), then direct.
 * `from` may be empty (home airport unknown): then any route ending at `to` counts.
 */
export function suggestRoutes(input: {
  from: string;
  to: string;
  usual?: string[] | null;
  /** Legs of every trip on file. */
  trips: FlightSegment[][];
  /** Journeys written as text, e.g. "KUG → YK → IQA" (from the Excel). */
  routeTexts?: string[];
  limit?: number;
}): RouteSuggestion[] {
  const from = input.from.trim().toUpperCase();
  const to = input.to.trim().toUpperCase();
  if (!to || from === to) return [];
  const found = new Map<string, RouteSuggestion>();
  const consider = (airports: string[], modes: ("flight" | "road")[]) => {
    const end = airports.lastIndexOf(to);
    if (end <= 0) return;
    const start = from ? airports.lastIndexOf(from, end - 1) : 0;
    if (start < 0) return;
    const chain = airports.slice(start, end + 1);
    const legModes = modes.slice(start, end);
    if (chain.length < 2 || new Set(chain).size !== chain.length) return;
    const key = `${chain.join(">")}|${legModes.join(",")}`;
    const row = found.get(key) ?? { airports: chain, modes: legModes, uses: 0, usual: false };
    row.uses += 1;
    found.set(key, row);
  };
  for (const legs of input.trips) {
    const rows = legs.filter((row) => row.fromAirport && row.toAirport);
    if (!rows.length) continue;
    const airports = [rows[0]!.fromAirport, ...rows.map((row) => row.toAirport)].map((code) => code.toUpperCase());
    consider(airports, rows.map((row) => (row.mode === "road" ? "road" : "flight")));
  }
  for (const text of input.routeTexts ?? []) {
    const airports = text
      .split(/→|->|>/)
      .map((part) => part.trim().toUpperCase())
      .filter((code) => CODE.test(code));
    consider(airports, airports.slice(1).map(() => "flight"));
  }
  const list = [...found.values()].sort((a, b) => b.uses - a.uses || a.airports.length - b.airports.length);
  if (input.usual && input.usual.length > 1) {
    const usualKey = input.usual.join(">");
    const hit = list.find((row) => row.airports.join(">") === usualKey && row.modes.every((mode) => mode === "flight"));
    if (hit) hit.usual = true;
    else list.unshift({ airports: input.usual, modes: input.usual.slice(1).map(() => "flight"), uses: 0, usual: true });
    list.sort((a, b) => Number(b.usual) - Number(a.usual));
  }
  if (from && !list.some((row) => row.airports.length === 2)) {
    list.push({ airports: [from, to], modes: ["flight"], uses: 0, usual: false });
  }
  return list.slice(0, input.limit ?? 5);
}
