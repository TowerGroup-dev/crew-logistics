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
  setStayTentative,
  clearStayPlacement,
  confirmStayArrival,
  setStayIn,
  stintOverrideKey,
} from "@/lib/crew-roster";
import type { CrewPerson } from "@/lib/crew-schedule";
import { siteOnDay } from "@/lib/crew-site-days";

/** NAV-01 / NAV-07 / NAV-08, rotation plan CRUD (Excel place / clear / note). */
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

  it("setStayTentative marks sheet stays and app plans", () => {
    const sheet = setStayTentative(emptyRoster(), "sheet-1", "2026-06-01", {
      through: "2026-06-04",
    });
    expect(sheet.stintTentativeOverrides[stintOverrideKey("sheet-1", "2026-06-01")]).toBe(
      "2026-06-04",
    );
    const withPlan = addNextRotation(emptyRoster(), "p1", {
      site: "IQA",
      from: "2026-12-01",
      out: "2026-12-20",
      tentative: true,
      tentativeThrough: "2026-12-03",
    });
    expect(withPlan.rotationPlans.p1?.[0]?.tentative).toBe(true);
    expect(withPlan.rotationPlans.p1?.[0]?.tentativeThrough).toBe("2026-12-03");
    const confirmed = setStayTentative(withPlan, "p1", "2026-12-01", false);
    expect(confirmed.rotationPlans.p1?.[0]?.tentative).toBeUndefined();
  });

  it("setStayTentative window grows earlier and later without moving Arrival", () => {
    const placed = addNextRotation(emptyRoster(), "p1", {
      site: "IQA",
      from: "2027-10-01",
      out: "2027-10-11",
    });
    const back = setStayTentative(placed, "p1", "2027-10-01", { through: "2027-10-03" });
    expect(back.rotationPlans.p1?.[0]?.from).toBe("2027-10-01");
    expect(back.rotationPlans.p1?.[0]?.tentativeThrough).toBe("2027-10-03");
    // Before Arrival (Sep 29) through after Arrival (Oct 3) — Arrival stays put.
    const both = setStayTentative(back, "p1", "2027-10-01", {
      start: "2027-09-29",
      through: "2027-10-03",
    });
    expect(both.rotationPlans.p1?.[0]?.from).toBe("2027-10-01");
    expect(both.rotationPlans.p1?.[0]?.tentativeFrom).toBe("2027-09-29");
    expect(both.rotationPlans.p1?.[0]?.tentativeThrough).toBe("2027-10-03");
    // Window start can also sit after Arrival.
    const mid = setStayTentative(both, "p1", "2027-10-01", {
      start: "2027-10-02",
      through: "2027-10-05",
    });
    expect(mid.rotationPlans.p1?.[0]?.from).toBe("2027-10-01");
    expect(mid.rotationPlans.p1?.[0]?.tentativeFrom).toBe("2027-10-02");
    expect(mid.rotationPlans.p1?.[0]?.tentativeThrough).toBe("2027-10-05");
  });

  it("confirmStayArrival locks IN and clears tentative window", () => {
    const placed = addNextRotation(emptyRoster(), "p1", {
      site: "IQA",
      from: "2026-12-01",
      out: "2026-12-20",
      tentative: true,
      tentativeThrough: "2026-12-04",
    });
    const confirmed = confirmStayArrival(placed, "p1", "2026-12-01", "2026-12-03");
    expect(confirmed.rotationPlans.p1?.[0]?.from).toBe("2026-12-03");
    expect(confirmed.rotationPlans.p1?.[0]?.tentative).toBeUndefined();
    expect(confirmed.rotationPlans.p1?.[0]?.tentativeThrough).toBeUndefined();
  });

  it("setStayIn keeps the same placement (idFrom) when dragging the IN edge", () => {
    const placed = addNextRotation(emptyRoster(), "p1", {
      site: "IQA",
      from: "2026-11-01",
      out: "2026-12-13",
    });
    const moved = setStayIn(placed, "p1", "2026-11-01", "2026-11-05");
    expect(moved.rotationPlans.p1).toHaveLength(1);
    expect(moved.rotationPlans.p1?.[0]?.from).toBe("2026-11-05");
    expect(moved.rotationPlans.p1?.[0]?.idFrom).toBe("2026-11-01");
    expect(moved.rotationPlans.p1?.[0]?.out).toBe("2026-12-13");
    const again = setStayIn(moved, "p1", "2026-11-05", "2026-10-28");
    expect(again.rotationPlans.p1).toHaveLength(1);
    expect(again.rotationPlans.p1?.[0]?.from).toBe("2026-10-28");
    expect(again.rotationPlans.p1?.[0]?.idFrom).toBe("2026-11-01");
  });

  it("clearStayPlacement removes an app stay", () => {
    const placed = addNextRotation(emptyRoster(), "p1", {
      site: "IQA",
      from: "2026-11-01",
      out: "2026-12-13",
    });
    const planId = placed.rotationPlans.p1?.[0]?.id;
    const cleared = clearStayPlacement(placed, "p1", "2026-11-01", planId);
    expect(cleared.rotationPlans.p1 ?? []).toHaveLength(0);
  });

  it("clearStayPlacement removes duplicate plans on the same IN", () => {
    let roster = emptyRoster();
    for (let i = 0; i < 4; i += 1) {
      const existing = roster.rotationPlans.p1 ?? [];
      roster = {
        ...roster,
        rotationPlans: {
          ...roster.rotationPlans,
          p1: [
            ...existing,
            {
              id: `rot-p1-2027-01-01-${i}`,
              site: "IQA",
              from: "2027-01-01",
              out: "2027-01-02",
              role: "Manager",
            },
          ],
        },
      };
    }
    expect(roster.rotationPlans.p1).toHaveLength(4);
    const cleared = clearStayPlacement(roster, "p1", "2027-01-01", roster.rotationPlans.p1![0]!.id);
    expect(cleared.rotationPlans.p1 ?? []).toHaveLength(0);
  });

  it("addNextRotation replaces an overlapping plan instead of stacking", () => {
    const first = addNextRotation(emptyRoster(), "p1", {
      site: "IQA",
      from: "2027-01-01",
      out: "2027-01-02",
    });
    const second = addNextRotation(first, "p1", {
      site: "IQA",
      from: "2027-01-01",
      out: "2027-01-02",
    });
    expect(second.rotationPlans.p1).toHaveLength(1);
  });

  it("addNextRotation keeps a stay that crosses New Year (Nov → March)", () => {
    const roster = addNextRotation(emptyRoster(), "p1", {
      site: "IQA",
      from: "2026-11-30",
      out: "2027-03-15",
    });
    const plan = roster.rotationPlans.p1?.[0];
    expect(plan?.from).toBe("2026-11-30");
    expect(plan?.out).toBe("2027-03-15");
    const people = mergePeople(
      [
        {
          id: "p1",
          name: "Maegan",
          role: "Labourer",
          roles: ["Labourer"],
          homeSites: ["IQA"],
          projectIds: [],
          inDate: null,
          outDate: null,
          rotationDays: 42,
          events: [],
          stints: [],
        },
      ] as never[],
      roster,
    );
    const person = people[0]!;
    expect(siteOnDay(person, "2026-12-31")).toBe("IQA");
    expect(siteOnDay(person, "2027-01-01")).toBe("IQA");
    expect(siteOnDay(person, "2027-03-14")).toBe("IQA");
    expect(siteOnDay(person, "2027-03-15")).toBe(null);
  });

  it("clearStayPlacement collapses a sheet stay even after IN was dragged", () => {
    const sheetFrom = "2026-11-23";
    const key = stintOverrideKey("eric", sheetFrom);
    const roster = {
      ...emptyRoster(),
      stintInOverrides: { [key]: "2026-11-25" },
      stintOutOverrides: { [key]: "2027-01-04" },
    };
    const cleared = clearStayPlacement(roster, "eric", "2026-11-25");
    expect(cleared.stintInOverrides?.[key]).toBeUndefined();
    expect(cleared.stintOutOverrides?.[key]).toBe(sheetFrom);
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
