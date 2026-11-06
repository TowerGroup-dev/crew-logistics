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

export type EmploymentStatus = "active" | "inactive";

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
};

/** Next on-site stretch added in the app (painted onto the schedule). */
export type RosterRotationPlan = {
  id: string;
  site: string;
  from: string;
  out: string;
  /** Role for this assignment only (can differ from the person's usual roles). */
  role?: string;
};

/** Max on-site days for an app-added rotation (6 weeks). */
export const MAX_ROTATION_DAYS = 42;

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
  employees: ManualCrewPerson[];
};

const STORAGE_KEY = "tower-arctic-crew-roster";

export function emptyRoster(): CrewRosterBook {
  return { projects: [], projectLinks: {}, employmentStatus: {}, rotationPlans: {}, employees: [] };
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
    employmentStatus:
      row.employmentStatus === "inactive"
        ? "inactive"
        : row.employmentStatus === "active"
          ? "active"
          : undefined,
  };
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
      if (status === "active" || status === "inactive") employmentStatus[personId] = status;
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
          return plan;
        })
        .filter((item): item is RosterRotationPlan => Boolean(item));
    }
  }
  return {
    projects: Array.isArray(raw.projects)
      ? raw.projects.map(readProject).filter((item): item is CrewProject => Boolean(item))
      : [],
    projectLinks,
    employmentStatus,
    rotationPlans,
    employees,
  };
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
  site: string;
  sites: string[];
  from: string;
  out: string | null;
  arrival: string;
  departure: string | null;
  tentative: boolean;
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
  active?: boolean;
  aliases?: string[];
};

export function employmentStatusFor(roster: CrewRosterBook, personId: string): EmploymentStatus {
  return roster.employmentStatus[personId] === "inactive" ? "inactive" : "active";
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

/** Activate the person (if needed) and append a next on-site rotation (max 42 days). */
export function addNextRotation(
  roster: CrewRosterBook,
  personId: string,
  input: { site: string; from: string; out: string; role?: string },
): CrewRosterBook {
  const site = input.site.trim().toUpperCase();
  const from = input.from.slice(0, 10);
  let out = input.out.slice(0, 10);
  if (!site || !from || !out || out <= from) return roster;
  const maxOut = addDaysLocal(from, MAX_ROTATION_DAYS);
  if (out > maxOut) out = maxOut;
  const role = input.role?.trim() || undefined;
  const plan: RosterRotationPlan = {
    id: `rot-${personId}-${from}-${Date.now()}`,
    site,
    from,
    out,
    role,
  };
  const existing = roster.rotationPlans?.[personId] ?? [];
  const withActive = setEmploymentStatus(roster, personId, "active");
  return {
    ...withActive,
    rotationPlans: {
      ...(withActive.rotationPlans ?? {}),
      [personId]: [...existing, plan],
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
  return plans.map((plan) => ({
    site: plan.site,
    sites: [plan.site],
    from: plan.from,
    out: plan.out,
    arrival: "app",
    departure: "app",
    tentative: false,
    note: plan.role ? `Added in app · ${plan.role}` : "Added in app",
    role: plan.role,
  }));
}

/** Combine imported schedule people with manually added employees and project links. */
export function mergePeople(imported: ImportedPerson[], roster: CrewRosterBook): ImportedPerson[] {
  const importedIds = new Set(imported.map((person) => person.id));
  const merged = imported.map((person) => {
    const extra = plansAsStints(roster.rotationPlans?.[person.id]);
    return {
      ...person,
      roles: person.roles?.length ? [...person.roles] : [person.role],
      projectIds: projectsForPerson(person.id, person.projectIds, roster),
      homeSites: [...person.homeSites],
      events: person.events.map((event) => ({ ...event })),
      stints: [...(person.stints ?? []), ...extra],
      active: employmentStatusFor(roster, person.id) === "active",
    };
  });

  for (const employee of roster.employees) {
    if (importedIds.has(employee.id)) {
      const index = merged.findIndex((person) => person.id === employee.id);
      if (index >= 0) {
        merged[index] = {
          ...merged[index],
          projectIds: projectsForPerson(employee.id, merged[index].projectIds, roster),
          active: employmentStatusFor(roster, employee.id) === "active",
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
      stints: plansAsStints(roster.rotationPlans?.[employee.id]),
      manual: true,
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
