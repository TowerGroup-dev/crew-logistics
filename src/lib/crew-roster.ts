/** Editable roster layered on the imported schedule: manual employees and project links. */

import { mergePeopleByName } from "@/lib/crew-schedule";

export type CrewProjectWindow = {
  from: string | null;
  to: string | null;
};

/** Per-person IN / OUT on a job. */
export type CrewProjectAssignment = {
  personId: string;
  from: string | null;
  to: string | null;
};

export type CrewProject = {
  id: string;
  name: string;
  year?: number;
  source?: string;
  region?: string | null;
  /** Planned windows; extra rows are extensions. */
  windows?: CrewProjectWindow[];
  /** People on this job with their own dates. */
  assignments?: CrewProjectAssignment[];
};

/** Active on the board, or inactive with a reason (all inactive live under See more). */
export type EmploymentStatus =
  | "active"
  | "pause"
  | "terminated"
  | "resignation"
  | "retirement"
  /** @deprecated migrated to pause */
  | "inactive";

export const INACTIVE_EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  "pause",
  "terminated",
  "resignation",
  "retirement",
  "inactive",
];

export function isInactiveEmployment(status: EmploymentStatus | undefined | null) {
  return Boolean(status && status !== "active");
}

export function employmentStatusLabel(status: EmploymentStatus) {
  switch (status) {
    case "pause":
    case "inactive":
      return "Pause";
    case "terminated":
      return "Terminated";
    case "resignation":
      return "Resignation";
    case "retirement":
      return "Retirement";
    default:
      return "Active";
  }
}

export function normalizeEmploymentStatus(value: unknown): EmploymentStatus | null {
  if (value === "active") return "active";
  if (value === "pause" || value === "inactive") return "pause";
  if (value === "terminated" || value === "resignation" || value === "retirement") return value;
  return null;
}

export type ManualCrewPerson = {
  id: string;
  name: string;
  role: string;
  homeSites: string[];
  projectIds: string[];
  rotationDays: number | null;
  /** Optional notes for coordinators. */
  notes: string;
  createdAt: string;
  /** Defaults to active when omitted. */
  employmentStatus?: EmploymentStatus;
  /** What-if hire, place on Calendar, then Save or Discard. */
  provisional?: boolean;
  /** Hire type overlay (REG / LOC / SUB). */
  category?: "Regular" | "Local" | "Subcontractor";
};

/** Next on-site stretch added in the app (painted onto the schedule). */
export type RosterRotationPlan = {
  id: string;
  site: string;
  from: string;
  out: string;
  /** Role for this assignment only (can differ from the person's usual roles). */
  role?: string;
  /** Coordinator cell note (Excel-style), e.g. "Lingering for snow". */
  note?: string;
  /** First start date, kept when the IN is dragged, so bookings and notes stay attached. */
  idFrom?: string;
  /**
   * Preliminary arrival — shaded window on the calendar until Confirm sets the
   * one IN; Overview shows a book-by reminder (2 weeks before first possible day).
   */
  tentative?: boolean;
  /** Inclusive first day of the arrival window. Defaults to `from`. */
  tentativeFrom?: string;
  /** Inclusive last day of the arrival window (one day or several). Defaults to `from`. */
  tentativeThrough?: string;
};

/** Standard on-site length (6 weeks). Place/forms stop here unless extending past. */
export const DEFAULT_ROTATION_DAYS = 42;
export const STANDARD_ROTATION_DAYS = 42;
/** Absolute ceiling when Katrina extends past 6 weeks. */
export const MAX_ROTATION_DAYS = 120;
/** Excel-style stay note on the bar (e.g. "Linger for snow"). */
export const MAX_STAY_NOTE_CHARS = 80;

export type CrewRosterBook = {
  projects: CrewProject[];
  /** Extra project ids attached to imported or manual people. */
  projectLinks: Record<string, string[]>;
  /**
   * Employment status overrides for imported + manual people.
   * Missing id = active.
   */
  employmentStatus: Record<string, EmploymentStatus>;
  /** Manual next rotations layered onto imported + manual people. */
  rotationPlans: Record<string, RosterRotationPlan[]>;
  /**
   * Extend an imported (or other) stint past its sheet OUT.
   * Key: `${personId}:${stintFrom}` → exclusive out date.
   */
  stintOutOverrides: Record<string, string>;
  /**
   * Move the IN of an imported stint. Key: `${personId}:${original start}` → new start.
   */
  stintInOverrides: Record<string, string>;
  /**
   * Mark / clear preliminary arrival on a stay (sheet or app).
   * Key: `${personId}:${stintFrom}` → inclusive through date, or false when confirmed.
   * Legacy `true` means a one-day window at the stay start.
   */
  stintTentativeOverrides: Record<string, string | boolean>;
  /**
   * Coordinator notes on any stay (sheet or app), keyed by {@link stayNoteKey}.
   * App plans also keep a copy on `RosterRotationPlan.note`.
   */
  stayNotes: Record<string, string>;
  /** Notes on dates you pick (e.g. "Lingering for snow" 15 to 20 Nov), shown only on those days. */
  dateNotes: DateNote[];
  employees: ManualCrewPerson[];
  /**
   * Permanently removed people (sheet or manual). Filtered out of mergePeople.
   * Prefer this over deleting imported schedule rows.
   */
  removedPersonIds?: Record<string, true>;
};

export type DateNote = {
  id: string;
  personId: string;
  /** First day (inclusive). */
  from: string;
  /** Last day (inclusive). */
  to: string;
  note: string;
};

const STORAGE_KEY = "tower-arctic-crew-roster";

export function emptyRoster(): CrewRosterBook {
  return {
    projects: [],
    projectLinks: {},
    employmentStatus: {},
    rotationPlans: {},
    stintOutOverrides: {},
    stintInOverrides: {},
    stintTentativeOverrides: {},
    stayNotes: {},
    dateNotes: [],
    employees: [],
  };
}

export function stintOverrideKey(personId: string, stintFrom: string) {
  return `${personId}:${stintFrom.slice(0, 10)}`;
}

/** The first start of a stay whose IN was dragged to `from` (or `from` itself). */
export function noteAnchorFrom(roster: CrewRosterBook, personId: string, from: string) {
  const iso = from.slice(0, 10);
  for (const [key, moved] of Object.entries(roster.stintInOverrides ?? {})) {
    if (moved === iso && key.startsWith(`${personId}:`)) return key.slice(personId.length + 1);
  }
  const plan = (roster.rotationPlans?.[personId] ?? []).find((row) => row.from === iso && row.idFrom);
  return plan?.idFrom ?? iso;
}

export function stayNoteKey(personId: string, from: string, out: string) {
  return `${personId}:${from.slice(0, 10)}:${out.slice(0, 10)}`;
}

