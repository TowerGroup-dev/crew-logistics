/** Per-browser schedule visibility (Month / Year). Not shared across devices. */

import { normalizeRole } from "@/lib/crew-schedule";
import { parseRoleRowKey, roleRowKey } from "@/lib/crew-role-sections";

const STORAGE_KEY = "tower-arctic-crew-schedule-view-v1";

export type CalendarInteractionMode = "view" | "edit";

export type CrewScheduleViewPrefs = {
  version: 1;
  /** Person ids fully hidden from Month and Year calendars. */
  hiddenPersonIds: string[];
  /**
   * Extra / override role sections a person appears under on Month/Year.
   * Missing → home person.role only.
   */
  roleMemberships?: Record<string, string[]>;
  /**
   * Calendar-only section a person is shown under on Month/Year (set by "+ add under
   * role"). Never changes their home role, so the Employees page keeps the real role.
   * Missing → home person.role.
   */
  calendarSections?: Record<string, string>;
  /** Hidden role-rows: `${personId}::${normalizedRole}`. */
  hiddenRoleRowKeys?: string[];
  /**
   * Month calendar interaction.
   * view = scroll / tap to open only (no drag-place, avoids phone wobble).
   * edit = paint / extend / return-window gestures.
   */
  calendarMode?: CalendarInteractionMode;
};

export function emptyScheduleViewPrefs(): CrewScheduleViewPrefs {
  return {
    version: 1,
    hiddenPersonIds: [],
    roleMemberships: {},
    calendarSections: {},
    hiddenRoleRowKeys: [],
    calendarMode: "view",
  };
}

function readPrefs(raw: unknown): CrewScheduleViewPrefs {
  if (!raw || typeof raw !== "object") return emptyScheduleViewPrefs();
  const data = raw as Record<string, unknown>;
  const ids = Array.isArray(data.hiddenPersonIds)
    ? data.hiddenPersonIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  // The calendar always opens in View (no accidental edits); Edit lasts until the page is reloaded.
  const calendarMode: CalendarInteractionMode = "view";
  const roleMemberships: Record<string, string[]> = {};
  if (data.roleMemberships && typeof data.roleMemberships === "object") {
    for (const [personId, roles] of Object.entries(data.roleMemberships as Record<string, unknown>)) {
      if (!Array.isArray(roles)) continue;
      const cleaned = roles
        .filter((role): role is string => typeof role === "string" && role.trim().length > 0)
        .map((role) => normalizeRole(role));
      if (cleaned.length) roleMemberships[personId] = [...new Set(cleaned)];
    }
  }
  const calendarSections: Record<string, string> = {};
  if (data.calendarSections && typeof data.calendarSections === "object") {
    for (const [personId, role] of Object.entries(data.calendarSections as Record<string, unknown>)) {
      if (typeof role === "string" && role.trim()) calendarSections[personId] = normalizeRole(role);
    }
  }
  const hiddenRoleRowKeys = Array.isArray(data.hiddenRoleRowKeys)
    ? data.hiddenRoleRowKeys.filter((key): key is string => typeof key === "string" && key.includes("::"))
    : [];
  return {
    version: 1,
    hiddenPersonIds: [...new Set(ids)],
    roleMemberships,
    calendarSections,
    hiddenRoleRowKeys: [...new Set(hiddenRoleRowKeys)],
    calendarMode,
  };
}

export function setCalendarMode(
  prefs: CrewScheduleViewPrefs,
  calendarMode: CalendarInteractionMode,
): CrewScheduleViewPrefs {
  if (prefs.calendarMode === calendarMode) return prefs;
  return { ...prefs, calendarMode };
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
  if (!prefs.hiddenPersonIds.length && !(prefs.hiddenRoleRowKeys?.length)) return prefs;
  return { ...prefs, hiddenPersonIds: [], hiddenRoleRowKeys: [] };
}

/**
 * Calendar section for a person: the calendar-only section if one was set,
 * otherwise their home role. Always exactly one row (no duplicates).
 * Extra roleMemberships are legacy and no longer expand rows.
 */
export function membershipsForPerson(
  prefs: CrewScheduleViewPrefs,
  personId: string,
  homeRole: string,
): string[] {
  return [normalizeRole(prefs.calendarSections?.[personId] || homeRole)];
}

