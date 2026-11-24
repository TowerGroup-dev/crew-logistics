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
  it("one-day Ottawa → IQA paints one grey day with OTT→IQA path", () => {
    const plan = buildJourneyPlan({
      airports: ["YOW", "IQA"],
      startDate: "2026-11-24",
      endDate: "2026-11-24",
      journeyType: "coming",
    });
    expect(plan?.pathLabel).toBe("YOW → IQA");
    expect(plan?.segments).toHaveLength(1);
    expect(plan?.segments[0]).toEqual(
      expect.objectContaining({
        fromAirport: "YOW",
        toAirport: "IQA",
        departDate: "2026-11-24",
        arriveDate: "2026-11-24",
      }),
    );
    expect(plan?.stopoverDays).toEqual([{ iso: "2026-11-24", hub: "YOW" }]);
  });

  it("direct KUG → IQA camp transfer needs no hub", () => {
    const plan = buildJourneyPlan({
      airports: ["KUG", "IQA"],
      startDate: "2026-11-25",
      endDate: "2026-11-25",
      journeyType: "transfer",
    });
    expect(plan?.pathLabel).toBe("KUG → IQA");
    expect(plan?.stopoverDays).toEqual([{ iso: "2026-11-25", hub: "KUG" }]);
  });

  it("multi-day Ottawa → Edmonton → IQA spreads legs across painted days", () => {
    const plan = buildJourneyPlan({
      airports: ["YOW", "YEG", "IQA"],
      startDate: "2026-11-24",
      endDate: "2026-11-25",
      journeyType: "coming",
      overnightHub: "YEG",
    });
    expect(plan?.segments.map((leg) => [leg.fromAirport, leg.toAirport, leg.departDate])).toEqual([
      ["YOW", "YEG", "2026-11-24"],
      ["YEG", "IQA", "2026-11-25"],
    ]);
    expect(plan?.stopoverDays.map((row) => row.iso)).toEqual(["2026-11-24", "2026-11-25"]);
  });

  it("Montreal → POND and Vancouver → KUG work as free origins", () => {
    expect(
      buildJourneyPlan({ airports: ["YUL", "POND"], startDate: "2026-12-01", endDate: "2026-12-01" })
        ?.pathLabel,
    ).toBe("YUL → POND");
    expect(
      buildJourneyPlan({ airports: ["YVR", "KUG"], startDate: "2026-12-01", endDate: "2026-12-01" })
        ?.pathLabel,
    ).toBe("YVR → KUG");
  });

  it("legacy overnight pace still spans two days for direct", () => {
    const plan = buildJourneyPlan({
      airports: ["YOW", "IQA"],
      startDate: "2026-11-26",
      pace: "overnight",
    });
    expect(plan?.arriveDate).toBe("2026-11-27");
    expect(plan?.stopoverDays.map((row) => row.iso)).toEqual(["2026-11-26", "2026-11-27"]);
  });
});
