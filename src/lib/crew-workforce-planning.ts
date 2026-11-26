/** Editable workforce demand book: project pipeline and weekly crew needs (trial page). */

import { addDays, weekBounds } from "@/lib/dates";

export const WORKFORCE_PLANNING_KEY = "tower-arctic-crew-workforce-planning-v1";

export type PlanningWorkType = "Piling" | "Civil" | "Install" | "";
export type PlanningStatus = "Contracted" | "Pending" | "Early-stage" | "Lost";

export type PlanningPhase = {
  /** Inclusive start (ISO date). */
  from: string;
  /** Inclusive end (ISO date). */
  to: string;
  /** Headcount needed each week this phase covers. */
  crew: number;
};

export type PlanningProject = {
  id: string;
  year: number;
  name: string;
  site: string;
  workType: PlanningWorkType;
  status: PlanningStatus;
  phases: PlanningPhase[];
  notes: string;
};

export type WorkforcePlanningBook = {
  projects: PlanningProject[];
};

export const PLANNING_WORK_TYPES: PlanningWorkType[] = ["Piling", "Civil", "Install", ""];
export const PLANNING_STATUSES: PlanningStatus[] = [
  "Contracted",
  "Pending",
  "Early-stage",
  "Lost",
];

/** Statuses that contribute to needed headcount. */
export function statusCountsInDemand(status: PlanningStatus): boolean {
  return status === "Contracted" || status === "Pending";
}

export function emptyPlanningBook(): WorkforcePlanningBook {
  return { projects: [] };
}

function readPhase(value: unknown): PlanningPhase | null {
  if (!value || typeof value !== "object") return null;
  const row = value as PlanningPhase;
  if (typeof row.from !== "string" || typeof row.to !== "string") return null;
  const crew = typeof row.crew === "number" && Number.isFinite(row.crew) ? Math.max(0, Math.round(row.crew)) : 0;
  if (!row.from || !row.to || row.to < row.from) return null;
  return { from: row.from.slice(0, 10), to: row.to.slice(0, 10), crew };
}

function readProject(value: unknown): PlanningProject | null {
  if (!value || typeof value !== "object") return null;
  const row = value as PlanningProject;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  const year = typeof row.year === "number" && Number.isFinite(row.year) ? row.year : new Date().getFullYear();
  const workType: PlanningWorkType =
    row.workType === "Piling" || row.workType === "Civil" || row.workType === "Install" ? row.workType : "";
  const status: PlanningStatus =
    row.status === "Contracted" ||
    row.status === "Pending" ||
    row.status === "Early-stage" ||
    row.status === "Lost"
      ? row.status
      : "Pending";
  const phases = Array.isArray(row.phases)
    ? row.phases.map(readPhase).filter((item): item is PlanningPhase => Boolean(item))
    : [];
  return {
    id: row.id,
    year,
    name: row.name.trim() || "Untitled",
    site: typeof row.site === "string" ? row.site.trim() : "",
    workType,
    status,
    phases,
    notes: typeof row.notes === "string" ? row.notes : "",
  };
}

export function readPlanningBook(raw: unknown): WorkforcePlanningBook {
  if (!raw || typeof raw !== "object") return emptyPlanningBook();
  const projects = Array.isArray((raw as WorkforcePlanningBook).projects)
    ? (raw as WorkforcePlanningBook).projects
        .map(readProject)
        .filter((item): item is PlanningProject => Boolean(item))
    : [];
  return { projects };
}

export function loadPlanningBook(): WorkforcePlanningBook {
  if (typeof window === "undefined") return emptyPlanningBook();
  try {
    return readPlanningBook(JSON.parse(localStorage.getItem(WORKFORCE_PLANNING_KEY) ?? "{}"));
  } catch {
    return emptyPlanningBook();
  }
}

export function savePlanningBook(book: WorkforcePlanningBook) {
  if (typeof window === "undefined") return;
  const next = JSON.stringify(book);
  if (localStorage.getItem(WORKFORCE_PLANNING_KEY) === next) return;
  localStorage.setItem(WORKFORCE_PLANNING_KEY, next);
}

export function planningStatusTone(status: PlanningStatus): string {
  if (status === "Contracted") return "bg-emerald-100 text-emerald-950";
  if (status === "Pending") return "bg-orange-100 text-orange-950";
  if (status === "Early-stage") return "bg-rose-100 text-rose-950";
  return "bg-stone-200 text-stone-700";
}

export function planningBarTone(status: PlanningStatus): string {
  if (status === "Contracted") return "bg-emerald-500/85 text-white";
  if (status === "Pending") return "bg-orange-400/90 text-white";
  if (status === "Early-stage") return "bg-rose-400/85 text-white";
  return "bg-stone-400/80 text-white";
}

function slugPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function newPlanningProjectId(name: string, year: number) {
  return `plan-${year}-${slugPart(name) || "project"}-${Date.now().toString(36)}`;
}

export function projectsForYear(book: WorkforcePlanningBook, year: number): PlanningProject[] {
  return book.projects.filter((row) => row.year === year);
}

/** Monday of the week containing iso. */
export function mondayOf(iso: string) {
  return weekBounds(iso).start;
}

