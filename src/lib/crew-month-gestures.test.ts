import { describe, expect, it } from "vitest";
import { returnWindowFromStayDay } from "@/lib/crew-month-gestures";

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
});
