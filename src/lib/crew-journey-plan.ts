/**
 * Flexible journey plan for the Month calendar.
 * Any origin/destination/stop; dates come from the painted travel period.
 */

import { addDays, daysBetween } from "@/lib/dates";
import type { FlightSegment } from "@/lib/crew-flights";

export type JourneyPace = "same-day" | "overnight";

export type JourneyType = "coming" | "home" | "transfer";

export type JourneyStopoverDay = { iso: string; hub: string };

export type BuiltJourney = {
  airports: string[];
  pathLabel: string;
  segments: FlightSegment[];
  /** Grey calendar days to paint (every travel day in the selected range). */
  stopoverDays: JourneyStopoverDay[];
  startDate: string;
  arriveDate: string;
  journeyType: JourneyType;
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

function daysInclusive(from: string, to: string) {
  const start = from.slice(0, 10);
  const end = to.slice(0, 10) < start ? start : to.slice(0, 10);
  const list: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) list.push(d);
  return list;
}

/**
 * Build flight legs + grey travel days from the user's route and painted dates.
 * Does not invent hubs — only uses airports the user entered.
 */
export function buildJourneyPlan(input: {
  airports: string[];
  startDate: string;
  /** Inclusive last travel day (from calendar paint). Defaults to startDate. */
  endDate?: string;
  /** @deprecated prefer endDate; overnight=true with no endDate ⇒ start+1 for direct. */
  pace?: JourneyPace;
  journeyType?: JourneyType;
  /** City they sleep in when overnight (optional; used as grey hub on first night). */
  overnightHub?: string;
}): BuiltJourney | null {
  const airports = normalizeJourneyAirports(input.airports);
  if (airports.length < 2) return null;
  const start = input.startDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;

  let end = (input.endDate || start).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) end = start;
  if (end < start) end = start;

  // Legacy overnight with no endDate: direct trip spans two calendar days.
  if (!input.endDate && input.pace === "overnight" && end === start) {
    end = addDays(start, 1);
  }

  const days = daysInclusive(start, end);
  const segments: FlightSegment[] = [];
  const nLegs = airports.length - 1;

  if (days.length === 1) {
    // One painted day: every hop that day.
    for (let i = 0; i < nLegs; i += 1) {
      const from = airports[i]!;
      const to = airports[i + 1]!;
      segments.push({
        fromAirport: from,
        toAirport: to,
        departDate: start,
        departTime: "",
        arriveDate: start,
        arriveTime: "",
        flightNumber: "",
        mode: "flight",
      });
    }
  } else if (nLegs === 1) {
    // Direct multi-day: leave first day, arrive last day.
    segments.push({
      fromAirport: airports[0]!,
      toAirport: airports[1]!,
      departDate: start,
      departTime: "",
      arriveDate: end,
      arriveTime: "",
      flightNumber: "",
      mode: "flight",
    });
  } else {
    // Spread legs across painted days (last leg on last day).
    for (let i = 0; i < nLegs; i += 1) {
      const dayIndex =
        nLegs === 1 ? 0 : Math.min(days.length - 1, Math.round((i * (days.length - 1)) / (nLegs - 1)));
      const day = days[dayIndex]!;
      segments.push({
        fromAirport: airports[i]!,
        toAirport: airports[i + 1]!,
        departDate: day,
        departTime: "",
        arriveDate: day,
        arriveTime: "",
        flightNumber: "",
        mode: "flight",
      });
    }
  }

  const overnight = clean(input.overnightHub || "");
  const stopoverDays: JourneyStopoverDay[] = days.map((iso, index) => {
    // Prefer overnight hub on intermediate nights; else "at" city for that morning.
    if (overnight && index < days.length - 1 && index === 0) {
      return { iso, hub: overnight };
    }
    const leg = segments.find((row) => row.departDate === iso) || segments[Math.min(index, segments.length - 1)]!;
    return { iso, hub: leg.fromAirport || airports[0]! };
  });

  const arriveDate = segments[segments.length - 1]?.arriveDate || end;
  return {
    airports,
    pathLabel: airports.join(" → "),
    segments,
    stopoverDays,
    startDate: start,
    arriveDate,
    journeyType: input.journeyType || "coming",
  };
}

export function journeyTypeToDirection(type: JourneyType): "outbound" | "return" {
  return type === "home" ? "return" : "outbound";
}

export function directionToJourneyType(
  direction: "outbound" | "return",
  notes?: string,
): JourneyType {
  if (direction === "return") return "home";
  if ((notes || "").toLowerCase().includes("transfer")) return "transfer";
  return "coming";
}

/** Span of calendar days a booking covers (for clearing grey on delete/edit). */
export function journeyDateSpan(segments: FlightSegment[]): { from: string; to: string } | null {
  const dates = segments
    .flatMap((leg) => [leg.departDate, leg.arriveDate])
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (!dates.length) return null;
  return { from: dates[0]!, to: dates[dates.length - 1]! };
}

export function daysBetweenInclusive(from: string, to: string) {
  return daysBetween(from, to) + 1;
}
