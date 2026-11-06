import { CREW_SCHEDULE_DATA } from "@/lib/crew-schedule-data";
import { bookingNeedsAttention, type CrewPersonOps } from "@/lib/crew-ops";
import { addDays, daysBetween } from "@/lib/dates";

/** Sheet noise that is not a camp assignment (keep local to avoid import cycles). */
const NON_SITE_MARKS = new Set([
  "IN",
  "OUT",
  "TRANSFER",
  "TBC",
  "YEG",
  "YF",
  "YK",
  "YFB",
  "YYZ",
  "YOW",
  "YYC",
  "YUL",
  "OFF",
  "HOME",
  "TRAVEL",
  "TRANSIT",
]);

function worksiteFromMarkLocal(mark: string | null | undefined): string | null {
  if (!mark) return null;
  for (const part of mark.split(/[/|,]/)) {
    const code = part.trim().toUpperCase();
    if (code.length >= 2 && !NON_SITE_MARKS.has(code)) return code;
  }
  return null;
}

/** Default on-site rotation when the sheet does not set a per-person value. */
export const DEFAULT_ROTATION_DAYS = 42;

/** Days before planned Out when replacement / return travel needs attention (2-week window). */
export const RETURN_SOON_DAYS = 14;

/** Days on site when the person is flagged 4 weeks out (review required). */
export const FOUR_WEEK_TRACK_DAYS = 28;

/** Built-in schedule years (app is the source of truth, not Excel). */
export const CREW_AVAILABLE_YEARS = [2026] as const;

export type CrewEvent = {
  date: string;
  mark: string;
};

/**
 * One on-site stretch read from the sheet: arrive (In) on `from`, leave (Out) on `out`.
 * `departure` says where the Out date came from: typed OUT ("marked"), the end of the shaded cells
 * ("shading-ended" / "travel-cell"), or nothing yet ("open").
 */
export type CrewStint = {
  site: string;
  sites: string[];
  from: string;
  out: string | null;
  arrival: string;
  departure: string | null;
  tentative: boolean;
  note?: string;
  /** Role for this stretch only, can differ from the person's usual roles. */
  role?: string;
};

/** Historical booking row from the "Crew - Flights - 2026" sheet. */
export type CrewFlight = {
  arriveIqa: string | null;
  arriveRef: string | null;
  departIqa: string | null;
  departRef: string | null;
  camp: string | null;
  carService: string | null;
  note: string | null;
};

export type CrewPerson = {
  id: string;
  name: string;
  /** Primary role used for grouping / filters. */
  role: string;
  /** All roles when the sheet lists the same person under more than one trade. */
  roles: string[];
  homeSites: string[];
  /** Projects this person can work on at the same time. */
  projectIds: string[];
  inDate: string | null;
  outDate: string | null;
  rotationDays: number | null;
  events: CrewEvent[];
  /** True when added in the app rather than imported from the sheet. */
  manual?: boolean;
  /** False when the person's row is hidden on the sheet (not on the current schedule). */
  active?: boolean;
  sheetRow?: number;
  /** On-site stretches read from the sheet (marks + shading). Preferred over events for In/Out dates. */
  stints?: CrewStint[];
  fullName?: string;
  flights?: CrewFlight[];
  agreementSigned?: boolean;
  /** Things on the sheet that look inconsistent for this person. */
  warnings?: string[];
  /** Extra sheet row ids folded into this person (multi-role merge). */
  aliases?: string[];
};

export function roleLabel(person: Pick<CrewPerson, "role" | "roles">) {
  const roles = person.roles?.length ? person.roles : [person.role];
  return roles.join(" / ");
}

function roleRank(value: string) {
  const index = (CREW_ROLE_ORDER as readonly string[]).indexOf(value);
  return index === -1 ? CREW_ROLE_ORDER.length : index;
}

function mergeEvents(events: CrewEvent[]) {
  const byDate = new Map<string, string>();
  for (const event of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
    byDate.set(event.date, event.mark);
  }
  return [...byDate.entries()].map(([date, mark]) => ({ date, mark }));
}

