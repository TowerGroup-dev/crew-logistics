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
      if (segment) return segment.kind === "site" ? worksiteFromMark(segment.site || "") || null : null;
      const site = worksiteFromMark(stint.site) || stint.sites.map(worksiteFromMark).find(Boolean);
      return site || null;
    }
  }
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
