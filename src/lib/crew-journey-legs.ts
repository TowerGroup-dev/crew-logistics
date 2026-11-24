/**
 * Per-day captions painted inside Month calendar boxes for a journey.
 *
 * Rules (codes only):
 * - Same-day hop with stops into camp: camp-coloured box, caption like `YUL → YK`
 *   (intermediates that day; final camp is the box colour, not repeated in the caption).
 * - Overnight: grey while flying to a hub (Home → YK); camp colour when that day's
 *   destination is a site (YK → KUG). Arrival camp day shows `→ YK`.
 * - Never show sheet prose ("Leaving… confirmed by…") — only airport codes.
 */

import type { FlightSegment } from "@/lib/crew-flights";
import { addDays } from "@/lib/dates";
import { flightPlaceOnDay } from "@/lib/crew-routes";

export const CAMP_SITE_CODES = new Set(["IQA", "POND", "ALRT", "KUG"]);

export function normalizeAirportCode(code: string) {
  const raw = code.replace(/^via\s+/i, "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "KU") return "KUG";
  if (raw === "IQ") return "IQA";
  if (raw === "PD" || raw === "PND") return "POND";
  // Airport / hub codes only — reject sheet prose ("Leaving Iqaluit… confirmed by…").
  if (!/^[A-Z0-9]{2,8}$/.test(raw)) return "";
  if (raw === "TRV" || raw === "TRAVEL") return "";
  return raw;
}

function isCamp(code: string, camps: Set<string> = CAMP_SITE_CODES) {
  return camps.has(normalizeAirportCode(code));
}

/** Collapse consecutive duplicate codes into a path string. */
export function formatLegCaption(codes: string[]) {
  const path: string[] = [];
  for (const code of codes) {
    const next = normalizeAirportCode(code);
    if (!next) continue;
    if (path[path.length - 1] !== next) path.push(next);
  }
  if (!path.length) return "";
  if (path.length === 1) return `→ ${path[0]}`;
  return path.join(" → ");
}

function sortedLegs(segments: FlightSegment[]) {
  return segments
    .filter((row) => row.departDate && (row.fromAirport || row.toAirport))
    .map((row) => ({
      from: normalizeAirportCode(row.fromAirport),
      to: normalizeAirportCode(row.toAirport),
      departDate: row.departDate.slice(0, 10),
      arriveDate: (row.arriveDate || row.departDate).slice(0, 10),
    }))
    .filter((row) => row.from || row.to)
    .sort((a, b) => a.departDate.localeCompare(b.departDate) || a.arriveDate.localeCompare(b.arriveDate));
}

function uniquePath(codes: string[]) {
  const path: string[] = [];
  for (const code of codes) {
    const next = normalizeAirportCode(code);
    if (!next) continue;
    if (path[path.length - 1] !== next) path.push(next);
  }
  return path;
}

/**
 * Camp code this travel day should be coloured with, or null for grey (hub / home).
 * Colour follows that day's destination — not the whole trip's final site on every day.
 */
export function journeyDayDestination(
  segments: FlightSegment[],
  iso: string,
  opts?: { campCodes?: Set<string> },
): string | null {
  const day = iso.slice(0, 10);
  const camps = opts?.campCodes ?? CAMP_SITE_CODES;
  const legs = sortedLegs(segments);
  if (!legs.length) return null;

  // Prefer a camp landed on today (same-day multi-hop ends at camp).
  const arriving = legs.filter((leg) => leg.arriveDate === day && leg.to);
  for (let i = arriving.length - 1; i >= 0; i -= 1) {
    const to = arriving[i]!.to;
    if (to && isCamp(to, camps)) return normalizeAirportCode(to);
  }

  // Departures that land today at a camp (same calendar day hop).
  const departing = legs.filter((leg) => leg.departDate === day);
  for (let i = departing.length - 1; i >= 0; i -= 1) {
    const leg = departing[i]!;
    if (leg.to && isCamp(leg.to, camps) && leg.arriveDate === day) {
      return normalizeAirportCode(leg.to);
    }
  }

  // Hub overnight / flying home — grey (no camp destination today).
  return null;
}

/**
 * Inbound caption (left of box): stops before camp on arrival day, or route on travel days.
 */
export function journeyDayCaption(
  segments: FlightSegment[],
  iso: string,
  opts?: {
    /** Camp site colour on this day (IQA / POND / …), if any. */
    siteOnIso?: string | null;
    campCodes?: Set<string>;
  },
): string {
  const day = iso.slice(0, 10);
  const camps = opts?.campCodes ?? CAMP_SITE_CODES;
  const site = opts?.siteOnIso ? normalizeAirportCode(opts.siteOnIso) : "";
  const legs = sortedLegs(segments);
  if (!legs.length) return "";

  const landingAtCamp = legs.find(
    (leg) => leg.arriveDate === day && leg.to && isCamp(leg.to, camps) && (!site || leg.to === site),
  );
  const onCampToday = Boolean(site && isCamp(site, camps));

  // Arrival on camp (site-coloured box) — inbound only.
  if (onCampToday && landingAtCamp) {
    const sameDayChain = legs.filter((leg) => leg.departDate === day && leg.arriveDate === day);
    if (sameDayChain.length) {
      const codes: string[] = [];
      for (const leg of sameDayChain) {
        if (leg.from) codes.push(leg.from);
        if (leg.to) codes.push(leg.to);
      }
      const path = uniquePath(codes);
      // Final camp is the box colour — show the stop(s) before it.
      if (path.length && path[path.length - 1] === site) path.pop();
      return formatLegCaption(path);
    }
    // Overnight: arrived from the hub they slept in.
    if (landingAtCamp.from) return formatLegCaption([landingAtCamp.from]);
  }

  // Do not put leave routes in the inbound caption (OUT day uses journeyDayLeaveCaption).
  if (onCampToday) return "";

  // Travel day (not on camp): legs that leave today.
  const departing = legs.filter((leg) => leg.departDate === day);
  if (departing.length) {
    const codes: string[] = [];
    for (const leg of departing) {
      if (leg.from) codes.push(leg.from);
      if (leg.to) codes.push(leg.to);
    }
    const path = uniquePath(codes);
    if (path.length && isCamp(path[path.length - 1]!, camps)) {
      path.pop();
    }
    return formatLegCaption(path);
  }

  // Multi-day direct: still show From → To on days between depart and arrive.
  const spanning = legs.find((leg) => leg.departDate < day && day <= leg.arriveDate);
  if (spanning?.from && spanning.to) {
    return formatLegCaption([spanning.from, spanning.to]);
  }

  // Sitting overnight at a hub between legs.
  const place = flightPlaceOnDay(segments, day);
  if (place && !isCamp(place, camps)) return formatLegCaption([place]);
  return "";
}

/**
 * Leave caption for the OUT day (right of box), e.g. `→ YUL` or `YK → YUL`.
 */
export function journeyDayLeaveCaption(
  segments: FlightSegment[],
  iso: string,
  opts?: {
    siteOnIso?: string | null;
    campCodes?: Set<string>;
  },
): string {
  const day = iso.slice(0, 10);
  const camps = opts?.campCodes ?? CAMP_SITE_CODES;
  const site = opts?.siteOnIso ? normalizeAirportCode(opts.siteOnIso) : "";
  const legs = sortedLegs(segments);
  if (!legs.length) return "";

  // Arriving at camp today is inbound — not a leave caption.
  if (
    site &&
    legs.some((leg) => leg.arriveDate === day && leg.to === site)
  ) {
    return "";
  }

  const departing = legs.filter((leg) => leg.departDate === day);
  if (!departing.length) {
    // Multi-day leave: first day of a spanning return leg.
    const spanning = legs.find(
      (leg) =>
        leg.departDate === day || (leg.departDate < day && day <= leg.arriveDate),
    );
    if (
      spanning?.from &&
      spanning.to &&
      (!site || spanning.from === site || !isCamp(spanning.to, camps))
    ) {
      const path = uniquePath([spanning.from, spanning.to]).filter((code) => code !== site);
      return formatLegCaption(path);
    }
    return "";
  }

  // Leave only when departing from this camp (or no site given).
  if (site && !departing.some((leg) => leg.from === site)) return "";

  const codes: string[] = [];
  for (const leg of departing) {
    if (leg.from) codes.push(leg.from);
    if (leg.to) codes.push(leg.to);
  }
  const path = uniquePath(codes).filter((code) => code !== site);
  if (!path.length) return "";
  if (path.length && isCamp(path[path.length - 1]!, camps)) return "";
  return formatLegCaption(path);
}

/**
 * Pick the flight segments that belong to this stay day (outbound near IN,
 * return near OUT, or any booking covering the day).
 */
export function segmentsForPersonDay(
  bookings: { personId: string; direction: string; status: string; rotationDate: string | null; segments: FlightSegment[] }[],
  personId: string,
  iso: string,
  stayFrom?: string | null,
  stayOutExclusive?: string | null,
): FlightSegment[] {
  const day = iso.slice(0, 10);
  const active = bookings.filter(
    (row) => row.personId === personId && row.status !== "cancelled" && row.segments?.length,
  );
  if (!active.length) return [];

  const coversDay = (segments: FlightSegment[]) =>
    sortedLegs(segments).some((leg) => leg.departDate <= day && day <= leg.arriveDate);

  // Prefer the booking that actually covers this calendar day.
  const covering = active.filter((row) => coversDay(row.segments));
  if (covering.length === 1) return covering[0]!.segments;
  const lastInclusive =
    stayOutExclusive && /^\d{4}-\d{2}-\d{2}$/.test(stayOutExclusive.slice(0, 10))
      ? addDays(stayOutExclusive.slice(0, 10), -1)
      : null;

  if (covering.length > 1) {
    if (stayFrom && day === stayFrom.slice(0, 10)) {
      const outbound = covering.find((row) => row.direction === "outbound");
      if (outbound) return outbound.segments;
    }
    if (lastInclusive && day === lastInclusive) {
      const ret = covering.find((row) => row.direction === "return");
      if (ret) return ret.segments;
    }
    return covering[0]!.segments;
  }

  // Fallback: rotationDate near stay edges.
  if (stayFrom && day === stayFrom.slice(0, 10)) {
    const outbound = active.find((row) => row.direction === "outbound");
    if (outbound) return outbound.segments;
  }
  if (lastInclusive && day === lastInclusive) {
    const ret = active.find((row) => row.direction === "return" && coversDay(row.segments));
    if (ret) return ret.segments;
    const anyReturn = active.find((row) => row.direction === "return");
    if (anyReturn) return anyReturn.segments;
  }
  return [];
}

/**
 * Caption from a sheet travel segment route string (e.g. "YUL → YK → IQA") for one day.
 */
export function captionFromSheetRoute(
  route: string,
  iso: string,
  opts?: { siteOnIso?: string | null; departDate?: string; arriveDate?: string },
): string {
  const codes = route
    .split(/\s*→\s*/)
    .map((part) => normalizeAirportCode(part.replace(/^[→\s]+|[→\s]+$/g, "")))
    .filter(Boolean);
  if (codes.length < 2) return formatLegCaption(codes);

  const site = opts?.siteOnIso ? normalizeAirportCode(opts.siteOnIso) : "";
  const start = opts?.departDate?.slice(0, 10);
  const end = opts?.arriveDate?.slice(0, 10) || start;
  const day = iso.slice(0, 10);

  // Same calendar day for the whole sheet route.
  if (!start || !end || start === end || (start === day && end === day)) {
    if (site && codes[codes.length - 1] === site) {
      return formatLegCaption(codes.slice(0, -1));
    }
    return formatLegCaption(codes);
  }

  // Multi-day sheet route: first day shows start → hub; arrival day shows → hub.
  if (day === start) {
    return formatLegCaption(codes.slice(0, Math.min(2, codes.length)));
  }
  if (day === end && site) {
    const fromHub = codes[codes.length - 2];
    return fromHub ? formatLegCaption([fromHub]) : "";
  }
  if (day > start && day < end) {
    const hub = codes[Math.min(1, codes.length - 1)];
    return hub ? formatLegCaption([hub]) : "";
  }
  return "";
}