/** Inclusive date range → Monday week starts that overlap the range. */
export function mondaysOverlapping(from: string, to: string): string[] {
  if (!from || !to || to < from) return [];
  const first = mondayOf(from);
  const last = mondayOf(to);
  const out: string[] = [];
  let cursor = first;
  while (cursor <= last) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return out;
}

/** Crew needed on a Monday week for one project (0 if none / TBD). */
export function crewForWeek(project: PlanningProject, weekMonday: string): number {
  const weekEnd = addDays(weekMonday, 6);
  let total = 0;
  for (const phase of project.phases) {
    if (phase.to < weekMonday || phase.from > weekEnd) continue;
    total += phase.crew;
  }
  return total;
}

export type DemandMode = "contracted" | "contracted_pending";

function statusInMode(status: PlanningStatus, mode: DemandMode) {
  if (status === "Early-stage" || status === "Lost") return false;
  if (mode === "contracted") return status === "Contracted";
  return status === "Contracted" || status === "Pending";
}

/** Sum crew across projects for one Monday week. */
export function neededForWeek(
  projects: PlanningProject[],
  weekMonday: string,
  mode: DemandMode,
): number {
  let total = 0;
  for (const project of projects) {
    if (!statusInMode(project.status, mode)) continue;
    total += crewForWeek(project, weekMonday);
  }
  return total;
}

/** Person-weeks for a year (sum of weekly needed). */
export function personWeeksForYear(
  projects: PlanningProject[],
  year: number,
  mode: DemandMode,
): number {
  const weeks = mondayWeeksForYear(year);
  let total = 0;
  for (const week of weeks) {
    total += neededForWeek(projects, week, mode);
  }
  return total;
}

/** Season Mondays covering Mar–Dec of the year (and any phase spill). */
export function mondayWeeksForYear(year: number): string[] {
  const start = mondayOf(`${year}-03-01`);
  const end = mondayOf(`${year}-12-31`);
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return out;
}

