import { describe, expect, it } from "vitest";
import { buildJourneyPlan, normalizeJourneyAirports } from "@/lib/crew-journey-plan";

describe("normalizeJourneyAirports", () => {
  it("drops blanks and consecutive dupes", () => {
    expect(normalizeJourneyAirports(["yow", "", "YEG", "YEG", "KUG", "IQA"])).toEqual([
      "YOW",
      "YEG",
      "KUG",
      "IQA",
    ]);
  });
});

describe("buildJourneyPlan", () => {
  it("same-day keeps every leg on the start date", () => {
    const plan = buildJourneyPlan({
      airports: ["YOW", "YEG", "KUG", "IQA"],
      startDate: "2026-11-23",
      pace: "same-day",
    });
    expect(plan?.pathLabel).toBe("YOW → YEG → KUG → IQA");
    expect(plan?.segments).toHaveLength(3);
    expect(plan?.segments.every((leg) => leg.departDate === "2026-11-23")).toBe(true);
    expect(plan?.arriveDate).toBe("2026-11-23");
    expect(plan?.stopoverDays).toEqual([]);
  });

  it("overnight advances a day at each intermediate stop", () => {
    const plan = buildJourneyPlan({
      airports: ["YOW", "YEG", "KUG", "IQA"],
      startDate: "2026-11-23",
      pace: "overnight",
    });
    expect(plan?.segments.map((leg) => [leg.fromAirport, leg.toAirport, leg.departDate])).toEqual([
      ["YOW", "YEG", "2026-11-23"],
      ["YEG", "KUG", "2026-11-24"],
      ["KUG", "IQA", "2026-11-25"],
    ]);
    expect(plan?.arriveDate).toBe("2026-11-25");
    expect(plan?.stopoverDays).toEqual([{ iso: "2026-11-23", hub: "YEG" }]);
  });
});
