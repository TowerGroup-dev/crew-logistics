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
  onSave,
}: {
  defaultSite?: string | null;
  defaultRole?: string | null;
  defaultDays: number;
  isActive: boolean;
  onSave: (input: { site: string; from: string; out: string; role: string }) => void;
}) {
  const [site, setSite] = useState(() => {
    const home = (defaultSite || "IQA").toUpperCase();
    return SITES.some((row) => row.code === home) ? home : "IQA";
  });
  const role = (defaultRole || "Labourer").trim();
  const [from, setFrom] = useState("");
  const [days, setDays] = useState(
    String(Math.min(defaultDays || DEFAULT_ROTATION_DAYS, MAX_ROTATION_DAYS)),
  );
  const [error, setError] = useState("");

  const out = useMemo(() => {
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return "";
    const n = Math.min(Math.max(1, Math.round(Number(days) || 0)), MAX_ROTATION_DAYS);
    if (!Number.isFinite(n) || n < 1) return "";
    return addDays(from, n);
  }, [days, from]);

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
    onSave({ site, from, out, role });
    setFrom("");
  }

  return (
    <section className="grid gap-3 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Next rotation</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isActive
            ? `Site + IN. Role stays ${role}. Standard ${DEFAULT_ROTATION_DAYS} days; up to ${MAX_ROTATION_DAYS}.`
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
        <div className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Role</span>
          <p className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-2 font-medium">
            {role || "—"}
          </p>
        </div>
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
          <span className="text-muted-foreground">OUT</span>
          <div className="flex h-9 items-center rounded-lg border border-dashed border-border px-2 text-sm">
            {out ? formatMedium(out) : "-"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {isActive ? "Add rotation" : "Set active + add rotation"}
        </button>
        <div className="flex flex-wrap gap-2 text-[13px] text-muted-foreground">
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