export function clampStayNote(note: string): string {
  return note.replace(/\s+/g, " ").trim().slice(0, MAX_STAY_NOTE_CHARS);
}

export function getStayNote(
  roster: CrewRosterBook | null | undefined,
  personId: string,
  from: string,
  out: string,
): string {
  if (!roster) return "";
  const key = stayNoteKey(personId, from, out);
  const fromMap = roster.stayNotes?.[key];
  if (fromMap) return fromMap;
  // The stay's dates may have been dragged since the note was written: match on its first start.
  const anchor = noteAnchorFrom(roster, personId, from);
  const prefixes = [...new Set([`${personId}:${from.slice(0, 10)}:`, `${personId}:${anchor}:`])];
  for (const [noteKey, note] of Object.entries(roster.stayNotes ?? {})) {
    if (note && prefixes.some((prefix) => noteKey.startsWith(prefix))) return note;
  }
  const plan = (roster.rotationPlans?.[personId] ?? []).find(
    (row) => row.from === from.slice(0, 10) && row.out === out.slice(0, 10),
  );
  return plan?.note || "";
}

export function slugProject(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function slugEmployee(name: string, role: string) {
  return slugProject(`${name}-${role || "crew"}`);
}

function readProject(value: unknown): CrewProject | null {
  if (!value || typeof value !== "object") return null;
  const row = value as CrewProject;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  const windows = Array.isArray(row.windows)
    ? row.windows
        .map((window) => {
          if (!window || typeof window !== "object") return null;
          const entry = window as CrewProjectWindow;
          return {
            from: typeof entry.from === "string" ? entry.from.slice(0, 10) : null,
            to: typeof entry.to === "string" ? entry.to.slice(0, 10) : null,
          };
        })
        .filter((item): item is CrewProjectWindow => Boolean(item))
    : undefined;
  const assignments = Array.isArray(row.assignments)
    ? row.assignments
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const item = entry as CrewProjectAssignment;
          if (typeof item.personId !== "string") return null;
          return {
            personId: item.personId,
            from: typeof item.from === "string" ? item.from.slice(0, 10) : null,
            to: typeof item.to === "string" ? item.to.slice(0, 10) : null,
          };
        })
        .filter((item): item is CrewProjectAssignment => Boolean(item))
    : undefined;
  return {
    id: row.id,
    name: row.name,
    year: typeof row.year === "number" ? row.year : undefined,
    source: typeof row.source === "string" ? row.source : "manual",
    region: typeof row.region === "string" ? row.region : row.region === null ? null : undefined,
    windows,
    assignments,
  };
}

function readEmployee(value: unknown): ManualCrewPerson | null {
  if (!value || typeof value !== "object") return null;
  const row = value as ManualCrewPerson;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  return {
    id: row.id,
    name: row.name,
    role: typeof row.role === "string" && row.role ? row.role : "Crew",
    homeSites: Array.isArray(row.homeSites) ? row.homeSites.filter((item): item is string => typeof item === "string") : [],
    projectIds: Array.isArray(row.projectIds)
      ? row.projectIds.filter((item): item is string => typeof item === "string")
      : [],
    rotationDays: typeof row.rotationDays === "number" ? row.rotationDays : 42,
    notes: typeof row.notes === "string" ? row.notes : "",
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
    employmentStatus: normalizeEmploymentStatus(row.employmentStatus) ?? undefined,
    provisional: row.provisional === true,
    category:
      row.category === "Regular" || row.category === "Local" || row.category === "Subcontractor"
        ? row.category
        : undefined,
  };
}

/** Add a draft person for Calendar what-if planning. */
export function addProvisionalEmployee(
  roster: CrewRosterBook,
  input: { name: string; role?: string },
): { roster: CrewRosterBook; personId: string } | null {
  const name = input.name.trim();
  if (!name) return null;
  const role = (input.role || "Labourer").trim() || "Labourer";
  let id = slugEmployee(name, role);
  if (roster.employees.some((row) => row.id === id)) {
    id = `${id}-${Date.now().toString(36)}`;
  }
  const employee: ManualCrewPerson = {
    id,
    name,
    role,
    homeSites: [],
    projectIds: [],
    rotationDays: 42,
    notes: "",
    createdAt: new Date().toISOString(),
    employmentStatus: "active",
    provisional: true,
  };
  return {
    personId: id,
    roster: {
      ...roster,
      employees: [...roster.employees, employee],
      employmentStatus: { ...roster.employmentStatus, [id]: "active" },
    },
  };
}

/** Keep the person; clear the Draft flag (optionally rename). */
export function commitProvisionalEmployee(
  roster: CrewRosterBook,
  personId: string,
  name?: string,
): CrewRosterBook {
  const employees = roster.employees.map((row) => {
    if (row.id !== personId) return row;
    const nextName = name?.trim();
    return {
      ...row,
      name: nextName || row.name,
      provisional: false,
    };
  });
  return { ...roster, employees };
}

/** Remove a manual employee and their app rotation plans. */
export function removeManualEmployee(roster: CrewRosterBook, personId: string): CrewRosterBook {
  return removePerson(roster, personId);
}

/**
 * Permanently remove someone from Employees (manual or sheet).
 * Sheet people are hidden via removedPersonIds; manual rows are deleted.
 */
export function removePerson(roster: CrewRosterBook, personId: string): CrewRosterBook {
  const employees = roster.employees.filter((row) => row.id !== personId);
  const rotationPlans = { ...(roster.rotationPlans ?? {}) };
  delete rotationPlans[personId];
  const employmentStatus = { ...roster.employmentStatus };
  delete employmentStatus[personId];
  const projectLinks = { ...roster.projectLinks };
  delete projectLinks[personId];
  const stintOutOverrides = { ...roster.stintOutOverrides };
  for (const key of Object.keys(stintOutOverrides)) {
    if (key.startsWith(`${personId}:`)) delete stintOutOverrides[key];
  }
  const stintInOverrides = { ...(roster.stintInOverrides ?? {}) };
  for (const key of Object.keys(stintInOverrides)) {
    if (key.startsWith(`${personId}:`)) delete stintInOverrides[key];
  }
  const stintTentativeOverrides = { ...(roster.stintTentativeOverrides ?? {}) };
  for (const key of Object.keys(stintTentativeOverrides)) {
    if (key.startsWith(`${personId}:`)) delete stintTentativeOverrides[key];
  }
  const stayNotes = { ...(roster.stayNotes ?? {}) };
  for (const key of Object.keys(stayNotes)) {
    if (key.startsWith(`${personId}:`)) delete stayNotes[key];
  }
  const removedPersonIds = { ...(roster.removedPersonIds ?? {}), [personId]: true as const };
  return {
    ...roster,
    employees,
    rotationPlans,
    employmentStatus,
    projectLinks,
    stintOutOverrides,
    stintInOverrides,
    stintTentativeOverrides,
    stayNotes,
    removedPersonIds,
    dateNotes: (roster.dateNotes ?? []).filter((row) => row.personId !== personId),
  };
}

