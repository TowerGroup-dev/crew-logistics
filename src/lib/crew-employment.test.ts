import { describe, expect, it } from "vitest";
import {
  addProvisionalEmployee,
  emptyRoster,
  employmentStatusFor,
  employmentStatusLabel,
  isInactiveEmployment,
  mergePeople,
  normalizeEmploymentStatus,
  removePerson,
  setEmploymentStatus,
  setStayNote,
} from "@/lib/crew-roster";
import type { CrewPerson } from "@/lib/crew-schedule";

describe("employment status", () => {
  it("normalizes legacy inactive to pause", () => {
    expect(normalizeEmploymentStatus("inactive")).toBe("pause");
    expect(normalizeEmploymentStatus("pause")).toBe("pause");
    expect(normalizeEmploymentStatus("terminated")).toBe("terminated");
    expect(normalizeEmploymentStatus("resignation")).toBe("resignation");
    expect(normalizeEmploymentStatus("retirement")).toBe("retirement");
    expect(normalizeEmploymentStatus("active")).toBe("active");
    expect(normalizeEmploymentStatus("nope")).toBeNull();
  });

  it("labels Pause / EOE reasons for the Employees See more UI", () => {
    expect(employmentStatusLabel("inactive")).toBe("Pause");
    expect(employmentStatusLabel("pause")).toBe("Pause");
    expect(employmentStatusLabel("terminated")).toBe("Terminated");
    expect(employmentStatusLabel("resignation")).toBe("Resignation");
    expect(employmentStatusLabel("retirement")).toBe("Retirement");
    expect(employmentStatusLabel("active")).toBe("Active");
    expect(isInactiveEmployment("pause")).toBe(true);
    expect(isInactiveEmployment("active")).toBe(false);
  });

  it("setEmploymentStatus round-trips Pause and EOE on the roster", () => {
    const created = addProvisionalEmployee(emptyRoster(), { name: "Pat", role: "Labourer" })!;
    const paused = setEmploymentStatus(created.roster, created.personId, "pause");
    expect(employmentStatusFor(paused, created.personId)).toBe("pause");
    expect(paused.employees[0]!.employmentStatus).toBe("pause");

    const eoe = setEmploymentStatus(paused, created.personId, "resignation");
    expect(employmentStatusFor(eoe, created.personId)).toBe("resignation");
  });
});

describe("removePerson", () => {
  it("marks the person removed and strips notes/plans so mergePeople hides them", () => {
    const created = addProvisionalEmployee(emptyRoster(), { name: "Alex", role: "Labourer" })!;
    let roster = created.roster;
    roster = setEmploymentStatus(roster, created.personId, "terminated");
    roster = setStayNote(roster, created.personId, "2026-06-01", "2026-07-13", "gone");

    const sheet: CrewPerson = {
      id: "sheet-dean",
      name: "Dean",
      role: "Foreman",
      roles: ["Foreman"],
      homeSites: ["IQA"],
      projectIds: [],
      inDate: null,
      outDate: null,
      rotationDays: 42,
      events: [],
      stints: [{ site: "IQA", from: "2026-06-01", out: "2026-07-13" }],
      active: true,
    };

    const withSheetGone = removePerson(
      { ...roster, employmentStatus: { ...roster.employmentStatus, "sheet-dean": "pause" } },
      "sheet-dean",
    );
    expect(withSheetGone.removedPersonIds?.["sheet-dean"]).toBe(true);

    const cleared = removePerson(withSheetGone, created.personId);
    expect(cleared.employees.find((row) => row.id === created.personId)).toBeUndefined();
    expect(cleared.removedPersonIds?.[created.personId]).toBe(true);
    expect(cleared.employmentStatus[created.personId]).toBeUndefined();
    expect(Object.keys(cleared.stayNotes).some((key) => key.startsWith(`${created.personId}:`))).toBe(
      false,
    );

    const people = mergePeople([sheet], cleared);
    expect(people.find((row) => row.id === "sheet-dean")).toBeUndefined();
    expect(people.find((row) => row.id === created.personId)).toBeUndefined();
  });
});
