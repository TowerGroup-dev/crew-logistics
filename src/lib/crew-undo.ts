import type { CrewOpsBook } from "@/lib/crew-ops";
import type { CrewRosterBook } from "@/lib/crew-roster";
import type { RotationBook } from "@/lib/crew-rotations";
import type { FlightBook } from "@/lib/crew-flights";
import type { CrewStopoverBook } from "@/lib/crew-stopovers";

/** Snapshot of schedule books that can roll back like Excel Undo. */
export type CrewScheduleSnapshot = {
  opsBook: CrewOpsBook;
  roster: CrewRosterBook;
  rotationBook: RotationBook;
  flightBook: FlightBook;
  stopoverBook: CrewStopoverBook;
};

export const CREW_UNDO_LIMIT = 50;

export function cloneScheduleSnapshot(snapshot: CrewScheduleSnapshot): CrewScheduleSnapshot {
  return structuredClone(snapshot);
}

/** Push a snapshot onto the undo stack (NAV-09), capped at CREW_UNDO_LIMIT. */
export function pushUndoSnapshot(
  stack: CrewScheduleSnapshot[],
  snapshot: CrewScheduleSnapshot,
  limit = CREW_UNDO_LIMIT,
): CrewScheduleSnapshot[] {
  return [...stack, cloneScheduleSnapshot(snapshot)].slice(-Math.max(1, limit));
}

/** Pop the latest snapshot for restore, or null when empty. */
export function popUndoSnapshot(
  stack: CrewScheduleSnapshot[],
): { stack: CrewScheduleSnapshot[]; snapshot: CrewScheduleSnapshot } | null {
  if (!stack.length) return null;
  const snapshot = stack[stack.length - 1]!;
  return { stack: stack.slice(0, -1), snapshot };
}
