/** Per-browser schedule visibility (Month / Year). Not shared across devices. */

const STORAGE_KEY = "tower-arctic-crew-schedule-view-v1";

export type CrewScheduleViewPrefs = {
  version: 1;
  /** Person ids hidden from Month and Year calendars. */
  hiddenPersonIds: string[];
};

export function emptyScheduleViewPrefs(): CrewScheduleViewPrefs {
  return { version: 1, hiddenPersonIds: [] };
}

function readPrefs(raw: unknown): CrewScheduleViewPrefs {
  if (!raw || typeof raw !== "object") return emptyScheduleViewPrefs();
  const data = raw as Record<string, unknown>;
  const ids = Array.isArray(data.hiddenPersonIds)
    ? data.hiddenPersonIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return { version: 1, hiddenPersonIds: [...new Set(ids)] };
}

export function loadScheduleViewPrefs(): CrewScheduleViewPrefs {
  if (typeof window === "undefined") return emptyScheduleViewPrefs();
  try {
    return readPrefs(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return emptyScheduleViewPrefs();
  }
}

export function saveScheduleViewPrefs(prefs: CrewScheduleViewPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function hidePerson(prefs: CrewScheduleViewPrefs, personId: string): CrewScheduleViewPrefs {
  if (prefs.hiddenPersonIds.includes(personId)) return prefs;
  return { ...prefs, hiddenPersonIds: [...prefs.hiddenPersonIds, personId] };
}

export function showPerson(prefs: CrewScheduleViewPrefs, personId: string): CrewScheduleViewPrefs {
  return {
    ...prefs,
    hiddenPersonIds: prefs.hiddenPersonIds.filter((id) => id !== personId),
  };
}

export function showAllPeople(prefs: CrewScheduleViewPrefs): CrewScheduleViewPrefs {
  if (!prefs.hiddenPersonIds.length) return prefs;
  return { ...prefs, hiddenPersonIds: [] };
}
