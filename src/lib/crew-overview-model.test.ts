import { describe, expect, it } from "vitest";
import {
  ASSUMED_BOOKED_BEFORE,
  BOOK_BEFORE_ARRIVAL_DAYS,
  buildOverview,
  buildWeekStory,
  isAssumedBookedDone,
  tentativeConfirmItems,
} from "@/lib/crew-overview-model";
import { emptyTravel, type CrewRotation, type RotationBook } from "@/lib/crew-rotations";
import type { CrewPerson, CrewSnapshot } from "@/lib/crew-schedule";

function person(partial: Partial<CrewPerson> & Pick<CrewPerson, "id" | "name">): CrewPerson {
  return {
    role: "Labourer",
    roles: ["Labourer"],
    homeSites: [],
    projectIds: [],
    inDate: null,
    outDate: null,
    rotationDays: null,
    active: true,
    stints: [],
    events: [],
    flights: [],
    ...partial,
  };
}

function snap(p: CrewPerson, extra: Partial<CrewSnapshot> = {}): CrewSnapshot {
  return {
    person: p,
    site: null,
    duty: "off_rotation",
    mark: null,
    plannedIn: null,
    plannedOut: null,
    actualIn: null,
    actualOut: null,
    expectedOut: null,
    arrivedOn: null,
    rotationDay: null,
    rotationDays: 42,
    daysOnSite: null,
    daysAway: null,
    weeksAway: null,
    daysUntilOut: null,
    overdue: false,
    dueSoon: false,
    fourWeeksOut: false,
    alerts: [],
    outSource: null,
    tentative: false,
    ...extra,
  };
}

function rotation(partial: Partial<CrewRotation> & Pick<CrewRotation, "id" | "personId" | "plannedIn" | "plannedOut">): CrewRotation {
  return {
    role: "Labourer",
    site: "IQA",
    actualIn: null,
    actualOut: null,
    actualInTime: "",
    actualOutTime: "",
    rotationDays: 42,
    outbound: emptyTravel("outbound"),
    returnTravel: emptyTravel("return"),
    stay: { site: "IQA", room: "", checkIn: null, checkOut: null, confirmed: false, document: null, notes: "" },
    replacesRotationId: null,
    replacedByRotationId: null,
    replacementNeeded: true,
    handoverFrom: null,
    handoverTo: null,
    notes: "",
    source: "app",
    moves: [],
    ...partial,
  };
}

describe("assumed booked cutoff", () => {
  it("treats dates before Oct 15 as done", () => {
    expect(isAssumedBookedDone("2026-10-14")).toBe(true);
    expect(isAssumedBookedDone(ASSUMED_BOOKED_BEFORE)).toBe(false);
    expect(isAssumedBookedDone("2026-10-16")).toBe(false);
    expect(BOOK_BEFORE_ARRIVAL_DAYS).toBe(14);
  });

  it("drops pre–Oct 15 stays from To do", () => {
    const book: RotationBook = {
      version: 1,
      rotations: [rotation({ id: "old", personId: "p1", plannedIn: "2026-09-01", plannedOut: "2026-10-10" })],
    };
    const data = buildOverview({
      rows: [snap(person({ id: "p1", name: "Old Stay" }))],
      book,
      asOf: "2026-11-20",
      horizonDays: 30,
      thresholds: { planDays: 14, returnBookDay: 28, escalateDays: 3 },
    });
    expect(data.groups.every((g) => g.items.length === 0)).toBe(true);
  });
});