/** One roster row per person name, multi-role sheet rows become roles[]. */
export function mergePeopleByName(people: CrewPerson[]): CrewPerson[] {
  const groups = new Map<string, CrewPerson[]>();
  for (const person of people) {
    const key = person.name.trim().toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(person);
    groups.set(key, list);
  }

  return [...groups.values()].map((group) => {
    if (group.length === 1) {
      const sole = group[0]!;
      const roles = sole.roles?.length ? sole.roles : [sole.role];
      return {
        ...sole,
        roles,
        role: roles[0] ?? sole.role,
        events: mergeEvents(sole.events),
      };
    }

    const sorted = [...group].sort(
      (a, b) => roleRank(a.role) - roleRank(b.role) || a.id.localeCompare(b.id),
    );
    const primary = sorted[0]!;
    const roles = [
      ...new Set(sorted.flatMap((person) => (person.roles?.length ? person.roles : [person.role]))),
    ].sort((a, b) => roleRank(a) - roleRank(b) || a.localeCompare(b));

    const homeSites = [...new Set(sorted.flatMap((person) => person.homeSites))];
    const projectIds = [...new Set(sorted.flatMap((person) => person.projectIds))];
    const events = mergeEvents(sorted.flatMap((person) => person.events));
    const stints = sorted.flatMap((person) => person.stints ?? []);
    const flights = sorted.flatMap((person) => person.flights ?? []);
    const warnings = [...new Set(sorted.flatMap((person) => person.warnings ?? []))];
    const aliases = sorted.slice(1).map((person) => person.id);

    const latestIn = sorted
      .map((person) => person.inDate)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
    const latestOut = sorted
      .map((person) => person.outDate)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    return {
      ...primary,
      role: roles[0] ?? primary.role,
      roles,
      homeSites,
      projectIds,
      inDate: latestIn,
      outDate: latestOut,
      rotationDays: primary.rotationDays ?? sorted.find((person) => person.rotationDays != null)?.rotationDays ?? null,
      events,
      stints: stints.length ? stints : undefined,
      flights: flights.length ? flights : undefined,
      warnings: warnings.length ? warnings : undefined,
      aliases: aliases.length ? aliases : undefined,
      active: sorted.some((person) => person.active !== false),
      agreementSigned: sorted.some((person) => person.agreementSigned),
    };
  });
}

export type CrewProject = {
  id: string;
  name: string;
  year?: number;
  source?: string;
  region?: string | null;
  active?: boolean;
  starred?: boolean;
  /** Date ranges the project is shaded as active on the sheet's project timeline. */
  windows?: { from: string | null; to: string | null }[];
  /** Per-person IN / OUT on this job. */
  assignments?: { personId: string; from: string | null; to: string | null }[];
  /** Crew needed by role, from the "Required Staff" sheet. */
  needs?: Record<string, number>;
  parent?: string;
  startsOn?: string | null;
};

export type CrewDutyStatus =
  | "on_site"
  | "off_rotation"
  | "in_transit"
  | "upcoming"
  | "unassigned";

export type CrewAlert =
  | "overdue"
  | "due_soon"
  | "return_flight"
  | "outbound_flight"
  | "accommodation";

export type CrewSnapshot = {
  person: CrewPerson;
  mark: string | null;
  /** Operational status: on site, off rotation, in transit, upcoming, or unassigned. */
  duty: CrewDutyStatus;
  /** Physical worksite code only (never "Out"). */
  site: string | null;
  rotationDays: number;
  /** Planned In for the current (or next) on-site stretch. */
  plannedIn: string | null;
  /** Planned Out for the current (or next) on-site stretch. Drives departure reminders. */
  plannedOut: string | null;
  actualIn: string | null;
  actualOut: string | null;
  /** Effective arrival used for days on site (actual preferred). */
  arrivedOn: string | null;
  /** Effective expected departure date (ops override > planned Out). */
  expectedOut: string | null;
  /**
   * Days on site so far, sheet-compatible: today − In.
   * Arrival day is 0 elapsed; day 42 is the default planned Out when Out = In + 42.
   */
  daysOnSite: number | null;
  /** @deprecated use daysOnSite */
  daysAway: number | null;
  weeksAway: number | null;
  /** Day number for display (arrival = day 1). */
  rotationDay: number | null;
  daysUntilOut: number | null;
  overdue: boolean;
  dueSoon: boolean;
  /** True when on site 4+ weeks, 4 weeks out, review required. */
  fourWeeksOut: boolean;
  alerts: CrewAlert[];
  /** Where plannedOut came from: typed OUT, end of shading on the sheet, or In + rotation length. */
  outSource: "typed" | "shading" | "rotation" | null;
  /** Arrival typed as "In" (site not set yet) or similar tentative entry. */
  tentative: boolean;
};

