"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Users, X } from "lucide-react";
import type { CrewPerson } from "@/lib/crew-schedule";
import { DEFAULT_SITES } from "@/lib/crew-sites";
import { DEFAULT_ROTATION_DAYS } from "@/lib/crew-roster";
import { addDays, formatMedium } from "@/lib/dates";
import { cn } from "@/lib/cn";

export type MultiScheduleRow = {
  personId: string;
  personName: string;
  site: string;
  from: string;
  to: string;
};

/** Schedule several people onto the Month calendar in one pass. */
export function CrewMultiSchedule({
  people,
  initialDate,
  onApply,
  onClose,
}: {
  people: CrewPerson[];
  initialDate: string;
  onApply: (rows: MultiScheduleRow[]) => void;
  onClose: () => void;
}) {
  const start = initialDate.slice(0, 10);
  // Inclusive last day of a standard rotation (roster `out` is exclusive one day later).
  const defaultOut = addDays(start, DEFAULT_ROTATION_DAYS - 1);
  const [rows, setRows] = useState<MultiScheduleRow[]>([
    {
      personId: "",
      personName: "",
      site: "IQA",
      from: start,
      to: defaultOut,
    },
  ]);
  const [query, setQuery] = useState("");

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((person) => person.active !== false)
      .filter((person) => !q || person.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 40);
  }, [people, query]);

  function setRow(index: number, patch: Partial<MultiScheduleRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function pickPerson(index: number, person: CrewPerson) {
    setRow(index, { personId: person.id, personName: person.name });
    setQuery("");
  }

  function apply() {
    const ready = rows.filter((row) => row.personId && row.site && row.from && row.to && row.to >= row.from);
    if (!ready.length) return;
    onApply(ready);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-stone-900/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="multi-schedule-title"
        className="max-h-[min(92vh,36rem)] w-full max-w-lg overflow-auto rounded-2xl border border-border bg-card p-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="multi-schedule-title" className="flex items-center gap-2 text-base font-semibold">
              <Users className="size-4" />
              Schedule multiple people
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {rows.map((row, index) => (
            <div key={index} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Person {index + 1}
                </p>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    aria-label="Remove person"
                    onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    className="rounded-md p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-800"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>

              <label className="mt-2 grid gap-1 text-xs text-muted-foreground">
                Employee
                <input
                  value={row.personName || query}
                  onChange={(event) => {
                    setRow(index, { personId: "", personName: event.target.value });
                    setQuery(event.target.value);
                  }}
                  placeholder="Search by name..."
                  className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
                />
              </label>
              {!row.personId && query.trim() ? (
                <ul className="mt-1 max-h-28 overflow-auto rounded-lg border border-border bg-card">
                  {options.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => pickPerson(index, person)}
                        className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span className="font-medium">{person.name}</span>
                        <span className="text-xs text-muted-foreground">{person.role}</span>
                      </button>
                    </li>
                  ))}
                  {!options.length ? (
                    <li className="px-2.5 py-2 text-xs text-muted-foreground">No match</li>
                  ) : null}
                </ul>
              ) : null}

              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Camp
                  <select
                    value={row.site}
                    onChange={(event) => setRow(index, { site: event.target.value })}
                    className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
                  >
                    {DEFAULT_SITES.map((site) => (
                      <option key={site.code} value={site.code}>
                        {site.code}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Arrival
                  <input
                    type="date"
                    value={row.from}
                    onChange={(event) => setRow(index, { from: event.target.value })}
                    className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
                  />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Departure
                  <input
                    type="date"
                    value={row.to}
                    onChange={(event) => setRow(index, { to: event.target.value })}
                    className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
                  />
                </label>
              </div>
              {row.personName && row.from && row.to ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {row.personName} · {row.site} · {formatMedium(row.from)} – {formatMedium(row.to)}
                </p>
              ) : null}
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  personId: "",
                  personName: "",
                  site: current[0]?.site || "IQA",
                  from: current[0]?.from || start,
                  to: current[0]?.to || defaultOut,
                },
              ])
            }
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-input text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-3.5" /> Add another employee
          </button>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-input px-3 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!rows.some((row) => row.personId)}
            onClick={apply}
            className={cn(
              "h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground",
              "disabled:opacity-40",
            )}
          >
            Add to calendar
          </button>
        </div>
      </div>
    </div>
  );
}
