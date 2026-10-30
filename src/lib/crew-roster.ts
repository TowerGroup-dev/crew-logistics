/** Editable roster layered on the imported schedule: manual employees and project links. */

export type CrewProject = {
  id: string;
  name: string;
  year?: number;
  source?: string;
};

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
};

export type CrewRosterBook = {
  projects: CrewProject[];
  /** Extra project ids attached to imported or manual people. */
  projectLinks: Record<string, string[]>;
  employees: ManualCrewPerson[];
};

const STORAGE_KEY = "tower-arctic-crew-roster";

export function emptyRoster(): CrewRosterBook {
  return { projects: [], projectLinks: {}, employees: [] };
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
  return {
    id: row.id,
    name: row.name,
    year: typeof row.year === "number" ? row.year : undefined,
    source: typeof row.source === "string" ? row.source : "manual",
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
  return {
    projects: Array.isArray(raw.projects)
      ? raw.projects.map(readProject).filter((item): item is CrewProject => Boolean(item))
      : [],
    projectLinks,
    employees: Array.isArray(raw.employees)
      ? raw.employees.map(readEmployee).filter((item): item is ManualCrewPerson => Boolean(item))
      : [],
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

export function mergeProjects(imported: CrewProject[], roster: CrewRosterBook) {
  const byId = new Map<string, CrewProject>();
  for (const project of imported) byId.set(project.id, project);
  for (const project of roster.projects) byId.set(project.id, project);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

type ImportedPerson = {
  id: string;
  name: string;
  role: string;
  homeSites: string[];
  projectIds: string[];
  inDate: string | null;
  outDate: string | null;
  rotationDays: number | null;
  events: { date: string; mark: string }[];
  manual?: boolean;
};

/** Combine imported schedule people with manually added employees and project links. */
export function mergePeople(imported: ImportedPerson[], roster: CrewRosterBook): ImportedPerson[] {
  const importedIds = new Set(imported.map((person) => person.id));
  const merged = imported.map((person) => ({
    ...person,
    projectIds: projectsForPerson(person.id, person.projectIds, roster),
    homeSites: [...person.homeSites],
    events: person.events.map((event) => ({ ...event })),
  }));

  for (const employee of roster.employees) {
    if (importedIds.has(employee.id)) {
      const index = merged.findIndex((person) => person.id === employee.id);
      if (index >= 0) {
        merged[index] = {
          ...merged[index],
          projectIds: projectsForPerson(employee.id, merged[index].projectIds, roster),
        };
      }
      continue;
    }
    merged.push({
      id: employee.id,
      name: employee.name,
      role: employee.role,
      homeSites: [...employee.homeSites],
      projectIds: [...employee.projectIds],
      inDate: null,
      outDate: null,
      rotationDays: employee.rotationDays,
      events: [],
      manual: true,
    });
  }

  return merged.sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
}
