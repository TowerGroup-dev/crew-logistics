"use client";

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { addDays, formatMedium } from "@/lib/dates";
import { CrewConfirmDialog } from "@/components/crew-confirm-dialog";
import { buildSiteHistory, daysAtSite, firstNameOf, roleRank, type PersonSiteHistory } from "@/lib/crew-planning-history";
import type { CrewPerson } from "@/lib/crew-schedule";
import {
  crewForWeek,
  groupProjectsBySite,
  crewClashWeeks,
  mondayOf,
  PLANNING_ROLE_SUGGESTIONS,
  projectPeakCrew,
  type PlanningCrewMember,
  mondayWeeksForProjects,
  neededForWeek,
  newPlanningProjectId,
  PLANNING_STATUSES,
  planningColour,
  PLANNING_COLOURS,
  type PlanningPhase,
  type PlanningProject,
  type PlanningStatus,
  type PlanningWorkType,
  type WorkforcePlanningBook,
} from "@/lib/crew-workforce-planning";

const WORK_TYPE_OPTIONS: { value: PlanningWorkType; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "Piling", label: "Piling" },
  { value: "Civil", label: "Civil" },
  { value: "Install", label: "Install" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function emptyDraft(year: number): PlanningProject {
  return {
    id: "",
    year,
    name: "",
    site: "",
    location: "",
    workType: "",
    status: "Pending",
    phases: [],
    notes: "",
    crew: [],
  };
}

function firstStart(project: PlanningProject) {
  let min = "";
  for (const phase of project.phases) if (!min || phase.from < min) min = phase.from;
  return min;
}

/** Managers first, then surveyors, mechanics, operators, labourers; then most often at the site. */
function sortCrew(crew: PlanningCrewMember[], history: Map<string, PersonSiteHistory>, site: string) {
  return [...crew].sort(
    (a, b) =>
      roleRank(a.role) - roleRank(b.role) ||
      daysAtSite(history.get(b.personId), site) - daysAtSite(history.get(a.personId), site) ||
      a.name.localeCompare(b.name),
  );
}

/** Mondays on which a project needs people. */
function mondaysWithWork(project: PlanningProject): Set<string> {
  const out = new Set<string>();
  for (const phase of project.phases) {
    for (let week = mondayOf(phase.from); week <= phase.to; week = addDays(week, 7)) {
      if (phase.crew > 0) out.add(week);
    }
  }
  return out;
}

type Segment = { crew: number; weeks: number };
type Run = { start: number; length: number; segments: Segment[] };

/** Consecutive weeks with crew > 0 → one bar; crew changes inside it → segments. */
function barRuns(project: PlanningProject, weeks: string[]): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  weeks.forEach((week, index) => {
    // Hidden weeks between columns: never draw one bar across the gap.
    if (index > 0 && addDays(weeks[index - 1], 7) !== week) current = null;
    const crew = crewForWeek(project, week);
    if (crew <= 0) {
      current = null;
      return;
    }
    if (!current) {
      current = { start: index, length: 0, segments: [] };
      runs.push(current);
    }
    current.length += 1;
    const last = current.segments[current.segments.length - 1];
    if (last && last.crew === crew) last.weeks += 1;
    else current.segments.push({ crew, weeks: 1 });
  });
  return runs;
}

