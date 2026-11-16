import { describe, expect, it } from "vitest";
import {
  addNextRotation,
  emptyRoster,
  findRotationPlanAt,
  removeRotationPlan,
  setRotationPlanNote,
  setStayOut,
  stintOverrideKey,
} from "@/lib/crew-roster";

/** NAV-01 / NAV-07 / NAV-08 — rotation plan CRUD (Excel place / clear / note). */
describe("crew-roster rotation plans", () => {
  it("NAV-01 addNextRotation appends an active placement with optional note", () => {
    const roster = addNextRotation(emptyRoster(), "p1", {
      site: "IQA",
      from: "2026-06-01",
      out: "2026-07-13",
      role: "Labourer",
      note: "Lingering for snow",
    });
    const plans = roster.rotationPlans.p1 ?? [];
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      site: "IQA",
      from: "2026-06-01",
      out: "2026-07-13",
      role: "Labourer",
      note: "Lingering for snow",
    });
    expect(roster.employmentStatus.p1).toBe("active");
  });

  it("NAV-07 removeRotationPlan clears the placement", () => {
    const placed = addNextRotation(emptyRoster(), "p1", {
      site: "POND",
      from: "2026-03-01",
      out: "2026-04-12",
    });
    const planId = placed.rotationPlans.p1![0]!.id;
    const cleared = removeRotationPlan(placed, "p1", planId);
    expect(cleared.rotationPlans.p1).toBeUndefined();
    expect(findRotationPlanAt(cleared, "p1", "2026-03-05")).toBeNull();
  });

  it("NAV-08 setRotationPlanNote round-trips and clears", () => {
    const placed = addNextRotation(emptyRoster(), "p1", {
      site: "ALRT",
      from: "2026-08-01",
      out: "2026-09-12",
    });
    const planId = placed.rotationPlans.p1![0]!.id;
    const withNote = setRotationPlanNote(placed, "p1", planId, "  Lingering for snow  ");
    expect(withNote.rotationPlans.p1![0]!.note).toBe("Lingering for snow");
    expect(findRotationPlanAt(withNote, "p1", "2026-08-10")?.note).toBe("Lingering for snow");

    const cleared = setRotationPlanNote(withNote, "p1", planId, "   ");
    expect(cleared.rotationPlans.p1![0]!.note).toBeUndefined();
  });

  it("removeRotationPlan is a no-op for unknown plan ids", () => {
    const placed = addNextRotation(emptyRoster(), "p1", {
      site: "IQA",
      from: "2026-01-01",
      out: "2026-02-12",
    });
    const again = removeRotationPlan(placed, "p1", "missing");
    expect(again).toBe(placed);
  });

  it("setStayOut shortens extracted sheet stays via override", () => {
    const shortened = setStayOut(emptyRoster(), "sheet-1", "2026-06-01", "2026-06-07");
    expect(shortened.stintOutOverrides[stintOverrideKey("sheet-1", "2026-06-01")]).toBe("2026-06-07");
  });
});
