/**
 * Layout helpers for Month stay notes: a note on from→out must span every day
 * of that stay in the visible day window, not collapse to one cell.
 */

import { daysBetween } from "@/lib/dates";

export type StayNoteBar = {
  start: number;
  span: number;
  note: string;
  key: string;
};

/**
 * Where a whole-stay note sits on the day track.
 * `yearStart` is dayMeta[0] (first visible day); `dayCount` is dayMeta.length.
 */
export function stayNoteBarLayout(input: {
  yearStart: string;
  dayCount: number;
  stayFrom: string;
  stayOutExclusive: string;
  note: string;
}): StayNoteBar | null {
  const note = input.note.trim();
  if (!note || input.dayCount <= 0) return null;
  const start = Math.max(0, daysBetween(input.yearStart, input.stayFrom.slice(0, 10)));
  const end = Math.min(input.dayCount, daysBetween(input.yearStart, input.stayOutExclusive.slice(0, 10)));
  if (end <= start) return null;
  return {
    key: `${input.stayFrom}|${input.stayOutExclusive}`,
    start,
    span: end - start,
    note,
  };
}
