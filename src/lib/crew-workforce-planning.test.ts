import { describe, expect, it } from "vitest";
import {
  crewForWeek,
  emptyPlanningBook,
  ensureYearSeeded,
  mondayOf,
  mondaysOverlapping,
  neededForWeek,
  personWeeksForYear,
  projectsForYear,
  readPlanningBook,
} from "@/lib/crew-workforce-planning";

describe("crew-workforce-planning", () => {
  it("seeds 2027 once only and never overwrites a non-empty year", () => {
    const first = ensureYearSeeded(emptyPlanningBook(), 2027);
    expect(first.seeded).toBe(true);
    expect(projectsForYear(first.book, 2027).length).toBeGreaterThan(10);

    const second = ensureYearSeeded(first.book, 2027);
    expect(second.seeded).toBe(false);
    expect(second.book.projects.length).toBe(first.book.projects.length);

    const edited = {
      projects: first.book.projects.map((row, index) =>
        index === 0 ? { ...row, name: "Renamed WTP" } : row,
      ),
    };
    const again = ensureYearSeeded(edited, 2027);
    expect(again.seeded).toBe(false);
    expect(again.book.projects[0]?.name).toBe("Renamed WTP");
  });

  it("does not seed years other than 2027 when empty", () => {
    const result = ensureYearSeeded(emptyPlanningBook(), 2026);
    expect(result.seeded).toBe(false);
    expect(result.book.projects).toEqual([]);
  });

  it("expands phases onto Monday weeks", () => {
    expect(mondayOf("2027-06-14")).toBe("2027-06-14");
    expect(mondayOf("2027-06-16")).toBe("2027-06-14");
    expect(mondaysOverlapping("2027-06-07", "2027-06-20")).toEqual([
      "2027-06-07",
      "2027-06-14",
    ]);
  });

  it("excludes Lost and Early-stage from totals; pending stacks separately", () => {
    const { book } = ensureYearSeeded(emptyPlanningBook(), 2027);
    const projects = projectsForYear(book, 2027);
    const week = "2027-06-14";
    const contracted = neededForWeek(projects, week, "contracted");
    const withPending = neededForWeek(projects, week, "contracted_pending");
    const lost = projects.find((row) => row.status === "Lost")!;
    expect(crewForWeek(lost, "2027-05-03")).toBe(6);
    expect(contracted).toBe(22);
    expect(withPending).toBe(32);
  });

  it("14 Jun 2027 is 22 contracted and +10 pending", () => {
    const { book } = ensureYearSeeded(emptyPlanningBook(), 2027);
    const projects = projectsForYear(book, 2027);
    expect(neededForWeek(projects, "2027-06-14", "contracted")).toBe(22);
    expect(neededForWeek(projects, "2027-06-14", "contracted_pending")).toBe(32);
  });

  it("matches Contracted 416 and Pending 130 person-weeks", () => {
    const { book } = ensureYearSeeded(emptyPlanningBook(), 2027);
    const projects = projectsForYear(book, 2027);
    const contracted = personWeeksForYear(projects, 2027, "contracted");
    const withPending = personWeeksForYear(projects, 2027, "contracted_pending");
    expect(contracted).toBe(416);
    expect(withPending - contracted).toBe(130);
  });

  it("readPlanningBook ignores bad rows", () => {
    const book = readPlanningBook({
      projects: [
        { id: "ok", year: 2027, name: "A", site: "Iqaluit", workType: "Civil", status: "Contracted", phases: [], notes: "" },
        { id: 1, name: "bad" },
        null,
      ],
    });
    expect(book.projects).toHaveLength(1);
    expect(book.projects[0]?.name).toBe("A");
  });
});
