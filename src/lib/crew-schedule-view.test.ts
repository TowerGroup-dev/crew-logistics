import { describe, expect, it } from "vitest";
import {
  addPersonUnderRole,
  emptyScheduleViewPrefs,
  membershipsForPerson,
  resetPersonRoleSections,
} from "@/lib/crew-schedule-view";
import { roleRowKey } from "@/lib/crew-role-sections";

describe("crew-schedule-view role sections", () => {
  it("resetPersonRoleSections drops extras and hide keys for that person only", () => {
    const prefs = {
      ...emptyScheduleViewPrefs(),
      roleMemberships: {
        william: ["Surveyor", "Manager"],
        other: ["Operator"],
      },
      hiddenRoleRowKeys: [
        roleRowKey("william", "Surveyor"),
        roleRowKey("other", "Labourer"),
      ],
      hiddenPersonIds: ["william", "other"],
    };

    const next = resetPersonRoleSections(prefs, "william");
    expect(next.roleMemberships?.william).toBeUndefined();
    expect(next.roleMemberships?.other).toEqual(["Operator"]);
    expect(next.hiddenRoleRowKeys).toEqual([roleRowKey("other", "Labourer")]);
    expect(next.hiddenPersonIds).toEqual(["other"]);
    expect(membershipsForPerson(next, "william", "Manager")).toEqual(["Manager"]);
  });

  it("addPersonUnderRole moves the calendar row only, home role untouched", () => {
    const prefs = {
      ...emptyScheduleViewPrefs(),
      roleMemberships: { william: ["Surveyor", "Manager"] },
      hiddenRoleRowKeys: [roleRowKey("william", "Surveyor")],
    };

    const next = addPersonUnderRole(prefs, "william", "Surveyor", "Operator");
    expect(next.roleMemberships?.william).toBeUndefined();
    expect(next.hiddenRoleRowKeys).toEqual([]);
    // Home role is still Surveyor (roster unchanged); calendar shows one row under Operator.
    expect(membershipsForPerson(next, "william", "Surveyor")).toEqual(["Operator"]);
  });

  it("addPersonUnderRole back to the home role clears the calendar section", () => {
    const moved = addPersonUnderRole(emptyScheduleViewPrefs(), "william", "Surveyor", "Operator");
    const back = addPersonUnderRole(moved, "william", "Surveyor", "Surveyor");
    expect(back.calendarSections?.william).toBeUndefined();
    expect(membershipsForPerson(back, "william", "Surveyor")).toEqual(["Surveyor"]);
  });

  it("resetPersonRoleSections drops the calendar section too", () => {
    const moved = addPersonUnderRole(emptyScheduleViewPrefs(), "william", "Surveyor", "Operator");
    const reset = resetPersonRoleSections(moved, "william");
    expect(membershipsForPerson(reset, "william", "Surveyor")).toEqual(["Surveyor"]);
  });

  it("membershipsForPerson ignores legacy multi-section extras (no duplicates)", () => {
    const prefs = {
      ...emptyScheduleViewPrefs(),
      roleMemberships: { william: ["Surveyor", "Manager"] },
    };
    expect(membershipsForPerson(prefs, "william", "Manager")).toEqual(["Manager"]);
  });
});
