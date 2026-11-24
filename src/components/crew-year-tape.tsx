"use client";

import { useMemo, useState } from "react";
import { EyeOff, Plus } from "lucide-react";
import {
  CREW_ROLE_ORDER,
  CREW_ROLES,
  CREW_SCHEDULE,
  isCampSite,
  isOffRotation,
  normalizeRole,
  siteLabel,
  statusOnDate,
  yearOnSiteBars,
  yearTodayMarker,
  type CrewPerson,
} from "@/lib/crew-schedule";
import { CrewRoleHeader } from "@/components/crew-role-header";
import { CrewPlaceDialog, type PlaceRotationInput } from "@/components/crew-place-dialog";
import { DEFAULT_ROTATION_DAYS, MAX_ROTATION_DAYS } from "@/lib/crew-roster";
import { DEFAULT_SITES, siteColour, worksiteFromMark, type CrewSite } from "@/lib/crew-sites";
import { addDays, formatMedium } from "@/lib/dates";
import { cn } from "@/lib/cn";

const MONTHS = [
  { key: "01", short: "Jan", long: "January" },
  { key: "02", short: "Feb", long: "February" },
  { key: "03", short: "Mar", long: "March" },
  { key: "04", short: "Apr", long: "April" },
  { key: "05", short: "May", long: "May" },
  { key: "06", short: "Jun", long: "June" },
  { key: "07", short: "Jul", long: "July" },
  { key: "08", short: "Aug", long: "August" },
  { key: "09", short: "Sep", long: "September" },
  { key: "10", short: "Oct", long: "October" },
  { key: "11", short: "Nov", long: "November" },
  { key: "12", short: "Dec", long: "December" },
] as const;

function siteBarTone(site: string, sites: CrewSite[]) {
  const key = site.toUpperCase();
  const hit = sites.find((row) => key === row.code || key.includes(row.code));
  if (hit) return siteColour(hit).bar;
  const camp = sites.find((row) => row.camp);
  if (isCampSite(site) && camp) return siteColour(camp).bar;
  return siteColour(site).bar;
}

function occupiedOn(person: CrewPerson, iso: string) {
  for (const stint of person.stints || []) {
    if (stint.from <= iso && (!stint.out || iso < stint.out)) {
      return Boolean(worksiteFromMark(stint.site) || stint.sites.some((entry) => worksiteFromMark(entry)));
    }
  }
  const mark = statusOnDate(person, iso);
  return Boolean(mark && !isOffRotation(mark) && worksiteFromMark(mark));
}

function overlapMessage(person: CrewPerson, from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (occupiedOn(person, d)) {
      return `Overlaps an existing stay around ${formatMedium(d)}. Open Month and place on empty days.`;
    }
  }
  return null;
}

type Row = {
  person: CrewPerson;
  displayRole?: string;
};

