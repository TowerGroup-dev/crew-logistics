import { describe, expect, it } from "vitest";
import {
  crewClashWeeks,
  ensureYearSeeded,
  emptyPlanningBook,
  projectPeakCrew,
  projectsForYear,
  readPlanningBook,
} from "@/lib/crew-workforce-planning";
import { daysAtSite, firstNameOf } from "@/lib/crew-planning-history";

describe("overlook crew", () => {
  const projects = projectsForYear(ensureYearSeeded(emptyPlanningBook(), 2027).book, 2027);
  const byName = (name: string) => projects.find((row) => row.name === name)!;

  it("seeded projects start with no crew", () => {
    expect(projects.every((row) => Array.isArray(row.crew) && row.crew.length === 0)).toBe(true);
  });

  it("peak crew is the most people in any phase", () => {
    expect(projectPeakCrew(byName("WTP - Civil"))).toBe(12);
    expect(projectPeakCrew(byName("Steam - Phase B"))).toBe(0);
  });

  it("reads crew, drops bad and duplicate rows", () => {
    const book = readPlanningBook({
      projects: [
        {
          id: "x",
          name: "X",
          year: 2027,
          crew: [
            { personId: "a", name: "Ann Lee", role: "Foreman" },
            { personId: "a", name: "Ann Lee", role: "Operator" },
            { name: "no id" },
          ],
        },
      ],
    });
    expect(book.projects[0]!.crew).toEqual([{ personId: "a", name: "Ann Lee", role: "Foreman" }]);
  });

  it("flags a person on two jobs in the same week, ignoring Lost", () => {
    const member = { personId: "p1", name: "Sam", role: "Operator" };
    const wtp = { ...byName("WTP - Civil"), crew: [member] }; // from 7 Jun
    const cctv = { ...byName("CCTV - Civil"), crew: [member] }; // 7 Jun – 11 Jul
    const lost = { ...byName("QEW & Nipisa"), crew: [member] };
    const weeks = ["2027-05-31", "2027-06-07", "2027-07-05", "2027-07-12"];
    expect([...crewClashWeeks([wtp, cctv, lost], "p1", weeks)]).toEqual(["2027-06-07", "2027-07-05"]);
    expect(crewClashWeeks([wtp, lost], "p1", weeks).size).toBe(0);
  });

  it("history helpers", () => {
    expect(firstNameOf("Mike Smith")).toBe("Mike");
    const info = {
      personId: "p",
      name: "Mike",
      firstName: "Mike",
      role: "Operator",
      category: "Regular" as const,
      total: 50,
      bySite: { Iqaluit: 40, "Pond Inlet": 10 },
      usualSite: "Iqaluit",
    };
    expect(daysAtSite(info, "iqaluit")).toBe(40);
    expect(daysAtSite(info, "Alert")).toBe(0);
  });
});

describe("crew order", () => {
  it("managers first, then surveyors, operators, labourers", async () => {
    const { roleRank } = await import("@/lib/crew-planning-history");
    const roles = ["Labourer", "Operator/Truck Driver", "Surveyor", "Manager", "Mechanic"];
    expect([...roles].sort((a, b) => roleRank(a) - roleRank(b))).toEqual([
      "Manager",
      "Surveyor",
      "Mechanic",
      "Operator/Truck Driver",
      "Labourer",
    ]);
  });
});
