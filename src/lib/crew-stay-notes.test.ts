import { describe, expect, it } from "vitest";
import { daysBetween } from "@/lib/dates";
import { stayNoteBarLayout } from "@/lib/crew-stay-notes";

describe("stayNoteBarLayout", () => {
  it("spans every day of from→out (not a 1-day date note)", () => {
    const stayFrom = "2026-06-01";
    const stayOutExclusive = "2026-07-13";
    const dayCount = daysBetween(stayFrom, stayOutExclusive);
    expect(dayCount).toBe(42);

    const bar = stayNoteBarLayout({
      yearStart: stayFrom,
      dayCount,
      stayFrom,
      stayOutExclusive,
      note: "testing",
    });

    expect(bar).toEqual({
      key: `${stayFrom}|${stayOutExclusive}`,
      start: 0,
      span: dayCount,
      note: "testing",
    });
    expect(bar!.span).not.toBe(1);
  });

  it("clips to the visible window when the stay overhangs", () => {
    const bar = stayNoteBarLayout({
      yearStart: "2026-06-10",
      dayCount: 20,
      stayFrom: "2026-06-01",
      stayOutExclusive: "2026-07-13",
      note: "Lingering for snow",
    });
    expect(bar).toEqual({
      key: "2026-06-01|2026-07-13",
      start: 0,
      span: 20,
      note: "Lingering for snow",
    });
  });

  it("returns null for blank notes or stays outside the window", () => {
    expect(
      stayNoteBarLayout({
        yearStart: "2026-01-01",
        dayCount: 31,
        stayFrom: "2026-06-01",
        stayOutExclusive: "2026-07-13",
        note: "   ",
      }),
    ).toBeNull();

    expect(
      stayNoteBarLayout({
        yearStart: "2026-01-01",
        dayCount: 10,
        stayFrom: "2026-06-01",
        stayOutExclusive: "2026-07-13",
        note: "away",
      }),
    ).toBeNull();
  });
});