export function discardProvisionalEmployee(roster: CrewRosterBook, personId: string): CrewRosterBook {
  const row = roster.employees.find((employee) => employee.id === personId);
  if (!row?.provisional) return roster;
  return removeManualEmployee(roster, personId);
}

export function isProvisionalEmployee(roster: CrewRosterBook, personId: string) {
  return roster.employees.some((row) => row.id === personId && row.provisional === true);
}

export function isManualEmployee(roster: CrewRosterBook, personId: string) {
  return roster.employees.some((row) => row.id === personId);
}

export function readRoster(value: unknown): CrewRosterBook {
  if (!value || typeof value !== "object") return emptyRoster();
  const raw = value as Partial<CrewRosterBook>;
  const projectLinks: Record<string, string[]> = {};
  if (raw.projectLinks && typeof raw.projectLinks === "object") {
    for (const [personId, ids] of Object.entries(raw.projectLinks)) {
      if (!Array.isArray(ids)) continue;
      projectLinks[personId] = ids.filter((item): item is string => typeof item === "string");
    }
  }
  const employmentStatus: Record<string, EmploymentStatus> = {};
  if (raw.employmentStatus && typeof raw.employmentStatus === "object") {
    for (const [personId, status] of Object.entries(raw.employmentStatus)) {
      const normalized = normalizeEmploymentStatus(status);
      if (normalized) employmentStatus[personId] = normalized;
    }
  }
  const removedPersonIds: Record<string, true> = {};
  if (raw.removedPersonIds && typeof raw.removedPersonIds === "object") {
    for (const [personId, flag] of Object.entries(raw.removedPersonIds)) {
      if (flag) removedPersonIds[personId] = true;
    }
  }
  const employees = Array.isArray(raw.employees)
    ? raw.employees.map(readEmployee).filter((item): item is ManualCrewPerson => Boolean(item))
    : [];
  for (const employee of employees) {
    if (employee.employmentStatus && !(employee.id in employmentStatus)) {
      employmentStatus[employee.id] = employee.employmentStatus;
    }
  }
  const rotationPlans: Record<string, RosterRotationPlan[]> = {};
  if (raw.rotationPlans && typeof raw.rotationPlans === "object") {
    for (const [personId, plans] of Object.entries(raw.rotationPlans)) {
      if (!Array.isArray(plans)) continue;
      rotationPlans[personId] = plans
        .map((entry): RosterRotationPlan | null => {
          if (!entry || typeof entry !== "object") return null;
          const row = entry as Partial<RosterRotationPlan>;
          if (typeof row.id !== "string" || typeof row.site !== "string") return null;
          if (typeof row.from !== "string" || typeof row.out !== "string") return null;
          const plan: RosterRotationPlan = {
            id: row.id,
            site: row.site.trim().toUpperCase(),
            from: row.from.slice(0, 10),
            out: row.out.slice(0, 10),
          };
          if (typeof row.role === "string" && row.role.trim()) plan.role = row.role.trim();
          if (typeof row.note === "string" && row.note.trim()) plan.note = row.note.trim();
          if (typeof row.idFrom === "string" && row.idFrom.length >= 10) plan.idFrom = row.idFrom.slice(0, 10);
          if (row.tentative === true) plan.tentative = true;
          if (typeof row.tentativeFrom === "string" && row.tentativeFrom.length >= 10) {
            plan.tentativeFrom = row.tentativeFrom.slice(0, 10);
          }
          if (typeof row.tentativeThrough === "string" && row.tentativeThrough.length >= 10) {
            plan.tentativeThrough = row.tentativeThrough.slice(0, 10);
          }
          return plan;
        })
        .filter((item): item is RosterRotationPlan => Boolean(item));
    }
  }
  const stintOutOverrides: Record<string, string> = {};
  if (raw.stintOutOverrides && typeof raw.stintOutOverrides === "object") {
    for (const [key, out] of Object.entries(raw.stintOutOverrides)) {
      if (typeof out === "string" && out.length >= 10) stintOutOverrides[key] = out.slice(0, 10);
    }
  }
  const stintTentativeOverrides: Record<string, string | boolean> = {};
  if (raw.stintTentativeOverrides && typeof raw.stintTentativeOverrides === "object") {
    for (const [key, value] of Object.entries(raw.stintTentativeOverrides)) {
      if (typeof value === "boolean") stintTentativeOverrides[key] = value;
      else if (typeof value === "string" && value.length >= 10) stintTentativeOverrides[key] = value.slice(0, 10);
    }
  }
  const stintInOverrides: Record<string, string> = {};
  if (raw.stintInOverrides && typeof raw.stintInOverrides === "object") {
    for (const [key, from] of Object.entries(raw.stintInOverrides)) {
      if (typeof from === "string" && from.length >= 10) stintInOverrides[key] = from.slice(0, 10);
    }
  }
  const stayNotes: Record<string, string> = {};
  if (raw.stayNotes && typeof raw.stayNotes === "object") {
    for (const [key, note] of Object.entries(raw.stayNotes)) {
      if (typeof note !== "string") continue;
      const clamped = clampStayNote(note);
      if (clamped) stayNotes[key] = clamped;
    }
  }
  const dateNotes: DateNote[] = Array.isArray(raw.dateNotes)
    ? raw.dateNotes.flatMap((row: unknown) => {
        const item = row as Partial<DateNote> | null;
        if (!item || typeof item.id !== "string" || typeof item.personId !== "string") return [];
        if (typeof item.from !== "string" || typeof item.to !== "string" || typeof item.note !== "string") return [];
        const note = clampStayNote(item.note);
        if (!note) return [];
        const from = item.from.slice(0, 10);
        const to = item.to.slice(0, 10);
        return [{ id: item.id, personId: item.personId, from: from <= to ? from : to, to: from <= to ? to : from, note }];
      })
    : [];
  // Backfill plan notes into the shared map so sheet + app stays share one lookup.
  for (const [personId, plans] of Object.entries(rotationPlans)) {
    for (const plan of plans) {
      if (!plan.note) continue;
      const key = stayNoteKey(personId, plan.from, plan.out);
      if (!stayNotes[key]) stayNotes[key] = clampStayNote(plan.note);
    }
  }
  return {
    projects: Array.isArray(raw.projects)
      ? raw.projects.map(readProject).filter((item): item is CrewProject => Boolean(item))
      : [],
    projectLinks,
    employmentStatus,
    rotationPlans,
    stintOutOverrides,
    stintInOverrides,
    stintTentativeOverrides,
    stayNotes,
    dateNotes,
    employees,
    removedPersonIds,
  };
}

