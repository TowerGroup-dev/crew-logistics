import { describe, expect, it } from "vitest";
import { arrivalWindowFromStayDay, returnWindowFromStayDay } from "@/lib/crew-month-gestures";

describe("returnWindowFromStayDay (NAV-03)", () => {
  it("paints from clicked day through end of stay (day 6 of 10 → 6–10)", () => {
    // 10 inclusive days: 2026-06-01 .. 2026-06-10, exclusive out 2026-06-11
    const range = returnWindowFromStayDay({
      clickIso: "2026-06-06",
      stayFrom: "2026-06-01",
      stayOutExclusive: "2026-06-11",
      seasonEnd: "2026-12-31",
    });
    expect(range).toEqual({ from: "2026-06-06", to: "2026-06-10" });
  });

  it("does not cap at 14 days when stay is longer", () => {
    const range = returnWindowFromStayDay({
      clickIso: "2026-06-01",
      stayFrom: "2026-06-01",
      stayOutExclusive: "2026-07-13",
      seasonEnd: "2026-12-31",
    });
    expect(range).toEqual({ from: "2026-06-01", to: "2026-07-12" });
  });

  it("keeps a return window that runs past New Year", () => {
    const range = returnWindowFromStayDay({
      clickIso: "2026-12-20",
      stayFrom: "2026-11-30",
      stayOutExclusive: "2027-03-15",
      seasonEnd: "2026-12-31",
    });
    expect(range).toEqual({ from: "2026-12-20", to: "2027-03-14" });
  });
});

describe("arrivalWindowFromStayDay", () => {
  it("paints from a day before Arrival through Arrival", () => {
    const range = arrivalWindowFromStayDay({
      clickIso: "2026-05-28",
      stayFrom: "2026-06-01",
      stayOutExclusive: "2026-06-11",
      seasonEnd: "2026-12-31",
      leadDays: 21,
    });
    expect(range).toEqual({ from: "2026-05-28", to: "2026-06-01" });
  });

  it("paints Arrival through a day inside the stay", () => {
    const range = arrivalWindowFromStayDay({
      clickIso: "2026-06-04",
      stayFrom: "2026-06-01",
      stayOutExclusive: "2026-06-11",
      seasonEnd: "2026-12-31",
      leadDays: 21,
    });
    expect(range).toEqual({ from: "2026-06-01", to: "2026-06-04" });
  });

  it("rejects clicks outside the lead window", () => {
    const range = arrivalWindowFromStayDay({
      clickIso: "2026-05-01",
      stayFrom: "2026-06-01",
      stayOutExclusive: "2026-06-11",
      seasonEnd: "2026-12-31",
      leadDays: 21,
    });
    expect(range).toBeNull();
  });
});
