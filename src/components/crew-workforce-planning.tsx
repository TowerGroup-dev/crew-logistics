"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatMedium } from "@/lib/dates";
import {
  crewForWeek,
  formatPhaseSummary,
  groupProjectsBySite,
  mondayWeeksForProjects,
  neededForWeek,
  newPlanningProjectId,
  planningBarTone,
  planningStatusTone,
  PLANNING_STATUSES,
  type DemandMode,
  type PlanningPhase,
  type PlanningProject,
  type PlanningStatus,
  type PlanningWorkType,
  type WorkforcePlanningBook,
} from "@/lib/crew-workforce-planning";

const WORK_TYPE_OPTIONS: { value: PlanningWorkType; label: string }[] = [
  { value: "", label: "—" },
  { value: "Piling", label: "Piling" },
  { value: "Civil", label: "Civil" },
  { value: "Install", label: "Install" },
];

function emptyDraft(year: number): PlanningProject {
  return {
    id: "",
    year,
    name: "",
    site: "",
    workType: "",
    status: "Pending",
    phases: [],
    notes: "",
  };
}

export function CrewWorkforcePlanningPanel({
  year,
  book,
  availableHeadcount,
  onChange,
}: {
  year: number;
  book: WorkforcePlanningBook;
  /** All active employees (roster), not Calendar stays. */
  availableHeadcount: number;
  onChange: (book: WorkforcePlanningBook) => void;
}) {
  const projects = useMemo(
    () => book.projects.filter((row) => row.year === year).sort((a, b) => a.name.localeCompare(b.name)),
    [book.projects, year],
  );
  const groups = useMemo(() => groupProjectsBySite(projects), [projects]);
  const weeks = useMemo(() => mondayWeeksForProjects(projects, year), [projects, year]);
  const [demandMode, setDemandMode] = useState<DemandMode>("contracted");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanningProject>(() => emptyDraft(year));
  const [adding, setAdding] = useState(false);

  function openEdit(project: PlanningProject) {
    setAdding(false);
    setEditingId(project.id);
    setDraft({ ...project, phases: project.phases.map((phase) => ({ ...phase })) });
  }

  function openAdd() {
    setEditingId(null);
    setAdding(true);
    setDraft(emptyDraft(year));
  }

  function cancelEdit() {
    setEditingId(null);
    setAdding(false);
    setDraft(emptyDraft(year));
  }

  function saveDraft() {
    const name = draft.name.trim();
    if (!name) return;
    const project: PlanningProject = {
      ...draft,
      id: draft.id || newPlanningProjectId(name, year),
      year,
      name,
      site: draft.site.trim(),
      notes: draft.notes.trim(),
      phases: draft.phases.filter((phase) => phase.from && phase.to && phase.to >= phase.from),
    };
    const others = book.projects.filter((row) => row.id !== project.id);
    onChange({ projects: [...others, project] });
    cancelEdit();
  }

  function removeProject(id: string) {
    onChange({ projects: book.projects.filter((row) => row.id !== id) });
    if (editingId === id) cancelEdit();
  }

  function setPhase(index: number, patch: Partial<PlanningPhase>) {
    setDraft((current) => ({
      ...current,
      phases: current.phases.map((phase, i) => (i === index ? { ...phase, ...patch } : phase)),
    }));
  }

  return (
    <div className="space-y-8 p-3 sm:p-4">
      <header className="space-y-1 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Workforce Planning</h2>
          <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide text-amber-950 uppercase">
            Trial page
          </span>
        </div>
        <p className="text-sm text-muted-foreground">Project & crew planning</p>
        <p className="text-xs text-muted-foreground">
          What work is coming and how many people it needs. Not the Calendar — try things here freely.
        </p>
      </header>

      {/* 1. Project list */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-2">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">{year} projects</h3>
            <p className="text-xs text-muted-foreground">{projects.length} in the pipeline</p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-stone-900 px-3 text-sm font-semibold text-white"
          >
            <Plus className="size-4" />
            Add project
          </button>
        </div>

        {adding || editingId ? (
          <ProjectEditor
            draft={draft}
            onChange={setDraft}
            onPhaseChange={setPhase}
            onAddPhase={() =>
              setDraft((current) => ({
                ...current,
                phases: [...current.phases, { from: `${year}-06-01`, to: `${year}-06-07`, crew: 5 }],
              }))
            }
            onRemovePhase={(index) =>
              setDraft((current) => ({
                ...current,
                phases: current.phases.filter((_, i) => i !== index),
              }))
            }
            onSave={saveDraft}
            onCancel={cancelEdit}
          />
        ) : null}

        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects for {year} yet. Add one, or open 2027 for the starter list.</p>
        ) : (
          <>
            {/* Phone cards */}
            <ul className="grid gap-2 sm:hidden">
              {projects.map((project) => (
                <li key={project.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{project.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {project.site || "No site"}
                        {project.workType ? ` · ${project.workType}` : ""}
                      </p>
                    </div>
                    <StatusTag status={project.status} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{formatPhaseSummary(project)}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(project)}
                      className="h-8 rounded-lg border border-input px-3 text-xs font-medium"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeProject(project.id)}
                      className="h-8 rounded-lg border border-input px-3 text-xs font-medium text-rose-800"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Site</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Phases / crew</th>
                    <th className="py-2 font-medium"> </th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project.id} className="border-b border-border/70 align-top">
                      <td className="py-2.5 pr-3 font-medium">{project.name}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{project.site || "—"}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{project.workType || "—"}</td>
                      <td className="py-2.5 pr-3">
                        <StatusTag status={project.status} />
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">{formatPhaseSummary(project)}</td>
                      <td className="py-2.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(project)}
                          className="mr-2 text-xs font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => removeProject(project.id)}
                          className="text-xs font-medium text-rose-800 underline-offset-2 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* 2. Timeline */}
      <section className="space-y-3">
        <div className="border-b border-border pb-2">
          <h3 className="text-sm font-semibold tracking-tight">Weekly timeline</h3>
          <p className="text-xs text-muted-foreground">Monday weeks · crew number in each week · coloured by status</p>
        </div>
        {weeks.length === 0 || projects.every((row) => !row.phases.length) ? (
          <p className="text-sm text-muted-foreground">Add phase dates to see the timeline.</p>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div style={{ minWidth: `${11 + weeks.length * 2.4}rem` }}>
              <div className="sticky left-0 z-10 mb-1 flex">
                <div className="w-44 shrink-0 bg-background pr-2 text-xs text-muted-foreground sm:w-56" />
                <div className="flex min-w-0 flex-1">
                  {weeks.map((week) => (
                    <div
                      key={week}
                      className="w-9 shrink-0 text-center text-[0.6rem] leading-tight text-muted-foreground sm:w-10"
                      title={formatMedium(week)}
                    >
                      {week.slice(5)}
                    </div>
                  ))}
                </div>
              </div>
              {groups.map((group) => (
                <div key={group.site} className="mb-3">
                  <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.site}
                  </p>
                  {group.projects.map((project) => (
                    <div key={project.id} className="mb-0.5 flex items-stretch">
                      <div className="sticky left-0 z-10 flex w-44 shrink-0 items-center gap-1.5 bg-background pr-2 sm:w-56">
                        <span className="truncate text-xs font-medium" title={project.name}>
                          {project.name}
                        </span>
                        <StatusTag status={project.status} compact />
                      </div>
                      <div className="flex min-w-0 flex-1">
                        {weeks.map((week) => {
                          const crew = crewForWeek(project, week);
                          return (
                            <div
                              key={`${project.id}-${week}`}
                              className="flex w-9 shrink-0 items-center justify-center px-0.5 sm:w-10"
                            >
                              {crew > 0 ? (
                                <span
                                  className={cn(
                                    "flex h-7 w-full items-center justify-center rounded text-[0.65rem] font-semibold tabular-nums",
                                    planningBarTone(project.status),
                                  )}
                                  title={`${project.name} · ${formatMedium(week)} · ${crew}`}
                                >
                                  {crew}
                                </span>
                              ) : (
                                <span className="h-7 w-full rounded bg-muted/40" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 3. Needed vs available */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Needed vs available</h3>
            <p className="text-xs text-muted-foreground">
              Available = all active employees ({availableHeadcount}). Early-stage and Lost are never counted.
            </p>
          </div>
          <div className="flex rounded-lg border border-input p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setDemandMode("contracted")}
              className={cn(
                "rounded-md px-2.5 py-1.5 font-medium",
                demandMode === "contracted" ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              Contracted only
            </button>
            <button
              type="button"
              onClick={() => setDemandMode("contracted_pending")}
              className={cn(
                "rounded-md px-2.5 py-1.5 font-medium",
                demandMode === "contracted_pending" ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              + Pending
            </button>
          </div>
        </div>

        {weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dated work yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Week of</th>
                  <th className="py-2 pr-3 font-medium">Needed</th>
                  <th className="py-2 pr-3 font-medium">Available</th>
                  <th className="py-2 font-medium">Gap</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => {
                  const needed = neededForWeek(projects, week, demandMode);
                  if (needed === 0) return null;
                  const gap = availableHeadcount - needed;
                  const short = gap < 0;
                  return (
                    <tr key={week} className="border-b border-border/70">
                      <td className="py-2 pr-3">{formatMedium(week)}</td>
                      <td className="py-2 pr-3 tabular-nums">{needed}</td>
                      <td className="py-2 pr-3 tabular-nums">{availableHeadcount}</td>
                      <td
                        className={cn(
                          "py-2 tabular-nums font-medium",
                          short ? "text-rose-800" : gap > 0 ? "text-emerald-800" : "text-muted-foreground",
                        )}
                      >
                        {short ? `Short ${Math.abs(gap)}` : gap > 0 ? `Spare ${gap}` : "Even"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusTag({ status, compact }: { status: PlanningStatus; compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded px-1.5 py-0.5 font-semibold",
        compact ? "text-[0.55rem]" : "text-[0.65rem]",
        planningStatusTone(status),
      )}
    >
      {status}
    </span>
  );
}

function ProjectEditor({
  draft,
  onChange,
  onPhaseChange,
  onAddPhase,
  onRemovePhase,
  onSave,
  onCancel,
}: {
  draft: PlanningProject;
  onChange: (next: PlanningProject) => void;
  onPhaseChange: (index: number, patch: Partial<PlanningPhase>) => void;
  onAddPhase: () => void;
  onRemovePhase: (index: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Name</span>
          <input
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            className="h-9 rounded-lg border border-input bg-card px-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Site</span>
          <input
            value={draft.site}
            onChange={(event) => onChange({ ...draft, site: event.target.value })}
            placeholder="Iqaluit, Pond Inlet…"
            list="planning-sites"
            className="h-9 rounded-lg border border-input bg-card px-2"
          />
          <datalist id="planning-sites">
            <option value="Iqaluit" />
            <option value="Pond Inlet" />
            <option value="Kugluktuk" />
            <option value="Alert" />
          </datalist>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Work type</span>
          <select
            value={draft.workType}
            onChange={(event) =>
              onChange({ ...draft, workType: event.target.value as PlanningWorkType })
            }
            className="h-9 rounded-lg border border-input bg-card px-2"
          >
            {WORK_TYPE_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Status</span>
          <select
            value={draft.status}
            onChange={(event) =>
              onChange({ ...draft, status: event.target.value as PlanningStatus })
            }
            className="h-9 rounded-lg border border-input bg-card px-2"
          >
            {PLANNING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-3">
          <span className="text-muted-foreground">Notes</span>
          <input
            value={draft.notes}
            onChange={(event) => onChange({ ...draft, notes: event.target.value })}
            className="h-9 rounded-lg border border-input bg-card px-2"
            placeholder="Optional"
          />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phases</p>
          <button
            type="button"
            onClick={onAddPhase}
            className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
          >
            Add phase
          </button>
        </div>
        {draft.phases.length === 0 ? (
          <p className="text-xs text-muted-foreground">No dates yet — shows as TBD. Add a phase when known.</p>
        ) : (
          <ul className="space-y-2">
            {draft.phases.map((phase, index) => (
              <li key={index} className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs">
                  <span className="text-muted-foreground">From</span>
                  <input
                    type="date"
                    value={phase.from}
                    onChange={(event) => onPhaseChange(index, { from: event.target.value })}
                    className="h-9 rounded-lg border border-input bg-card px-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="text-muted-foreground">To</span>
                  <input
                    type="date"
                    value={phase.to}
                    onChange={(event) => onPhaseChange(index, { to: event.target.value })}
                    className="h-9 rounded-lg border border-input bg-card px-2"
                  />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="text-muted-foreground">Crew</span>
                  <input
                    type="number"
                    min={0}
                    value={phase.crew}
                    onChange={(event) =>
                      onPhaseChange(index, { crew: Math.max(0, Number(event.target.value) || 0) })
                    }
                    className="h-9 w-20 rounded-lg border border-input bg-card px-2"
                  />
                </label>
                <button
                  type="button"
                  aria-label="Remove phase"
                  onClick={() => onRemovePhase(index)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-input text-muted-foreground hover:text-rose-800"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!draft.name.trim()}
          onClick={onSave}
          className="h-9 rounded-lg bg-stone-900 px-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          Save project
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg border border-input px-3 text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