export function CrewWorkforcePlanningPanel({
  year,
  book,
  people = [],
  onChange,
}: {
  year: number;
  book: WorkforcePlanningBook;
  /** Roster (with Calendar stays) for picking crew and "who is often there". */
  people?: CrewPerson[];
  /** Kept for later (needed vs available); not shown for now. */
  availableHeadcount?: number;
  onChange: (book: WorkforcePlanningBook) => void;
}) {
  const [editor, setEditor] = useState<PlanningProject | null>(null);
  /** Projects whose name slots are open under the bar. */
  const [openCrew, setOpenCrew] = useState<Set<string>>(() => new Set());
  function toggleCrew(id: string) {
    setOpenCrew((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function saveCrew(project: PlanningProject, crew: PlanningCrewMember[]) {
    onChange({
      projects: book.projects.map((row) => (row.id === project.id ? { ...row, crew } : row)),
    });
  }
  /** Last full year on the Calendar before the one being planned. */
  const historyYear = year - 1;
  const history = useMemo(
    () => buildSiteHistory(people, `${historyYear}-01-01`, `${historyYear}-12-31`),
    [people, historyYear],
  );
  const [askDelete, setAskDelete] = useState<PlanningProject | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterSite, setFilterSite] = useState("");
  const [filterStatus, setFilterStatus] = useState<PlanningStatus | "">("");
  const [filterWorkType, setFilterWorkType] = useState<"all" | PlanningWorkType>("all");

  const yearProjects = useMemo(
    () =>
      book.projects
        .filter((row) => row.year === year)
        .sort((a, b) => {
          const fa = firstStart(a);
          const fb = firstStart(b);
          if (fa && fb && fa !== fb) return fa < fb ? -1 : 1;
          if (fa && !fb) return -1;
          if (!fa && fb) return 1;
          return a.name.localeCompare(b.name);
        }),
    [book.projects, year],
  );

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of yearProjects) if (row.location.trim()) set.add(row.location.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [yearProjects]);

  const siteOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of yearProjects) if (row.site.trim()) set.add(row.site.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [yearProjects]);

  const projects = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return yearProjects.filter((row) => {
      if (q && !row.name.toLowerCase().includes(q) && !row.location.toLowerCase().includes(q)) {
        return false;
      }
      if (filterLocation && row.location.trim() !== filterLocation) return false;
      if (filterSite && row.site.trim() !== filterSite) return false;
      if (filterStatus && row.status !== filterStatus) return false;
      if (filterWorkType !== "all" && row.workType !== filterWorkType) return false;
      return true;
    });
  }, [yearProjects, filterQuery, filterLocation, filterSite, filterStatus, filterWorkType]);

  const filtersActive =
    Boolean(filterQuery.trim()) ||
    Boolean(filterLocation) ||
    Boolean(filterSite) ||
    Boolean(filterStatus) ||
    filterWorkType !== "all";

  const groups = useMemo(() => groupProjectsBySite(projects), [projects]);
  const [fullYearView, setFullYearView] = useState(true);
  /** Whole year (Mon weeks Jan to Dec), widened if a phase spills past it. */
  const allWeeks = useMemo(() => {
    const span = mondayWeeksForProjects(projects, year);
    // First Monday on or after 1 Jan, so the year never opens on a December week.
    let first = mondayOf(`${year}-01-01`);
    if (first < `${year}-01-01`) first = addDays(first, 7);
    let last = mondayOf(`${year}-12-31`);
    if (span.length && projects.some((row) => row.phases.length)) {
      if (span[0] < first) first = span[0];
      if (span[span.length - 1] > last) last = span[span.length - 1];
    }
    const out: string[] = [];
    for (let cursor = first; cursor <= last; cursor = addDays(cursor, 7)) out.push(cursor);
    return out;
  }, [projects, year]);
  const weeks = useMemo(() => {
    if (fullYearView) return allWeeks;
    // Lost bids are not real work, so they never keep a week on screen.
    const shown = allWeeks.filter((week) =>
      projects.some((row) => row.status !== "Lost" && crewForWeek(row, week) > 0),
    );
    return shown.length ? shown : allWeeks;
  }, [allWeeks, fullYearView, projects]);
  /** Column indexes that follow hidden weeks. */
  const gapStarts = useMemo(() => {
    const out = new Set<number>();
    weeks.forEach((week, index) => {
      if (index > 0 && addDays(weeks[index - 1], 7) !== week) out.add(index);
    });
    return out;
  }, [weeks]);

  function openEditor(project: PlanningProject) {
    setEditor({
      ...project,
      location: project.location ?? "",
      site: project.site ?? "",
      phases: project.phases.map((phase) => ({ ...phase })),
      crew: (project.crew ?? []).map((member) => ({ ...member })),
    });
  }

  const demand = useMemo(
    () =>
      weeks.map((week) => {
        const contracted = neededForWeek(projects, week, "contracted");
        const withPending = neededForWeek(projects, week, "contracted_pending");
        return { week, contracted, pending: withPending - contracted, total: withPending };
      }),
    [projects, weeks],
  );
  const peak = useMemo(() => {
    let best = demand[0];
    for (const row of demand) if (!best || row.total > best.total) best = row;
    return best && best.total > 0 ? best : null;
  }, [demand]);
  const scaleMax = Math.max(1, ...demand.map((row) => row.total));

  /** Month label spans across the week columns. */
  const monthSpans = useMemo(() => {
    const spans: { label: string; start: number; length: number }[] = [];
    weeks.forEach((week, index) => {
      const month = Number(week.slice(5, 7)) - 1;
      const last = spans[spans.length - 1];
      if (last && last.label === MONTHS[month]) last.length += 1;
      else spans.push({ label: MONTHS[month], start: index, length: 1 });
    });
    return spans;
  }, [weeks]);
  const monthStarts = useMemo(() => new Set(monthSpans.map((span) => span.start)), [monthSpans]);

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `var(--overlook-name) repeat(${Math.max(weeks.length, 1)}, minmax(0, 1fr))`,
  };

  function save(project: PlanningProject) {
    const name = project.name.trim();
    if (!name) return;
    const next: PlanningProject = {
      ...project,
      id: project.id || newPlanningProjectId(name, year),
      year,
      name,
      site: project.site.trim(),
      location: project.location.trim(),
      notes: project.notes.trim(),
      phases: project.phases
        .filter((phase) => phase.from && phase.to && phase.to >= phase.from)
        .sort((a, b) => (a.from < b.from ? -1 : 1)),
    };
    onChange({ projects: [...book.projects.filter((row) => row.id !== next.id), next] });
    setEditor(null);
  }

  function remove(id: string) {
    onChange({ projects: book.projects.filter((row) => row.id !== id) });
    setEditor(null);
    setAskDelete(null);
  }

  return (
    <div className="px-3 pt-4 pb-8 sm:px-5 [--overlook-name:9.5rem] sm:[--overlook-name:15rem]">
      <div className="space-y-5 rounded-2xl border border-border bg-card px-3 py-4 sm:px-5 sm:py-5">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Crew-Project Overlook</h2>
            <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wide text-amber-950 uppercase">
              Trial
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{year}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={fullYearView}
            onClick={() => setFullYearView((on) => !on)}
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
          >
            <span
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                fullYearView ? "bg-stone-900" : "bg-stone-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-4 rounded-full bg-white transition-[left]",
                  fullYearView ? "left-4" : "left-0.5",
                )}
              />
            </span>
            Full year view
          </button>
          <button
            type="button"
            onClick={() => setEditor(emptyDraft(year))}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 text-sm font-semibold text-white hover:bg-stone-800"
          >
            <Plus className="size-4" />
            Add project
          </button>
        </div>
      </header>

      {/* Legend: colour = status; shade = work type */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {PLANNING_STATUSES.map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            {status === "Contracted" || status === "Pending" ? (
              <span className="inline-flex">
                <span className="size-2.5 rounded-l-sm" style={{ backgroundColor: planningColour("Piling", status).bg }} />
                <span className="size-2.5 rounded-r-sm" style={{ backgroundColor: planningColour("Civil", status).bg }} />
              </span>
            ) : (
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: planningColour("", status).bg }} />
            )}
            <span className="font-medium text-foreground">{status}</span>
          </span>
        ))}
        <span className="text-[0.7rem]">darker = piling, lighter = civil / install</span>
      </div>

      {/* Filters */}
      {yearProjects.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4 sm:gap-3">
          <label className="grid min-w-[10rem] flex-1 gap-1 text-xs text-muted-foreground sm:max-w-xs">
            Project
            <input
              type="search"
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
              placeholder="Name or location"
              className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground"
            />
          </label>
          <label className="grid min-w-[8rem] gap-1 text-xs text-muted-foreground">
            Location
            <select
              value={filterLocation}
              onChange={(event) => setFilterLocation(event.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            >
              <option value="">All</option>
              {locationOptions.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-[8rem] gap-1 text-xs text-muted-foreground">
            Site
            <select
              value={filterSite}
              onChange={(event) => setFilterSite(event.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            >
              <option value="">All</option>
              {siteOptions.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-[8rem] gap-1 text-xs text-muted-foreground">
            Status
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value as PlanningStatus | "")}
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            >
              <option value="">All</option>
              {PLANNING_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-[8rem] gap-1 text-xs text-muted-foreground">
            Work type
            <select
              value={filterWorkType === "all" ? "all" : filterWorkType}
              onChange={(event) => {
                const value = event.target.value;
                setFilterWorkType(value === "all" ? "all" : (value as PlanningWorkType));
              }}
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            >
              <option value="all">All</option>
              {WORK_TYPE_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {filtersActive ? (
            <button
              type="button"
              onClick={() => {
                setFilterQuery("");
                setFilterLocation("");
                setFilterSite("");
                setFilterStatus("");
                setFilterWorkType("all");
              }}
              className="h-9 rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}

      {yearProjects.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No projects for {year} yet. Use Add project to start.
        </p>
      ) : projects.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No projects match these filters.
        </p>
      ) : (
        <div className="relative w-full min-w-0 border-t border-border pt-4">
            {/* Month gridlines behind everything */}
            <div className="pointer-events-none absolute inset-0 top-4 grid" style={gridStyle} aria-hidden>
              <div />
              {weeks.map((week, index) => (
                <div
                  key={week}
                  className={cn(
                    "border-l",
                    gapStarts.has(index)
                      ? "border-l-2 border-dashed border-stone-400"
                      : index > 0 && monthStarts.has(index)
                        ? "border-stone-300"
                        : "border-stone-100",
                  )}
                />
              ))}
            </div>

            {/* Month row */}
            <div className="relative grid" style={gridStyle}>
              <div />
              {monthSpans.map((span) => (
                <div
                  key={`${span.label}-${span.start}`}
                  className="pb-0.5 pl-1 text-xs font-semibold text-foreground"
                  style={{ gridColumn: `${span.start + 2} / span ${span.length}` }}
                >
                  {span.label}
                </div>
              ))}
            </div>
            {/* Week row */}
            <div className="relative grid border-b border-border" style={gridStyle}>
              <div className="pb-1.5 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                Week of
              </div>
              {weeks.map((week) => (
                <div
                  key={week}
                  className="relative pb-2 pl-1 text-left text-[0.65rem] text-muted-foreground tabular-nums"
                  title={`Week of Monday ${formatMedium(week)}`}
                >
                  {Number(week.slice(8, 10))}
                  <span className="absolute bottom-0 left-0 h-2 w-px bg-stone-500" aria-hidden />
                </div>
              ))}
            </div>

            {/* Projects by site */}
            {groups.map((group) => (
              <div key={group.site || "unset"} className="relative">
                <div className="grid pt-4 pb-1" style={gridStyle}>
                  <div className="text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
                    {group.site || "No site"}
                  </div>
                </div>
                {group.projects.map((project) => {
                  const runs = barRuns(project, weeks);
                  const muted = project.status === "Lost";
                  const peakCrew = projectPeakCrew(project);
                  const named = project.crew?.length ?? 0;
                  return (
                    <Fragment key={project.id}>
                    <div className="group/row grid h-9 items-center" style={gridStyle}>
                      <div className="flex h-full min-w-0 items-center gap-2 pr-3">
                      <button
                        type="button"
                        onClick={() => openEditor(project)}
                        className="flex h-full min-w-0 flex-1 items-center gap-2 bg-card text-left"
                        title={`${project.name} · ${project.status}${project.workType ? ` · ${project.workType}` : ""}${project.location ? ` · ${project.location}` : ""}`}
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: planningColour(project.workType, project.status).bg }}
                        />
                        <span
                          className={cn(
                            "min-w-0 truncate text-sm group-hover/row:underline",
                            muted ? "text-muted-foreground line-through decoration-stone-400" : "font-medium",
                          )}
                        >
                          {project.name}
                          {project.location ? (
                            <span className="font-normal text-muted-foreground"> · {project.location}</span>
                          ) : null}
                        </span>
                      </button>
                        {peakCrew > 0 && !muted ? (
                          <button
                            type="button"
                            onClick={() => toggleCrew(project.id)}
                            aria-expanded={openCrew.has(project.id)}
                            className={cn(
                              "shrink-0 rounded px-1 text-xs tabular-nums underline decoration-dotted underline-offset-4 hover:bg-muted",
                              named >= peakCrew ? "font-semibold text-emerald-800" : "text-muted-foreground",
                              openCrew.has(project.id) && "bg-muted text-foreground",
                            )}
                            title={`${named} of ${peakCrew} people named. Click to type names.`}
                          >
                            {named}/{peakCrew}
                          </button>
                        ) : null}
                      </div>
                      {runs.map((run) => (
                          <button
                            type="button"
                            key={run.start}
                            onClick={() => openEditor(project)}
                            className="flex h-6 overflow-hidden rounded-md px-px transition-[filter] hover:brightness-110"
                            style={{ gridColumn: `${run.start + 2} / span ${run.length}`, gridRow: 1 }}
                            title={`${project.name} · ${formatMedium(weeks[run.start])} to ${formatMedium(addDays(weeks[run.start + run.length - 1], 6))}`}
                          >
                            {run.segments.map((segment, index) => (
                              <span
                                key={index}
                                className={cn(
                                  "flex items-center justify-center text-xs font-semibold tabular-nums",
                                  index > 0 && "border-l-2 border-card",
                                )}
                                style={{
                                  flexGrow: segment.weeks,
                                  flexBasis: 0,
                                  backgroundColor: planningColour(project.workType, project.status).bg,
                                  color: planningColour(project.workType, project.status).fg,
                                }}
                              >
                                {segment.crew}
                              </span>
                            ))}
                          </button>
                        ))}
                    </div>
                    {openCrew.has(project.id) ? (
                      <CrewSlots
                        project={project}
                        peakCrew={peakCrew}
                        runs={runs}
                        weeks={weeks}
                        gridStyle={gridStyle}
                        allProjects={yearProjects}
                        people={people}
                        history={history}
                        onCrewChange={(crew) => saveCrew(project, crew)}
                      />
                    ) : sortCrew(project.crew ?? [], history, project.site).map((member) => {
                      const clashes = crewClashWeeks(yearProjects, member.personId, weeks);
                      const colour = planningColour(project.workType, project.status);
                      return (
                        <div key={member.personId} className="grid h-5 items-center" style={gridStyle}>
                          <button
                            type="button"
                            onClick={() => openEditor(project)}
                            className="flex min-w-0 items-center gap-1.5 pr-3 pl-4 text-left text-xs"
                            title={`${member.name}${member.role ? ` · ${member.role}` : ""}${clashes.size ? " · also on another job the same week" : ""}`}
                          >
                            <span className={cn("truncate", clashes.size ? "font-semibold text-rose-700" : "text-foreground")}>
                              {firstNameOf(member.name)}
                            </span>
                            {member.role ? (
                              <span className="truncate text-[0.65rem] text-muted-foreground">{member.role}</span>
                            ) : null}
                          </button>
                          {runs.map((run) => (
                            <span
                              key={`m-${run.start}`}
                              className="h-1.5 rounded-full opacity-80"
                              style={{
                                gridColumn: `${run.start + 2} / span ${run.length}`,
                                gridRow: 1,
                                backgroundColor: colour.bg,
                              }}
                            />
                          ))}
                          {weeks.map((week, index) =>
                            clashes.has(week) && crewForWeek(project, week) > 0 ? (
                              <span
                                key={`c-${week}`}
                                className="mx-px h-3 rounded-sm bg-rose-600"
                                style={{ gridColumn: `${index + 2} / span 1`, gridRow: 1 }}
                                title={`${member.name} is on two jobs the week of ${formatMedium(week)}`}
                              />
                            ) : null,
                          )}
                        </div>
                      );
                    })}
                    </Fragment>
                  );
                })}
              </div>
            ))}

            {/* People needed per week */}
            {peak ? (
              <div className="relative mt-6 border-t border-border pt-3">
                <div className="grid" style={gridStyle}>
                  <div className="flex flex-col justify-end bg-card pr-3 pb-1">
                    <p className="text-sm font-semibold">People needed</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[0.7rem] leading-snug text-muted-foreground">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: PLANNING_COLOURS.contractedPiling }} />
                      Signed work
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[0.7rem] leading-snug text-muted-foreground">
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: PLANNING_COLOURS.pendingPiling }} />
                      Extra if pending jobs are won
                    </p>
                  </div>
                  {demand.map((row) => {
                    const height = 7.5; // rem
                    const contractedH = (row.contracted / scaleMax) * height;
                    const pendingH = (row.pending / scaleMax) * height;
                    const fits = (h: number) => h >= 0.8;
                    return (
                      <div
                        key={row.week}
                        className="flex h-[8rem] flex-col items-stretch justify-end px-[2px]"
                        title={
                          row.pending > 0
                            ? `Week of ${formatMedium(row.week)}: ${row.contracted} people for signed work, ${row.pending} more if pending jobs are won (${row.total} in all)`
                            : `Week of ${formatMedium(row.week)}: ${row.contracted} people for signed work`
                        }
                      >
                        {row.pending > 0 ? (
                          <span
                            className="flex items-center justify-center rounded-t-sm text-[0.6rem] font-semibold text-stone-900 tabular-nums"
                            style={{ height: `${pendingH}rem`, backgroundColor: PLANNING_COLOURS.pendingPiling }}
                          >
                            {fits(pendingH) ? row.pending : ""}
                          </span>
                        ) : null}
                        {row.contracted > 0 ? (
                          <span
                            className={cn(
                              "flex items-center justify-center text-[0.6rem] font-semibold text-white tabular-nums",
                              row.pending > 0 ? "" : "rounded-t-sm",
                            )}
                            style={{ height: `${contractedH}rem`, backgroundColor: PLANNING_COLOURS.contractedPiling }}
                          >
                            {fits(contractedH) ? row.contracted : ""}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {/* Totals under the graph, like the Excel head count row */}
                <div className="grid border-t border-border pt-1.5" style={gridStyle}>
                  <div className="pr-3 text-[0.7rem] font-medium text-muted-foreground">Signed work</div>
                  {demand.map((row) => (
                    <div key={row.week} className="text-center text-[0.65rem] text-muted-foreground tabular-nums">
                      {row.contracted || ""}
                    </div>
                  ))}
                </div>
                <div className="grid pt-0.5" style={gridStyle}>
                  <div className="pr-3 text-[0.7rem] font-semibold">Total if pending won</div>
                  {demand.map((row) => (
                    <div
                      key={row.week}
                      className={cn(
                        "text-center text-[0.65rem] tabular-nums",
                        peak && row.week === peak.week ? "font-bold text-foreground" : "font-semibold text-foreground/80",
                      )}
                    >
                      {row.total || ""}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
        </div>
      )}
      </div>

      {editor ? (
        <ProjectSheet
          initial={editor}
          year={year}
          locations={locationOptions}
          history={history}
          people={people}
          otherProjects={yearProjects.filter((row) => row.id !== editor.id)}
          onSave={save}
          onCancel={() => setEditor(null)}
          onDelete={editor.id ? () => setAskDelete(editor) : undefined}
        />
      ) : null}

      {askDelete ? (
        <CrewConfirmDialog
          title={`Delete ${askDelete.name}?`}
          message="It will be removed from this overlook. This does not change the Calendar."
          confirmLabel="Delete project"
          onConfirm={() => remove(askDelete.id)}
          onCancel={() => setAskDelete(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Type names straight onto a job: one underlined line per person needed.
 * Suggestions list the people most often at that site first.
 */
function CrewSlots({
  project,
  peakCrew,
  runs,
  weeks,
  gridStyle,
  allProjects,
  people,
  history,
  onCrewChange,
}: {
  project: PlanningProject;
  peakCrew: number;
  runs: Run[];
  weeks: string[];
  gridStyle: CSSProperties;
  allProjects: PlanningProject[];
  people: CrewPerson[];
  history: Map<string, PersonSiteHistory>;
  onCrewChange: (crew: PlanningCrewMember[]) => void;
}) {
  const crew = project.crew ?? [];
  // One line per person needed, no extras (more only shows if dates were cut after naming).
  const lines = Math.max(peakCrew, crew.length);
  const listId = `overlook-people-${project.id}`;
  const colour = planningColour(project.workType, project.status);

  const suggestions = useMemo(
    () =>
      people
        .filter((person) => person.active !== false && !person.provisional)
        .map((person) => ({ person, info: history.get(person.id) }))
        .sort(
          (a, b) =>
            roleRank(a.info?.role || a.person.role) - roleRank(b.info?.role || b.person.role) ||
            daysAtSite(b.info, project.site) - daysAtSite(a.info, project.site) ||
            (b.info?.total ?? 0) - (a.info?.total ?? 0) ||
            a.person.name.localeCompare(b.person.name),
        ),
    [people, history, project.site],
  );

  function commit(index: number, text: string) {
    const name = text.trim();
    const current = crew[index];
    if (current && current.name === name) return;
    const next = [...crew];
    if (!name) {
      if (index < next.length) next.splice(index, 1);
      onCrewChange(next);
      return;
    }
    const person = people.find((row) => row.name.toLowerCase() === name.toLowerCase());
    const member: PlanningCrewMember = person
      ? { personId: person.id, name: person.name, role: history.get(person.id)?.role || person.role || "" }
      : { personId: `name:${name.toLowerCase()}`, name, role: "" };
    if (next.some((row, i) => i !== index && row.personId === member.personId)) return;
    if (index < next.length) next[index] = member;
    else next.push(member);
    onCrewChange(sortCrew(next, history, project.site));
  }

  return (
    <>
      <datalist id={listId}>
        {suggestions.map(({ person, info }) => {
          return (
            <option key={person.id} value={person.name}>
              {info?.role || person.role}
            </option>
          );
        })}
      </datalist>
      {Array.from({ length: lines }, (_, index) => {
        const member = crew[index];
        const clashes = member ? crewClashWeeks(allProjects, member.personId, weeks) : new Set<string>();
        return (
          <div key={member?.personId ?? `empty-${index}`} className="grid h-7 items-center" style={gridStyle}>
            <div className="flex min-w-0 items-center gap-2 pr-3 pl-4">
              <span className="w-4 shrink-0 text-right text-[0.65rem] text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <input
                defaultValue={member?.name ?? ""}
                key={member?.name ?? `blank-${index}`}
                list={listId}
                size={member ? Math.min(20, Math.max(5, member.name.length - 1)) : 10}
                placeholder="Name"
                aria-label={`${project.name} person ${index + 1}`}
                onBlur={(event) => commit(index, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                }}
                className={cn(
                  "h-6 min-w-0 shrink border-0 border-b bg-transparent px-0.5 text-xs outline-none focus:border-stone-900",
                  member ? "border-stone-300" : "border-stone-300 border-dashed",
                  clashes.size ? "font-semibold text-rose-700" : "text-foreground",
                )}
              />
              {member?.role ? (
                <span className="min-w-0 truncate text-[0.65rem] text-muted-foreground" title={member.role}>
                  {member.role}
                </span>
              ) : null}
            </div>
            {member
              ? runs.map((run) => (
                  <span
                    key={`m-${run.start}`}
                    className="h-1.5 rounded-full opacity-80"
                    style={{ gridColumn: `${run.start + 2} / span ${run.length}`, gridRow: 1, backgroundColor: colour.bg }}
                  />
                ))
              : null}
            {member
              ? weeks.map((week, weekIndex) =>
                  clashes.has(week) && crewForWeek(project, week) > 0 ? (
                    <span
                      key={`c-${week}`}
                      className="mx-px h-3 rounded-sm bg-rose-600"
                      style={{ gridColumn: `${weekIndex + 2} / span 1`, gridRow: 1 }}
                      title={`${member.name} is on two jobs the week of ${formatMedium(week)}`}
                    />
                  ) : null,
                )
              : null}
          </div>
        );
      })}
    </>
  );
}

/** Right-hand panel to add or edit one project. */
function ProjectSheet({
  initial,
  year,
  locations,
  history,
  people,
  otherProjects,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: PlanningProject;
  year: number;
  locations: string[];
  history: Map<string, PersonSiteHistory>;
  people: CrewPerson[];
  otherProjects: PlanningProject[];
  onSave: (project: PlanningProject) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<PlanningProject>(() => ({
    ...initial,
    location: initial.location ?? "",
  }));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function setPhase(index: number, patch: Partial<PlanningPhase>) {
    setDraft((current) => ({
      ...current,
      phases: current.phases.map((phase, i) => (i === index ? { ...phase, ...patch } : phase)),
    }));
  }

  function addPhase() {
    setDraft((current) => {
      const last = current.phases[current.phases.length - 1];
      const from = last ? addDays(last.to, 1) : `${year}-06-07`;
      return {
        ...current,
        phases: [...current.phases, { from, to: addDays(from, 13), crew: last?.crew ?? 5 }],
      };
    });
  }

  const inputClass = "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm";
  const [crewQuery, setCrewQuery] = useState("");
  const crew = draft.crew ?? [];
  const peakCrew = projectPeakCrew(draft);

  /** Other live jobs this person is already planned on that overlap this one. */
  function busyWith(personId: string): string[] {
    const mine = mondaysWithWork(draft);
    return otherProjects
      .filter((row) => row.status !== "Lost" && (row.crew ?? []).some((member) => member.personId === personId))
      .filter((row) => [...mondaysWithWork(row)].some((week) => mine.has(week)))
      .map((row) => row.name);
  }

  const candidates = useMemo(() => {
    const taken = new Set(crew.map((member) => member.personId));
    const query = crewQuery.trim().toLowerCase();
    return people
      .filter((person) => person.active !== false && !person.provisional && !taken.has(person.id))
      .filter((person) => !query || person.name.toLowerCase().includes(query) || (person.role || "").toLowerCase().includes(query))
      .map((person) => ({ person, info: history.get(person.id) }))
      .sort(
        (a, b) =>
          roleRank(a.info?.role || a.person.role) - roleRank(b.info?.role || b.person.role) ||
          daysAtSite(b.info, draft.site) - daysAtSite(a.info, draft.site) ||
          (b.info?.total ?? 0) - (a.info?.total ?? 0) ||
          a.person.name.localeCompare(b.person.name),
      );
  }, [crew, crewQuery, people, history, draft.site]);

  const full = peakCrew > 0 && crew.length >= peakCrew;
  function addMember(person: CrewPerson) {
    if (full) return;
    const info = history.get(person.id);
    setDraft((current) => ({
      ...current,
      crew: sortCrew(
        [...(current.crew ?? []), { personId: person.id, name: person.name, role: info?.role || person.role || "" }],
        history,
        current.site,
      ),
    }));
  }

  function setMember(personId: string, patch: Partial<PlanningCrewMember>) {
    setDraft((current) => ({
      ...current,
      crew: (current.crew ?? []).map((member) => (member.personId === personId ? { ...member, ...patch } : member)),
    }));
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/25" onMouseDown={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={initial.id ? `Edit ${initial.name}` : "Add project"}
        className="flex h-full w-full max-w-md flex-col bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <p className="text-lg font-semibold tracking-tight">{initial.id ? "Edit project" : "Add project"}</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Name</span>
            <input
              autoFocus={!initial.id}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className={inputClass}
              placeholder="e.g. WTP - Civil"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Site</span>
              <input
                value={draft.site}
                onChange={(event) => setDraft({ ...draft, site: event.target.value })}
                placeholder="Iqaluit"
                list="forecast-sites"
                className={inputClass}
              />
              <datalist id="forecast-sites">
                <option value="Iqaluit" />
                <option value="Pond Inlet" />
                <option value="Kugluktuk" />
                <option value="Alert" />
              </datalist>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Location</span>
              <input
                value={draft.location}
                onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                placeholder="Camp, hub, area…"
                list="forecast-locations"
                className={inputClass}
              />
              <datalist id="forecast-locations">
                {locations.map((location) => (
                  <option key={location} value={location} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Work type</span>
            <select
              value={draft.workType}
              onChange={(event) => setDraft({ ...draft, workType: event.target.value as PlanningWorkType })}
              className={inputClass}
            >
              {WORK_TYPE_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="grid gap-1.5 text-sm">
            <legend className="mb-1.5 font-medium">Status</legend>
            <div className="grid grid-cols-2 gap-2">
              {PLANNING_STATUSES.map((status) => (
                <button
                  type="button"
                  key={status}
                  onClick={() => setDraft({ ...draft, status })}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-lg border px-2.5 text-left text-sm",
                    draft.status === status
                      ? "border-stone-900 font-semibold"
                      : "border-input text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="size-2.5 rounded-sm" style={{ backgroundColor: planningColour(draft.workType, status).bg }} />
                  {status}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Only Contracted adds to people needed. Pending is maybe awarded, not signed.
            </p>
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Dates and people</p>
              <button type="button" onClick={addPhase} className="text-xs font-semibold text-primary hover:underline">
                + Add dates
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add another line when the number of people changes.
            </p>
            {draft.phases.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                No dates yet — add a date range above when you know them.
              </p>
            ) : (
              <ul className="space-y-2">
                {draft.phases.map((phase, index) => (
                  <li key={index} className="grid grid-cols-[1fr_1fr_4.5rem_2.25rem] items-end gap-2">
                    <label className="grid gap-1 text-xs">
                      {index === 0 ? <span className="text-muted-foreground">From</span> : null}
                      <input
                        type="date"
                        value={phase.from}
                        onChange={(event) => setPhase(index, { from: event.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <label className="grid gap-1 text-xs">
                      {index === 0 ? <span className="text-muted-foreground">To</span> : null}
                      <input
                        type="date"
                        value={phase.to}
                        onChange={(event) => setPhase(index, { to: event.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <label className="grid gap-1 text-xs">
                      {index === 0 ? <span className="text-muted-foreground">People</span> : null}
                      <input
                        type="number"
                        min={0}
                        value={phase.crew}
                        onChange={(event) => setPhase(index, { crew: Math.max(0, Number(event.target.value) || 0) })}
                        className={inputClass}
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Remove these dates"
                      onClick={() =>
                        setDraft((current) => ({ ...current, phases: current.phases.filter((_, i) => i !== index) }))
                      }
                      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-rose-800"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">Crew</p>
              <p className={cn("text-xs tabular-nums", peakCrew > 0 && crew.length >= peakCrew ? "text-emerald-800" : "text-muted-foreground")}>
                {crew.length}
                {peakCrew > 0 ? ` of ${peakCrew}` : ""} named
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Who we plan to send, for the whole job. Planning only: nothing is added to the Calendar.
            </p>

            {crew.length ? (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {crew.map((member) => {
                  const info = history.get(member.personId);
                  const busy = busyWith(member.personId);
                  return (
                    <li key={member.personId} className="space-y-1.5 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", busy.length && "text-rose-700")}>
                          {member.name}
                        </span>
                        <input
                          value={member.role}
                          onChange={(event) => setMember(member.personId, { role: event.target.value })}
                          list="overlook-roles"
                          placeholder="Role"
                          aria-label={`Role for ${member.name}`}
                          className="h-8 w-32 rounded-md border border-input bg-card px-2 text-xs"
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${member.name}`}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              crew: (current.crew ?? []).filter((row) => row.personId !== member.personId),
                            }))
                          }
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-rose-800"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      {info ? <p className="text-[0.7rem] text-muted-foreground">{info.category}</p> : null}
                      {busy.length ? (
                        <p className="text-[0.7rem] font-medium text-rose-700">Also on {busy.join(", ")} at the same time</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <datalist id="overlook-roles">
              {PLANNING_ROLE_SUGGESTIONS.map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>

            {full ? (
              <p className="text-xs text-emerald-800">All {peakCrew} spots named. Remove someone to change the crew.</p>
            ) : (
            <div className="rounded-lg border border-border">
              <input
                type="search"
                value={crewQuery}
                onChange={(event) => setCrewQuery(event.target.value)}
                placeholder="Add a person: type a name or role"
                className="h-9 w-full rounded-t-lg border-b border-border bg-card px-3 text-sm"
              />
              <p className="px-3 pt-2 text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">
                {draft.site.trim() ? `Most often at ${draft.site.trim()} first` : "Most often on site first"}
              </p>
              <ul className="max-h-64 overflow-y-auto py-1">
                {candidates.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-muted-foreground">No one matches.</li>
                ) : (
                  candidates.slice(0, 60).map(({ person, info }) => {
                    const busy = busyWith(person.id);
                    return (
                      <li key={person.id}>
                        <button
                          type="button"
                          onClick={() => addMember(person)}
                          className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-muted"
                        >
                          <Plus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2">
                              <span className="truncate text-sm font-medium">{person.name}</span>
                              <span className="truncate text-[0.7rem] text-muted-foreground">{info?.role || person.role}</span>
                            </span>
                            {info ? <span className="block text-[0.7rem] text-muted-foreground">{info.category}</span> : null}
                            {busy.length ? (
                              <span className="block text-[0.7rem] font-medium text-rose-700">Already on {busy.join(", ")}</span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
            )}
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Notes</span>
            <textarea
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              rows={3}
              className="w-full rounded-lg border border-input bg-card px-2.5 py-2 text-sm"
              placeholder="Optional"
            />
          </label>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="h-9 rounded-lg px-3 text-sm font-medium text-rose-800 hover:bg-rose-50"
            >
              Delete
            </button>
          ) : null}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-input px-3 text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft.name.trim()}
              onClick={() => onSave(draft)}
              className="h-9 rounded-lg bg-stone-900 px-4 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