/** Mondays spanning all dated phases in the project list (fallback to year season). */
export function mondayWeeksForProjects(projects: PlanningProject[], year: number): string[] {
  let min: string | null = null;
  let max: string | null = null;
  for (const project of projects) {
    for (const phase of project.phases) {
      if (!min || phase.from < min) min = phase.from;
      if (!max || phase.to > max) max = phase.to;
    }
  }
  if (!min || !max) return mondayWeeksForYear(year);
  const first = mondayOf(min);
  const last = mondayOf(max);
  const out: string[] = [];
  let cursor = first;
  while (cursor <= last) {
    out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return out;
}

type SeedSpec = {
  name: string;
  site: string;
  workType: PlanningWorkType;
  status: PlanningStatus;
  phases: PlanningPhase[];
};

function seed2027(): PlanningProject[] {
  const year = 2027;
  const specs: SeedSpec[] = [
    {
      name: "WTP - Pile",
      site: "Pond Inlet",
      workType: "Piling",
      status: "Contracted",
      phases: [{ from: "2027-04-26", to: "2027-05-23", crew: 5 }],
    },
    {
      name: "WTP - Civil",
      site: "Pond Inlet",
      workType: "Civil",
      status: "Contracted",
      phases: [
        { from: "2027-06-07", to: "2027-06-20", crew: 12 },
        { from: "2027-06-21", to: "2027-07-25", crew: 7 },
        { from: "2027-07-26", to: "2027-10-17", crew: 12 },
      ],
    },
    {
      name: "Shelter - Civil",
      site: "Pond Inlet",
      workType: "Civil",
      status: "Contracted",
      phases: [{ from: "2027-06-21", to: "2027-07-11", crew: 5 }],
    },
    {
      name: "Daycare - Civil",
      site: "Pond Inlet",
      workType: "Civil",
      status: "Contracted",
      phases: [{ from: "2027-07-19", to: "2027-07-25", crew: 5 }],
    },
    {
      name: "IDP - Civil",
      site: "Pond Inlet",
      workType: "Civil",
      status: "Contracted",
      phases: [{ from: "2027-07-12", to: "2027-07-18", crew: 5 }],
    },
    {
      name: "Daycare - Pile",
      site: "Pond Inlet",
      workType: "Piling",
      status: "Pending",
      phases: [{ from: "2027-05-24", to: "2027-06-20", crew: 5 }],
    },
    {
      name: "Nikku Lane - Pile",
      site: "Iqaluit",
      workType: "Piling",
      status: "Contracted",
      phases: [{ from: "2027-03-29", to: "2027-04-25", crew: 5 }],
    },
    {
      name: "Critical Pipeline - Civil",
      site: "Iqaluit",
      workType: "Civil",
      status: "Contracted",
      phases: [
        { from: "2027-05-03", to: "2027-06-20", crew: 6 },
        { from: "2027-07-26", to: "2027-09-12", crew: 6 },
      ],
    },
    {
      name: "Noble House - Civil",
      site: "Iqaluit",
      workType: "Civil",
      status: "Contracted",
      phases: [{ from: "2027-05-24", to: "2027-06-06", crew: 4 }],
    },
    {
      name: "Hospital Hill - Civil",
      site: "Iqaluit",
      workType: "Civil",
      status: "Contracted",
      phases: [{ from: "2027-09-13", to: "2027-09-26", crew: 4 }],
    },
    {
      name: "CCTV - Civil",
      site: "Iqaluit",
      workType: "Civil",
      status: "Contracted",
      phases: [{ from: "2027-06-07", to: "2027-07-11", crew: 4 }],
    },
    {
      name: "Steam - Phase A - Civil",
      site: "Iqaluit",
      workType: "Civil",
      status: "Contracted",
      phases: [{ from: "2027-08-23", to: "2027-09-12", crew: 4 }],
    },
    {
      name: "Nikku Lane - Civil",
      site: "Iqaluit",
      workType: "Civil",
      status: "Contracted",
      phases: [{ from: "2027-07-26", to: "2027-08-22", crew: 4 }],
    },
    {
      name: "Elders - Phase A",
      site: "Iqaluit",
      workType: "",
      status: "Pending",
      phases: [{ from: "2027-09-13", to: "2027-10-24", crew: 5 }],
    },
    {
      name: "Steam - Phase B",
      site: "Iqaluit",
      workType: "",
      status: "Pending",
      phases: [],
    },
    {
      name: "City Garage - Civil",
      site: "Iqaluit",
      workType: "Civil",
      status: "Pending",
      phases: [{ from: "2027-06-14", to: "2027-07-25", crew: 5 }],
    },
    {
      name: "Fitzgerald Land - Pile",
      site: "Iqaluit",
      workType: "Piling",
      status: "Pending",
      phases: [{ from: "2027-06-21", to: "2027-07-25", crew: 5 }],
    },
    {
      name: "Fitzgerald Land - Civil",
      site: "Iqaluit",
      workType: "Civil",
      status: "Pending",
      phases: [{ from: "2027-05-10", to: "2027-06-06", crew: 5 }],
    },
    {
      name: "C&K AV (342) Install",
      site: "Iqaluit",
      workType: "Install",
      status: "Pending",
      phases: [{ from: "2027-10-04", to: "2027-10-10", crew: 5 }],
    },
    {
      name: "Heritage - Phase A",
      site: "Iqaluit",
      workType: "",
      status: "Early-stage",
      phases: [],
    },
    {
      name: "Trigram Extension",
      site: "Iqaluit",
      workType: "",
      status: "Early-stage",
      phases: [],
    },
    {
      name: "QEW & Nipisa",
      site: "",
      workType: "",
      status: "Lost",
      phases: [
        { from: "2027-04-26", to: "2027-06-06", crew: 6 },
        { from: "2027-07-26", to: "2027-11-14", crew: 6 },
      ],
    },
  ];

  return specs.map((spec, index) => ({
    id: `seed-2027-${index + 1}-${slugPart(spec.name)}`,
    year,
    name: spec.name,
    site: spec.site,
    workType: spec.workType,
    status: spec.status,
    phases: spec.phases,
    notes: "",
  }));
}

/**
 * If `year` has no projects yet, copy the starter set once (2027 only for now).
 * Never overwrites a non-empty year.
 */
export function ensureYearSeeded(
  book: WorkforcePlanningBook,
  year: number,
): { book: WorkforcePlanningBook; seeded: boolean } {
  if (projectsForYear(book, year).length > 0) return { book, seeded: false };
  if (year !== 2027) return { book, seeded: false };
  return {
    book: { projects: [...book.projects, ...seed2027()] },
    seeded: true,
  };
}

export function upsertPlanningProject(
  book: WorkforcePlanningBook,
  project: PlanningProject,
): WorkforcePlanningBook {
  const index = book.projects.findIndex((row) => row.id === project.id);
  if (index < 0) return { projects: [...book.projects, project] };
  const projects = [...book.projects];
  projects[index] = project;
  return { projects };
}

export function removePlanningProject(
  book: WorkforcePlanningBook,
  projectId: string,
): WorkforcePlanningBook {
  return { projects: book.projects.filter((row) => row.id !== projectId) };
}

export function formatPhaseSummary(project: PlanningProject): string {
  if (!project.phases.length) return "TBD";
  return project.phases
    .map((phase) => {
      const from = formatShortDate(phase.from);
      const to = formatShortDate(phase.to);
      return `${from}–${to}: ${phase.crew}`;
    })
    .join("; ");
}

function formatShortDate(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[(m || 1) - 1]}`;
}

export function siteGroupLabel(site: string) {
  return site.trim() || "No site";
}

export function groupProjectsBySite(projects: PlanningProject[]): { site: string; projects: PlanningProject[] }[] {
  const order: string[] = [];
  const map = new Map<string, PlanningProject[]>();
  for (const project of projects) {
    const key = siteGroupLabel(project.site);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(project);
  }
  // Prefer Pond Inlet, Iqaluit, then others, then No site last.
  const rank = (site: string) => {
    if (site === "Pond Inlet") return 0;
    if (site === "Iqaluit") return 1;
    if (site === "No site") return 99;
    return 50;
  };
  return order
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((site) => ({ site, projects: map.get(site)! }));
}
