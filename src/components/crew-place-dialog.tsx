"use client";

import { useState } from "react";
import { MAX_ROTATION_DAYS, STANDARD_ROTATION_DAYS } from "@/lib/crew-roster";
import { DEFAULT_SITES, siteColour, type CrewSite } from "@/lib/crew-sites";
import { addDays, daysBetween, formatMedium } from "@/lib/dates";
import { cn } from "@/lib/cn";

export type PlaceRotationInput = {
  site: string;
  from: string;
  out: string;
  role: string;
};

export function CrewPlaceDialog({
  personName,
  defaultSite,
  defaultRole,
  from,
  to,
  overlapError,
  sites = DEFAULT_SITES,
  onCancel,
  onSave,
}: {
  personName: string;
  defaultSite?: string | null;
  defaultRole?: string | null;
  /** Inclusive start / end of the painted range. */
  from: string;
  to: string;
  overlapError?: string | null;
  sites?: CrewSite[];
  roles?: string[];
  onCancel: () => void;
  onSave: (input: PlaceRotationInput) => void;
}) {
  const siteList = sites.length ? sites : DEFAULT_SITES;
  const home = (defaultSite || siteList[0]?.code || "IQA").toUpperCase();
  const [site, setSite] = useState(() =>
    siteList.some((row) => row.code === home) ? home : siteList[0]!.code,
  );
  const role = (defaultRole || "Labourer").trim();
  const [error, setError] = useState("");

  const dayCount = daysBetween(from, to) + 1;
  const overCeiling = dayCount > MAX_ROTATION_DAYS;
  const inclusiveTo = overCeiling ? addDays(from, MAX_ROTATION_DAYS - 1) : to;
  const out = addDays(inclusiveTo, 1);
  const finalDays = daysBetween(from, inclusiveTo) + 1;
  const pastSixWeeks = finalDays > STANDARD_ROTATION_DAYS;

  function submit() {
    if (overlapError) {
      setError(overlapError);
      return;
    }
    if (!role) {
      setError("This person has no role on file.");
      return;
    }
    setError("");
    onSave({ site, from, out, role });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="place-rotation-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl"
      >
        <h3 id="place-rotation-title" className="text-base font-semibold tracking-tight">
          Place {personName}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatMedium(from)} – {formatMedium(inclusiveTo)} · {finalDays} day{finalDays === 1 ? "" : "s"}
          {pastSixWeeks ? " · extending past 6 weeks" : ""}
          {overCeiling ? ` (capped at ${MAX_ROTATION_DAYS})` : ""}
        </p>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Site</span>
            <select
              value={site}
              onChange={(event) => setSite(event.target.value)}
              className="h-9 rounded-lg border border-input px-2"
            >
              {siteList.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.code}
                  {row.name !== row.code ? `, ${row.name}` : ""}
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

          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {siteList.map((row) => (
              <span key={row.code} className="inline-flex items-center gap-1">
                <span className={cn("size-2 rounded-sm", siteColour(row).swatch)} aria-hidden />
                {row.code}
              </span>
            ))}
          </div>
        </div>

        {overlapError || error ? (
          <p className="mt-3 text-sm text-rose-700">{overlapError || error}</p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            {pastSixWeeks
              ? `This stay is past the usual 6 weeks (${STANDARD_ROTATION_DAYS} days). Ceiling is ${MAX_ROTATION_DAYS} days.`
              : `Standard stay is ${STANDARD_ROTATION_DAYS} days (6 weeks). Keep painting to extend past 6 weeks if needed.`}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-input px-3 text-sm font-medium">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={Boolean(overlapError)}
            className="h-9 rounded-lg bg-stone-900 px-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Place
          </button>
        </div>
      </div>
    </div>
  );
}