export type CrewScheduleData = {
  year: number;
  source: string;
  sheet?: string;
  note?: string;
  sites: Record<string, string>;
  projects: CrewProject[];
  people: CrewPerson[];
};

const HOUSING_SLOT_IDS = new Set(["side-1", "side-2", "new-housing"]);

export function isHousingSlot(projectId: string) {
  return HOUSING_SLOT_IDS.has(projectId);
}

const ROLE_ALIASES: Record<string, string> = {
  Managers: "Manager",
  Surveyors: "Surveyor",
  "Operators / Truck Drivers": "Operator/Truck Driver",
  "Operators/Truck Drivers": "Operator/Truck Driver",
  Labourers: "Labourer",
  Mechanics: "Mechanic",
};

export function normalizeRole(role: string) {
  return ROLE_ALIASES[role] ?? role;
}

export const CREW_ROLE_ORDER = [
  "Manager",
  "Surveyor",
  "Operator/Truck Driver",
  "Labourer",
  "Mechanic",
] as const;

export const CREW_SCHEDULE: CrewScheduleData = {
  year: CREW_SCHEDULE_DATA.year,
  source: CREW_SCHEDULE_DATA.source,
  sheet: "sheet" in CREW_SCHEDULE_DATA ? String(CREW_SCHEDULE_DATA.sheet) : undefined,
  note: "note" in CREW_SCHEDULE_DATA ? String(CREW_SCHEDULE_DATA.note) : undefined,
  sites: { ...CREW_SCHEDULE_DATA.sites },
  // Visible project-timeline rows only (17 on the sheet).
  projects: ("projects" in CREW_SCHEDULE_DATA ? CREW_SCHEDULE_DATA.projects : [])
    .filter((project) => {
      const row = project as {
        source?: string;
        active?: boolean;
      };
      if (row.source !== "project-timeline") return false;
      if (row.active === false) return false;
      return true;
    })
    .map((project) => {
      const row = project as unknown as {
        id: string;
        name: string;
        year?: number;
        source?: string;
        region?: string | null;
        active?: boolean;
        starred?: boolean;
        windows?: { from: string | null; to: string | null }[];
        needs?: Record<string, number>;
        parent?: string;
        startsOn?: string | null;
      };
      return {
        id: row.id,
        name: row.name,
        year: row.year ?? CREW_SCHEDULE_DATA.year,
        source: row.source ?? "import",
        region: row.region,
        active: row.active,
        starred: row.starred,
        windows: row.windows?.map((window) => ({ from: window.from, to: window.to })),
        needs: row.needs ? { ...row.needs } : undefined,
        parent: row.parent,
        startsOn: row.startsOn,
      };
    }),
  // Only visible CREW rows from the sheet (hidden Excel rows are finished / not on this roster).
  // Same name under multiple trades → one person with roles[].
  people: mergePeopleByName(
    CREW_SCHEDULE_DATA.people
      .filter((person) => !("active" in person) || Boolean(person.active))
      .map((person) => {
        const role = normalizeRole(person.role);
        return {
          id: person.id,
          name: person.name,
          role,
          roles: [role],
          homeSites: [...person.homeSites],
          projectIds: ("projectIds" in person ? [...person.projectIds] : []).filter((id) => !isHousingSlot(id)),
          inDate: person.inDate,
          outDate: person.outDate,
          rotationDays: person.rotationDays,
          events: mergeEvents(person.events.map((event) => ({ date: event.date, mark: event.mark }))),
          active: true,
          sheetRow: "sheetRow" in person ? Number(person.sheetRow) : undefined,
          stints: "stints" in person ? person.stints.map((stint) => ({ ...stint, sites: [...stint.sites] })) : undefined,
          fullName: "fullName" in person ? String(person.fullName) : undefined,
          flights: "flights" in person ? person.flights.map((flight) => ({ ...flight })) : undefined,
          agreementSigned: "agreementSigned" in person ? Boolean(person.agreementSigned) : undefined,
          warnings: "warnings" in person ? [...person.warnings] : undefined,
        };
      }),
  ),
};

export const CREW_ROLES = [
  ...CREW_ROLE_ORDER.filter((role) =>
    CREW_SCHEDULE.people.some((person) => (person.roles?.length ? person.roles : [person.role]).includes(role)),
  ),
  ...[
    ...new Set(
      CREW_SCHEDULE.people.flatMap((person) =>
        (person.roles?.length ? person.roles : [person.role]).map((role) => normalizeRole(role)),
      ),
    ),
  ].filter((role) => !(CREW_ROLE_ORDER as readonly string[]).includes(role)),
];
export const CREW_PROJECTS = CREW_SCHEDULE.projects;