export function CrewYearTape({
  year = CREW_SCHEDULE.year,
  today,
  rows,
  sites = DEFAULT_SITES,
  roles = [],
  onOpen,
  onMonthClick,
  onAddRotation,
  onHidePerson,
  hiddenPeople,
  onShowPerson,
  onShowAllHidden,
  onAddUnderRole,
}: {
  year?: number;
  today: string;
  rows: Row[];
  sites?: CrewSite[];
  roles?: string[];
  onOpen: (personId: string) => void;
  /** monthIndex is 1–12. personId set when clicking a crew row month cell. */
  onMonthClick?: (year: number, monthIndex: number, personId?: string) => void;
  onAddRotation?: (personId: string, input: PlaceRotationInput) => string | void;
  onHidePerson?: (personId: string, sectionRole?: string) => void;
  hiddenPeople?: { id: string; name: string; role?: string }[];
  onShowPerson?: (personId: string, sectionRole?: string) => void;
  onShowAllHidden?: () => void;
  onAddUnderRole?: (sectionRole: string) => void;
}) {
  const siteList = sites.length ? sites : DEFAULT_SITES;
  const roleOptions = roles.length ? roles : [...CREW_ROLES];
  const todayPct = yearTodayMarker(today, year);
  const todayMonth = today.startsWith(String(year)) ? Number(today.slice(5, 7)) : null;
  const [placePrompt, setPlacePrompt] = useState<{
    person: CrewPerson;
    sectionRole: string;
    from: string;
    to: string;
  } | null>(null);

  const groups = useMemo(() => {
    const roleRank = (value: string) => {
      const key = normalizeRole(value);
      const index = (CREW_ROLE_ORDER as readonly string[]).indexOf(key as (typeof CREW_ROLE_ORDER)[number]);
      return index === -1 ? CREW_ROLE_ORDER.length : index;
    };
    const sorted = [...rows].sort(
      (a, b) =>
        roleRank(a.displayRole || a.person.role) - roleRank(b.displayRole || b.person.role) ||
        a.person.name.localeCompare(b.person.name),
    );
    const out: { role: string; people: CrewPerson[] }[] = [];
    for (const row of sorted) {
      const role = normalizeRole(row.displayRole || row.person.role);
      const last = out[out.length - 1];
      if (!last || last.role !== role) out.push({ role, people: [row.person] });
      else last.people.push(row.person);
    }
    return out;
  }, [rows]);

  function startPlace(person: CrewPerson, monthIndex: number, sectionRole: string) {
    const month = String(monthIndex).padStart(2, "0");
    const monthStart = `${year}-${month}-01`;
    const nextMonth =
      monthIndex === 12 ? `${year + 1}-01-01` : `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
    let from = monthStart;
    while (from < nextMonth && occupiedOn(person, from)) from = addDays(from, 1);
    if (from >= nextMonth) {
      // Whole month busy, still open dialog so the overlap message explains it.
      from = monthStart;
    }
    let to = from;
    for (let i = 1; i < DEFAULT_ROTATION_DAYS; i += 1) {
      const next = addDays(from, i);
      if (occupiedOn(person, next)) break;
      to = next;
    }
    if (onAddRotation) {
      setPlacePrompt({ person, sectionRole, from, to });
      return;
    }
    onMonthClick?.(year, monthIndex, person.id);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-[#356dbd] px-3 py-2.5 text-white sm:px-5 sm:py-4">
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{year}</h2>
        <p className="mt-1 hidden text-sm text-white/85 sm:block">
          Click a month on a person to place them (standard 6 weeks; can extend). Header months open Month view.
        </p>
      </div>

      <div className="overflow-x-auto">
        {/* Phones: the whole year fits the screen (one letter per month). */}
        <div className="sm:min-w-[72rem]">
          <div className="sticky top-0 z-20 grid grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] border-b border-border bg-card shadow-sm">
            <div className="flex items-end overflow-hidden px-2 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:px-3 sm:py-3 sm:pl-5">
              <span className="truncate">List · {year}</span>
            </div>
            <div className="grid grid-cols-12 border-l border-border">
              {MONTHS.map((month, index) => {
                const active = todayMonth === index + 1;
                return (
                  <button
                    key={month.key}
                    type="button"
                    title={`Open ${month.long} ${year}`}
                    onClick={() => onMonthClick?.(year, index + 1)}
                    className={cn(
                      "overflow-hidden border-r border-border px-0 py-2 text-center last:border-r-0 hover:bg-primary/10 sm:px-1 sm:py-3",
                      active && "bg-rose-50",
                    )}
                  >
                    <p className={cn("truncate text-[0.8125rem] font-bold tracking-wide", active ? "text-rose-700" : "text-foreground")}>
                      <span className="sm:hidden">{month.short.slice(0, 1)}</span>
                      <span className="hidden sm:inline">{month.short}</span>
                    </p>
                    <p className={cn("mt-0.5 hidden truncate text-xs sm:block", active ? "font-medium text-rose-600" : "text-muted-foreground")}>
                      {year}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <ul>
            {groups.length === 0 ? (
              <li className="px-4 py-8 text-sm text-muted-foreground">No people match these filters.</li>
            ) : (
              groups.map((group, groupIndex) => (
                <li key={group.role}>
                  <CrewRoleHeader
                    role={group.role}
                    count={group.people.length}
                    spaced={groupIndex > 0}
                    trailing={
                      onAddUnderRole ? (
                        <button
                          type="button"
                          title={`Add someone under ${group.role}`}
                          aria-label={`Add under ${group.role}`}
                          onClick={() => onAddUnderRole(group.role)}
                          className="inline-flex size-7 items-center justify-center rounded-md bg-slate-300/70 text-slate-800 hover:bg-slate-300"
                        >
                          <Plus className="size-3.5" aria-hidden />
                        </button>
                      ) : null
                    }
                  />
                  <ul className="divide-y divide-border">
                    {group.people.map((person) => {
                      const bars = yearOnSiteBars(person, year);
                      return (
                        <li
                          key={`${person.id}::${group.role}`}
                          className="grid grid-cols-[6.5rem_minmax(0,1fr)] sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] hover:bg-muted/40"
                        >
                          <div className="flex min-w-0 items-center gap-0.5 py-2 pr-1 pl-1 sm:pl-4">
                            <button
                              type="button"
                              onClick={() => onOpen(person.id)}
                              className="min-w-0 flex-1 px-1 py-1 text-left sm:px-2"
                            >
                              <span className="block truncate text-sm font-medium">{person.name}</span>
                            </button>
                            {onHidePerson ? (
                              <button
                                type="button"
                                title={`Hide ${person.name}`}
                                aria-label={`Hide ${person.name}`}
                                onClick={() => onHidePerson(person.id, group.role)}
                                className="hidden shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:block"
                              >
                                <EyeOff className="size-3.5" />
                              </button>
                            ) : null}
                          </div>
                          <div className="relative h-14 border-l border-border bg-[linear-gradient(to_right,transparent_0,transparent_calc(100%/12-1px),rgba(0,0,0,0.06)_calc(100%/12-1px),rgba(0,0,0,0.06)_calc(100%/12))] bg-size-[calc(100%/12)_100%]">
                            <div className="absolute inset-0 z-20 grid grid-cols-12">
                              {MONTHS.map((month, index) => (
                                <button
                                  key={month.key}
                                  type="button"
                                  title={`Place ${person.name} from ${month.long} ${year}`}
                                  onClick={() => startPlace(person, index + 1, group.role)}
                                  className={cn(
                                    "border-r border-border/50 last:border-r-0 hover:bg-primary/15",
                                    todayMonth === index + 1 && "bg-rose-50/40",
                                  )}
                                />
                              ))}
                            </div>
                            {todayPct != null ? (
                              <div
                                className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-rose-500"
                                style={{ left: `${todayPct}%` }}
                                title={`Today · ${formatMedium(today)}`}
                              >
                                <span className="absolute top-0 left-1 hidden rounded bg-rose-600 px-1 py-px text-[9px] font-bold text-white sm:inline">
                                  Today
                                </span>
                              </div>
                            ) : null}
                            {bars.map((bar) => {
                              const label = siteLabel(bar.site);
                              return (
                                <div
                                  key={`${person.id}-${bar.from}-${bar.site}`}
                                  title={`${label} · ${formatMedium(bar.from)} – ${formatMedium(bar.to)}`}
                                  className={cn(
                                    "pointer-events-none absolute top-3 z-[1] flex h-8 items-center overflow-hidden rounded-md px-0.5 text-[10px] font-semibold text-white sm:px-1.5 sm:text-xs",
                                    siteBarTone(bar.site, siteList),
                                  )}
                                  style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                                >
                                  <span className="truncate">{label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {placePrompt && onAddRotation ? (
        <CrewPlaceDialog
          personName={placePrompt.person.name}
          defaultSite={siteList[0]?.code || "IQA"}
          defaultRole={placePrompt.sectionRole || placePrompt.person.role}
          from={placePrompt.from}
          to={placePrompt.to}
          sites={siteList}
          roles={roleOptions}
          overlapError={overlapMessage(placePrompt.person, placePrompt.from, placePrompt.to)}
          onCancel={() => setPlacePrompt(null)}
          onSave={(input) => {
            onAddRotation(placePrompt.person.id, input);
            setPlacePrompt(null);
          }}
        />
      ) : null}
    </section>
  );
}
