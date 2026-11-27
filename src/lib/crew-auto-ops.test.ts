import { describe, expect, it } from "vitest";
import { autoSeedTravelOps } from "@/lib/crew-auto-ops";
import { emptyCrewOps, type CrewOpsBook } from "@/lib/crew-ops";
import type { CrewPerson } from "@/lib/crew-schedule";

function personWithStay(out: string | null): CrewPerson {
  return {
    id: "p1",
    name: "Test",
    role: "Labourer",
    roles: ["Labourer"],
    inDate: null,
    outDate: null,
    rotationDays: null,
    homeSites: ["IQA"],
    projectIds: [],
    events: [],
    stints: [{ from: "2026-10-01", out, site: "IQA", sites: ["IQA"], arrival: "2026-10-01", departure: out, tentative: false }],
    active: true,
  };
}

describe("autoSeedTravelOps", () => {
  it("does not restore a return window the user cleared", () => {
    const people = [personWithStay("2026-12-01")];
    const ops: CrewOpsBook = {
      p1: {
        ...emptyCrewOps("p1"),
        returnBookFrom: null,
        returnBookTo: null,
        returnWindowPainted: false,
        returnWindowCleared: true,
      },
    };
    const next = autoSeedTravelOps(people, ops, "2026-11-01");
    expect(next.p1?.returnBookFrom).toBeNull();
    expect(next.p1?.returnBookTo).toBeNull();
  });

  it("still seeds a return window when never cleared", () => {
    const people = [personWithStay("2026-12-01")];
    const ops: CrewOpsBook = { p1: emptyCrewOps("p1") };
    const next = autoSeedTravelOps(people, ops, "2026-11-01");
    // plannedOut is inclusive last day (stint.out exclusive → day before).
    expect(next.p1?.returnBookTo).toBe("2026-11-30");
    expect(next.p1?.returnBookFrom).toBeTruthy();
  });
});
