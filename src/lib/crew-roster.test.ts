import { describe, expect, it } from "vitest";
import {
  addNextRotation,
  addProvisionalEmployee,
  commitProvisionalEmployee,
  discardProvisionalEmployee,
  emptyRoster,
  findRotationPlanAt,
  isManualEmployee,
  isProvisionalEmployee,
  mergePeople,
  removeManualEmployee,
  removeRotationPlan,
  setRotationPlanNote,
  setStayNote,
  MAX_STAY_NOTE_CHARS,
  setStayOut,
  stintOverrideKey,
} from "@/lib/crew-roster";
import type { CrewPerson } from "@/lib/crew-schedule";

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
    expect(withNote.stayNotes["p1:2026-08-01:2026-09-12"]).toBe("Lingering for snow");

    const cleared = setRotationPlanNote(withNote, "p1", planId, "   ");
    expect(cleared.rotationPlans.p1![0]!.note).toBeUndefined();
    expect(cleared.stayNotes["p1:2026-08-01:2026-09-12"]).toBeUndefined();
  });

  it("NAV-08 setStayNote works on sheet stays and clamps to 80 chars", () => {
    const long = `${"x".repeat(90)} linger`;
    const noted = setStayNote(emptyRoster(), "dean", "2026-08-31", "2026-12-29", `  Linger for snow  ${long}`);
    expect(noted.stayNotes["dean:2026-08-31:2026-12-29"]!.length).toBe(MAX_STAY_NOTE_CHARS);
    expect(noted.stayNotes["dean:2026-08-31:2026-12-29"]).toMatch(/^Linger for snow/);

    const cleared = setStayNote(noted, "dean", "2026-08-31", "2026-12-29", "   ");
    expect(cleared.stayNotes["dean:2026-08-31:2026-12-29"]).toBeUndefined();
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

describe("provisional / manual hire helpers", () => {
  it("addProvisionalEmployee creates a Draft hire", () => {
    const created = addProvisionalEmployee(emptyRoster(), { name: "John", role: "Labourer" });
    expect(created).not.toBeNull();
    expect(created!.roster.employees[0]).toMatchObject({
      name: "John",
      role: "Labourer",
      provisional: true,
      employmentStatus: "active",
    });
    expect(isProvisionalEmployee(created!.roster, created!.personId)).toBe(true);
    expect(isManualEmployee(created!.roster, created!.personId)).toBe(true);
  });

  it("commitProvisionalEmployee clears the Draft flag", () => {
    const created = addProvisionalEmployee(emptyRoster(), { name: "John", role: "Labourer" })!;
    const saved = commitProvisionalEmployee(created.roster, created.personId);
    expect(saved.employees[0]!.provisional).toBe(false);
    expect(isProvisionalEmployee(saved, created.personId)).toBe(false);
  });

  it("discardProvisionalEmployee removes draft placements", () => {
    const created = addProvisionalEmployee(emptyRoster(), { name: "John", role: "Labourer" })!;
    const placed = addNextRotation(created.roster, created.personId, {
      site: "IQA",
      from: "2026-06-01",
      out: "2026-07-13",
    });
    const discarded = discardProvisionalEmployee(placed, created.personId);
    expect(discarded.employees).toHaveLength(0);
    expect(discarded.rotationPlans[created.personId]).toBeUndefined();
  });

  it("removeManualEmployee deletes a saved hire", () => {
    const created = addProvisionalEmployee(emptyRoster(), { name: "Sam Local", role: "Labourer" })!;
    const saved = commitProvisionalEmployee(created.roster, created.personId);
    const removed = removeManualEmployee(saved, created.personId);
    expect(removed.employees).toHaveLength(0);
    expect(isManualEmployee(removed, created.personId)).toBe(false);
  });

  it("mergePeople surfaces provisional on calendar rows", () => {
    const created = addProvisionalEmployee(emptyRoster(), { name: "Try John", role: "Labourer" })!;
    const people = mergePeople([] as CrewPerson[], created.roster);
    const row = people.find((person) => person.id === created.personId);
    expect(row?.provisional).toBe(true);
    expect(row?.manual).toBe(true);
  });
});
