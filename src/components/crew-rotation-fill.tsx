"use client";

import { useMemo } from "react";
import { addDays, formatMedium } from "@/lib/dates";
import { dutyLabel, siteLabel, type CrewSnapshot } from "@/lib/crew-schedule";
import { cn } from "@/lib/cn";

function monthEndExclusive(monthStart: string) {
  return addDays(`${monthStart.slice(0, 7)}-28`, 10).slice(0, 7) + "-01";
}

function isAvailable(row: CrewSnapshot) {
  if (row.person.active === false) return false;
  return (
    row.duty === "unassigned" ||
    row.duty === "off_rotation" ||
    (row.duty === "upcoming" && !row.plannedIn)
  );
}

function siteOverlap(a: string[] | undefined, b: string | null) {
  if (!b || !a?.length) return false;
  return a.some((site) => site.toUpperCase() === b.toUpperCase());
}

export function CrewRotationFill({
  monthStart,
  today,
  rows,
  onOpen,
}: {
  monthStart: string;
  today: string;
  rows: CrewSnapshot[];
  onOpen: (personId: string) => void;
}) {
  const end = monthEndExclusive(monthStart);

  const available = useMemo(
    () =>
      rows
        .filter(isAvailable)
        .sort((a, b) => {
          const dutyRank = (duty: string) =>
            duty === "unassigned" ? 0 : duty === "off_rotation" ? 1 : 2;
          return (
            dutyRank(a.duty) - dutyRank(b.duty) ||
            a.person.role.localeCompare(b.person.role) ||
            a.person.name.localeCompare(b.person.name)
          );
        }),
    [rows],
  );

  const ending = useMemo(
    () =>
      rows
        .filter((row) => {
          if (row.person.active === false) return false;
          if (!row.plannedOut) return false;
          const leaving = row.plannedOut >= monthStart && row.plannedOut < end;
          const alreadyOut =
            row.plannedOut < today && (row.duty === "off_rotation" || row.duty === "unassigned");
          return leaving || (alreadyOut && row.plannedOut >= addDays(monthStart, -14));
        })
        .map((row) => {
          const sameRole = available.filter(
            (opt) => opt.person.id !== row.person.id && opt.person.role === row.person.role,
          );
          const siteFit = sameRole.filter((opt) => siteOverlap(opt.person.homeSites, row.site));
          const options = [
            ...siteFit,
            ...sameRole.filter((opt) => !siteFit.some((s) => s.person.id === opt.person.id)),
          ];
          return { row, options };
        })
        .sort(
          (a, b) =>
            (a.row.plannedOut || "").localeCompare(b.row.plannedOut || "") ||
            a.row.person.name.localeCompare(b.row.person.name),
        ),
    [available, end, monthStart, rows, today],
  );

  if (ending.length === 0 && available.length === 0) return null;

  return (
    <section className="grid gap-4 rounded-2xl border border-border bg-card p-4 lg:grid-cols-2">
      <div>
        <h3 className="text-base font-semibold tracking-tight">Rotations ending</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Finishing stays with unplaced options you can plan next.
        </p>
        {ending.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nobody finishing in this window.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {ending.map(({ row, options }) => (
              <li key={row.person.id} className="rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => onOpen(row.person.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{row.person.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.person.role}
                      {row.site ? ` · ${siteLabel(row.site)}` : ""}
                      {row.plannedOut ? ` · out ${formatMedium(row.plannedOut)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-primary">Open</span>
                </button>
                {options.length === 0 ? (
                  <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                    No unplaced {row.person.role} available right now.
                  </p>
                ) : (
                  <ul className="border-t border-border bg-muted/20">
                    {options.slice(0, 6).map((opt) => (
                      <li key={opt.person.id}>
                        <button
                          type="button"
                          onClick={() => onOpen(opt.person.id)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{opt.person.name}</span>
                            <span className="block text-[13px] text-muted-foreground">
                              {dutyLabel(opt.duty)}
                              {opt.person.homeSites?.length
                                ? ` · ${opt.person.homeSites.join(", ")}`
                                : ""}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium",
                              opt.duty === "unassigned"
                                ? "bg-rose-50 text-rose-900"
                                : "bg-card text-muted-foreground",
                            )}
                          >
                            {opt.duty === "unassigned" ? "Not placed" : dutyLabel(opt.duty)}
                          </span>
                        </button>
                      </li>
                    ))}
                    {options.length > 6 ? (
                      <li className="px-3 py-1.5 text-[13px] text-muted-foreground">
                        +{options.length - 6} more in Available to place
                      </li>
                    ) : null}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-base font-semibold tracking-tight">Available to place</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Not currently on a rotation. Full list for movement planning.
        </p>
        {available.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Everyone is placed or upcoming.</p>
        ) : (
          <ul className="mt-3 max-h-[28rem] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {available.map((row) => (
              <li key={row.person.id}>
                <button
                  type="button"
                  onClick={() => onOpen(row.person.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{row.person.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.person.role}
                      {row.person.homeSites?.length ? ` · ${row.person.homeSites.join(", ")}` : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[13px] font-medium",
                      row.duty === "unassigned" ? "bg-rose-50 text-rose-900" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {row.duty === "unassigned" ? "Not placed" : dutyLabel(row.duty)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
