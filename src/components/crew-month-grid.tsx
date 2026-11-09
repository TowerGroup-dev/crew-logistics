"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EyeOff } from "lucide-react";
import {
  CREW_ROLE_ORDER,
  isCampSite,
  isOffRotation,
  roleLabel,
  scheduleYearLastDay,
  scheduleYearOutExclusive,
  siteLabel,
  statusOnDate,
  workLabelForAssignment,
  type CrewPerson,
} from "@/lib/crew-schedule";
import { CrewRoleHeader } from "@/components/crew-role-header";
import { CrewPlaceDialog, type PlaceRotationInput } from "@/components/crew-place-dialog";
import { CrewScheduleHiddenBar } from "@/components/crew-schedule-hidden-bar";
import { opsFor, type CrewOpsBook, type CrewPersonOps } from "@/lib/crew-ops";
import { MAX_ROTATION_DAYS, STANDARD_ROTATION_DAYS } from "@/lib/crew-roster";
import { DEFAULT_SITES, siteColour, worksiteFromMark, type CrewSite } from "@/lib/crew-sites";
import { addDays, daysBetween, formatMedium, toISODate } from "@/lib/dates";
import { cn } from "@/lib/cn";

function siteTone(site: string, sites: CrewSite[]) {
  const key = site.toUpperCase();
  const hit = sites.find((row) => key === row.code || key.includes(row.code));
  if (hit) return siteColour(hit).solid;
  const camp = sites.find((row) => row.camp);
  if (isCampSite(site) && camp) return siteColour(camp).solid;
  return siteColour(site).solid;
}

function siteOnDay(person: CrewPerson, iso: string) {
  const seasonExclusive = scheduleYearOutExclusive(Number(iso.slice(0, 4)));
  for (const stint of person.stints || []) {
    const out = stint.out && stint.out < seasonExclusive ? stint.out : seasonExclusive;
    if (stint.from <= iso && iso < out) {
      const site = worksiteFromMark(stint.site) || stint.sites.map(worksiteFromMark).find(Boolean);
      return site || null;
    }
  }
  const mark = statusOnDate(person, iso);
  if (!mark || isOffRotation(mark)) return null;
  if (iso > scheduleYearLastDay(Number(iso.slice(0, 4)))) return null;
  return worksiteFromMark(mark);
}

function roleOnDay(person: CrewPerson, iso: string) {
  for (const stint of person.stints || []) {
    if (stint.from <= iso && (!stint.out || iso < stint.out)) return stint.role || null;
  }
  return null;
}

function flightOnDay(person: CrewPerson, iso: string) {
  for (const flight of person.flights || []) {
    if (flight.arriveIqa === iso) return "in" as const;
    if (flight.departIqa === iso) return "out" as const;
  }
  return null;
}

function inBookWindow(iso: string, from: string | null, to: string | null) {
  if (!from && !to) return false;
  const start = from || to!;
  const end = to || from!;
  return iso >= start && iso <= end;
}

function orderedRange(a: string, b: string) {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

function clampPlaceRange(from: string, to: string) {
  const range = orderedRange(from, to);
  const maxTo = addDays(range.from, MAX_ROTATION_DAYS - 1);
  const seasonEnd = scheduleYearLastDay(Number(range.from.slice(0, 4)));
  const capped = range.to > maxTo ? maxTo : range.to;
  return { from: range.from, to: capped > seasonEnd ? seasonEnd : capped };
}

function overlapMessage(person: CrewPerson, from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const site = siteOnDay(person, d);
    if (site) {
      return `Overlaps existing stay (${siteLabel(site)} on ${formatMedium(d)}). Pick empty days.`;
    }
  }
  return null;
}

type DragMode = "place" | "book" | "clear" | "open" | "extend";

function stintCovering(person: CrewPerson, iso: string) {
  const seasonExclusive = scheduleYearOutExclusive(Number(iso.slice(0, 4)));
  for (const stint of person.stints || []) {
    const out = stint.out && stint.out < seasonExclusive ? stint.out : seasonExclusive;
    if (stint.from <= iso && iso < out) return stint;
  }
  return null;
}

