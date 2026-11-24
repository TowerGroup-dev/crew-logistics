/**
 * Historical route suggestions from saved journeys (Stage 1–3).
 * Not flight availability — frequency of past From → stops → To only.
 */

import type { FlightBook, FlightBooking } from "@/lib/crew-flights";
import { normalizeJourneyAirports } from "@/lib/crew-journey-plan";

export type RouteSuggestion = {
  airports: string[];
  pathLabel: string;
  uses: number;
};

function pathFromBooking(booking: FlightBooking): string[] {
  const codes: string[] = [];
  for (const leg of booking.segments || []) {
    if (leg.fromAirport) codes.push(leg.fromAirport);
    if (leg.toAirport) codes.push(leg.toAirport);
  }
  return normalizeJourneyAirports(codes);
}

/**
 * Suggest connecting routes for an origin → destination from past bookings.
 * Never auto-applies — caller shows Accept / ignore.
 */
export function suggestRoutesFor(
  book: FlightBook | undefined,
  from: string,
  to: string,
  limit = 3,
): RouteSuggestion[] {
  const origin = from.trim().toUpperCase();
  const dest = to.trim().toUpperCase();
  if (!book || !origin || !dest || origin === dest) return [];

  const counts = new Map<string, { airports: string[]; uses: number }>();
  for (const booking of book.bookings) {
    if (booking.status === "cancelled") continue;
    const airports = pathFromBooking(booking);
    if (airports.length < 2) continue;
    if (airports[0] !== origin || airports[airports.length - 1] !== dest) continue;
    const key = airports.join(">");
    const prev = counts.get(key);
    if (prev) prev.uses += 1;
    else counts.set(key, { airports, uses: 1 });
  }

  return [...counts.values()]
    .sort((a, b) => b.uses - a.uses || a.airports.length - b.airports.length)
    .slice(0, limit)
    .map((row) => ({
      airports: row.airports,
      pathLabel: row.airports.join(" → "),
      uses: row.uses,
    }));
}