describe("week story", () => {
  it("does not invent Excel move lines", () => {
    const story = buildWeekStory({
      rows: [
        snap(
          person({
            id: "eric",
            name: "Eric Jacobsen",
            role: "Manager",
            roles: ["Manager"],
            events: [
              { date: "2026-11-16", mark: "IQA" },
              { date: "2026-11-16", mark: "YOW" },
            ],
          }),
        ),
      ],
      book: { version: 1, rotations: [] },
      asOf: "2026-11-16",
    });
    expect(story.lines.some((line) => line.text.includes("moves"))).toBe(false);
  });

  it("uses the calendar stay for leave site/date, not a stale travel-desk POND", () => {
    const story = buildWeekStory({
      rows: [
        snap(
          person({
            id: "mike-reid-mechanic",
            name: "Mike Reid",
            role: "Mechanic",
            roles: ["Mechanic"],
            stints: [
              {
                site: "IQA",
                sites: ["IQA"],
                from: "2026-11-09",
                out: "2026-12-21",
                arrival: "marked",
                departure: "marked",
                tentative: false,
              },
            ],
          }),
        ),
      ],
      book: {
        version: 1,
        rotations: [
          rotation({
            id: "mike-stale",
            personId: "mike-reid-mechanic",
            plannedIn: "2026-11-09",
            plannedOut: "2026-11-24",
            site: "POND",
          }),
        ],
      },
      asOf: "2026-11-23",
    });
    const leave = story.lines.find((line) => line.kind === "leaving" && line.personId === "mike-reid-mechanic");
    expect(leave).toBeUndefined();
    expect(story.lines.some((line) => /leaves POND/i.test(line.text))).toBe(false);
  });

  it("does not invent a POND leave from a desk rotation that does not match any calendar stay", () => {
    const mike = person({
      id: "mike-reid-mechanic",
      name: "Mike Reid",
      role: "Mechanic",
      roles: ["Mechanic"],
      stints: [
        {
          site: "IQA",
          sites: ["IQA"],
          from: "2026-11-09",
          out: "2026-12-21",
          arrival: "marked",
          departure: "marked",
          tentative: false,
          segments: [{ from: "2026-11-09", out: "2026-12-21", kind: "site", site: "IQA" }],
        },
      ],
      events: [{ date: "2026-11-09", mark: "IQA" }],
    });
    const story = buildWeekStory({
      rows: [snap(mike, { site: "IQA", duty: "on_site", mark: "IQA" })],
      book: {
        version: 1,
        rotations: [
          rotation({
            id: "mike-orphan-pond",
            personId: "mike-reid-mechanic",
            plannedIn: "2026-08-04",
            plannedOut: "2026-11-24",
            site: "POND",
          }),
        ],
      },
      asOf: "2026-11-23",
    });
    expect(story.lines.some((line) => /POND/i.test(line.text))).toBe(false);
    expect(story.lines.some((line) => /at IQA/i.test(line.text))).toBe(true);
  });
});

describe("buildOverview live site", () => {
  it("shows Mike on IQA from the calendar, not a stale desk POND", () => {
    const mike = person({
      id: "mike-reid-mechanic",
      name: "Mike Reid",
      role: "Mechanic",
      roles: ["Mechanic"],
      stints: [
        {
          site: "IQA",
          sites: ["IQA"],
          from: "2026-11-09",
          out: "2026-12-21",
          arrival: "marked",
          departure: "marked",
          tentative: false,
          segments: [{ from: "2026-11-09", out: "2026-12-21", kind: "site", site: "IQA" }],
        },
      ],
    });
    const data = buildOverview({
      rows: [snap(mike, { site: "POND", duty: "on_site", mark: "POND" })],
      book: {
        version: 1,
        rotations: [
          rotation({
            id: "mike-desk",
            personId: "mike-reid-mechanic",
            plannedIn: "2026-08-04",
            plannedOut: "2026-11-24",
            site: "POND",
          }),
        ],
      },
      asOf: "2026-11-23",
      horizonDays: 30,
      thresholds: { planDays: 14, returnBookDay: 28, escalateDays: 3 },
    });
    expect(data.onSite).toEqual([expect.objectContaining({ personId: "mike-reid-mechanic", site: "IQA" })]);
    expect(data.leaving.some((row) => /POND/i.test(row.site || ""))).toBe(false);
  });
});

describe("tentative confirm", () => {
  it("lists tentative arrivals for confirm", () => {
    const items = tentativeConfirmItems(
      [
        snap(
          person({
            id: "p2",
            name: "Pat Tentative",
            stints: [
              {
                from: "2026-12-01",
                out: "2026-12-20",
                site: "IQA",
                sites: ["IQA"],
                arrival: "2026-12-01",
                departure: null,
                tentative: true,
                tentativeThrough: "2026-12-03",
              },
            ],
          }),
        ),
      ],
      { version: 1, rotations: [] },
      "2026-11-20",
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toContain("Confirm arrival");
    expect(items[0]!.title).toMatch(/–/);
    expect(items[0]!.id).toBe("p2:tentative:2026-12-01");
    expect(items[0]!.detail).toContain("book by");
  });

  it("lists sheet unsure IN? dates as preliminary arrivals", () => {
    const items = tentativeConfirmItems(
      [
        snap(
          person({
            id: "p3",
            name: "Unsure Pat",
            stints: [
              {
                from: "2026-12-10",
                out: "2026-12-24",
                site: "KUG",
                sites: ["KUG"],
                arrival: "2026-12-10",
                departure: null,
                tentative: false,
                unsure: true,
              },
            ],
          }),
        ),
      ],
      { version: 1, rotations: [] },
      "2026-11-20",
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("p3:tentative:2026-12-10");
  });
});