export function projectLabel(projects: CrewProject[], projectId: string) {
  return projects.find((project) => project.id === projectId)?.name ?? projectId;
}

/** Project ids that belong on the 17-project list, never Housing slots. */
export function scheduleProjectIds(ids: string[], projects: CrewProject[]) {
  const allowed = new Set(projects.map((project) => project.id));
  return ids.filter((id) => allowed.has(id) && !isHousingSlot(id));
}

const CAMP_SITES = new Set(["IQA"]);

export function siteLabel(code: string) {
  return CREW_SCHEDULE.sites[code] ?? code;
}

export function isOffRotation(mark: string | null | undefined) {
  if (!mark) return true;
  const key = mark.toLowerCase();
  return key === "out" || key === "off rotation";
}

export function isCampSite(mark: string | null | undefined) {
  if (!mark || isOffRotation(mark)) return false;
  return mark.split(" / ").some((part) => CAMP_SITES.has(part.trim().toUpperCase()));
}

/** Expand sparse spreadsheet events forward until the next event. */
export function statusOnDate(person: CrewPerson, iso: string): string | null {
  let current: string | null = null;
  const events = [...person.events].sort((a, b) => a.date.localeCompare(b.date));
  for (const event of events) {
    if (event.date > iso) break;
    current = event.mark;
  }
  return current;
}

export function peopleOnDate(iso: string, options?: { site?: string | null; role?: string | null; campOnly?: boolean }) {
  return CREW_SCHEDULE.people
    .map((person) => ({ person, mark: statusOnDate(person, iso) }))
    .filter(({ person, mark }) => {
      if (options?.role && person.role !== options.role) return false;
      if (options?.campOnly && !isCampSite(mark)) return false;
      if (options?.site) {
        if (!mark) return false;
        if (options.site === "Out") return isOffRotation(mark);
        return mark.split(" / ").some((part) => part.trim().toUpperCase() === options.site);
      }
      // Full roster when no site filter is set.
      return true;
    })
    .sort((a, b) => a.person.role.localeCompare(b.person.role) || a.person.name.localeCompare(b.person.name));
}

export function dayCounts(iso: string) {
  const rows = CREW_SCHEDULE.people.map((person) => ({ person, mark: statusOnDate(person, iso) }));
  let camp = 0;
  let out = 0;
  let other = 0;
  let known = 0;
  const bySite = new Map<string, number>();
  for (const row of rows) {
    if (!row.mark) continue;
    known += 1;
    if (isOffRotation(row.mark)) {
      out += 1;
      continue;
    }
    if (isCampSite(row.mark)) camp += 1;
    else other += 1;
    for (const part of row.mark.split(" / ")) {
      const code = part.trim();
      if (!code || code.toLowerCase() === "out") continue;
      bySite.set(code, (bySite.get(code) ?? 0) + 1);
    }
  }
  return { total: known, camp, out, other, bySite };
}

export function personSegments(person: CrewPerson) {
  if (person.events.length === 0) return [] as { from: string; to: string; mark: string }[];
  const events = [...person.events].sort((a, b) => a.date.localeCompare(b.date));
  const segments: { from: string; to: string; mark: string }[] = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    const next = events[index + 1];
    const to = next ? addDays(next.date, -1) : scheduleYearLastDay();
    segments.push({ from: event.date, to: to < event.date ? event.date : to, mark: event.mark });
  }
  return segments;
}

const SITE_REGION: Record<string, string> = {
  IQA: "Iqaluit",
  POND: "Pond Inlet",
  ALRT: "Alert",
  KUG: "Kugluktuk",
};

function rangesOverlap(aFrom: string, aTo: string, bFrom: string | null, bTo: string | null) {
  const from = bFrom || aFrom;
  const to = bTo || aTo;
  return from <= aTo && to >= aFrom;
}

export type ProjectPhase = "completed" | "ongoing" | "future";

/** Earliest start / latest finish across windows (and startsOn). */
export function projectSpan(project: CrewProject) {
  const windows = project.windows?.length
    ? project.windows
    : project.startsOn
      ? [{ from: project.startsOn, to: null as string | null }]
      : [];
  let from: string | null = null;
  let to: string | null = null;
  let openEnded = windows.length === 0;
  for (const window of windows) {
    if (window.from && (!from || window.from < from)) from = window.from;
    if (!window.to) openEnded = true;
    else if (!to || window.to > to) to = window.to;
  }
  if (openEnded) to = null;
  return { from, to };
}