/** Notes for one person on picked dates, earliest first. */
export function dateNotesFor(roster: CrewRosterBook | null | undefined, personId: string): DateNote[] {
  return (roster?.dateNotes ?? [])
    .filter((row) => row.personId === personId)
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/** The date notes covering a day (newest last). */
export function dateNotesOn(roster: CrewRosterBook | null | undefined, personId: string, iso: string): DateNote[] {
  return dateNotesFor(roster, personId).filter((row) => row.from <= iso && iso <= row.to);
}

/** Add or change a note on dates you pick. Empty text removes it. */
export function setDateNote(
  roster: CrewRosterBook,
  input: { id?: string; personId: string; from: string; to: string; note: string },
): CrewRosterBook {
  const note = clampStayNote(input.note);
  const list = roster.dateNotes ?? [];
  if (!note) return input.id ? removeDateNote(roster, input.id) : roster;
  const a = input.from.slice(0, 10);
  const b = input.to.slice(0, 10);
  const row: DateNote = {
    id: input.id || `dn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    personId: input.personId,
    from: a <= b ? a : b,
    to: a <= b ? b : a,
    note,
  };
  const exists = list.some((item) => item.id === row.id);
  return { ...roster, dateNotes: exists ? list.map((item) => (item.id === row.id ? row : item)) : [...list, row] };
}

export function removeDateNote(roster: CrewRosterBook, id: string): CrewRosterBook {
  const list = roster.dateNotes ?? [];
  if (!list.some((item) => item.id === id)) return roster;
  return { ...roster, dateNotes: list.filter((item) => item.id !== id) };
}

export function loadRoster(): CrewRosterBook {
  if (typeof window === "undefined") return emptyRoster();
  try {
    return readRoster(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return emptyRoster();
  }
}

export function saveRoster(book: CrewRosterBook) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

export function projectsForPerson(
  personId: string,
  importedIds: string[],
  roster: CrewRosterBook,
) {
  const linked = roster.projectLinks[personId] ?? [];
  const manual = roster.employees.find((row) => row.id === personId)?.projectIds ?? [];
  return [...new Set([...importedIds, ...linked, ...manual])];
}

/** Add or remove a project id on a person (manual employee or projectLinks). */
export function linkPersonProject(roster: CrewRosterBook, personId: string, projectId: string, linked: boolean): CrewRosterBook {
  const manualIndex = roster.employees.findIndex((employee) => employee.id === personId);
  if (manualIndex >= 0) {
    const employees = roster.employees.map((employee, index) => {
      if (index !== manualIndex) return employee;
      const has = employee.projectIds.includes(projectId);
      if (linked && !has) return { ...employee, projectIds: [...employee.projectIds, projectId] };
      if (!linked && has) return { ...employee, projectIds: employee.projectIds.filter((id) => id !== projectId) };
      return employee;
    });
    return { ...roster, employees };
  }
  const current = roster.projectLinks[personId] ?? [];
  const has = current.includes(projectId);
  let nextLinks = current;
  if (linked && !has) nextLinks = [...current, projectId];
  if (!linked && has) nextLinks = current.filter((id) => id !== projectId);
  if (nextLinks === current) return roster;
  return {
    ...roster,
    projectLinks: { ...roster.projectLinks, [personId]: nextLinks },
  };
}

/** Sync who is on a project, `personIds` is the full desired set. */
export function setProjectCrew(
  roster: CrewRosterBook,
  projectId: string,
  personIds: string[],
  allPersonIds: string[],
  defaults?: { from: string | null; to: string | null },
): CrewRosterBook {
  const want = new Set(personIds);
  let next = roster;
  for (const personId of allPersonIds) {
    next = linkPersonProject(next, personId, projectId, want.has(personId));
  }
  next = {
    ...next,
    projects: ensureProjectRow(next, projectId).projects.map((project) => {
      if (project.id !== projectId) return project;
      const prev = new Map((project.assignments ?? []).map((row) => [row.personId, row]));
      const assignments: CrewProjectAssignment[] = personIds.map((personId) => {
        const existing = prev.get(personId);
        return {
          personId,
          from: existing?.from ?? defaults?.from ?? null,
          to: existing?.to ?? defaults?.to ?? null,
        };
      });
      return { ...project, assignments };
    }),
  };
  return next;
}

function ensureProjectRow(roster: CrewRosterBook, projectId: string): CrewRosterBook {
  if (roster.projects.some((project) => project.id === projectId)) return roster;
  return {
    ...roster,
    projects: [
      ...roster.projects,
      { id: projectId, name: projectId.replace(/-/g, " "), source: "manual", assignments: [] },
    ],
  };
}

export function setPersonProjectDates(
  roster: CrewRosterBook,
  projectId: string,
  personId: string,
  from: string | null,
  to: string | null,
): CrewRosterBook {
  let next = linkPersonProject(roster, personId, projectId, true);
  next = ensureProjectRow(next, projectId);
  return {
    ...next,
    projects: next.projects.map((project) => {
      if (project.id !== projectId) return project;
      const others = (project.assignments ?? []).filter((row) => row.personId !== personId);
      return {
        ...project,
        assignments: [...others, { personId, from, to }],
      };
    }),
  };
}

export function removePersonFromProject(
  roster: CrewRosterBook,
  projectId: string,
  personId: string,
): CrewRosterBook {
  let next = linkPersonProject(roster, personId, projectId, false);
  return {
    ...next,
    projects: next.projects.map((project) =>
      project.id === projectId
        ? {
            ...project,
            assignments: (project.assignments ?? []).filter((row) => row.personId !== personId),
          }
        : project,
    ),
  };
}

export function assignmentForPerson(project: CrewProject | undefined, personId: string) {
  return project?.assignments?.find((row) => row.personId === personId) ?? null;
}

export function mergeProjects<T extends CrewProject>(imported: T[], roster: CrewRosterBook): T[] {
  const byId = new Map<string, T>();
  for (const project of imported) byId.set(project.id, project);
  for (const project of roster.projects) {
    const existing = byId.get(project.id);
    byId.set(project.id, {
      ...(existing as T),
      ...project,
      windows: project.windows?.length ? project.windows : existing?.windows,
      assignments: project.assignments?.length ? project.assignments : existing?.assignments,
      region: project.region ?? existing?.region,
      year: project.year ?? existing?.year,
      source: project.source ?? existing?.source ?? "manual",
    } as T);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

type StintLike = {
  idFrom?: string;
  site: string;
  sites: string[];
  from: string;
  out: string | null;
  arrival: string;
  departure: string | null;
  tentative: boolean;
  unsure?: boolean;
  tentativeFrom?: string;
  tentativeThrough?: string;
  note?: string;
  role?: string;
};

type ImportedPerson = {
  id: string;
  name: string;
  role: string;
  roles: string[];
  homeSites: string[];
  projectIds: string[];
  inDate: string | null;
  outDate: string | null;
  rotationDays: number | null;
  events: { date: string; mark: string }[];
  stints?: StintLike[];
  manual?: boolean;
  provisional?: boolean;
  active?: boolean;
  aliases?: string[];
  category?: "Regular" | "Local" | "Subcontractor";
};

export function employmentStatusFor(roster: CrewRosterBook, personId: string): EmploymentStatus {
  const raw = roster.employmentStatus[personId];
  return normalizeEmploymentStatus(raw) ?? "active";
}

export function setEmploymentStatus(
  roster: CrewRosterBook,
  personId: string,
  status: EmploymentStatus,
): CrewRosterBook {
  const employmentStatus = { ...roster.employmentStatus, [personId]: status };
  const employees = roster.employees.map((employee) =>
    employee.id === personId ? { ...employee, employmentStatus: status } : employee,
  );
  return { ...roster, employmentStatus, employees };
}

/** Activate the person (if needed) and append a next on-site rotation. */
export function addNextRotation(
  roster: CrewRosterBook,
  personId: string,
  input: {
    site: string;
    from: string;
    out: string;
    role?: string;
    note?: string;
    tentative?: boolean;
    /** Inclusive last day of arrival window (defaults to from). */
    tentativeThrough?: string;
  },
): CrewRosterBook {
  const site = input.site.trim().toUpperCase();
  const from = input.from.slice(0, 10);
  let out = input.out.slice(0, 10);
  if (!site || !from || !out || out <= from) return roster;
  const maxOut = addDaysLocal(from, MAX_ROTATION_DAYS);
  if (out > maxOut) out = maxOut;
  const role = input.role?.trim() || undefined;
  const note = clampStayNote(input.note || "") || undefined;
  const lastInclusive = addDaysLocal(out, -1);
  let tentativeThrough =
    input.tentative && input.tentativeThrough ? input.tentativeThrough.slice(0, 10) : undefined;
  if (tentativeThrough) {
    if (tentativeThrough < from) tentativeThrough = from;
    if (tentativeThrough > lastInclusive) tentativeThrough = lastInclusive;
  }
  const plan: RosterRotationPlan = {
    id: `rot-${personId}-${from}-${Date.now()}`,
    site,
    from,
    out,
    role,
    note,
    ...(input.tentative
      ? {
          tentative: true,
          ...(tentativeThrough && tentativeThrough !== from ? { tentativeThrough } : {}),
        }
      : {}),
  };
  const existing = roster.rotationPlans?.[personId] ?? [];
  // Same IN (or overlapping span) → replace, do not stack duplicate INs.
  const kept = existing.filter((row) => !(row.from === from || (row.from < out && from < row.out)));
  const withActive = setEmploymentStatus(roster, personId, "active");
  const stayNotes = { ...(withActive.stayNotes ?? {}) };
  if (note) stayNotes[stayNoteKey(personId, from, out)] = note;
  return {
    ...withActive,
    stayNotes,
    rotationPlans: {
      ...(withActive.rotationPlans ?? {}),
      [personId]: [...kept, plan],
    },
  };
}

/** App-added plan covering this calendar day, if any (NAV-07 / NAV-08). */
export function findRotationPlanAt(
  roster: CrewRosterBook,
  personId: string,
  iso: string,
): RosterRotationPlan | null {
  const day = iso.slice(0, 10);
  const plans = roster.rotationPlans?.[personId] ?? [];
  return plans.find((plan) => plan.from <= day && day < plan.out) ?? null;
}

/** Find a plan by id. */
export function findRotationPlanById(
  roster: CrewRosterBook,
  personId: string,
  planId: string,
): RosterRotationPlan | null {
  return (roster.rotationPlans?.[personId] ?? []).find((plan) => plan.id === planId) ?? null;
}

/** Remove an app-painted placement (NAV-07). Sheet-imported stints have no plan id. */
export function removeRotationPlan(
  roster: CrewRosterBook,
  personId: string,
  planId: string,
): CrewRosterBook {
  const existing = roster.rotationPlans?.[personId] ?? [];
  if (!existing.some((plan) => plan.id === planId)) return roster;
  const nextPlans = existing.filter((plan) => plan.id !== planId);
  const rotationPlans = { ...(roster.rotationPlans ?? {}) };
  if (nextPlans.length) rotationPlans[personId] = nextPlans;
  else delete rotationPlans[personId];
  return { ...roster, rotationPlans };
}

/** Set or clear the coordinator note on a placement (NAV-08). */
export function setRotationPlanNote(
  roster: CrewRosterBook,
  personId: string,
  planId: string,
  note: string,
): CrewRosterBook {
  const existing = roster.rotationPlans?.[personId] ?? [];
  const index = existing.findIndex((plan) => plan.id === planId);
  if (index < 0) return roster;
  const current = existing[index]!;
  const nextNote = clampStayNote(note) || undefined;
  if ((current.note || undefined) === nextNote) return roster;
  const nextPlans = [...existing];
  nextPlans[index] = { ...current, note: nextNote };
  const stayNotes = { ...(roster.stayNotes ?? {}) };
  const key = stayNoteKey(personId, current.from, current.out);
  if (nextNote) stayNotes[key] = nextNote;
  else delete stayNotes[key];
  return {
    ...roster,
    stayNotes,
    rotationPlans: {
      ...(roster.rotationPlans ?? {}),
      [personId]: nextPlans,
    },
  };
}

/**
 * Set or clear a stay note for sheet or app stays (NAV-08).
 * When a matching app plan exists, its `note` is kept in sync.
 */
export function setStayNote(
  roster: CrewRosterBook,
  personId: string,
  from: string,
  out: string,
  note: string,
): CrewRosterBook {
  const fromIso = from.slice(0, 10);
  const outIso = out.slice(0, 10);
  // Keyed on the stay's first start, so dragging its dates never loses the note.
  const anchor = noteAnchorFrom(roster, personId, fromIso);
  const key = stayNoteKey(personId, anchor, outIso);
  const nextNote = clampStayNote(note);
  const stayNotes = { ...(roster.stayNotes ?? {}) };
  for (const noteKey of Object.keys(stayNotes)) {
    if (noteKey !== key && (noteKey.startsWith(`${personId}:${anchor}:`) || noteKey.startsWith(`${personId}:${fromIso}:`))) {
      delete stayNotes[noteKey];
    }
  }
  const prev = stayNotes[key] || "";
  if (prev === nextNote) {
    // Still sync plan copy if needed.
  } else if (nextNote) stayNotes[key] = nextNote;
  else delete stayNotes[key];

  const existing = roster.rotationPlans?.[personId] ?? [];
  const index = existing.findIndex((plan) => plan.from === fromIso && plan.out === outIso);
  let rotationPlans = roster.rotationPlans ?? {};
  if (index >= 0) {
    const current = existing[index]!;
    if ((current.note || "") !== nextNote) {
      const nextPlans = [...existing];
      nextPlans[index] = { ...current, note: nextNote || undefined };
      rotationPlans = { ...rotationPlans, [personId]: nextPlans };
    }
  }

  if (prev === nextNote && rotationPlans === roster.rotationPlans) return roster;
  return { ...roster, stayNotes, rotationPlans };
}

/** Set assignment role on an app-painted placement. */
export function setRotationPlanRole(
  roster: CrewRosterBook,
  personId: string,
  planId: string,
  role: string,
): CrewRosterBook {
  const existing = roster.rotationPlans?.[personId] ?? [];
  const index = existing.findIndex((plan) => plan.id === planId);
  if (index < 0) return roster;
  const nextRole = role.trim() || undefined;
  const current = existing[index]!;
  if ((current.role || undefined) === nextRole) return roster;
  const nextPlans = [...existing];
  nextPlans[index] = { ...current, role: nextRole };
  return {
    ...roster,
    rotationPlans: {
      ...(roster.rotationPlans ?? {}),
      [personId]: nextPlans,
    },
  };
}

/**
 * Create or update a roster profile overlay (manual hire or imported person edits).
 * Fixes typos / home role without rewriting the Excel extract.
 */
export function upsertEmployeeProfile(
  roster: CrewRosterBook,
  personId: string,
  patch: {
    name?: string;
    role?: string;
    notes?: string;
    /** Pass null to clear a previously saved hire type. */
    category?: "Regular" | "Local" | "Subcontractor" | null;
  },
  seed?: { name: string; role: string },
): CrewRosterBook {
  const index = roster.employees.findIndex((row) => row.id === personId);
  if (index >= 0) {
    const current = roster.employees[index]!;
    const next: ManualCrewPerson = {
      ...current,
      name: patch.name?.trim() || current.name,
      role: patch.role?.trim() || current.role,
      notes: patch.notes !== undefined ? patch.notes : current.notes,
      category:
        patch.category === null
          ? undefined
          : patch.category !== undefined
            ? patch.category
            : current.category,
    };
    const employees = [...roster.employees];
    employees[index] = next;
    return { ...roster, employees };
  }
  const name = (patch.name || seed?.name || "").trim();
  const role = (patch.role || seed?.role || "Labourer").trim() || "Labourer";
  if (!name) return roster;
  const employee: ManualCrewPerson = {
    id: personId,
    name,
    role,
    homeSites: [],
    projectIds: [],
    rotationDays: 42,
    notes: patch.notes ?? "",
    createdAt: new Date().toISOString(),
    employmentStatus: "active",
    provisional: false,
    category: patch.category || undefined,
  };
  return {
    ...roster,
    employees: [...roster.employees, employee],
    employmentStatus: { ...roster.employmentStatus, [personId]: "active" },
  };
}

/** Push a stay's exclusive OUT later (app plan or sheet stint override). */
export function extendStay(
  roster: CrewRosterBook,
  personId: string,
  stintFrom: string,
  newOut: string,
): CrewRosterBook {
  const from = stintFrom.slice(0, 10);
  const out = newOut.slice(0, 10);
  if (!from || !out || out <= from) return roster;
  const maxOut = addDaysLocal(from, MAX_ROTATION_DAYS);
  const cappedOut = out > maxOut ? maxOut : out;

  const plans = roster.rotationPlans?.[personId] ?? [];
  const index = plans.findIndex((plan) => plan.from === from);
  if (index >= 0) {
    const current = plans[index]!;
    if (cappedOut <= current.out) return roster;
    const nextPlans = [...plans];
    nextPlans[index] = { ...current, out: cappedOut };
    return {
      ...roster,
      rotationPlans: {
        ...(roster.rotationPlans ?? {}),
        [personId]: nextPlans,
      },
    };
  }

  const key = stintOverrideKey(personId, from);
  const previous = roster.stintOutOverrides?.[key];
  if (previous && previous >= cappedOut) return roster;
  return {
    ...roster,
    stintOutOverrides: {
      ...(roster.stintOutOverrides ?? {}),
      [key]: cappedOut,
    },
  };
}

function applyStintOutOverrides<
  T extends {
    from: string;
    out: string | null;
    idFrom?: string;
    tentative?: boolean;
    unsure?: boolean;
    tentativeThrough?: string;
  },
>(
  personId: string,
  stints: T[],
  overrides: Record<string, string> | undefined,
  inOverrides?: Record<string, string>,
  tentativeOverrides?: Record<string, string | boolean>,
): T[] {
  const hasOut = overrides && Object.keys(overrides).length;
  const hasIn = inOverrides && Object.keys(inOverrides).length;
  const hasTentative = tentativeOverrides && Object.keys(tentativeOverrides).length;
  if (!hasOut && !hasIn && !hasTentative) return stints;
  return stints
    .map((stint) => {
      const key = stintOverrideKey(personId, stint.from);
      let next = stint;
      const override = overrides?.[key];
      // Override wins: OUT = IN clears the sheet stay; later OUT shortens/extends.
      if (override && override.length >= 10) {
        if (override <= (next.from || stint.from)) next = { ...next, out: next.from || stint.from };
        else next = { ...next, out: override };
      }
      const movedIn = inOverrides?.[key];
      if (movedIn && (!next.out || movedIn < next.out)) {
        next = { ...next, from: movedIn, idFrom: stint.idFrom ?? stint.from };
      }
      const movedKey = stintOverrideKey(personId, next.from);
      const tentativeFlag =
        tentativeOverrides?.[movedKey] ??
        tentativeOverrides?.[key] ??
        (next.idFrom ? tentativeOverrides?.[stintOverrideKey(personId, next.idFrom)] : undefined);
      if (tentativeFlag === false) {
        next = {
          ...next,
          tentative: false,
          unsure: false,
          tentativeFrom: undefined,
          tentativeThrough: undefined,
        };
      } else if (typeof tentativeFlag === "string" && tentativeFlag.length >= 10) {
        const pipe = tentativeFlag.indexOf("|");
        let start = next.from;
        let through = tentativeFlag;
        if (pipe > 0) {
          start = tentativeFlag.slice(0, pipe);
          through = tentativeFlag.slice(pipe + 1);
        }
        if (start < next.from) start = next.from;
        if (through < start) through = start;
        next = {
          ...next,
          tentative: true,
          unsure: true,
          ...(start !== next.from ? { tentativeFrom: start } : { tentativeFrom: undefined }),
          tentativeThrough: through,
        };
      } else if (tentativeFlag === true) {
        next = {
          ...next,
          tentative: true,
          unsure: true,
          tentativeFrom: undefined,
          tentativeThrough: next.from,
        };
      }
      return next;
    })
    .filter((stint) => !stint.out || stint.out > stint.from);
}

/**
 * Move the IN (first day) of a stay, earlier or later, keeping its OUT.
 * Bookings, notes and transfers stay attached (they follow the stay's first start).
 */
export function setStayIn(roster: CrewRosterBook, personId: string, currentFrom: string, newFrom: string): CrewRosterBook {
  const current = currentFrom.slice(0, 10);
  const next = newFrom.slice(0, 10);
  if (!current || !next || current === next) return roster;
  const plans = roster.rotationPlans?.[personId] ?? [];
  // Same placement even after prior IN moves (idFrom keeps the booking identity).
  const index = plans.findIndex(
    (plan) => plan.from === current || plan.idFrom === current || plan.from === next,
  );
  if (index >= 0) {
    const plan = plans[index]!;
    if (next >= plan.out) return roster;
    const nextPlans = [...plans];
    nextPlans[index] = { ...plan, from: next, idFrom: plan.idFrom ?? plan.from };
    return { ...roster, rotationPlans: { ...(roster.rotationPlans ?? {}), [personId]: nextPlans } };
  }
  const original =
    Object.entries(roster.stintInOverrides ?? {}).find(
      ([key, moved]) => moved === current && key.startsWith(`${personId}:`),
    )?.[0] ?? stintOverrideKey(personId, current);
  const stintInOverrides = { ...(roster.stintInOverrides ?? {}) };
  if (original === stintOverrideKey(personId, next)) delete stintInOverrides[original];
  else stintInOverrides[original] = next;
  return { ...roster, stintInOverrides };
}

/**
 * Remove a stay from the calendar: app plan(s) deleted, or sheet stay collapsed (OUT = IN).
 * Flights/travel are cleared by the caller via clearStayBooking.
 * Clears every duplicate plan that shares the same IN (retries used to leave extras behind).
 */
export function clearStayPlacement(
  roster: CrewRosterBook,
  personId: string,
  stintFrom: string,
  planId?: string | null,
): CrewRosterBook {
  const from = stintFrom.slice(0, 10);
  if (!from) return roster;
  const plans = roster.rotationPlans?.[personId] ?? [];
  const seed =
    (planId ? plans.find((row) => row.id === planId) : undefined) ||
    plans.find((row) => row.from === from || row.idFrom === from);
  const keys = new Set<string>([from]);
  if (seed) {
    keys.add(seed.from);
    if (seed.idFrom) keys.add(seed.idFrom);
  }
  const toRemove = plans.filter(
    (row) =>
      (planId && row.id === planId) ||
      keys.has(row.from) ||
      (row.idFrom ? keys.has(row.idFrom) : false),
  );
  if (toRemove.length) {
    let next = roster;
    for (const plan of toRemove) {
      next = removeRotationPlan(next, personId, plan.id);
    }
    return next;
  }

  // Sheet stay: exclusive OUT = original IN → no on-site days left.
  const originalKey = Object.entries(roster.stintInOverrides ?? {}).find(
    ([key, moved]) => moved === from && key.startsWith(`${personId}:`),
  )?.[0];
  const key = originalKey ?? stintOverrideKey(personId, from);
  const sheetFrom = originalKey ? originalKey.slice(personId.length + 1) : from;
  const stintInOverrides = { ...(roster.stintInOverrides ?? {}) };
  if (originalKey) delete stintInOverrides[originalKey];
  return {
    ...roster,
    stintInOverrides,
    stintOutOverrides: {
      ...(roster.stintOutOverrides ?? {}),
      [key]: sheetFrom,
    },
    stintTentativeOverrides: {
      ...(roster.stintTentativeOverrides ?? {}),
      [key]: false,
    },
  };
}

/**
 * Confirm a preliminary arrival: lock IN to `confirmedIn`, clear tentative/IN?.
 * Callers should also shift any outbound journey to land on this day.
 */
export function confirmStayArrival(
  roster: CrewRosterBook,
  personId: string,
  stintFrom: string,
  confirmedIn: string,
): CrewRosterBook {
  const from = stintFrom.slice(0, 10);
  const confirmed = confirmedIn.slice(0, 10);
  if (!from || !confirmed) return roster;
  let next = roster;
  if (confirmed !== from) {
    next = setStayIn(next, personId, from, confirmed);
  }
  // Clear using the original key (still findable via idFrom / in-overrides).
  next = setStayTentative(next, personId, from, false);
  if (confirmed !== from) next = setStayTentative(next, personId, confirmed, false);
  return next;
}

/**
 * Mark or clear a preliminary (tentative) arrival window on a stay.
 * Window is inclusive `start`…`through` within the stay — does not move IN
 * (Confirm arrival moves IN). Extends earlier/later inside the stay only.
 * App plans store the flag on the plan; sheet stays use an override.
 */
export function setStayTentative(
  roster: CrewRosterBook,
  personId: string,
  stintFrom: string,
  tentative: boolean | { through: string; start?: string },
): CrewRosterBook {
  const from = stintFrom.slice(0, 10);
  if (!from) return roster;
  const on = tentative !== false;
  let through = from;
  let start = from;
  if (typeof tentative === "object") {
    if (tentative.through) through = tentative.through.slice(0, 10);
    if (tentative.start) start = tentative.start.slice(0, 10);
  }
  // Shade only — never move the placement IN.
  if (start < from) start = from;
  if (through < start) through = start;
  const nextRoster = roster;
  const plans = nextRoster.rotationPlans?.[personId] ?? [];
  const index = plans.findIndex(
    (plan) =>
      plan.from === from ||
      plan.idFrom === from ||
      plan.from === stintFrom.slice(0, 10) ||
      plan.idFrom === stintFrom.slice(0, 10),
  );
  if (index >= 0) {
    const current = plans[index]!;
    const planFrom = current.from;
    const lastInclusive = addDaysLocal(current.out, -1);
    if (through > lastInclusive) through = lastInclusive;
    if (start > lastInclusive) start = lastInclusive;
    if (start < planFrom) start = planFrom;
    if (through < start) through = start;
    const nextPlans = [...plans];
    if (!on) {
      const { tentative: _t, tentativeFrom: _tf, tentativeThrough: _th, ...rest } = current;
      nextPlans[index] = rest;
    } else {
      const nextPlan: RosterRotationPlan = { ...current, tentative: true };
      if (start !== planFrom) nextPlan.tentativeFrom = start;
      else delete nextPlan.tentativeFrom;
      if (through !== start) nextPlan.tentativeThrough = through;
      else delete nextPlan.tentativeThrough;
      nextPlans[index] = nextPlan;
    }
    return {
      ...nextRoster,
      rotationPlans: {
        ...(nextRoster.rotationPlans ?? {}),
        [personId]: nextPlans,
      },
    };
  }
  const original = Object.entries(nextRoster.stintInOverrides ?? {}).find(
    ([key, moved]) => moved === from && key.startsWith(`${personId}:`),
  )?.[0];
  const key = original ?? stintOverrideKey(personId, from);
  // Sheet override: encode start|through when the window does not start at IN.
  const nextValue: string | boolean = on
    ? start !== from
      ? `${start}|${through}`
      : through
    : false;
  const previous = nextRoster.stintTentativeOverrides?.[key];
  if (previous === nextValue) return nextRoster;
  return {
    ...nextRoster,
    stintTentativeOverrides: {
      ...(nextRoster.stintTentativeOverrides ?? {}),
      [key]: nextValue,
    },
  };
}

/**
 * Set exclusive OUT for a stay (app plan or sheet stint).
 * Use to extend or end early, keeps extracted Excel data editable.
 */
export function setStayOut(
  roster: CrewRosterBook,
  personId: string,
  stintFrom: string,
  newOut: string,
): CrewRosterBook {
  const from = stintFrom.slice(0, 10);
  const out = newOut.slice(0, 10);
  if (!from || !out || out <= from) return roster;
  const maxOut = addDaysLocal(from, MAX_ROTATION_DAYS);
  const cappedOut = out > maxOut ? maxOut : out;

  const plans = roster.rotationPlans?.[personId] ?? [];
  const index = plans.findIndex((plan) => plan.from === from || plan.idFrom === from);
  if (index >= 0) {
    const current = plans[index]!;
    if (current.out === cappedOut) return roster;
    const nextPlans = [...plans];
    nextPlans[index] = { ...current, out: cappedOut };
    return {
      ...roster,
      rotationPlans: {
        ...(roster.rotationPlans ?? {}),
        [personId]: nextPlans,
      },
    };
  }

  // Imported stay whose IN was dragged: its OUT override stays on the original start.
  const original = Object.entries(roster.stintInOverrides ?? {}).find(
    ([key, moved]) => moved === from && key.startsWith(`${personId}:`),
  )?.[0];
  const key = original ?? stintOverrideKey(personId, from);
  if (roster.stintOutOverrides?.[key] === cappedOut) return roster;
  return {
    ...roster,
    stintOutOverrides: {
      ...(roster.stintOutOverrides ?? {}),
      [key]: cappedOut,
    },
  };
}

function addDaysLocal(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, (d ?? 1) + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function plansAsStints(plans: RosterRotationPlan[] | undefined): StintLike[] {
  if (!plans?.length) return [];
  return plans.map((plan) => {
    const meta = plan.role ? `Added in app · ${plan.role}` : "Added in app";
    const tentative = plan.tentative === true;
    const start =
      tentative && plan.tentativeFrom && plan.tentativeFrom >= plan.from
        ? plan.tentativeFrom
        : undefined;
    const through =
      tentative && plan.tentativeThrough && plan.tentativeThrough >= (start || plan.from)
        ? plan.tentativeThrough
        : undefined;
    return {
      site: plan.site,
      sites: [plan.site],
      from: plan.from,
      out: plan.out,
      arrival: "app",
      departure: "app",
      tentative,
      unsure: tentative,
      ...(start ? { tentativeFrom: start } : {}),
      ...(through ? { tentativeThrough: through } : {}),
      note: plan.note
        ? `${plan.note} · ${meta}${tentative ? " · tentative" : ""}`
        : tentative
          ? `${meta} · tentative`
          : meta,
      role: plan.role,
      ...(plan.idFrom ? { idFrom: plan.idFrom } : {}),
    };
  });
}

/** Combine imported schedule people with manually added employees and project links. */
export function mergePeople(imported: ImportedPerson[], roster: CrewRosterBook): ImportedPerson[] {
  const removed = roster.removedPersonIds ?? {};
  const importedIds = new Set(imported.map((person) => person.id));
  const merged = imported
    .filter((person) => !removed[person.id])
    .map((person) => {
    const extra = plansAsStints(roster.rotationPlans?.[person.id]);
    const stints = applyStintOutOverrides(
      person.id,
      [...(person.stints ?? []), ...extra],
      roster.stintOutOverrides,
      roster.stintInOverrides,
      roster.stintTentativeOverrides,
    );
    return {
      ...person,
      roles: person.roles?.length ? [...person.roles] : [person.role],
      projectIds: projectsForPerson(person.id, person.projectIds, roster),
      homeSites: [...person.homeSites],
      events: person.events.map((event) => ({ ...event })),
      stints,
      active: employmentStatusFor(roster, person.id) === "active",
    };
  });

  for (const employee of roster.employees) {
    if (removed[employee.id]) continue;
    if (importedIds.has(employee.id)) {
      const index = merged.findIndex((person) => person.id === employee.id);
      if (index >= 0) {
        const base = merged[index]!;
        merged[index] = {
          ...base,
          name: employee.name || base.name,
          role: employee.role || base.role,
          roles: employee.role ? [employee.role] : base.roles,
          projectIds: projectsForPerson(employee.id, base.projectIds, roster),
          active: employmentStatusFor(roster, employee.id) === "active",
          category: employee.category ?? base.category,
          provisional: employee.provisional === true ? true : base.provisional,
          // Sheet people stay non-manual even when a profile overlay edits name/role.
          manual: false,
        };
      }
      continue;
    }
    merged.push({
      id: employee.id,
      name: employee.name,
      role: employee.role,
      roles: [employee.role],
      homeSites: [...employee.homeSites],
      projectIds: [...employee.projectIds],
      inDate: null,
      outDate: null,
      rotationDays: employee.rotationDays,
      events: [],
      stints: applyStintOutOverrides(
        employee.id,
        plansAsStints(roster.rotationPlans?.[employee.id]),
        roster.stintOutOverrides,
        roster.stintInOverrides,
        roster.stintTentativeOverrides,
      ),
      manual: true,
      provisional: employee.provisional === true,
      category: employee.category,
      active: employmentStatusFor(roster, employee.id) === "active",
    });
  }

  return mergePeopleByName(
    merged.map((person) => ({
      ...person,
      roles: person.roles?.length ? person.roles : [person.role],
    })),
  ).sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
}