export function CrewMonthGrid({
  monthStart,
  today,
  rows,
  opsBook,
  sites = DEFAULT_SITES,
  onOpen,
  onOpenDay,
  onPrev,
  onNext,
  onThisMonth,
  onSetBookWindow,
  onAddRotation,
  onExtendStay,
  onHidePerson,
  hiddenPeople,
  onShowPerson,
  onShowAllHidden,
}: {
  monthStart: string;
  today: string;
  rows: { person: CrewPerson }[];
  opsBook: CrewOpsBook;
  sites?: CrewSite[];
  onOpen: (personId: string) => void;
  /** Open the rotation covering this day (click, not drag). */
  onOpenDay?: (personId: string, iso: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onThisMonth?: () => void;
  onSetBookWindow: (
    personId: string,
    recipe: (current: CrewPersonOps) => CrewPersonOps,
  ) => void;
  onAddRotation: (personId: string, input: PlaceRotationInput) => void;
  /** Extend an existing stay's exclusive OUT to a later date. */
  onExtendStay?: (personId: string, stintFrom: string, newOut: string) => void;
  onHidePerson?: (personId: string) => void;
  hiddenPeople?: { id: string; name: string }[];
  onShowPerson?: (personId: string) => void;
  onShowAllHidden?: () => void;
}) {
  const siteList = sites.length ? sites : DEFAULT_SITES;
  const peopleById = useMemo(() => new Map(rows.map((row) => [row.person.id, row.person])), [rows]);
  const dragRef = useRef<{
    personId: string;
    /** Fixed day the drag started on — never moves during place. */
    anchor: string;
    start: string;
    end: string;
    mode: DragMode;
    moved: boolean;
  } | null>(null);
  const [draft, setDraft] = useState<{
    personId: string;
    start: string;
    end: string;
    mode: DragMode;
  } | null>(null);
  const [placePrompt, setPlacePrompt] = useState<{
    personId: string;
    from: string;
    to: string;
  } | null>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  /**
   * Focused month plus enough following days that a place/extend started late
   * in the month can still paint a long stay.
   */
  const days = useMemo(() => {
    const start = monthStart;
    const year = Number(start.slice(0, 4));
    const scheduleEnd = scheduleYearLastDay(year);
    const nextMonthStart = addDays(`${start.slice(0, 7)}-28`, 10).slice(0, 7) + "-01";
    const lastOfFocused = addDays(nextMonthStart, -1);
    // Paint ahead for place/extend, but never past season end (18 Dec 2026).
    const endExclusive = addDays(lastOfFocused, MAX_ROTATION_DAYS);
    const list: string[] = [];
    for (let d = start; d < endExclusive && d <= scheduleEnd; d = addDays(d, 1)) list.push(d);
    return list;
  }, [monthStart]);

  const nextMonthStart = useMemo(
    () => addDays(`${monthStart.slice(0, 7)}-28`, 10).slice(0, 7) + "-01",
    [monthStart],
  );

  const columns = `minmax(0,11rem) repeat(${days.length}, minmax(0,2.25rem))`;
  const trackWidth = `calc(11rem + ${days.length * 2.25}rem)`;

  function syncScroll(from: "top" | "main") {
    if (syncing.current) return;
    const top = topScrollRef.current;
    const main = mainScrollRef.current;
    if (!top || !main) return;
    syncing.current = true;
    if (from === "top") main.scrollLeft = top.scrollLeft;
    else top.scrollLeft = main.scrollLeft;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }

  const dateHeader = (
    <div className="grid bg-card" style={{ gridTemplateColumns: columns, width: trackWidth }}>
      <div className="sticky left-0 z-30 min-w-0 overflow-hidden bg-card px-4 py-2 pl-5 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase shadow-[2px_0_0_0_var(--border)]">
        List
      </div>
      {days.map((iso) => {
        const d = Number(iso.slice(8, 10));
        const date = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, d);
        const weekend = date.getDay() === 0 || date.getDay() === 6;
        const isToday = iso === today;
        const otherMonth = iso >= nextMonthStart;
        const monthBoundary = iso === nextMonthStart;
        return (
          <div
            key={iso}
            title={formatMedium(iso)}
            className={cn(
              "min-w-0 overflow-hidden border-l border-border px-0.5 py-2 text-center text-[12px] leading-tight tabular-nums",
              weekend && "bg-muted/60",
              otherMonth && "bg-sky-50/80",
              monthBoundary && "border-l-2 border-l-primary",
              isToday && "bg-rose-50 font-bold text-rose-700",
            )}
          >
            <div className="truncate">{d}</div>
            <div className="truncate text-muted-foreground">
              {d === 1 || monthBoundary
                ? date.toLocaleDateString("en-US", { month: "narrow" })
                : date.toLocaleDateString("en-US", { weekday: "narrow" })}
            </div>
          </div>
        );
      })}
    </div>
  );

  function autoScrollToward(iso: string) {
    const main = mainScrollRef.current;
    if (!main) return;
    const idx = days.indexOf(iso);
    if (idx < 0) return;
    const cellLeft = 11 * 16 + idx * 2.25 * 16;
    const cellRight = cellLeft + 2.25 * 16;
    const viewLeft = main.scrollLeft;
    const viewRight = viewLeft + main.clientWidth;
    if (cellRight > viewRight - 48) {
      main.scrollLeft = Math.min(main.scrollWidth, cellRight - main.clientWidth + 80);
      syncScroll("main");
    } else if (cellLeft < viewLeft + 48) {
      main.scrollLeft = Math.max(0, cellLeft - 80);
      syncScroll("main");
    }
  }

  const title = useMemo(() => {
    const [y, m] = monthStart.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
  }, [monthStart]);

  const groups = useMemo(() => {
    const roleRank = (value: string) => {
      const index = (CREW_ROLE_ORDER as readonly string[]).indexOf(value);
      return index === -1 ? CREW_ROLE_ORDER.length : index;
    };
    const sorted = [...rows].sort(
      (a, b) => roleRank(a.person.role) - roleRank(b.person.role) || a.person.name.localeCompare(b.person.name),
    );
    const out: { role: string; people: CrewPerson[] }[] = [];
    for (const row of sorted) {
      const last = out[out.length - 1];
      if (!last || last.role !== row.person.role) out.push({ role: row.person.role, people: [row.person] });
      else last.people.push(row.person);
    }
    return out;
  }, [rows]);

  /** Exact booking window from the days the user painted (contiguous on-site only). */
  function paintBookRange(personId: string, anchor: string, tip: string) {
    const person = peopleById.get(personId);
    if (!person || !siteOnDay(person, anchor)) return null;
    if (tip >= anchor) {
      let to = anchor;
      for (let d = anchor; d <= tip; d = addDays(d, 1)) {
        if (!siteOnDay(person, d)) break;
        to = d;
      }
      return { from: anchor, to };
    }
    let from = anchor;
    for (let d = anchor; d >= tip; d = addDays(d, -1)) {
      if (!siteOnDay(person, d)) break;
      from = d;
    }
    return { from, to: anchor };
  }

  function openDay(personId: string, iso: string) {
    if (onOpenDay) onOpenDay(personId, iso);
    else onOpen(personId);
  }

  function commitDrag() {
    const active = dragRef.current;
    dragRef.current = null;
    setDraft(null);
    if (!active) return;

    if (active.mode === "open") {
      openDay(active.personId, active.anchor);
      return;
    }

    if (active.mode === "clear") {
      onSetBookWindow(active.personId, (current) => ({
        ...current,
        returnBookFrom: null,
        returnBookTo: null,
        returnWindowPainted: false,
        returnFlight:
          current.returnFlight === "booked" || current.returnFlight === "confirmed"
            ? current.returnFlight
            : "not_started",
      }));
      return;
    }

    if (active.mode === "book") {
      const range = paintBookRange(active.personId, active.anchor, active.end);
      if (!range) return;
      onSetBookWindow(active.personId, (current) => ({
        ...current,
        returnBookFrom: range.from,
        returnBookTo: range.to,
        returnWindowPainted: true,
        returnFlight:
          current.returnFlight === "booked" || current.returnFlight === "confirmed"
            ? current.returnFlight
            : "needed",
      }));
      return;
    }

    if (active.mode === "extend") {
      const person = peopleById.get(active.personId);
      const stint = person ? stintCovering(person, active.anchor) : null;
      if (!stint || !onExtendStay) return;
      const painted = orderedRange(active.start, active.end);
      const lastInclusive = clampPlaceRange(stint.from, painted.to).to;
      const newOut = addDays(lastInclusive, 1);
      if (!stint.out || newOut > stint.out) onExtendStay(active.personId, stint.from, newOut);
      return;
    }

    if (active.mode !== "place") return;
    const painted = orderedRange(active.start, active.end);
    const finalRange = clampPlaceRange(painted.from, painted.to);
    setPlacePrompt({ personId: active.personId, from: finalRange.from, to: finalRange.to });
  }

  // Finish the drag even if the pointer is released outside the grid.
  useEffect(() => {
    function onUp() {
      if (dragRef.current) commitDrag();
    }
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
    // commitDrag reads dragRef only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setReturnWindow(personId: string, from: string, to: string) {
    onSetBookWindow(personId, (current) => ({
      ...current,
      returnBookFrom: from,
      returnBookTo: to,
      returnWindowPainted: true,
      returnFlight:
        current.returnFlight === "booked" || current.returnFlight === "confirmed"
          ? current.returnFlight
          : "needed",
    }));
  }

  /** Right-click on a stay day paints a return booking window (yellow). */
  function addReturnWindowAt(personId: string, iso: string) {
    const person = peopleById.get(personId);
    if (!person || !siteOnDay(person, iso)) return;
    const stint = stintCovering(person, iso);
    const seasonEnd = scheduleYearLastDay(Number(monthStart.slice(0, 4)));
    const lastInclusive = stint?.out ? addDays(stint.out, -1) : seasonEnd;
    const placeEnd = lastInclusive > seasonEnd ? seasonEnd : lastInclusive;
    // Default window: clicked day through end of stay, capped at 2 weeks for booking.
    const to = placeEnd >= iso ? placeEnd : iso;
    const capped = daysBetween(iso, to) > 13 ? addDays(iso, 13) : to;
    setReturnWindow(personId, iso, capped);
  }

  function startDrag(personId: string, iso: string, button = 0) {
    // Only left button starts place / open / clear / drag-book.
    if (button !== 0) return;
    const person = peopleById.get(personId);
    if (!person) return;
    const ops = opsFor(opsBook, personId);

    if (inBookWindow(iso, ops.returnBookFrom, ops.returnBookTo)) {
      dragRef.current = { personId, anchor: iso, start: iso, end: iso, mode: "clear", moved: false };
      setDraft(null);
      return;
    }

    if (siteOnDay(person, iso)) {
      // Click opens the rotation; drag marks the return-book window (yellow).
      dragRef.current = { personId, anchor: iso, start: iso, end: iso, mode: "open", moved: false };
      setDraft(null);
      return;
    }

    dragRef.current = { personId, anchor: iso, start: iso, end: iso, mode: "place", moved: false };
    setDraft({ personId, start: iso, end: iso, mode: "place" });
  }

  function moveDrag(personId: string, iso: string) {
    const active = dragRef.current;
    if (!active || active.personId !== personId || active.mode === "clear") return;

    // Dragging on a stay: inside stay = return-book window; past OUT = extend stay.
    if (active.mode === "open" || active.mode === "book" || active.mode === "extend") {
      const person = peopleById.get(personId);
      const stint = person ? stintCovering(person, active.anchor) : null;
      if (stint?.out && iso >= stint.out && onExtendStay) {
        let end = addDays(stint.out, -1);
        for (let d = stint.out; d <= iso; d = addDays(d, 1)) {
          if (siteOnDay(person!, d)) break;
          end = d;
        }
        const range = clampPlaceRange(stint.from, end);
        dragRef.current = {
          personId,
          anchor: active.anchor,
          start: stint.from,
          end: range.to,
          mode: "extend",
          moved: true,
        };
        setDraft({ personId, start: stint.from, end: range.to, mode: "extend" });
        autoScrollToward(iso);
        return;
      }

      const range = paintBookRange(personId, active.anchor, iso);
      if (!range) return;
      dragRef.current = {
        personId,
        anchor: active.anchor,
        start: range.from,
        end: range.to,
        mode: "book",
        moved: true,
      };
      setDraft({ personId, start: range.from, end: range.to, mode: "book" });
      autoScrollToward(iso);
      return;
    }

    const person = peopleById.get(personId);
    if (!person) return;
    let range = clampPlaceRange(active.anchor, iso);
    // Don't paint through an existing stay — stop before the conflict.
    if (overlapMessage(person, range.from, range.to)) {
      const forward = iso >= active.anchor;
      if (forward) {
        let end = active.anchor;
        for (let d = active.anchor; d <= range.to; d = addDays(d, 1)) {
          if (siteOnDay(person, d)) break;
          end = d;
        }
        range = { from: active.anchor, to: end };
      } else {
        let start = active.anchor;
        for (let d = active.anchor; d >= range.from; d = addDays(d, -1)) {
          if (siteOnDay(person, d)) break;
          start = d;
        }
        range = { from: start, to: active.anchor };
      }
    }
    dragRef.current = { ...active, start: range.from, end: range.to, moved: true };
    setDraft({ personId, start: range.from, end: range.to, mode: "place" });
    autoScrollToward(iso);
  }

  const placePerson = placePrompt ? peopleById.get(placePrompt.personId) : null;
  const draftDays =
    draft && (draft.mode === "place" || draft.mode === "book" || draft.mode === "extend")
      ? daysBetween(orderedRange(draft.start, draft.end).from, orderedRange(draft.start, draft.end).to) + 1
      : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {hiddenPeople?.length && onShowPerson && onShowAllHidden ? (
        <div className="border-b border-border px-4 py-2">
          <CrewScheduleHiddenBar
            hidden={hiddenPeople}
            onShow={onShowPerson}
            onShowAll={onShowAllHidden}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag empty days to place · drag past OUT to extend · click a stay to open · right-click a stay to add return window
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
            {siteList.map((site) => (
              <span
                key={site.code}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 font-medium text-muted-foreground"
              >
                <span className={cn("size-2 rounded-sm", siteColour(site).swatch)} aria-hidden />
                {site.code}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-950">
              <span className="size-2 rounded-sm bg-[#FFD600]" aria-hidden />
              Return
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-medium text-sky-950">
              <span className="size-2 rounded-sm border border-dashed border-primary bg-primary/25" aria-hidden />
              Place
            </span>
          </div>
          {draftDays != null ? (
            <div
              className={cn(
                "mt-3 max-w-md rounded-xl border px-3 py-2.5",
                draft?.mode === "book"
                  ? "border-amber-300 bg-amber-50"
                  : draft?.mode === "extend"
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-sky-300 bg-sky-50",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {draft?.mode === "book"
                    ? "Return window"
                    : draft?.mode === "extend"
                      ? "Extend stay"
                      : "New rotation"}
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {draft?.mode === "book"
                    ? `${draftDays} day${draftDays === 1 ? "" : "s"}`
                    : draftDays > STANDARD_ROTATION_DAYS
                      ? `${draftDays} days · past 6 weeks`
                      : `${draftDays} / ${STANDARD_ROTATION_DAYS} days`}
                </p>
              </div>
              {(draft?.mode === "place" || draft?.mode === "extend") && draftDays <= STANDARD_ROTATION_DAYS ? (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-200/80">
                  <div
                    className="h-full rounded-full bg-sky-600 transition-[width]"
                    style={{ width: `${Math.min(100, (draftDays / STANDARD_ROTATION_DAYS) * 100)}%` }}
                  />
                </div>
              ) : null}
              {draft?.mode === "book" ? (
                <p className="mt-1.5 text-xs text-amber-950">Release to save this yellow return window</p>
              ) : draft?.mode === "extend" && draftDays > STANDARD_ROTATION_DAYS ? (
                <p className="mt-1.5 text-xs font-medium text-emerald-900">
                  Extending past 6 weeks · release to save (max {MAX_ROTATION_DAYS} days)
                </p>
              ) : draft?.mode === "extend" ? (
                <p className="mt-1.5 text-xs text-emerald-900">Release to push OUT later</p>
              ) : draftDays > STANDARD_ROTATION_DAYS ? (
                <p className="mt-1.5 text-xs font-medium text-amber-950">
                  Extending past 6 weeks · keep dragging if needed (max {MAX_ROTATION_DAYS})
                </p>
              ) : draftDays === STANDARD_ROTATION_DAYS ? (
                <p className="mt-1.5 text-xs text-sky-900">
                  Full 6 weeks · keep dragging to extend past 6 weeks
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-sky-900">Keep dragging · standard max is 6 weeks</p>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrev} className="rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted">
            Prev
          </button>
          {onThisMonth ? (
            <button type="button" onClick={onThisMonth} className="rounded-lg px-3 py-1.5 text-sm text-primary hover:underline">
              November
            </button>
          ) : null}
          <button type="button" onClick={onNext} className="rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted">
            Next
          </button>
          <button
            type="button"
            onClick={() => {
              const main = mainScrollRef.current;
              if (!main) return;
              const idx = days.findIndex((iso) => iso >= nextMonthStart);
              if (idx < 0) {
                main.scrollTo({ left: main.scrollWidth, behavior: "smooth" });
                return;
              }
              main.scrollTo({ left: 11 * 16 + idx * 2.25 * 16, behavior: "smooth" });
            }}
            className="rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            Next month →
          </button>
        </div>
      </div>

      {/* Date bar stays fixed while crew rows scroll vertically; horizontal scroll stays in sync. */}
      <div
        ref={topScrollRef}
        className="relative z-20 shrink-0 overflow-x-auto overflow-y-hidden border-b border-border bg-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={() => syncScroll("top")}
      >
        <div className="flex h-3 items-stretch bg-muted/30" style={{ width: trackWidth }}>
          <div className="w-[11rem] shrink-0" />
          <div className="flex flex-1">
            <div
              className="border-r border-border/60"
              style={{ flex: Math.max(1, days.filter((iso) => iso < nextMonthStart).length) }}
              title="This month"
            />
            <div
              className="bg-primary/10"
              style={{ flex: Math.max(1, days.filter((iso) => iso >= nextMonthStart).length) }}
              title="Following days"
            />
          </div>
        </div>
        {dateHeader}
      </div>

      <div
        ref={mainScrollRef}
        className="max-h-[min(70vh,40rem)] overflow-auto"
        onScroll={() => syncScroll("main")}
        onPointerUp={commitDrag}
        onPointerCancel={commitDrag}
      >
        <div className="min-w-max">
          {groups.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">No crew match these filters.</p>
          ) : (
            groups.map((group, groupIndex) => (
              <div key={group.role}>
                <CrewRoleHeader role={group.role} count={group.people.length} spaced={groupIndex > 0} />
                {group.people.map((person) => {
                  const ops = opsFor(opsBook, person.id);
                  const draftRange =
                    draft?.personId === person.id ? orderedRange(draft.start, draft.end) : null;
                  const draftMode = draft?.personId === person.id ? draft.mode : null;
                  return (
                    <div
                      key={person.id}
                      className="grid w-full border-b border-border"
                      style={{ gridTemplateColumns: columns }}
                    >
                      <div className="sticky left-0 z-10 flex min-w-0 items-center gap-0.5 overflow-hidden bg-card py-1 pr-1 pl-4 shadow-[2px_0_0_0_var(--border)]">
                        <button
                          type="button"
                          onClick={() => onOpen(person.id)}
                          className="min-w-0 flex-1 px-2 py-1 text-left hover:bg-muted/40"
                        >
                          <span className="block truncate text-sm font-medium">{person.name}</span>
                          {(person.roles?.length ?? 0) > 1 ? (
                            <span className="block truncate text-[12px] text-muted-foreground">{roleLabel(person)}</span>
                          ) : null}
                        </button>
                        {onHidePerson ? (
                          <button
                            type="button"
                            title={`Hide ${person.name}`}
                            aria-label={`Hide ${person.name}`}
                            onClick={() => onHidePerson(person.id)}
                            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <EyeOff className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                      {days.map((iso) => {
                        const site = siteOnDay(person, iso);
                        const assignmentRole = roleOnDay(person, iso);
                        const flight = flightOnDay(person, iso);
                        const date = new Date(
                          Number(iso.slice(0, 4)),
                          Number(iso.slice(5, 7)) - 1,
                          Number(iso.slice(8, 10)),
                        );
                        const weekend = date.getDay() === 0 || date.getDay() === 6;
                        const otherMonth = iso >= nextMonthStart;
                        const stintStart = Boolean(site && !siteOnDay(person, addDays(iso, -1)));
                        // Last day of the place = OUT (place end).
                        const stintEnd = Boolean(site && !siteOnDay(person, addDays(iso, 1)));
                        const work = site ? workLabelForAssignment(person, site, iso, iso) : "";
                        const inDraft =
                          Boolean(draftRange && iso >= draftRange.from && iso <= draftRange.to);
                        const returnWindow =
                          inBookWindow(iso, ops.returnBookFrom, ops.returnBookTo) ||
                          (inDraft && draftMode === "book");
                        const placePreview = inDraft && draftMode === "place";
                        const extendPreview = inDraft && draftMode === "extend";
                        const paintPreview = placePreview || extendPreview;

                        return (
                          <div
                            key={`${person.id}-${iso}`}
                            role="button"
                            tabIndex={0}
                            title={
                              flight
                                ? `${flight === "in" ? "Inbound" : "Outbound"} · ${formatMedium(iso)}`
                                : site
                                  ? `${stintEnd ? "OUT · " : ""}${assignmentRole ? `${assignmentRole} · ` : ""}${work ? `${work} · ` : ""}${siteLabel(site)} · ${formatMedium(iso)} · right-click for return window · drag past OUT to extend`
                                  : `Empty · ${formatMedium(iso)} · drag to place`
                            }
                            onPointerDown={(event) => {
                              if (event.button !== 0) return;
                              event.preventDefault();
                              startDrag(person.id, iso, event.button);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              if (!site) return;
                              addReturnWindowAt(person.id, iso);
                            }}
                            onPointerEnter={() => moveDrag(person.id, iso)}
                            className={cn(
                              "relative flex h-11 min-w-0 cursor-cell select-none items-center justify-center overflow-hidden border-l border-border text-[10px] font-bold",
                              !site && !flight && !returnWindow && !paintPreview && weekend && "bg-muted/40",
                              !site && !flight && !returnWindow && !paintPreview && otherMonth && "bg-sky-50/50",
                              site && !flight && !returnWindow && !paintPreview && siteTone(site, siteList),
                              flight === "in" && !returnWindow && !paintPreview && "bg-teal-600 text-white",
                              flight === "out" && !returnWindow && !paintPreview && "bg-indigo-600 text-white",
                              returnWindow && "bg-[#FFD600] text-stone-900",
                              placePreview && "bg-sky-500/45 text-sky-950 ring-1 ring-inset ring-sky-600/40",
                              extendPreview && "bg-emerald-500/40 text-emerald-950 ring-1 ring-inset ring-emerald-600/40",
                            )}
                          >
                            <span className="relative z-[1] block max-w-full truncate px-0.5">
                              {paintPreview
                                ? (() => {
                                    const dayNum = daysBetween(draftRange!.from, iso) + 1;
                                    const last = iso === draftRange!.to;
                                    if (dayNum === 1 && last) return "OUT";
                                    if (dayNum === 1) return "IN";
                                    if (last) return "OUT";
                                    return dayNum % 7 === 0 ? String(dayNum) : "";
                                  })()
                                : // OUT always wins on the last day of the stay, even over yellow return window.
                                  flight === "out" || stintEnd
                                  ? "OUT"
                                  : returnWindow && inDraft && draftMode === "book"
                                    ? iso === draftRange!.from
                                      ? "BK"
                                      : iso === draftRange!.to
                                        ? String(draftDays ?? "")
                                        : ""
                                    : returnWindow
                                      ? ""
                                      : flight === "in"
                                        ? "IN"
                                        : stintStart && assignmentRole
                                          ? assignmentRole.slice(0, 5)
                                          : stintStart && work
                                            ? work.split(" · ")[0]?.slice(0, 5)
                                            : stintStart && site
                                              ? site.slice(0, 3)
                                              : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {placePrompt && placePerson ? (
        <CrewPlaceDialog
          personName={placePerson.name}
          defaultSite={placePerson.homeSites[0] || siteList[0]?.code || "IQA"}
          defaultRole={placePerson.role}
          from={placePrompt.from}
          to={placePrompt.to}
          sites={siteList}
          overlapError={overlapMessage(placePerson, placePrompt.from, placePrompt.to)}
          onCancel={() => setPlacePrompt(null)}
          onSave={(input) => {
            onAddRotation(placePrompt.personId, input);
            setPlacePrompt(null);
          }}
        />
      ) : null}
    </section>
  );
}

export function monthStartFromIso(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function shiftMonth(monthStart: string, delta: number) {
  const [y, m] = monthStart.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1 + delta, 1);
  return toISODate(date).slice(0, 7) + "-01";
}