export function projectPhase(project: CrewProject, today: string): ProjectPhase {
  const { from, to } = projectSpan(project);
  if (to && to < today) return "completed";
  if (from && from > today) return "future";
  return "ongoing";
}

function projectOverlapsDay(project: CrewProject, day: string) {
  const windows = project.windows?.length
    ? project.windows
    : project.startsOn
      ? [{ from: project.startsOn, to: null as string | null }]
      : [];
  if (windows.length === 0) return false;
  return windows.some((window) => rangesOverlap(day, day, window.from, window.to));
}

/**
 * Single current job for a person as of `today`.
 * Prefers an assigned ongoing project; otherwise one timeline match at site.
 * Blank when nothing is active today (does not list every historical project).
 */
export function currentProjectForPerson(
  person: CrewPerson,
  today: string,
  site: string | null = null,
  projects: CrewProject[] = CREW_PROJECTS,
): CrewProject | null {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const assigned = person.projectIds.map((id) => byId.get(id)).filter((project): project is CrewProject => Boolean(project));

  const activeAssigned = assigned
    .filter((project) => {
      const seat = project.assignments?.find((row) => row.personId === person.id);
      if (seat) {
        const from = seat.from || "0000-01-01";
        const to = seat.to || "9999-12-31";
        return from <= today && to >= today;
      }
      return projectOverlapsDay(project, today) || projectPhase(project, today) === "ongoing";
    })
    .sort((a, b) => {
      const aSeat = a.assignments?.find((row) => row.personId === person.id);
      const bSeat = b.assignments?.find((row) => row.personId === person.id);
      const aFrom = aSeat?.from || projectSpan(a).from || "";
      const bFrom = bSeat?.from || projectSpan(b).from || "";
      return bFrom.localeCompare(aFrom);
    });
  if (activeAssigned[0]) return activeAssigned[0];

  if (site) {
    const region = SITE_REGION[site] || site;
    const timeline = projects
      .filter((project) => {
        if (project.region && project.region !== region) return false;
        return projectOverlapsDay(project, today);
      })
      .sort((a, b) => (projectSpan(b).from || "").localeCompare(projectSpan(a).from || ""));
    if (timeline[0]) return timeline[0];
  }

  return null;
}

/** Assigned projects, or timeline projects at that site overlapping the dates. */
export function workForAssignment(
  person: CrewPerson,
  site: string,
  from: string,
  to: string,
  projects: CrewProject[] = CREW_PROJECTS,
) {
  const current = currentProjectForPerson(person, from, site, projects);
  return current ? [current.name] : [];
}

export function workLabelForAssignment(
  person: CrewPerson,
  site: string,
  from: string,
  to: string,
  projects: CrewProject[] = CREW_PROJECTS,
) {
  return workForAssignment(person, site, from, to, projects).join(" · ");
}

/** On-site bars for the year tape (Out stretches are left blank). */
export function yearOnSiteBars(person: CrewPerson, year = CREW_SCHEDULE.year) {
  const yearStart = `${year}-01-01`;
  const seasonEnd = scheduleYearLastDay(year);
  const yearDays = daysBetween(yearStart, seasonEnd) + 1;

  const raw =
    person.stints && person.stints.length > 0
      ? person.stints
          .map((stint) => {
            const site =
              worksiteFromMarkLocal(stint.site) ||
              stint.sites.map(worksiteFromMarkLocal).find(Boolean) ||
              null;
            if (!site) return null;
            const to = stint.out ? addDays(stint.out, -1) : seasonEnd;
            return {
              from: stint.from,
              to: to > seasonEnd ? seasonEnd : to,
              site,
              role: stint.role,
            };
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row))
      : personSegments(person)
          .filter((segment) => !isOffRotation(segment.mark) && worksiteFromMarkLocal(segment.mark))
          .map((segment) => ({
            from: segment.from,
            to: segment.to > seasonEnd ? seasonEnd : segment.to,
            site: worksiteFromMarkLocal(segment.mark) || segment.mark,
            role: undefined as string | undefined,
          }));

  return raw
    .map((bar) => {
      const from = bar.from < yearStart ? yearStart : bar.from;
      const to = bar.to > seasonEnd ? seasonEnd : bar.to;
      if (to < yearStart || from > seasonEnd || to < from) return null;
      const start = daysBetween(yearStart, from);
      const end = daysBetween(yearStart, to) + 1;
      return {
        from,
        to,
        site: bar.site,
        role: bar.role,
        work: bar.role || workLabelForAssignment(person, bar.site, from, to),
        leftPct: (start / yearDays) * 100,
        widthPct: Math.max(((end - start) / yearDays) * 100, 0.35),
      };
    })
    .filter((bar): bar is NonNullable<typeof bar> => Boolean(bar));
}