function withCalendarSection(
  sections: Record<string, string> | undefined,
  personId: string,
  target: string,
  homeRole: string,
): Record<string, string> {
  const next = { ...(sections ?? {}) };
  const role = normalizeRole(target);
  if (!role || role === normalizeRole(homeRole)) delete next[personId];
  else next[personId] = role;
  return next;
}

/** Drop calendar section extras/hides so the person sits under home role only. */
export function resetPersonRoleSections(
  prefs: CrewScheduleViewPrefs,
  personId: string,
): CrewScheduleViewPrefs {
  const roleMemberships = { ...(prefs.roleMemberships ?? {}) };
  delete roleMemberships[personId];
  const calendarSections = { ...(prefs.calendarSections ?? {}) };
  delete calendarSections[personId];
  const hiddenRoleRowKeys = (prefs.hiddenRoleRowKeys ?? []).filter(
    (key) => parseRoleRowKey(key)?.personId !== personId,
  );
  const hiddenPersonIds = prefs.hiddenPersonIds.filter((id) => id !== personId);
  if (
    !(personId in (prefs.roleMemberships ?? {})) &&
    !(personId in (prefs.calendarSections ?? {})) &&
    hiddenRoleRowKeys.length === (prefs.hiddenRoleRowKeys ?? []).length &&
    hiddenPersonIds.length === prefs.hiddenPersonIds.length
  ) {
    return prefs;
  }
  return { ...prefs, roleMemberships, calendarSections, hiddenRoleRowKeys, hiddenPersonIds };
}

export function isRoleRowHidden(prefs: CrewScheduleViewPrefs, personId: string, role: string) {
  if (prefs.hiddenPersonIds.includes(personId)) return true;
  const key = roleRowKey(personId, role);
  return (prefs.hiddenRoleRowKeys ?? []).includes(key);
}

/**
 * Move person under a role section with no leftover duplicates.
 * Caller must also set roster home role to `targetRole` so the calendar
 * expands only that section via {@link membershipsForPerson}.
 */
/** Show a person under another role section on the calendar only (home role untouched). */
export function addPersonUnderRole(
  prefs: CrewScheduleViewPrefs,
  personId: string,
  homeRole: string,
  targetRole: string,
): CrewScheduleViewPrefs {
  const cleared = resetPersonRoleSections(prefs, personId);
  const calendarSections = withCalendarSection(cleared.calendarSections, personId, targetRole, homeRole);
  return { ...cleared, calendarSections };
}

/**
 * Unhide a role-row: move person back under that role (leave other sections hidden).
 */
export function unhideRoleRow(
  prefs: CrewScheduleViewPrefs,
  personId: string,
  role: string,
  homeRole: string,
): CrewScheduleViewPrefs {
  const target = normalizeRole(role);
  const home = normalizeRole(homeRole);
  const roleMemberships = {
    ...(prefs.roleMemberships ?? {}),
    [personId]: target === home ? [home] : [...new Set([home, target])],
  };
  const hidden = new Set(prefs.hiddenRoleRowKeys ?? []);
  for (const key of [...hidden]) {
    const parsed = parseRoleRowKey(key);
    if (parsed?.personId === personId) hidden.delete(key);
  }
  for (const membership of roleMemberships[personId]!) {
    if (membership !== target) hidden.add(roleRowKey(personId, membership));
  }
  hidden.delete(roleRowKey(personId, target));
  return {
    ...prefs,
    hiddenPersonIds: prefs.hiddenPersonIds.filter((id) => id !== personId),
    calendarSections: withCalendarSection(prefs.calendarSections, personId, target, homeRole),
    roleMemberships,
    hiddenRoleRowKeys: [...hidden],
  };
}

export function hideRoleRow(prefs: CrewScheduleViewPrefs, personId: string, role: string): CrewScheduleViewPrefs {
  const key = roleRowKey(personId, role);
  if ((prefs.hiddenRoleRowKeys ?? []).includes(key)) return prefs;
  return { ...prefs, hiddenRoleRowKeys: [...(prefs.hiddenRoleRowKeys ?? []), key] };
}

export function hiddenRoleRows(
  prefs: CrewScheduleViewPrefs,
): { personId: string; role: string; key: string }[] {
  return (prefs.hiddenRoleRowKeys ?? [])
    .map((key) => {
      const parsed = parseRoleRowKey(key);
      if (!parsed) return null;
      return { ...parsed, key };
    })
    .filter((row): row is { personId: string; role: string; key: string } => Boolean(row));
}
