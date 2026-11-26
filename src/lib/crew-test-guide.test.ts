import { describe, expect, it } from "vitest";
import { TEST_GUIDE, allGuideStepIds, sectionForPath } from "@/lib/crew-test-guide";

describe("crew-test-guide", () => {
  it("has unique step ids across every page", () => {
    const ids = allGuideStepIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(25);
  });

  it("maps calendar paths to the matching section", () => {
    expect(sectionForPath("/").id).toBe("overview");
    expect(sectionForPath("/month").id).toBe("month");
    expect(sectionForPath("/year").id).toBe("year");
    expect(sectionForPath("/list").id).toBe("list");
    expect(sectionForPath("/employees").id).toBe("employees");
    expect(sectionForPath("/reports").id).toBe("reports");
    expect(sectionForPath("/settings").id).toBe("settings");
  });

  it("Month steps cover camp place, Arrival/Return brushes, and current right-click language", () => {
    const month = TEST_GUIDE.find((s) => s.id === "month");
    expect(month).toBeTruthy();
    const ids = new Set(month!.steps.map((s) => s.id));
    expect(ids.has("month-place")).toBe(true);
    expect(ids.has("month-arrival")).toBe(true);
    expect(ids.has("month-confirm")).toBe(true);
    expect(ids.has("month-return")).toBe(true);
    expect(ids.has("month-departure-loc")).toBe(true);
    expect(ids.has("month-extend")).toBe(true);
    expect(ids.has("month-year")).toBe(true);
    expect(ids.has("month-travel-days")).toBe(false);
    expect(ids.has("month-travel-in")).toBe(false);
    const blob = month!.steps.map((s) => `${s.do} ${s.expect}`).join(" ");
    expect(blob).toMatch(/2027/);
    expect(blob).toMatch(/Arrival/);
    expect(blob).toMatch(/Return/);
    expect(blob).toMatch(/Departure location/);
    expect(blob).toMatch(/Planned arrival/);
    expect(blob.toLowerCase()).not.toMatch(/travel chip/);
    expect(blob.toLowerCase()).not.toMatch(/coming from/);
    expect(blob.toLowerCase()).not.toMatch(/going home/);
    expect(blob.toLowerCase()).not.toMatch(/preliminary/);
  });

  it("Overview covers This week / On site and planning-year quiet state", () => {
    const overview = TEST_GUIDE.find((s) => s.id === "overview");
    expect(overview).toBeTruthy();
    const ids = new Set(overview!.steps.map((s) => s.id));
    expect(ids.has("overview-week")).toBe(true);
    expect(ids.has("overview-onsite")).toBe(true);
    expect(ids.has("overview-flights")).toBe(false);
    expect(ids.has("overview-todo")).toBe(false);
    const blob = overview!.steps.map((s) => `${s.do} ${s.expect}`).join(" ");
    expect(blob).toMatch(/2027/);
    expect(blob.toLowerCase()).toMatch(/calendar/);
  });

  it("Reports covers operations hero, outlook, and action list", () => {
    const reports = TEST_GUIDE.find((s) => s.id === "reports");
    expect(reports).toBeTruthy();
    const ids = new Set(reports!.steps.map((s) => s.id));
    expect(ids.has("rep-hero")).toBe(true);
    expect(ids.has("rep-outlook")).toBe(true);
    expect(ids.has("rep-actions")).toBe(true);
    expect(ids.has("rep-attention")).toBe(false);
  });

  it("does not include the removed Accommodation page", () => {
    expect(TEST_GUIDE.some((s) => s.id === "accommodation")).toBe(false);
  });
});
