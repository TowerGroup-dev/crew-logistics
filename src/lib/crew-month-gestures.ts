import { addDays } from "@/lib/dates";

/**
 * NAV-03: return booking window from the clicked stay day through the last
 * inclusive day of that stay (e.g. 10-day stay, click day 6 → days 6–10 yellow).
 */
export function returnWindowFromStayDay(input: {
  clickIso: string;
  stayFrom: string;
  /** Exclusive OUT (first day off site). */
  stayOutExclusive: string | null;
  seasonEnd: string;
}): { from: string; to: string } | null {
  const click = input.clickIso.slice(0, 10);
  const from = input.stayFrom.slice(0, 10);
  if (click < from) return null;
  if (input.stayOutExclusive && click >= input.stayOutExclusive.slice(0, 10)) return null;

  // Explicit OUT (including into next year) wins; open sheet stays stop at season end.
  const lastInclusive = input.stayOutExclusive
    ? addDays(input.stayOutExclusive.slice(0, 10), -1)
    : input.seasonEnd;
  if (lastInclusive < click) return { from: click, to: click };
  return { from: click, to: lastInclusive };
}

/**
 * Planned arrival window: click before/on Arrival → that day through Arrival;
 * click after Arrival (on stay) → Arrival through that day. Drag still paints
 * any span within the lead window.
 */
export function arrivalWindowFromStayDay(input: {
  clickIso: string;
  /** Arrival / first day on site. */
  stayFrom: string;
  /** Exclusive OUT (first day off site). */
  stayOutExclusive: string | null;
  seasonEnd: string;
  /** How many days before Arrival you may paint. */
  leadDays: number;
}): { from: string; to: string } | null {
  const click = input.clickIso.slice(0, 10);
  const arrival = input.stayFrom.slice(0, 10);
  const earliest = addDays(arrival, -Math.max(0, input.leadDays));
  const lastInclusive = input.stayOutExclusive
    ? addDays(input.stayOutExclusive.slice(0, 10), -1)
    : input.seasonEnd;

  if (click < earliest || click > lastInclusive) return null;

  if (click <= arrival) {
    return { from: click, to: arrival };
  }
  return { from: arrival, to: click };
}
