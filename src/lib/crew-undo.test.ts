import { describe, expect, it } from "vitest";
import {
  CREW_UNDO_LIMIT,
  popUndoSnapshot,
  pushUndoSnapshot,
  type CrewScheduleSnapshot,
} from "@/lib/crew-undo";
import { emptyRoster } from "@/lib/crew-roster";
import { emptyFlightBook } from "@/lib/crew-flights";

function snap(label: string): CrewScheduleSnapshot {
  return {
    opsBook: {},
    roster: { ...emptyRoster(), employees: [] },
    rotationBook: { version: 1, rotations: [] },
    flightBook: emptyFlightBook(),
    stopoverBook: { [label]: {} },
  };
}

/** NAV-09 — Excel-style undo stack helpers. */
describe("crew-undo stack", () => {
  it("NAV-09 pushUndoSnapshot clones and caps at limit", () => {
    let stack: CrewScheduleSnapshot[] = [];
    for (let i = 0; i < CREW_UNDO_LIMIT + 3; i += 1) {
      stack = pushUndoSnapshot(stack, snap(`s${i}`), CREW_UNDO_LIMIT);
    }
    expect(stack).toHaveLength(CREW_UNDO_LIMIT);
    expect(Object.keys(stack[0]!.stopoverBook)[0]).toBe("s3");
    expect(Object.keys(stack[stack.length - 1]!.stopoverBook)[0]).toBe(
      `s${CREW_UNDO_LIMIT + 2}`,
    );
  });

  it("NAV-09 popUndoSnapshot restores the latest entry", () => {
    let stack = pushUndoSnapshot([], snap("a"));
    stack = pushUndoSnapshot(stack, snap("b"));
    const popped = popUndoSnapshot(stack);
    expect(popped).not.toBeNull();
    expect(Object.keys(popped!.snapshot.stopoverBook)[0]).toBe("b");
    expect(popped!.stack).toHaveLength(1);
    expect(popUndoSnapshot([])).toBeNull();
  });
});
