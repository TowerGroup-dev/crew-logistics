import { CREW_SCHEDULE_DATA } from "@/lib/crew-schedule-data";
import { bookingNeedsAttention, type CrewPersonOps } from "@/lib/crew-ops";
import { addDays, daysBetween } from "@/lib/dates";

/** Default on-site rotation when the sheet does not set a per-person value. */
export const DEFAULT_ROTATION_DAYS = 42;

/** Days before planned Out when replacement / return travel needs attention (2-week window). */
export const RETURN_SOON_DAYS = 14;

export type CrewEvent = {
  date: string;
  mark: string;
};

export type CrewPerson = {
  id: string;
  name: string;
  role: string;
  homeSites: string[];
  /** Projects this person can work on at the same time. */
  projectIds: string[];
  inDate: string | null;
  outDate: string | null;
  rotationDays: number | null;
  events: CrewEvent[];
  /** True when added in the app rather than imported from the sheet. */
  manual?: boolean;
};

export type CrewProject = {
  id: string;
  name: string;
  year?: number;
  source?: string;
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
  alerts: CrewAlert[];
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

export const CREW_SCHEDULE: CrewScheduleData = {
  year: CREW_SCHEDULE_DATA.year,
  source: CREW_SCHEDULE_DATA.source,
  sheet: "sheet" in CREW_SCHEDULE_DATA ? String(CREW_SCHEDULE_DATA.sheet) : undefined,
  note: CREW_SCHEDULE_DATA.note,
  sites: { ...CREW_SCHEDULE_DATA.sites },
  projects: ("projects" in CREW_SCHEDULE_DATA ? CREW_SCHEDULE_DATA.projects : []).map((project) => ({
    id: project.id,
    name: project.name,
    year: "year" in project ? Number(project.year) : CREW_SCHEDULE_DATA.year,
    source: "source" in project ? String(project.source) : "import",
  })),
  people: CREW_SCHEDULE_DATA.people.map((person) => ({
    id: person.id,
    name: person.name,
    role: person.role,
    homeSites: [...person.homeSites],
    projectIds: "projectIds" in person ? [...person.projectIds] : [],
    inDate: person.inDate,
    outDate: person.outDate,
    rotationDays: person.rotationDays,
    events: person.events.map((event) => ({ date: event.date, mark: event.mark })),
  })),
};

export const CREW_ROLES = [...new Set(CREW_SCHEDULE.people.map((person) => person.role))];
export const CREW_PROJECTS = CREW_SCHEDULE.projects;

export function projectLabel(projects: CrewProject[], projectId: string) {
  return projects.find((project) => project.id === projectId)?.name ?? projectId;
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
  for (const event of person.events) {
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
  const segments: { from: string; to: string; mark: string }[] = [];
  for (let index = 0; index < person.events.length; index += 1) {
    const event = person.events[index];
    const next = person.events[index + 1];
    const to = next ? addDays(next.date, -1) : `${CREW_SCHEDULE.year}-12-31`;
    segments.push({ from: event.date, to: to < event.date ? event.date : to, mark: event.mark });
  }
  return segments;
}

export function rotationFor(person: CrewPerson) {
  return person.rotationDays ?? DEFAULT_ROTATION_DAYS;
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

/** Physical site only — never treats Out / Off rotation as a location. */
function primarySite(mark: string | null) {
  if (!mark || isOffRotation(mark)) return null;
  const key = mark.toLowerCase();
  if (key.includes("transfer") || key === "in" || key.includes("yf") || key.includes("yeg") || key.includes("yk")) {
    return null;
  }
  return mark.split(" / ")[0]?.trim() || mark;
}

/**
 * Planned Out for a stretch starting at plannedIn.
 * Prefer the next Out event after In. Ignore sheet outDate values that belong to an earlier cycle.
 * Fall back to In + rotation (sheet Days = Out − In).
 */
export function resolvePlannedOut(person: CrewPerson, plannedIn: string) {
  const rotationDays = rotationFor(person);
  const nextOut = person.events.find((event) => event.date > plannedIn && isOffRotation(event.mark));
  if (nextOut?.date && nextOut.date > plannedIn) return nextOut.date;
  if (person.outDate && person.outDate > plannedIn) return person.outDate;
  return addDays(plannedIn, rotationDays);
}

/** Current or next on-site stretch: In = arrive at site, Out = leave site. */
export function currentStretch(person: CrewPerson, iso: string) {
  const segments = personSegments(person);
  const current = segments.find((segment) => segment.from <= iso && segment.to >= iso) ?? null;
  if (current && !isOffRotation(current.mark)) {
    return {
      plannedIn: current.from,
      plannedOut: resolvePlannedOut(person, current.from),
      mark: current.mark,
      upcoming: false,
    };
  }

  const nextOn = segments.find((segment) => segment.from > iso && !isOffRotation(segment.mark));
  if (nextOn) {
    return {
      plannedIn: nextOn.from,
      plannedOut: resolvePlannedOut(person, nextOn.from),
      mark: nextOn.mark,
      upcoming: true,
    };
  }

  if (person.inDate && person.inDate > iso) {
    return {
      plannedIn: person.inDate,
      plannedOut: resolvePlannedOut(person, person.inDate),
      mark: null as string | null,
      upcoming: true,
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
      };
    }
  }

  return {
    plannedIn: null as string | null,
    plannedOut: null as string | null,
    mark: current?.mark ?? null,
    upcoming: false,
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
  const plannedOutRaw = ops?.plannedOutOverride || stretch.plannedOut;
  const plannedOut =
    plannedIn && plannedOutRaw && plannedOutRaw > plannedIn
      ? plannedOutRaw
      : plannedIn
        ? resolvePlannedOut(person, plannedIn)
        : plannedOutRaw;
  const actualIn = ops?.actualIn ?? null;
  const actualOut = ops?.actualOut ?? null;
  const activeOnSite = duty === "on_site" || duty === "in_transit";
  const arrivedOn = activeOnSite ? actualIn || plannedIn : null;
  // Planned Out drives reminders; actual Out only clears overdue once recorded.
  const expectedOut = activeOnSite ? plannedOut || (arrivedOn ? addDays(arrivedOn, rotationDays) : null) : plannedOut;
  const daysOnSite = activeOnSite && arrivedOn && arrivedOn <= iso ? daysBetween(arrivedOn, iso) : null;
  const rotationDay = daysOnSite == null ? null : daysOnSite + 1;
  const weeksAway = daysOnSite == null ? null : Math.round((daysOnSite / 7) * 10) / 10;
  const daysUntilOut = expectedOut ? daysBetween(iso, expectedOut) : null;
  const overdue = Boolean(activeOnSite && daysUntilOut != null && daysUntilOut < 0 && !actualOut);
  // Due soon is driven only by planned/expected Out date, never by rotation %.
  const dueSoon = Boolean(activeOnSite && daysUntilOut != null && daysUntilOut >= 0 && daysUntilOut <= RETURN_SOON_DAYS);

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
    alerts,
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
