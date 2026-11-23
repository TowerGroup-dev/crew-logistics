/**
 * Simple journey plan for the Month calendar: From → stops → To,
 * same-day or overnight (one night at each intermediate stop).
 */

import { addDays } from "@/lib/dates";
import type { FlightSegment } from "@/lib/crew-flights";
import { WORK_SITE_CODES } from "@/lib/crew-travel-hubs";

export type JourneyPace = "same-day" | "overnight";

export type JourneyStopoverDay = { iso: string; hub: string };

export type BuiltJourney = {
  airports: string[];
  pathLabel: string;
  segments: FlightSegment[];
  /** Grey hub days to paint (intermediate stops / overnight cities). */
  stopoverDays: JourneyStopoverDay[];
  /** First depart day. */
  startDate: string;
  /** Last arrive day (inclusive). */
  arriveDate: string;
};

function clean(code: string) {
  return code.replace(/^via\s+/i, "").trim().toUpperCase();
}

/** Collapse blanks and consecutive duplicates. */
export function normalizeJourneyAirports(codes: string[]) {
  const out: string[] = [];
  for (const raw of codes) {
    const code = clean(raw);
    if (!code || !/^[A-Z0-9]{2,8}$/.test(code)) continue;
    if (out[out.length - 1] === code) continue;
    out.push(code);
  }
  return out;
}

/**
 * Build flight legs + which calendar days get a hub mark.
 * - same-day: every leg on `startDate`; leave and arrive that day.
 * - overnight / 2 days:
 *   - direct (From → To only): leave startDate, arrive the next day
 *   - with stops: one night at each intermediate city, then final hop
 */
export function buildJourneyPlan(input: {
  airports: string[];
  startDate: string;
  pace: JourneyPace;
}): BuiltJourney | null {
  const airports = normalizeJourneyAirports(input.airports);
  if (airports.length < 2) return null;
  const start = input.startDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;

  const segments: FlightSegment[] = [];
  const stopoverDays: JourneyStopoverDay[] = [];
  let day = start;
  const direct = airports.length === 2;

  for (let i = 0; i < airports.length - 1; i += 1) {
    const from = airports[i]!;
    const to = airports[i + 1]!;
    const last = i === airports.length - 2;
    // Direct 2-day: arrive the next calendar day. Multi-stop overnight: arrive same day as that hop's depart.
    const arrive =
      input.pace === "overnight" && direct && last ? addDays(day, 1) : day;
    segments.push({
      fromAirport: from,
      toAirport: to,
      departDate: day,
      departTime: "",
      arriveDate: arrive,
      arriveTime: "",
      flightNumber: "",
      mode: "flight",
    });
    // Overnight with stops: sleep at this hop's arrival when it is not the final destination.
    if (input.pace === "overnight" && !last && !WORK_SITE_CODES.has(to)) {
      stopoverDays.push({ iso: day, hub: to });
      day = addDays(day, 1);
    } else if (input.pace === "overnight" && !last && WORK_SITE_CODES.has(to)) {
      // Camp in the middle of a chain — still advance a day for the next hop.
      day = addDays(day, 1);
    }
  }

  const arriveDate = segments[segments.length - 1]?.arriveDate || start;
  return {
    airports,
    pathLabel: airports.join(" → "),
    segments,
    stopoverDays,
    startDate: start,
    arriveDate,
  };
}
