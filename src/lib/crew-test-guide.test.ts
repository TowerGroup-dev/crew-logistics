import { describe, expect, it } from "vitest";
import { TEST_GUIDE, allGuideStepIds, sectionForPath } from "@/lib/crew-test-guide";

describe("crew-test-guide", () => {
  it("has unique step ids across every page", () => {
    const ids = allGuideStepIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(30);
  });

  it("maps calendar paths to the matching section", () => {
    expect(sectionForPath("/").id).toBe("overview");
    expect(sectionForPath("/month").id).toBe("month");
    expect(sectionForPath("/year").id).toBe("year");
    expect(sectionForPath("/list").id).toBe("list");
    expect(sectionForPath("/employees").id).toBe("employees");
    expect(sectionForPath("/settings").id).toBe("settings");
  });

  it("Month steps cover Edit place, Travel chip, right-click routes, and year switch", () => {
    const month = TEST_GUIDE.find((s) => s.id === "month");
    expect(month).toBeTruthy();
    const ids = new Set(month!.steps.map((s) => s.id));
    expect(ids.has("month-place")).toBe(true);
    expect(ids.has("month-travel-days")).toBe(true);
    expect(ids.has("month-travel-in")).toBe(true);
    expect(ids.has("month-travel-out")).toBe(true);
    expect(ids.has("month-extend")).toBe(true);
    expect(ids.has("month-tentative")).toBe(true);
    expect(ids.has("month-filters")).toBe(true);
    expect(ids.has("month-year")).toBe(true);
    // Old Travel-brush-only wording must not linger.
    for (const step of month!.steps) {
      expect(step.do.includes("Select Travel")).toBe(false);
    }
  });

  it("Overview mentions confirm / tentative book-by", () => {
    const overview = TEST_GUIDE.find((s) => s.id === "overview");
    expect(overview).toBeTruthy();
    const blob = overview!.steps.map((s) => `${s.do} ${s.expect}`).join(" ");
    expect(blob.toLowerCase()).toMatch(/tentative|confirm|book-by|book by/);
  });
});
