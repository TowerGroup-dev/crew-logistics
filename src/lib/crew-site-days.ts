/**
 * Where a person is on a given day. Shared by the Month calendar (boxes and the
 * daily headcount) and the Reports page, so the numbers always agree.
 */

import {
  isOffRotation,
  scheduleYearLastDay,
  scheduleYearOutExclusive,
  statusOnDate,
  type CrewPerson,
  type CrewStint,
} from "@/lib/crew-schedule";
import { worksiteFromMark } from "@/lib/crew-sites";

/** Worksite code (IQA, POND, ...) the person is on that day, or null when off site. */
export function siteOnDay(person: CrewPerson, iso: string) {
  const seasonExclusive = scheduleYearOutExclusive(Number(iso.slice(0, 4)));
  for (const stint of person.stints || []) {
    const out = stint.out && stint.out < seasonExclusive ? stint.out : seasonExclusive;
    if (stint.from <= iso && iso < out) {
      const segment = segmentOn(stint.segments, iso);
      const lastSite = [...(stint.segments || [])].reverse().find((piece) => piece.kind === "site");
      if (segment?.kind === "site") return worksiteFromMark(segment.site || "") || null;
      if (segment?.kind === "travel") {
        // Real hub stop (YK / YOW / …) → not a camp day. Generic "TRV" leave window
        // stays camp-coloured until a booked → destination is painted in the box.
        const hubMark = (segment.label || "").replace(/^via\s+/i, "").trim().toUpperCase();
        const isRealHub =
          Boolean(hubMark) &&
          hubMark !== "TRV" &&
          hubMark !== "TRAVEL" &&
          !worksiteFromMark(hubMark);
        if (isRealHub) return null;
        return worksiteFromMark(lastSite?.site || stint.site || "") || null;
      }
      // Past its last known piece (open stay, or a stay dragged longer): still at the last site they were at.
      const lastPiece = stint.segments?.length ? stint.segments[stint.segments.length - 1] : null;
      if (lastPiece && lastSite && iso >= lastPiece.out) {
        return worksiteFromMark(lastSite.site || "") || null;
      }
      const site = worksiteFromMark(stint.site) || stint.sites.map(worksiteFromMark).find(Boolean);
      return site || null;
    }
  }
  // People with stays: the stays are the truth (a stay dragged shorter really ends).
  if (person.stints?.length) return null;
  const mark = statusOnDate(person, iso);
  if (!mark || isOffRotation(mark)) return null;
  if (iso > scheduleYearLastDay(Number(iso.slice(0, 4)))) return null;
  return worksiteFromMark(mark);
}

function segmentOn(segments: CrewStint["segments"], iso: string) {
  if (!segments) return null;
  for (const segment of segments) {
    if (segment.from <= iso && iso < segment.out) return segment;
  }
  return null;
}

/** Travel day inside a stay (from the sheet): box label and full route. */
export function travelSegmentOnDay(person: CrewPerson, iso: string) {
  for (const stint of person.stints || []) {
    if (stint.from <= iso && (!stint.out || iso < stint.out)) {
      const segment = segmentOn(stint.segments, iso);
      return segment && segment.kind === "travel"
        ? { label: segment.label || "", route: segment.route || segment.label || "" }
        : null;
    }
  }
  return null;
}

/** Role for the stay covering that day (when the stay has its own role). */
export function roleOnDay(person: CrewPerson, iso: string) {
  for (const stint of person.stints || []) {
    if (stint.from <= iso && (!stint.out || iso < stint.out)) return stint.role || null;
  }
  return null;
}

/**
 * Moves between sites exactly as the calendar shows them during a stay: every time
 * the person turns up at a different site. `date` is the first day after they left
 * the old site (the travel day), `arrive` the first day at the new one.
 */
export function movesOnCalendar(person: CrewPerson, from: string, outExclusive: string) {
  const moves: { fromSite: string; toSite: string; date: string; arrive: string }[] = [];
  let lastSite: string | null = null;
  let lastDay = "";
  for (let d = from; d < outExclusive; d = addOneDay(d)) {
    const site = siteOnDay(person, d);
    if (!site) continue;
    if (lastSite && site !== lastSite) {
      moves.push({ fromSite: lastSite, toSite: site, date: addOneDay(lastDay), arrive: d });
    }
    lastSite = site;
    lastDay = d;
  }
  return moves;
}

function addOneDay(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
