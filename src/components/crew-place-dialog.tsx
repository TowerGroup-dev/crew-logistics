"use client";

import { useMemo, useState } from "react";
import { CREW_ROLES } from "@/lib/crew-schedule";
import { MAX_ROTATION_DAYS } from "@/lib/crew-roster";
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
  roles,
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
  const [role, setRole] = useState(() => defaultRole || "Labourer");
  const [customRole, setCustomRole] = useState("");
  const [error, setError] = useState("");

  const dayCount = daysBetween(from, to) + 1;
  const capped = dayCount > MAX_ROTATION_DAYS;
  const inclusiveTo = capped ? addDays(from, MAX_ROTATION_DAYS - 1) : to;
  const out = addDays(inclusiveTo, 1);
  const finalDays = daysBetween(from, inclusiveTo) + 1;

  const roleOptions = useMemo(() => {
    const set = new Set<string>([...(roles || CREW_ROLES), defaultRole || ""].filter(Boolean));
    return [...set];
  }, [defaultRole, roles]);

  function submit() {
    if (overlapError) {
      setError(overlapError);
      return;
    }
    const chosen = role === "__other__" ? customRole.trim() : role.trim();
    if (!chosen) {
      setError("Pick a role for this assignment.");
      return;
    }
    setError("");
    onSave({ site, from, out, role: chosen });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="place-rotation-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl"
      >
        <h3 id="place-rotation-title" className="font-heading text-xl tracking-tight">
          Place {personName}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatMedium(from)} – {formatMedium(inclusiveTo)} · {finalDays} day{finalDays === 1 ? "" : "s"}
          {capped ? ` (capped at ${MAX_ROTATION_DAYS})` : ""}
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
            <span className="text-muted-foreground">Role for this assignment</span>
            <select
              value={roleOptions.includes(role) ? role : "__other__"}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "__other__") {
                  setRole("__other__");
                } else {
                  setRole(value);
                  setCustomRole("");
                }
              }}
              className="h-9 rounded-lg border border-input px-2"
            >
              {roleOptions.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
              <option value="__other__">Other role…</option>
            </select>
          </label>

          {role === "__other__" || !roleOptions.includes(role) ? (
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Custom role</span>
              <input
                value={customRole || (role !== "__other__" ? role : "")}
                onChange={(event) => {
                  setRole("__other__");
                  setCustomRole(event.target.value);
                }}
                placeholder="e.g. Manager"
                className="h-9 rounded-lg border border-input px-2"
              />
            </label>
          ) : null}

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
            Role is for this stay only. Next time they can be a different role.
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
