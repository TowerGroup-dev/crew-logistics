"use client";

import { useEffect, useMemo, useState } from "react";
import {
  projectPhase,
  projectSpan,
  type CrewProject,
  type ProjectPhase,
} from "@/lib/crew-schedule";
import { assignmentForPerson } from "@/lib/crew-roster";
import { formatMedium, toISODate } from "@/lib/dates";
import { cn } from "@/lib/cn";

const REGIONS = ["Iqaluit", "Kugluktuk", "Pond Inlet", "Alert"] as const;

export type ProjectCrewOption = { id: string; name: string; role: string; projectIds: string[] };

const PHASE_ORDER: ProjectPhase[] = ["ongoing", "future", "completed"];
const PHASE_LABEL: Record<ProjectPhase, string> = {
  ongoing: "Ongoing",
  future: "Future",
  completed: "Completed",
};

export function CrewProjectsPanel({
  projects,
  year,
  people,
  today = toISODate(new Date()),
  onCreate,
  onExtend,
  onSetCrew,
  onUpdatePersonDates,
  onRemovePerson,
}: {
  projects: CrewProject[];
  year: number;
  people: ProjectCrewOption[];
  today?: string;
  onCreate: (input: {
    name: string;
    region: string;
    from: string;
    to: string;
    year: number;
    personIds: string[];
  }) => void;
  onExtend: (projectId: string, from: string, to: string) => void;
  onSetCrew: (projectId: string, personIds: string[]) => void;
  onUpdatePersonDates: (projectId: string, personId: string, from: string | null, to: string | null) => void;
  onRemovePerson: (projectId: string, personId: string) => void;
}) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState<string>("Iqaluit");
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [extendId, setExtendId] = useState("");
  const [extendFrom, setExtendFrom] = useState("");
  const [extendTo, setExtendTo] = useState("");
  const [crewEditId, setCrewEditId] = useState("");
  const [addDraft, setAddDraft] = useState<string[]>([]);

  useEffect(() => {
    setFrom(`${year}-01-01`);
    setTo(`${year}-12-31`);
  }, [year]);

  const grouped = useMemo(() => {
    const buckets: Record<ProjectPhase, CrewProject[]> = {
      ongoing: [],
      future: [],
      completed: [],
    };
    for (const project of projects) {
      buckets[projectPhase(project, today)].push(project);
    }
    for (const phase of PHASE_ORDER) {
      buckets[phase].sort((a, b) => a.name.localeCompare(b.name));
    }
    return buckets;
  }, [projects, today]);

  function togglePerson(list: string[], id: string) {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-heading text-2xl tracking-tight">Projects</h2>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || !from || !to) return;
            onCreate({ name: name.trim(), region, from, to, year, personIds });
            setName("");
            setPersonIds([]);
          }}
        >
          <label className="grid gap-1 text-sm lg:col-span-2">
            <span className="text-muted-foreground">Project name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 rounded-lg border border-input px-2"
              placeholder="Valve Replacement"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Community</span>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="h-9 rounded-lg border border-input px-2">
              {REGIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Start</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-input px-2" required />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Finish</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-input px-2" required />
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <p className="mb-2 text-sm text-muted-foreground">People on this job</p>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-border p-2">
              {people.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted-foreground">No crew loaded.</p>
              ) : (
                <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {people.map((person) => (
                    <li key={person.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60">
                        <input
                          type="checkbox"
                          checked={personIds.includes(person.id)}
                          onChange={() => setPersonIds((current) => togglePerson(current, person.id))}
                        />
                        <span className="min-w-0 truncate">
                          {person.name}
                          <span className="text-muted-foreground"> · {person.role}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Create project
            </button>
          </div>
        </form>
      </section>

      {PHASE_ORDER.map((phase) => {
        const list = grouped[phase];
        return (
          <section key={phase} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-heading text-lg tracking-tight">
                {PHASE_LABEL[phase]} ({list.length})
              </h3>
            </div>
            {list.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="divide-y divide-border">
                {list.map((project) => {
                  const span = projectSpan(project);
                  const windows = project.windows?.length
                    ? project.windows
                    : project.startsOn
                      ? [{ from: project.startsOn, to: null as string | null }]
                      : [];
                  const crew = people.filter((person) => person.projectIds.includes(project.id));
                  const available = people.filter((person) => !person.projectIds.includes(project.id));
                  return (
                    <li key={project.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold">{project.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {project.region || "-"}
                            {span.from || span.to
                              ? ` · ${span.from ? formatMedium(span.from) : "-"} → ${span.to ? formatMedium(span.to) : "open"}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted"
                            onClick={() => {
                              setCrewEditId(project.id);
                              setAddDraft([]);
                              setExtendId("");
                            }}
                          >
                            People
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted"
                            onClick={() => {
                              setExtendId(project.id);
                              const last = windows[windows.length - 1];
                              setExtendFrom(last?.to || `${year}-01-01`);
                              setExtendTo("");
                              setCrewEditId("");
                            }}
                          >
                            Add extension
                          </button>
                        </div>
                      </div>

                      <ul className="mt-3 space-y-2">
                        {crew.length === 0 ? (
                          <li className="text-sm text-muted-foreground">No people assigned</li>
                        ) : (
                          crew.map((person) => {
                            const seat = assignmentForPerson(project, person.id);
                            const personFrom = seat?.from ?? span.from ?? "";
                            const personTo = seat?.to ?? span.to ?? "";
                            return (
                              <li
                                key={person.id}
                                className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2"
                              >
                                <div className="min-w-[9rem] flex-1">
                                  <p className="text-sm font-semibold">{person.name}</p>
                                  <p className="text-xs text-muted-foreground">{person.role}</p>
                                </div>
                                <label className="grid gap-1 text-xs text-muted-foreground">
                                  IN
                                  <input
                                    type="date"
                                    value={personFrom}
                                    onChange={(event) =>
                                      onUpdatePersonDates(project.id, person.id, event.target.value || null, personTo || null)
                                    }
                                    className="h-8 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
                                  />
                                </label>
                                <label className="grid gap-1 text-xs text-muted-foreground">
                                  OUT
                                  <input
                                    type="date"
                                    value={personTo}
                                    onChange={(event) =>
                                      onUpdatePersonDates(project.id, person.id, personFrom || null, event.target.value || null)
                                    }
                                    className="h-8 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => onRemovePerson(project.id, person.id)}
                                  className="h-8 rounded-lg border border-rose-200 px-3 text-sm text-rose-800 hover:bg-rose-50"
                                >
                                  Remove
                                </button>
                              </li>
                            );
                          })
                        )}
                      </ul>

                      {crewEditId === project.id ? (
                        <div className="mt-3 space-y-3 rounded-xl bg-muted/40 p-3">
                          <p className="text-sm font-medium">Add people</p>
                          <div className="max-h-44 overflow-y-auto">
                            {available.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Everyone is already on this job.</p>
                            ) : (
                              <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                                {available.map((person) => (
                                  <li key={person.id}>
                                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-card">
                                      <input
                                        type="checkbox"
                                        checked={addDraft.includes(person.id)}
                                        onChange={() => setAddDraft((current) => togglePerson(current, person.id))}
                                      />
                                      <span className="min-w-0 truncate">
                                        {person.name}
                                        <span className="text-muted-foreground"> · {person.role}</span>
                                      </span>
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
                              disabled={addDraft.length === 0}
                              onClick={() => {
                                onSetCrew(
                                  project.id,
                                  [...crew.map((person) => person.id), ...addDraft],
                                );
                                setAddDraft([]);
                                setCrewEditId("");
                              }}
                            >
                              Add selected
                            </button>
                            <button type="button" onClick={() => setCrewEditId("")} className="h-9 rounded-lg border border-input px-3 text-sm">
                              Done
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {extendId === project.id ? (
                        <form
                          className={cn("mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-muted/40 p-3")}
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (!extendFrom || !extendTo) return;
                            onExtend(project.id, extendFrom, extendTo);
                            setExtendId("");
                            setExtendFrom("");
                            setExtendTo("");
                          }}
                        >
                          <label className="grid gap-1 text-sm">
                            <span className="text-muted-foreground">Extension start</span>
                            <input type="date" value={extendFrom} onChange={(e) => setExtendFrom(e.target.value)} className="h-9 rounded-lg border border-input px-2" required />
                          </label>
                          <label className="grid gap-1 text-sm">
                            <span className="text-muted-foreground">Extension finish</span>
                            <input type="date" value={extendTo} onChange={(e) => setExtendTo(e.target.value)} className="h-9 rounded-lg border border-input px-2" required />
                          </label>
                          <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
                            Save extension
                          </button>
                          <button type="button" onClick={() => setExtendId("")} className="h-9 rounded-lg border border-input px-3 text-sm">
                            Cancel
                          </button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