export function yearTodayMarker(iso: string, year = CREW_SCHEDULE.year) {
  const yearStart = `${year}-01-01`;
  const seasonEnd = scheduleYearLastDay(year);
  if (iso < yearStart || iso > seasonEnd) return null;
  const yearDays = daysBetween(yearStart, seasonEnd) + 1;
  return (daysBetween(yearStart, iso) / yearDays) * 100;
}

/** Sheet rule: "Rotation set = 6*7" for crew, "Mechanic = 7*4". */
export const MECHANIC_ROTATION_DAYS = 28;

export function rotationFor(person: CrewPerson) {
  if (person.rotationDays) return person.rotationDays;
  return person.role === "Mechanic" || person.role === "Mechanics"
    ? MECHANIC_ROTATION_DAYS
    : DEFAULT_ROTATION_DAYS;
}

function dutyFromMark(mark: string | null, hasUpcoming: boolean): CrewDutyStatus {
  if (!mark) return hasUpcoming ? "upcoming" : "unassigned";
  if (isOffRotation(mark)) return hasUpcoming ? "upcoming" : "off_rotation";
  const key = mark.toLowerCase();
  if (key.includes("transfer") || key === "in" || key.includes("yf") || key.includes("yeg") || key.includes("yk")) {
    return "in_transit";
  }
  return "on_site";
}

/** Physical site only, never treats Out / Off rotation as a location. */
function primarySite(mark: string | null) {
  if (!mark || isOffRotation(mark)) return null;
  const key = mark.toLowerCase();
  if (key.includes("transfer") || key === "in" || key.includes("yf") || key.includes("yeg") || key.includes("yk")) {
    return null;
  }
  return mark.split(" / ")[0]?.trim() || mark;
}

/**
 * Season end / last day on site when no Out is marked.
 * 2026 crew finishes 18 Dec — Out is that day for everyone still open.
 */
export function scheduleYearLastDay(year = CREW_SCHEDULE.year) {
  const rules = "rules" in CREW_SCHEDULE_DATA ? CREW_SCHEDULE_DATA.rules : null;
  const ends =
    rules && "calendarEnds" in rules && typeof rules.calendarEnds === "string"
      ? rules.calendarEnds.slice(0, 10)
      : null;
  if (ends && ends.startsWith(`${year}-`)) return ends;
  return `${year}-12-18`;
}

/** Exclusive Out for open stays: day after season end (place runs through Dec 18). */
export function scheduleYearOutExclusive(year = CREW_SCHEDULE.year) {
  return addDays(scheduleYearLastDay(year), 1);
}

/**
 * Exclusive Out (first day off site) for a stretch starting at plannedIn.
 * Prefer the next Out event after In. No Out on the sheet → day after season end
 * (18 Dec 2026). Place end / displayed Out = exclusive − 1 day.
 */
export function resolvePlannedOut(person: CrewPerson, plannedIn: string) {
  const seasonExclusive = scheduleYearOutExclusive();
  const events = [...person.events].sort((a, b) => a.date.localeCompare(b.date));
  const nextOut = events.find((event) => event.date > plannedIn && isOffRotation(event.mark));
  if (nextOut?.date && nextOut.date > plannedIn) {
    return nextOut.date > seasonExclusive ? seasonExclusive : nextOut.date;
  }
  if (person.outDate && person.outDate > plannedIn) {
    return person.outDate > seasonExclusive ? seasonExclusive : person.outDate;
  }
  return seasonExclusive;
}

/** Exclusive Out for a sheet stint. Open stints run through season end (Out = Dec 18). */
function stintOut(_person: CrewPerson, stint: CrewStint) {
  const seasonExclusive = scheduleYearOutExclusive();
  if (!stint.out) return seasonExclusive;
  return stint.out > seasonExclusive ? seasonExclusive : stint.out;
}

