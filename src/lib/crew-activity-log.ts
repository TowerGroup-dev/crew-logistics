/** Append-only planning / ops activity for monthly reports. */

const STORAGE_KEY = "tower-arctic-crew-activity-log-v1";

export type CrewActivityKind =
  | "role_section_move"
  | "stay_place"
  | "stay_clear"
  | "stay_extend"
  | "stay_role"
  | "employee_edit"
  | "flight_booking"
  | "accommodation"
  | "other";

export type CrewActivityEntry = {
  id: string;
  at: string;
  kind: CrewActivityKind;
  personId?: string;
  personName?: string;
  text: string;
  year?: number;
  month?: number;
};

export type CrewActivityLog = {
  version: 1;
  entries: CrewActivityEntry[];
};

export function emptyActivityLog(): CrewActivityLog {
  return { version: 1, entries: [] };
}

function readLog(raw: unknown): CrewActivityLog {
  if (!raw || typeof raw !== "object") return emptyActivityLog();
  const data = raw as Partial<CrewActivityLog>;
  const entries = Array.isArray(data.entries)
    ? data.entries.filter((row): row is CrewActivityEntry => {
        return Boolean(
          row &&
            typeof row === "object" &&
            typeof (row as CrewActivityEntry).id === "string" &&
            typeof (row as CrewActivityEntry).at === "string" &&
            typeof (row as CrewActivityEntry).text === "string",
        );
      })
    : [];
  return { version: 1, entries };
}

export function loadActivityLog(): CrewActivityLog {
  if (typeof window === "undefined") return emptyActivityLog();
  try {
    return readLog(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return emptyActivityLog();
  }
}

export function saveActivityLog(log: CrewActivityLog) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
}

export function appendActivity(
  log: CrewActivityLog,
  input: Omit<CrewActivityEntry, "id" | "at" | "year" | "month"> & { at?: string },
): CrewActivityLog {
  const at = input.at || new Date().toISOString();
  const d = new Date(at);
  const entry: CrewActivityEntry = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at,
    kind: input.kind,
    personId: input.personId,
    personName: input.personName,
    text: input.text,
    year: d.getFullYear(),
    month: d.getMonth() + 1,
  };
  return {
    version: 1,
    entries: [entry, ...log.entries].slice(0, 2000),
  };
}

export function activitiesForMonth(log: CrewActivityLog, year: number, month: number) {
  return log.entries.filter((row) => row.year === year && row.month === month);
}
