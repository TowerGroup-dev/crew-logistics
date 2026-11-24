"use client";

import { useState } from "react";
import { MAX_ROTATION_DAYS, MAX_STAY_NOTE_CHARS, STANDARD_ROTATION_DAYS } from "@/lib/crew-roster";
import { DEFAULT_SITES, siteColour, type CrewSite } from "@/lib/crew-sites";
import { addDays, dayCountLabel, daysBetween, formatMedium } from "@/lib/dates";
import { cn } from "@/lib/cn";

export type PlaceRotationInput = {
  site: string;
  from: string;
  out: string;
  role: string;
  /** Optional coordinator note on this placement (NAV-08). */
  note?: string;
  /** Preliminary arrival — Overview reminds to book 2 weeks before IN. */
  tentative?: boolean;
  /** Inclusive last day of the arrival window (one day or several). */
  tentativeThrough?: string;
};

export function CrewPlaceDialog({
  personName,
  defaultSite,
  defaultRole,
  from,
  to,
  overlapError,
  sites = DEFAULT_SITES,
  roles = [],
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
  const [role, setRole] = useState(() => (defaultRole || "Labourer").trim());
  const [note, setNote] = useState("");
  const [tentative, setTentative] = useState(false);
  const [tentativeThrough, setTentativeThrough] = useState(from);
  const [error, setError] = useState("");
  const roleOptions = roles.length ? roles : ["Labourer", "Operator/Truck Driver", "Surveyor", "Manager", "Mechanic"];

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
    let through = tentativeThrough.slice(0, 10);
    if (through < from) through = from;
    if (through > inclusiveTo) through = inclusiveTo;
    onSave({
      site,
      from,
      out,
      role,
      note: note.trim() || undefined,
      tentative: tentative || undefined,
      tentativeThrough: tentative && through !== from ? through : undefined,
    });
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

          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Role for this stay</span>
            <input
              value={role}
              onChange={(event) => setRole(event.target.value)}
              list="place-rotation-roles"
              className="h-9 rounded-lg border border-input px-2"
            />
            <datalist id="place-rotation-roles">
              {roleOptions.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Note</span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, MAX_STAY_NOTE_CHARS))}
              placeholder="e.g. Held for weather"
              maxLength={MAX_STAY_NOTE_CHARS}
              spellCheck
              autoCorrect="on"
              autoCapitalize="sentences"
              lang="en"
              className="h-9 rounded-lg border border-input px-2"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={tentative}
              onChange={(event) => setTentative(event.target.checked)}
              className="size-4 rounded border-input"
            />
            Preliminary arrival
          </label>

          {tentative ? (
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Window ends</span>
              <input
                type="date"
                value={tentativeThrough}
                min={from}
                max={inclusiveTo}
                onChange={(event) => setTentativeThrough(event.target.value)}
                className="h-9 rounded-lg border border-input px-2"
              />
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2 text-[0.8125rem] text-muted-foreground">
            {siteList.map((row) => (
              <span key={row.code} className="inline-flex items-center gap-1">
                <span className={cn("size-2 rounded-sm", siteColour(row).swatch)} aria-hidden />
                {row.code}
              </span>
            ))}
          </div>
        </div>

        {overlapError || error ? (
          <p className="mt-3 text-sm font-medium text-rose-700">
            <span aria-hidden>*</span> {overlapError || error}
          </p>
        ) : pastSixWeeks ? (
          <p className="mt-3 text-sm font-medium text-rose-700">
            <span aria-hidden>*</span> Past {dayCountLabel(STANDARD_ROTATION_DAYS)} · max{" "}
            {dayCountLabel(MAX_ROTATION_DAYS)}.
          </p>
        ) : null}

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