/** Last day on site (place end). Out in the UI is always this date; extensions move it. */
export function placeEndFromExclusiveOut(exclusiveOut: string | null | undefined) {
  if (!exclusiveOut) return null;
  const end = addDays(exclusiveOut, -1);
  const yearEnd = scheduleYearLastDay();
  return end > yearEnd ? yearEnd : end;
}

function stintOutSource(stint: CrewStint): "typed" | "shading" | "rotation" {
  if (!stint.out) return "rotation";
  return stint.departure === "marked" ? "typed" : "shading";
}

/** Stint covering `iso` (arrival day included, Out day excluded), else the next one. */
export function stintFor(person: CrewPerson, iso: string) {
  const stints = person.stints ?? [];
  const yearEndExclusive = scheduleYearOutExclusive();
  const current =
    stints.find((stint) => {
      const out = stint.out || yearEndExclusive;
      return stint.from <= iso && iso < out && iso <= scheduleYearLastDay();
    }) ?? null;
  if (current) return { stint: current, upcoming: false };
  const next = stints.find((stint) => stint.from > iso && stint.from <= scheduleYearLastDay()) ?? null;
  return next ? { stint: next, upcoming: true } : null;
}

/** Current or next on-site stretch: In = arrive at site, Out = leave site. */
export function currentStretch(person: CrewPerson, iso: string) {
  if (person.stints && person.stints.length > 0) {
    const found = stintFor(person, iso);
    if (!found) {
      return {
        plannedIn: null as string | null,
        plannedOut: null as string | null,
        mark: statusOnDate(person, iso),
        upcoming: false,
        outSource: null as "typed" | "shading" | "rotation" | null,
        tentative: false,
      };
    }
    return {
      plannedIn: found.stint.from,
      plannedOut: stintOut(person, found.stint),
      mark: found.upcoming ? found.stint.site : statusOnDate(person, iso),
      upcoming: found.upcoming,
      outSource: stintOutSource(found.stint) as "typed" | "shading" | "rotation" | null,
      tentative: found.stint.tentative,
    };
  }

  const segments = personSegments(person);
  const current = segments.find((segment) => segment.from <= iso && segment.to >= iso) ?? null;
  if (current && !isOffRotation(current.mark)) {
    return {
      plannedIn: current.from,
      plannedOut: resolvePlannedOut(person, current.from),
      mark: current.mark,
      upcoming: false,
      outSource: "rotation" as "typed" | "shading" | "rotation" | null,
      tentative: false,
    };
  }

  const nextOn = segments.find((segment) => segment.from > iso && !isOffRotation(segment.mark));
  if (nextOn) {
    return {
      plannedIn: nextOn.from,
      plannedOut: resolvePlannedOut(person, nextOn.from),
      mark: nextOn.mark,
      upcoming: true,
      outSource: "rotation" as "typed" | "shading" | "rotation" | null,
      tentative: false,
    };
  }

  if (person.inDate && person.inDate > iso) {
    return {
      plannedIn: person.inDate,
      plannedOut: resolvePlannedOut(person, person.inDate),
      mark: null as string | null,
      upcoming: true,
      outSource: "rotation" as "typed" | "shading" | "rotation" | null,
      tentative: false,
    };
  }

  if (person.inDate && (!person.outDate || person.outDate > person.inDate) && person.inDate <= iso) {
    const stillOpen = !person.outDate || person.outDate > iso;
    if (stillOpen) {
      return {
        plannedIn: person.inDate,
        plannedOut: resolvePlannedOut(person, person.inDate),
        mark: current?.mark ?? null,
        upcoming: false,
        outSource: "rotation" as "typed" | "shading" | "rotation" | null,
        tentative: false,
      };
    }
  }

  return {
    plannedIn: null as string | null,
    plannedOut: null as string | null,
    mark: current?.mark ?? null,
    upcoming: false,
    outSource: null as "typed" | "shading" | "rotation" | null,
    tentative: false,
  };
}

export function dutyLabel(duty: CrewDutyStatus) {
  switch (duty) {
    case "on_site":
      return "On site";
    case "off_rotation":
      return "Off rotation";
    case "in_transit":
      return "In transit";
    case "upcoming":
      return "Upcoming";
    case "unassigned":
      return "Unassigned";
  }
}

