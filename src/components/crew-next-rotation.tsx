"use client";

import { useMemo, useState } from "react";
import { DEFAULT_ROTATION_DAYS, MAX_ROTATION_DAYS } from "@/lib/crew-roster";
import { addDays, formatMedium } from "@/lib/dates";
import { cn } from "@/lib/cn";

const SITES = [
  { code: "IQA", label: "IQA", swatch: "bg-sky-500" },
  { code: "POND", label: "POND", swatch: "bg-emerald-500" },
  { code: "ALRT", label: "ALRT", swatch: "bg-amber-500" },
  { code: "KUG", label: "KUG", swatch: "bg-violet-500" },
] as const;

export function CrewNextRotationForm({
  defaultSite,
  defaultRole,
  defaultDays,
  isActive,
  roles = [],
  onSave,
  onSaveMany,
}: {
  defaultSite?: string | null;
  defaultRole?: string | null;
  defaultDays: number;
  isActive: boolean;
  roles?: string[];
  onSave: (input: { site: string; from: string; out: string; role: string }) => void;
  /** Several stays at once (repeat pattern), saved as one change. */
  onSaveMany?: (inputs: { site: string; from: string; out: string; role: string }[]) => void;
}) {
  const [site, setSite] = useState(() => {
    const home = (defaultSite || "IQA").toUpperCase();
    return SITES.some((row) => row.code === home) ? home : "IQA";
  });
  const [role, setRole] = useState(() => (defaultRole || "Labourer").trim());
  const [from, setFrom] = useState("");
  const [days, setDays] = useState(
    String(Math.min(defaultDays || DEFAULT_ROTATION_DAYS, MAX_ROTATION_DAYS)),
  );
  const [error, setError] = useState("");
  // Repeat: same length, N weeks off in between, until a date (planning a whole year).
  const [repeat, setRepeat] = useState(false);
  const [weeksOff, setWeeksOff] = useState("3");
  const [until, setUntil] = useState("");
  const roleOptions = roles.length
    ? roles
    : ["Labourer", "Operator/Truck Driver", "Surveyor", "Manager", "Mechanic"];

  const out = useMemo(() => {
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return "";
    const n = Math.min(Math.max(1, Math.round(Number(days) || 0)), MAX_ROTATION_DAYS);
    if (!Number.isFinite(n) || n < 1) return "";
    return addDays(from, n);
  }, [days, from]);

  /** Every stay the repeat pattern makes: [IN, exclusive OUT). */
  const series = useMemo(() => {
    if (!repeat || !from || !out) return [];
    const length = Math.max(1, Math.round((Date.parse(out) - Date.parse(from)) / 86400000));
    const gap = Math.max(0, Math.round(Number(weeksOff) || 0)) * 7;
    const last = until || `${from.slice(0, 4)}-12-31`;
    const stays: { from: string; out: string }[] = [];
    for (let start = from; start <= last && stays.length < 26; start = addDays(start, length + gap)) {
      stays.push({ from: start, out: addDays(start, length) });
    }
    return stays;
  }, [from, out, repeat, until, weeksOff]);

  function submit() {
    if (!from) {
      setError("Pick the IN date.");
      return;
    }
    if (!out) {
      setError(`Set days (1–${MAX_ROTATION_DAYS}).`);
      return;
    }
    if (!role) {
      setError("This person has no role on file.");
      return;
    }
    setError("");
    if (repeat && series.length > 1) {
      const inputs = series.map((stay) => ({ site, role, ...stay }));
      if (onSaveMany) onSaveMany(inputs);
      else inputs.forEach(onSave);
    } else {
      onSave({ site, from, out, role });
    }
    setFrom("");
  }

  return (
    <section className="grid gap-3 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Next rotation</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isActive
            ? `Site + IN. Change role for this stay if needed. Standard ${DEFAULT_ROTATION_DAYS} days; up to ${MAX_ROTATION_DAYS}.`
            : `Sets them active and places the next stay (standard ${DEFAULT_ROTATION_DAYS}, up to ${MAX_ROTATION_DAYS}).`}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Site</span>
          <select
            value={site}
            onChange={(event) => setSite(event.target.value)}
            className="h-9 rounded-lg border border-input px-2"
          >
            {SITES.map((row) => (
              <option key={row.code} value={row.code}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Role for this stay</span>
          <input
            value={role}
            onChange={(event) => setRole(event.target.value)}
            list="next-rotation-roles"
            className="h-9 rounded-lg border border-input px-2"
          />
          <datalist id="next-rotation-roles">
            {roleOptions.map((entry) => (
              <option key={entry} value={entry} />
            ))}
          </datalist>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">IN</span>
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 rounded-lg border border-input px-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Days (max {MAX_ROTATION_DAYS})</span>
          <input
            type="number"
            min={1}
            max={MAX_ROTATION_DAYS}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="h-9 rounded-lg border border-input px-2"
          />
        </label>
        <div className="grid gap-1 text-sm">
          <span className="text-muted-foreground">OUT (last day)</span>
          <div className="flex h-9 items-center rounded-lg border border-dashed border-border px-2 text-sm">
            {out ? formatMedium(addDays(out, -1)) : "-"}
          </div>
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <label className="inline-flex items-center gap-2 font-medium">
          <input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} />
          Repeat this rotation
        </label>
        {repeat ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-muted-foreground">Weeks off between stays</span>
                <input
                  type="number"
                  min={0}
                  max={26}
                  value={weeksOff}
                  onChange={(event) => setWeeksOff(event.target.value)}
                  className="h-9 rounded-lg border border-input px-2"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-muted-foreground">Last IN no later than</span>
                <input
                  type="date"
                  value={until}
                  min={from || undefined}
                  onChange={(event) => setUntil(event.target.value)}
                  className="h-9 rounded-lg border border-input px-2"
                />
              </label>
            </div>
            {series.length ? (
              <ol className="grid gap-1 sm:grid-cols-2">
                {series.map((stay, index) => (
                  <li key={stay.from} className="rounded-md bg-card px-2 py-1 tabular-nums">
                    <span className="font-semibold">{index + 1}.</span> {site} · IN {formatMedium(stay.from)}, OUT{" "}
                    {formatMedium(addDays(stay.out, -1))}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground">Pick the first IN date to see every stay.</p>
            )}
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {repeat && series.length > 1
            ? `Add ${series.length} rotations`
            : isActive
              ? "Add rotation"
              : "Set active and add rotation"}
        </button>
        <div className="flex flex-wrap gap-2 text-[0.8125rem] text-muted-foreground">
          {SITES.map((row) => (
            <span key={row.code} className="inline-flex items-center gap-1">
              <span className={cn("size-2 rounded-sm", row.swatch)} aria-hidden />
              {row.code}
            </span>
          ))}
        </div>
      </div>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