export function crewSnapshot(person: CrewPerson, iso: string, ops?: CrewPersonOps | null): CrewSnapshot {
  const mark = statusOnDate(person, iso);
  const stretch = currentStretch(person, iso);
  const duty = dutyFromMark(mark, stretch.upcoming && Boolean(stretch.plannedIn && stretch.plannedIn > iso));
  const rotationDays = rotationFor(person);
  const plannedIn = ops?.plannedInOverride || stretch.plannedIn;
  // Stretch / overrides store exclusive Out (first day off). UI Out = place end.
  const exclusiveOutRaw = ops?.plannedOutOverride || stretch.plannedOut;
  const exclusiveOut =
    plannedIn && exclusiveOutRaw && exclusiveOutRaw > plannedIn
      ? exclusiveOutRaw
      : plannedIn
        ? resolvePlannedOut(person, plannedIn)
        : exclusiveOutRaw;
  const plannedOut = placeEndFromExclusiveOut(exclusiveOut);
  const actualIn = ops?.actualIn ?? null;
  const actualOut = ops?.actualOut ?? null;
  const activeOnSite = duty === "on_site" || duty === "in_transit";
  const arrivedOn = activeOnSite ? actualIn || plannedIn : null;
  // Out is always the end of the place; extensions move it. Drives reminders.
  const expectedOut = activeOnSite
    ? plannedOut || (arrivedOn ? placeEndFromExclusiveOut(addDays(arrivedOn, rotationDays)) : null)
    : plannedOut;
  const daysOnSite = activeOnSite && arrivedOn && arrivedOn <= iso ? daysBetween(arrivedOn, iso) : null;
  const rotationDay = daysOnSite == null ? null : daysOnSite + 1;
  const weeksAway = daysOnSite == null ? null : Math.round((daysOnSite / 7) * 10) / 10;
  const daysUntilOut = expectedOut ? daysBetween(iso, expectedOut) : null;
  const overdue = Boolean(activeOnSite && daysUntilOut != null && daysUntilOut < 0 && !actualOut);
  // Due soon is driven only by planned/expected Out date, never by rotation %.
  const dueSoon = Boolean(activeOnSite && daysUntilOut != null && daysUntilOut >= 0 && daysUntilOut <= RETURN_SOON_DAYS);
  const fourWeeksOut = Boolean(activeOnSite && daysOnSite != null && daysOnSite >= FOUR_WEEK_TRACK_DAYS);

  const alerts: CrewAlert[] = [];
  if (overdue) alerts.push("overdue");
  if (dueSoon) alerts.push("due_soon");
  if (ops) {
    if (activeOnSite && bookingNeedsAttention(ops.returnFlight)) alerts.push("return_flight");
    if (!activeOnSite && plannedIn && daysBetween(iso, plannedIn) <= RETURN_SOON_DAYS && bookingNeedsAttention(ops.outboundFlight)) {
      alerts.push("outbound_flight");
    }
    if (activeOnSite && bookingNeedsAttention(ops.accommodation)) alerts.push("accommodation");
  } else if (activeOnSite && (overdue || dueSoon)) {
    alerts.push("return_flight");
  }

  return {
    person,
    mark,
    duty,
    site: primarySite(mark),
    rotationDays,
    plannedIn,
    plannedOut,
    actualIn,
    actualOut,
    arrivedOn,
    expectedOut,
    daysOnSite,
    daysAway: daysOnSite,
    weeksAway,
    rotationDay,
    daysUntilOut,
    overdue,
    dueSoon,
    fourWeeksOut,
    alerts,
    outSource: ops?.plannedOutOverride ? "typed" : stretch.outSource,
    tentative: stretch.tentative,
  };
}

export function crewOverview(
  iso: string,
  opsBook: Record<string, CrewPersonOps> = {},
  people: CrewPerson[] = CREW_SCHEDULE.people,
) {
  const rows = people.map((person) => crewSnapshot(person, iso, opsBook[person.id] ?? null));
  return {
    rows,
    total: rows.length,
    onSite: rows.filter((row) => row.duty === "on_site").length,
    offRotation: rows.filter((row) => row.duty === "off_rotation").length,
    inTransit: rows.filter((row) => row.duty === "in_transit").length,
    upcoming: rows.filter((row) => row.duty === "upcoming").length,
    unassigned: rows.filter((row) => row.duty === "unassigned").length,
    overdue: rows.filter((row) => row.overdue).length,
    dueSoon: rows.filter((row) => row.dueSoon).length,
    travelAttention: rows.filter((row) =>
      row.alerts.some((alert) => alert === "return_flight" || alert === "outbound_flight" || alert === "accommodation"),
    ).length,
  };
}
