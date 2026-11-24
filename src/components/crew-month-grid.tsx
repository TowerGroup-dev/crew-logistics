"use client";

import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import type { CalendarInteractionMode } from "@/lib/crew-schedule-view";
import {
  CREW_CATEGORY_ORDER,
  CREW_ROLE_ORDER,
  crewCategoryFor,
  crewCategoryLabel,
  isCampSite,
  isOffRotation,
  normalizeRole,
  roleLabel,
  roleSectionTitle,
  scheduleYearLastDay,
  scheduleYearOutExclusive,
  siteLabel,
  statusOnDate,
  workLabelForAssignment,
  type CrewCategory,
  type CrewPerson,
} from "@/lib/crew-schedule";
import { CrewRoleHeader } from "@/components/crew-role-header";
import { type PlaceRotationInput } from "@/components/crew-place-dialog";
import { emptyCrewOps, opsFor, type CrewOpsBook, type CrewPersonOps } from "@/lib/crew-ops";
import {
  MAX_ROTATION_DAYS,
  MAX_STAY_NOTE_CHARS,
  STANDARD_ROTATION_DAYS,
  dateNotesFor,
  dateNotesOn,
  findRotationPlanAt,
  getStayNote,
  type CrewRosterBook,
  type DateNote,
  type RosterRotationPlan,
} from "@/lib/crew-roster";
import {
  DEFAULT_SITES,
  normalizeCampCode,
  siteColour,
  sortSitesForDisplay,
  worksiteFromMark,
  type CrewSite,
} from "@/lib/crew-sites";
import {
  DEFAULT_TRAVEL_HUBS,
  formatJourneyNames,
  formatJourneyPath,
  hubFromMark,
  transitCellMark,
  travelHubLabel,
  travelHubName,
  type CrewTravelHubsBook,
  type TravelHub,
} from "@/lib/crew-travel-hubs";
import { returnWindowFromStayDay } from "@/lib/crew-month-gestures";
import { flightPlaceOnDay } from "@/lib/crew-routes";
import type { FlightBook } from "@/lib/crew-flights";
import {
  captionFromSheetRoute,
  journeyDayCaption,
  segmentsForPersonDay,
} from "@/lib/crew-journey-legs";
import { stayNoteBarLayout } from "@/lib/crew-stay-notes";
import {
  CrewJourneyPlanner,
  type JourneyPlannerApply,
} from "@/components/crew-journey-planner";
import { journeyDateSpan } from "@/lib/crew-journey-plan";
import { bookingCoveringDay } from "@/lib/crew-flights";
import {
  stopoverDatesFor,
  stopoverOnDay,
  travelPlanForStay,
  type CrewStopoverBook,
} from "@/lib/crew-stopovers";
import { addDays, daysBetween, formatDate, formatMedium, formatWeekdayNarrow, toISODate } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { roleOnDay, siteOnDay, travelSegmentOnDay } from "@/lib/crew-site-days";
import { CrewUndoButton } from "@/components/crew-undo-provider";
import { useIsPhone } from "@/lib/use-phone";

type StaySelection = {
  personId: string;
  /** App plan id when the stay was painted in-app; empty for sheet-imported stays. */
  planId: string;
  from: string;
  out: string;
  note: string;
};

/** Legend paint brush, click a camp site on top, then drag In→Out on the grid. */
type PaintBrush =
  | { kind: "site"; code: string }
  | { kind: "travel" }
  | { kind: "return" };

type CellMenu = {
  personId: string;
  iso: string;
  x: number;
  y: number;
  hasSite: boolean;
  plan: RosterRotationPlan | null;
  noteOpen: boolean;
};

/** Excel-style Hide / Unhide for people rows (right-click name or role). */
type RowMenu =
  | {
      kind: "person";
      personId: string;
      personName: string;
      sectionRole: string;
      x: number;
      y: number;
    }
  | {
      kind: "role";
      role: string;
      x: number;
      y: number;
      canHide: boolean;
      canUnhide: boolean;
      personIds: string[];
      hiddenPeople: { id: string; name: string }[];
    };

/** Map any sheet/app site mark onto the four camp colours (IQA / POND / ALRT / KUG). */
function siteTone(site: string, sites: CrewSite[]) {
  const camp =
    normalizeCampCode(site) ||
    worksiteFromMark(site) ||
    (["IQA", "POND", "ALRT", "KUG"] as const).find(
      (code) => site.toUpperCase() === code || site.toUpperCase().includes(code),
    );
  const code = camp && ["IQA", "POND", "ALRT", "KUG"].includes(camp) ? camp : null;
  if (code) {
    const hit = sites.find((row) => row.code === code) || DEFAULT_SITES.find((row) => row.code === code);
    if (hit) return siteColour(hit).solid;
  }
  const key = site.toUpperCase();
  const hit = sites.find((row) => key === row.code || key.includes(row.code));
  if (hit) return siteColour(hit).solid;
  const fallback = sites.find((row) => row.camp) || DEFAULT_SITES[0];
  if (fallback && (isCampSite(site) || !hit)) return siteColour(fallback).solid;
  return siteColour(site).solid;
}

/** Yellow return paint stays until leave tickets are confirmed, then back to site colour. */
function showReturnWindow(ops: CrewPersonOps, iso: string) {
  if (ops.returnFlight === "confirmed") return false;
  return inBookWindow(iso, ops.returnBookFrom, ops.returnBookTo);
}

function flightOnDay(
  person: CrewPerson,
  iso: string,
  flightBook?: FlightBook,
): "in" | "out" | null {
  for (const flight of person.flights || []) {
    if (flight.arriveIqa === iso) return "in";
    if (flight.departIqa === iso) return "out";
  }
  if (!flightBook) return null;
  for (const booking of flightBook.bookings) {
    if (booking.personId !== person.id || booking.status === "cancelled") continue;
    for (const segment of booking.segments) {
      if (booking.direction === "outbound" && segment.arriveDate === iso) return "in";
      if (booking.direction === "return" && segment.departDate === iso) return "out";
      if (booking.direction === "outbound" && segment.departDate === iso) return "in";
      if (booking.direction === "return" && segment.arriveDate === iso) return "out";
    }
  }
  return null;
}

/** Travel hub on a day from painted cells, sheet marks, or flight segments. */
function hubOnDay(
  person: CrewPerson,
  iso: string,
  stopoverBook?: CrewStopoverBook,
  flightBook?: FlightBook,
  hubs: TravelHub[] = DEFAULT_TRAVEL_HUBS,
) {
  const painted = stopoverOnDay(stopoverBook || {}, person.id, iso);
  if (painted) return painted;
  // Travel legs typed on the sheet inside a stay (YK, YOW, …). Skip generic TRV / prose.
  const sheetLeg = travelSegmentOnDay(person, iso);
  if (sheetLeg?.label) {
    const hub = hubFromMark(sheetLeg.label, hubs);
    if (hub) return hub;
    const code = sheetLeg.label.replace(/^via\s+/i, "").trim().toUpperCase();
    if (/^[A-Z0-9]{2,8}$/.test(code) && code !== "TRV" && code !== "TRAVEL") return code;
  }
  for (const event of person.events || []) {
    if (event.date === iso) {
      const hub = hubFromMark(event.mark, hubs);
      if (hub) return hub;
    }
  }
  if (!flightBook) return null;
  // Booked trip: every day from first take-off to final landing, including nights at a stopover.
  for (const booking of flightBook.bookings) {
    if (booking.personId !== person.id || booking.status === "cancelled") continue;
    const place = flightPlaceOnDay(booking.segments, iso);
    if (place) return hubFromMark(place, hubs) || place.toUpperCase();
  }
  return null;
}

/** Airport / hub codes for a booking direction. */
function journeyCodesForPerson(
  flightBook: FlightBook | undefined,
  personId: string,
  direction?: "outbound" | "return",
) {
  if (!flightBook) return [] as string[];
  const booking = flightBook.bookings.find(
    (row) =>
      row.personId === personId &&
      row.status !== "cancelled" &&
      (!direction || row.direction === direction),
  );
  if (!booking?.segments.length) return [];
  const airports: string[] = [];
  for (const segment of booking.segments) {
    if (segment.fromAirport) airports.push(segment.fromAirport);
    if (segment.toAirport) airports.push(segment.toAirport);
  }
  return airports;
}

function journeyForPerson(flightBook: FlightBook | undefined, personId: string, direction?: "outbound" | "return") {
  return formatJourneyPath(journeyCodesForPerson(flightBook, personId, direction));
}

/**
 * Quiet booking path under the name (airport codes only).
 * Place names live on the transit day boxes, not here.
 */
function dynamicJourneyLine(
  person: CrewPerson,
  _stopoverBook: CrewStopoverBook | undefined,
  flightBook: FlightBook | undefined,
  _year: number,
) {
  // Place names live on the day boxes. Only show a booked flight path under the name.
  return journeyForPerson(flightBook, person.id, "outbound");
}

/** Hover / tooltip: turn a code path into place names with arrows. */
/** Short code in a travel box (YK, YEG, IQA ...); the full route is on hover. */
function travelBoxCode(hub: string) {
  const code = hub.replace(/^via\s+/i, "").trim().toUpperCase();
  if (code === "KU") return "KUG";
  if (code === "IQ") return "IQA";
  if (code === "PD" || code === "PND") return "POND";
  return code.length > 5 ? code.slice(0, 5) : code;
}

function journeyDisplayNames(path: string, hubs: TravelHub[]) {
  if (!path || path === "No travel yet, right-click to add") return path;
  const codes = path
    .split(/\s*→\s*/)
    .map((part) => part.replace(/^[→\s]+|[→\s]+$/g, "").trim())
    .filter(Boolean);
  if (!codes.length) return path;
  return formatJourneyNames(codes, hubs);
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

type DragMode = "place" | "clear" | "open" | "extend" | "moveIn" | "return";

function stintCovering(person: CrewPerson, iso: string) {
  const seasonExclusive = scheduleYearOutExclusive(Number(iso.slice(0, 4)));
  for (const stint of person.stints || []) {
    const out = stint.out && stint.out < seasonExclusive ? stint.out : seasonExclusive;
    if (stint.from <= iso && iso < out) return stint;
  }
  return null;
}

function placementHasBookedFlights(ops: CrewPersonOps) {
  return (
    ops.outboundFlight === "booked" ||
    ops.outboundFlight === "confirmed" ||
    ops.returnFlight === "booked" ||
    ops.returnFlight === "confirmed"
  );
}

type MonthRowActions = {
  click: (personId: string, iso: string) => void;
  pointerDown: (event: React.PointerEvent, personId: string, iso: string, hasSite: boolean) => void;
  contextMenu: (event: React.MouseEvent, personId: string, iso: string) => void;
  pointerEnter: (event: React.PointerEvent, personId: string, iso: string, hasMark: boolean, plan: string) => void;
  pointerMove: (event: React.PointerEvent, personId: string, iso: string, hasMark: boolean) => void;
  pointerLeave: (personId: string, iso: string) => void;
};

type DayMeta = {
  iso: string;
  d: number;
  monthIndex: number;
  weekend: boolean;
  monthStartDay: boolean;
  isToday: boolean;
  weekday: string;
};

/**
 * One person's row of day boxes for the whole year. Memoised: it only redraws when
 * this person's data or the drag on this row changes.
 * Scrolling, hovering and edits to other people never touch it.
 */
const MonthRow = memo(function MonthRow({
  person,
  opsEntry,
  draft,
  stopoverBook,
  flightBook,
  roster,
  travelHubs,
  siteList,
  paintBrush,
  canEdit,
  year,
  dayMeta,
  gridColumns,
  daysTrackWidth,
  dayColRem,
  actions,
}: {
  person: CrewPerson;
  opsEntry: CrewPersonOps | undefined;
  draft: { personId: string; start: string; end: string; mode: DragMode; stayFrom?: string } | null;
  stopoverBook: CrewStopoverBook | undefined;
  flightBook: FlightBook | undefined;
  roster: CrewRosterBook | undefined;
  travelHubs: TravelHub[];
  siteList: CrewSite[];
  paintBrush: PaintBrush;
  canEdit: boolean;
  year: number;
  dayMeta: DayMeta[];
  gridColumns: string;
  daysTrackWidth: string;
  dayColRem: number;
  actions: MonthRowActions;
}) {
  const siteAt = dayMeta.map((day) => siteOnDay(person, day.iso));
  const hubAt = dayMeta.map((day) => hubOnDay(person, day.iso, stopoverBook, flightBook, travelHubs));
  const ops = opsEntry ?? emptyCrewOps(person.id);
  const draftRange =
    draft?.personId === person.id ? orderedRange(draft.start, draft.end) : null;
  const draftMode = draft?.personId === person.id ? draft.mode : null;
  const journeyLine = dynamicJourneyLine(person, stopoverBook, flightBook, year);
  // Stay notes are written once across the whole stay (not squeezed into one box).
  const yearStart = dayMeta[0]?.iso || `${year}-01-01`;
  const stayNotes = (person.stints || []).flatMap((stint) => {
    const out = stint.out || scheduleYearOutExclusive(year);
    const plan = roster ? findRotationPlanAt(roster, person.id, stint.from) : null;
    const note =
      getStayNote(roster, person.id, stint.from, out) ||
      (plan && plan.from === stint.from ? plan.note || "" : "");
    const bar = stayNoteBarLayout({
      yearStart,
      dayCount: dayMeta.length,
      stayFrom: stint.from,
      stayOutExclusive: out,
      note: note || "",
    });
    return bar ? [bar] : [];
  });
  // Notes on dates the coordinator picked: a thin amber line over those days, text at its start.
  const dateNoteBars = dateNotesFor(roster, person.id).flatMap((row) => {
    const start = Math.max(0, daysBetween(yearStart, row.from));
    const end = Math.min(dayMeta.length, daysBetween(yearStart, row.to) + 1);
    return end > start ? [{ ...row, start, span: end - start }] : [];
  });
  return (
    <div
      className="crew-day-row relative grid h-11 border-b border-border"
      style={{
        gridTemplateColumns: gridColumns,
        width: daysTrackWidth,
        minWidth: daysTrackWidth,
        // Rows scrolled out of view are skipped by the browser until they come back.
        contentVisibility: "auto",
        containIntrinsicSize: `${daysTrackWidth} 2.75rem`,
      }}
    >
                            {dayMeta.map((day, dayIndex) => {
        const iso = day.iso;
        const site = siteAt[dayIndex];
        const hubMark = hubAt[dayIndex];
        const hub = !site ? hubMark : null;
        const travelOnStay = Boolean(site && hubMark);
        const prevIso = addDays(iso, -1);
        const nextIso = addDays(iso, 1);
        const prevHubCode =
          !(dayIndex > 0 ? siteAt[dayIndex - 1] : siteOnDay(person, prevIso))
            ? (dayIndex > 0 ? hubAt[dayIndex - 1] : hubOnDay(person, prevIso, stopoverBook, flightBook, travelHubs))
            : null;
        const nextHubCode =
          !(dayIndex < siteAt.length - 1 ? siteAt[dayIndex + 1] : siteOnDay(person, nextIso))
            ? (dayIndex < hubAt.length - 1 ? hubAt[dayIndex + 1] : hubOnDay(person, nextIso, stopoverBook, flightBook, travelHubs))
            : null;
        const prevHub = Boolean(prevHubCode);
        const nextHub = Boolean(nextHubCode);
        const nextSite = Boolean((dayIndex < siteAt.length - 1 ? siteAt[dayIndex + 1] : siteOnDay(person, nextIso)));
        const hubTransition =
          Boolean(hub && prevHubCode && prevHubCode !== hub);
        const assignmentRole = roleOnDay(person, iso);
        const flight = flightOnDay(person, iso, flightBook);
        const journey =
          hub || flight
            ? journeyForPerson(flightBook, person.id, flight === "out" ? "return" : "outbound")
            : "";
        const weekend = day.weekend;
        const monthIndex = day.monthIndex;
        const monthStartDay = day.monthStartDay;
        const dayPlan = site ? (roster ? findRotationPlanAt(roster, person.id, iso) : null) : null;
        const coveringStay = stintCovering(person, iso);
        const covering = site ? coveringStay : null;
        // One IN (first day of stay) and one OUT (last day), never mid-stay doubles.
        // A stay can end on a travel day (e.g. IQA, then YOW on the way home): OUT goes on that last box.
        const stayForOut = covering || (hub ? coveringStay : null);
        const stayLastDay =
          stayForOut?.out && stayForOut.out.length >= 10
            ? addDays(stayForOut.out, -1)
            : null;
        // IN on the first day of a stay, and on a camp arrival partway through one
        // (e.g. KUG → YK → IQA: IN on the first IQA day, then again on reaching Pond).
        const stintStart = Boolean(
          covering &&
            (iso === covering.from ||
              // First box on screen (e.g. 1 Jan): look at the real day before, so a stay
              // that carries over from last year is not shown as a fresh IN.
              (site && (dayIndex > 0 ? siteAt[dayIndex - 1] : siteOnDay(person, addDays(iso, -1))) !== site)),
        );
        const stintEnd = Boolean(stayLastDay && iso === stayLastDay);
        // No day counts in the boxes (asked to keep the calendar clean); progress shows in the side panel.
        const dayCount = "";
        const work = site ? workLabelForAssignment(person, site, iso, iso) : "";
        const inDraft =
          Boolean(draftRange && iso >= draftRange.from && iso <= draftRange.to);
        // Yellow only on stay days; white (away) days stay white.
        const returnWindow = Boolean(site) && showReturnWindow(ops, iso);
        const placePreview = inDraft && draftMode === "place";
        const returnPreview = inDraft && draftMode === "return";
        const stayDrag = draftMode === "extend" || draftMode === "moveIn";
        const extendPreview = inDraft && stayDrag;
        // Days this drag takes off the stay: faded until you let go.
        const trimPreview =
          !inDraft && stayDrag && Boolean(site) && Boolean(covering && draft?.stayFrom && covering.from === draft.stayFrom);
        const paintPreview = placePreview || extendPreview;
        const stayFrom = covering?.from || dayPlan?.from || "";
        const stayOut = covering?.out || dayPlan?.out || "";
        const stayNote =
          (stayFrom && stayOut
            ? getStayNote(roster, person.id, stayFrom, stayOut)
            : "") ||
          dayPlan?.note ||
          "";
        const stayTravel =
          covering && stopoverBook
            ? travelPlanForStay(
                stopoverBook,
                person.id,
                covering.from,
                covering.out,
                site,
              )
            : "";
        const bookedTravel = journey || journeyForPerson(flightBook, person.id, "return");
        const sheetLeg = travelSegmentOnDay(person, iso);
        const sheetRoute = sheetLeg?.route || "";
        const sheetPiece = (coveringStay?.segments || []).find(
          (piece) => piece.from <= iso && iso < piece.out,
        );
        const daySegments = segmentsForPersonDay(
          flightBook?.bookings || [],
          person.id,
          iso,
          coveringStay?.from || null,
          coveringStay?.out || null,
        );
        const legCaption =
          journeyDayCaption(daySegments, iso, { siteOnIso: site }) ||
          (sheetRoute
            ? captionFromSheetRoute(sheetRoute, iso, {
                siteOnIso: site,
                departDate: sheetPiece?.from,
                arriveDate: sheetPiece ? addDays(sheetPiece.out, -1) : undefined,
              })
            : "") ||
          (hub && !site ? `→ ${travelBoxCode(hub)}` : "");
        const travelDisplay = journeyDisplayNames(
          sheetRoute || bookedTravel || stayTravel || journeyLine || legCaption || "",
          travelHubs,
        );
        const hubJourneyTitle = travelDisplay
          ? `${travelHubName(hub || "", travelHubs)} · ${formatMedium(iso)} · ${travelDisplay}`
          : `${travelHubLabel(hub || "", travelHubs)} · ${formatMedium(iso)}`;

        return (
          <div
            key={`${person.id}-${iso}`}
            role="button"
            data-iso={iso}
            tabIndex={0}
            title={
              flight
                ? `${flight === "in" ? "Inbound" : "Outbound"} · ${formatMedium(iso)}${travelDisplay ? ` · ${travelDisplay}` : journey ? ` · ${journey}` : ""}`
                : hub
                  ? `${stintEnd ? "OUT · " : ""}${hubJourneyTitle}`
                  : site
                    ? `${stintEnd ? "OUT · " : ""}${assignmentRole ? `${assignmentRole} · ` : ""}${work ? `${work} · ` : ""}${siteLabel(site)} · ${formatMedium(iso)}${stayNote ? ` · ${stayNote}` : ""}${legCaption ? ` · ${legCaption}` : travelDisplay ? ` · Travel ${travelDisplay}` : ""}${covering?.unsure ? " · No site code on the Excel for this stay, please confirm" : ""}`
                    : `Empty · ${formatMedium(iso)} · drag ${
                        paintBrush.kind === "site"
                          ? paintBrush.code
                          : paintBrush.kind === "travel"
                            ? "Travel"
                            : "Return on a stay"
                      } · IN → OUT`
            }
            onClick={() => actions.click(person.id, iso)}
            onPointerDown={(event) => actions.pointerDown(event, person.id, iso, Boolean(site))}
            onContextMenu={(event) => actions.contextMenu(event, person.id, iso)}
            onPointerEnter={(event) =>
              actions.pointerEnter(
                event,
                person.id,
                iso,
                Boolean(site || hub),
                travelDisplay || (hub ? travelHubName(hub, travelHubs) : "No travel yet, right-click to add"),
              )
            }
            onPointerMove={(event) => actions.pointerMove(event, person.id, iso, Boolean(site || hub))}
            onPointerLeave={() => actions.pointerLeave(person.id, iso)}
            className={cn(
              "relative flex h-11 min-w-0 items-center justify-center overflow-hidden border-l border-border text-[0.625rem] font-bold outline-none focus:outline-none focus-visible:outline-none",
              // The blue month rule is drawn over this edge; no second thin line under it.
              monthStartDay && "border-l-transparent",
              canEdit ? "cursor-cell select-none touch-none" : "cursor-pointer touch-pan-x touch-pan-y",
              !site &&
                !hub &&
                !flight &&
                !returnWindow &&
                !paintPreview &&
                weekend &&
                "bg-muted/40",
              !site &&
                !hub &&
                !flight &&
                !returnWindow &&
                !paintPreview &&
                !weekend &&
                monthIndex % 2 === 1 &&
                "bg-sky-50/40",
              // Camp stays always use the legend IQA/POND/ALRT/KUG colours.
              site && !returnWindow && !paintPreview && siteTone(site, siteList),
              // Travel / hub / flight legs, one grey (not teal/indigo “off” colours).
              (hub || flight) &&
                !site &&
                !returnWindow &&
                !paintPreview &&
                "bg-stone-500 text-white",
              returnWindow && "bg-[#FFD600] text-stone-900",
              placePreview &&
                paintBrush.kind === "site" &&
                cn(siteTone(paintBrush.code, siteList), "opacity-80 ring-1 ring-inset ring-stone-900/40"),
              placePreview &&
                paintBrush.kind === "travel" &&
                "bg-stone-500/55 text-white ring-1 ring-inset ring-stone-700/50",
              returnPreview && "bg-[#FFD600]/80 text-stone-900 ring-1 ring-inset ring-amber-700/40",
              extendPreview && "bg-primary/25 text-foreground ring-1 ring-inset ring-primary/50",
              trimPreview && "opacity-25",
            )}
          >
            <span
              className={cn(
                "relative z-[1] flex max-w-full flex-col items-center justify-center gap-0 px-0.5 text-center leading-[1.05]",
                (hub || legCaption) && !paintPreview && !flight && !returnWindow && !stintEnd
                  ? "text-[8px] font-bold"
                  : "truncate text-[0.625rem] font-bold",
              )}
            >
              <span className={cn(legCaption && !paintPreview && !returnWindow && "truncate")}>
                {paintPreview
                  ? (() => {
                      const dayNum = daysBetween(draftRange!.from, iso) + 1;
                      const last = iso === draftRange!.to;
                      if (dayNum === 1) return "IN";
                      if (last) return `OUT ${dayNum}`;
                      return dayNum % 7 === 0 ? String(dayNum) : "";
                    })()
                  : stintStart
                    ? covering?.unsure && iso === covering.from
                      ? "IN?"
                      : "IN"
                    : stintEnd
                      ? "OUT"
                      : dayCount
                        ? dayCount
                        : hub && !site && !legCaption
                          ? travelBoxCode(hub)
                          : ""}
              </span>
              {legCaption && !paintPreview && !returnWindow ? (
                <span className="max-w-full truncate text-[7px] font-bold tracking-tight" title={legCaption}>
                  {legCaption}
                </span>
              ) : travelOnStay && hubMark ? (
                <span className="max-w-full truncate text-[7px] font-bold tracking-tight" title={travelHubLabel(hubMark, travelHubs)}>
                  {travelBoxCode(hubMark).slice(0, 4)}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
      {stayNotes.map((row) => (
        <div
          key={row.key}
          className="pointer-events-none absolute inset-x-0 inset-y-0 z-[3] flex items-center"
          style={{ left: `${row.start * dayColRem}rem`, width: `${row.span * dayColRem}rem` }}
        >
          {/* Full-stay banner so the note reads across the coloured boxes, not one day. */}
          <span
            title={row.note}
            className="mx-0.5 flex h-[1.15rem] w-[calc(100%-0.25rem)] items-center overflow-hidden rounded bg-white/90 px-1.5 text-[10px] font-semibold leading-tight text-stone-900 shadow-sm"
          >
            <span className="block w-full truncate">{row.note}</span>
          </span>
        </div>
      ))}
      {dateNoteBars.map((row) => (
        <div
          key={row.id}
          className="pointer-events-none absolute top-0 z-[4] h-full"
          style={{ left: `${row.start * dayColRem}rem`, width: `${row.span * dayColRem}rem` }}
        >
          <div className="absolute inset-x-0.5 top-0 h-[3px] rounded-b bg-stone-900/80" />
          <span
            title={`${row.note} · ${formatMedium(row.from)}${row.to !== row.from ? ` to ${formatMedium(row.to)}` : ""}`}
            className="sticky left-1 top-[3px] mt-[3px] inline-block max-w-[calc(100%-0.25rem)] truncate rounded border border-stone-300 bg-white px-1 text-[9px] font-semibold leading-[13px] text-stone-900 shadow-sm"
          >
            {row.note}
          </span>
        </div>
      ))}
    </div>
  );
});

export const CrewMonthGrid = memo(function CrewMonthGrid({
  year,
  today,
  scrollToIso,
  rows,
  opsBook,
  flightBook,
  stopoverBook,
  roster,
  sites = DEFAULT_SITES,
  travelHubs = DEFAULT_TRAVEL_HUBS,
  onTravelHubsChange,
  onOpen,
  onOpenDay,
  onSetBookWindow,
  onToggleStopover,
  onPaintStopovers,
  onApplyJourney,
  onDeleteJourney,
  onAddRotation,
  onExtendStay,
  onMoveStayIn,
  onMoveSite,
  moveOnDay,
  onBookMove,
  onRemoveRotation,
  onClearStayBooking,
  onSetRotationNote,
  onSetStayNote,
  onSetDateNote,
  onHidePerson,
  hiddenPeople,
  onShowPerson,
  onShowAllHidden,
  interactionMode = "view",
  active = true,
  onInteractionModeChange,
  onTryPerson,
  onCommitProvisional,
  onDiscardProvisional,
  onAddUnderRole,
}: {
  /** Selected schedule year, grid scrolls freely Jan 1 → Dec 31. */
  year: number;
  today: string;
  /** Optional day/month to land on when opening Month (e.g. from Year tape). */
  scrollToIso?: string | null;
  /** False while another tab is showing, skip viewport work until Month is visible again. */
  active?: boolean;
  /** displayRole = calendar section this row sits under (may differ from home role). */
  rows: { person: CrewPerson; displayRole?: string }[];
  opsBook: CrewOpsBook;
  flightBook?: FlightBook;
  stopoverBook?: CrewStopoverBook;
  /** Live roster so NAV-07/08 can resolve app-painted plans. */
  roster?: CrewRosterBook;
  sites?: CrewSite[];
  /** Editable travel places (short codes), Settings + right-click Add travel. */
  travelHubs?: TravelHub[];
  onTravelHubsChange?: (book: CrewTravelHubsBook) => void;
  onOpen: (personId: string) => void;
  /** Open the rotation covering this day (click, not drag). */
  onOpenDay?: (personId: string, iso: string) => void;
  onSetBookWindow: (
    personId: string,
    recipe: (current: CrewPersonOps) => CrewPersonOps,
  ) => void;
  /** Paint / clear a travel stopover hub on a day (short code). */
  onToggleStopover?: (personId: string, iso: string, hub: string) => void;
  /** Paint a travel hub across several days (legend Travel brush). */
  onPaintStopovers?: (personId: string, dates: string[], hub: string) => void;
  /** Travel editor: write legs + grey days onto the calendar. */
  onApplyJourney?: (personId: string, plan: JourneyPlannerApply) => void;
  /** Delete a saved journey (grey + flight record); camps stay. */
  onDeleteJourney?: (personId: string, bookingId: string) => void;
  /** Returns the new plan id when known (so Delete can target it immediately). */
  onAddRotation: (personId: string, input: PlaceRotationInput) => string | void;
  /** Extend or shorten a stay's exclusive OUT (sheet + app). */
  onExtendStay?: (personId: string, stintFrom: string, newOut: string) => void;
  /** Drag the first box of a stay: start it earlier or later. */
  onMoveStayIn?: (personId: string, stintFrom: string, newFrom: string) => void;
  /** Move to another site from this day, during the stay (null = undo the move starting that day). */
  onMoveSite?: (personId: string, iso: string, toSite: string | null) => void;
  /** The move that starts on this day, if any. */
  moveOnDay?: (personId: string, iso: string) => { fromSite: string; toSite: string } | null;
  /** Open the stay on Travel → Site transfers to book the travel. */
  onBookMove?: (personId: string, iso: string) => void;
  /** Delete an app-painted placement (NAV-07). */
  onRemoveRotation?: (personId: string, planId: string) => void;
  /** One-shot clear: flights + hotels + stopovers for this stay. */
  onClearStayBooking?: (personId: string, stayFrom: string, stayOutExclusive: string | null) => void;
  /** Update stay note on an app plan (NAV-08). */
  onSetRotationNote?: (personId: string, planId: string, note: string) => void;
  /** Update stay note on sheet or app stays by date range (NAV-08). */
  onSetStayNote?: (personId: string, from: string, out: string, note: string) => void;
  /** Note on dates you pick (add when no id, change when id). Empty text removes it. */
  onSetDateNote?: (input: { id?: string; personId: string; from: string; to: string; note: string }) => void;
  /** Hide this person under the given section role (defaults to home role). */
  onHidePerson?: (personId: string, sectionRole?: string) => void;
  hiddenPeople?: { id: string; name: string; role?: string }[];
  onShowPerson?: (personId: string, sectionRole?: string) => void;
  onShowAllHidden?: () => void;
  /** view = browse/scroll only; edit = drag-place gestures. */
  interactionMode?: CalendarInteractionMode;
  onInteractionModeChange?: (mode: CalendarInteractionMode) => void;
  /** What-if hire: name + role → provisional row on the calendar. */
  onTryPerson?: (input: { name: string; role: string }) => string | void;
  onCommitProvisional?: (personId: string, name?: string) => void;
  onDiscardProvisional?: (personId: string) => void;
  /** Plus on role header, add someone under this section. */
  onAddUnderRole?: (sectionRole: string) => void;
}) {
  const canEdit = interactionMode === "edit";
  // Legend stays the four camps, sheet off-colours still map onto these.
  const siteList = useMemo(
    () =>
      sortSitesForDisplay(
        (sites.length ? sites : DEFAULT_SITES).filter((row) =>
          DEFAULT_SITES.some((camp) => camp.code === row.code),
        ),
      ),
    [sites],
  );
  const [tryOpen, setTryOpen] = useState(false);
  const [tryDraft, setTryDraft] = useState({ name: "", role: "Labourer" });
  const peopleById = useMemo(() => new Map(rows.map((row) => [row.person.id, row.person])), [rows]);
  const displayRoleByPersonId = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.person.id, normalizeRole(row.displayRole || row.person.role));
    }
    return map;
  }, [rows]);
  const hiddenIdSet = useMemo(
    () => new Set((hiddenPeople || []).map((row) => row.id)),
    [hiddenPeople],
  );
  const dragRef = useRef<{
    personId: string;
    /** Fixed day the drag started on, never moves during place. */
    anchor: string;
    start: string;
    end: string;
    mode: DragMode;
    moved: boolean;
    stayFrom?: string;
  } | null>(null);
  const [draft, setDraft] = useState<{
    personId: string;
    start: string;
    end: string;
    mode: DragMode;
    stayFrom?: string;
  } | null>(null);
  const [staySelection, setStaySelection] = useState<StaySelection | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [dateNoteDraft, setDateNoteDraft] = useState<DateNoteDraft | null>(null);
  const [cellMenu, setCellMenu] = useState<CellMenu | null>(null);

  function closeCellMenu() {
    setCellMenu(null);
    setStaySelection(null);
  }

  // Leaving Edit cancels an in-progress drag so View stays scroll-only.
  useEffect(() => {
    if (canEdit) return;
    dragRef.current = null;
    setDraft(null);
    closeCellMenu();
  }, [canEdit]);
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);
  const [roleHiddenOpen, setRoleHiddenOpen] = useState<string | null>(null);
  const [journeyPlanner, setJourneyPlanner] = useState<{
    personId: string;
    personName: string;
    iso: string;
    endIso: string;
    site: string | null;
    bookingId?: string;
    from?: string;
    to?: string;
    stops?: string[];
    direction?: "outbound" | "return";
    overnight?: boolean;
    overnightHub?: string;
    notes?: string;
  } | null>(null);
  /** Legend chip → drag empty days. Sheet rule: every IN has an OUT (first / last day). */
  const [paintBrush, setPaintBrush] = useState<PaintBrush>(() => ({
    kind: "site",
    code: (sites.length ? sites : DEFAULT_SITES)[0]?.code || "IQA",
  }));
  const [flash, setFlash] = useState<string | null>(null);
  const paintBrushRef = useRef<PaintBrush>(paintBrush);
  paintBrushRef.current = paintBrush;

  function defaultSiteBrush(): PaintBrush {
    return { kind: "site", code: siteList[0]?.code || "IQA" };
  }

  /** Place a stay immediately, no dialog. Inclusive last day is OUT (sheet rule). */
  function placeStayNow(personId: string, from: string, inclusiveTo: string, siteCode: string) {
    const person = peopleById.get(personId);
    if (!person) return;
    const overlap = overlapMessage(person, from, inclusiveTo);
    if (overlap) {
      showFlash(overlap);
      return;
    }
    const cappedTo =
      daysBetween(from, inclusiveTo) + 1 > MAX_ROTATION_DAYS
        ? addDays(from, MAX_ROTATION_DAYS - 1)
        : inclusiveTo;
    // Exclusive out = day after last on-site day (Excel OUT = last day on site).
    const out = addDays(cappedTo, 1);
    if (out <= from) return;
    onAddRotation(personId, {
      site: siteCode,
      from,
      out,
      role: displayRoleByPersonId.get(personId) || person.role,
    });
    setStaySelection(null);
    setNoteDraft("");
    showFlash(`${siteCode}  ${formatMedium(from)} – ${formatMedium(cappedTo)}`);
  }
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Where the pointer is while dragging a stay, for the live day count. */
  const [dragTip, setDragTip] = useState<{ x: number; y: number } | null>(null);
  const [travelHover, setTravelHover] = useState<{
    personId: string;
    iso: string;
    x: number;
    y: number;
    plan: string;
  } | null>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const syncingVertical = useRef(false);
  const lastScrollTop = useRef(0);
  const dayWindowRaf = useRef<number | null>(null);
  function showFlash(message: string) {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(message);
    flashTimer.current = setTimeout(() => setFlash(null), 2000);
  }

  useEffect(() => {
    function onSaved(event: Event) {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail) showFlash(detail);
    }
    window.addEventListener("crew-flash", onSaved as EventListener);
    return () => window.removeEventListener("crew-flash", onSaved as EventListener);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (dayWindowRaf.current != null) cancelAnimationFrame(dayWindowRaf.current);
    };
  }, []);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  /** Height of the day pane's horizontal scrollbar (the names column gets the same space at the bottom). */
  const [hScrollbarPx, setHScrollbarPx] = useState(0);
  useEffect(() => {
    const main = mainScrollRef.current;
    if (!main || typeof ResizeObserver === "undefined") return;
    const measure = () => setHScrollbarPx(Math.max(0, main.offsetHeight - main.clientHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    return () => observer.disconnect();
  }, []);
  const cellMenuRef = useRef<HTMLDivElement>(null);
  // Keep the right-click menu fully on screen: move it up / left when it would run off the edge.
  useLayoutEffect(() => {
    const menu = cellMenuRef.current;
    if (!menu || !cellMenu) return;
    const margin = 8;
    const rect = menu.getBoundingClientRect();
    const top = Math.max(margin, Math.min(cellMenu.y, window.innerHeight - rect.height - margin));
    const left = Math.max(margin, Math.min(cellMenu.x, window.innerWidth - rect.width - margin));
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }, [cellMenu]);
  const didScrollToToday = useRef(false);
  /**
   * Wide day window + hysteresis so horizontal scrubbing stays native-smooth.
   * React only remounts cells when the viewport nears the edge of the mounted range.
   */
  const DAY_WINDOW_BUFFER = 90;
  const DAY_WINDOW_MARGIN = 28;
  // Whole year stays mounted: sliding across months is plain native scrolling, no redraws.
  const [dayWindow, setDayWindow] = useState({ start: 0, end: 400 });
  const dayWindowRef = useRef(dayWindow);
  dayWindowRef.current = dayWindow;

  /** Free-run year strip: every day from January through December. */
  const days = useMemo(() => {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const list: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) list.push(d);
    return list;
  }, [year]);

  /** Fixed rem widths so month bands line up exactly with day columns (1st → last). */
  // Phones: no Type column, a narrow name column and smaller day boxes, so you see a week or more.
  const phone = useIsPhone();
  const typeColRem = phone ? 0 : 4.5;
  const nameColRem = phone ? 7.5 : 13;
  const listColRem = typeColRem + nameColRem;
  const dayColRem = phone ? 2.5 : 2.85;
  const daysTrackWidth = `${days.length * dayColRem}rem`;
  const dayTracks = `repeat(${days.length}, ${dayColRem}rem)`;

  const dayColPx = useMemo(() => {
    if (typeof window === "undefined") return dayColRem * 16;
    const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return dayColRem * root;
  }, [dayColRem]);

  const dayMeta = useMemo(
    () =>
      days.map((iso) => {
        const d = Number(iso.slice(8, 10));
        const monthIndex = Number(iso.slice(5, 7)) - 1;
        const date = new Date(Number(iso.slice(0, 4)), monthIndex, d);
        return {
          iso,
          d,
          monthIndex,
          weekend: date.getDay() === 0 || date.getDay() === 6,
          monthStartDay: d === 1,
          isToday: iso === today,
          weekday: formatWeekdayNarrow(iso),
        };
      }),
    [days, today],
  );

  /** Head count per day: people shown on the calendar who are on site that day. */
  const onSiteCounts = useMemo(() => {
    const counts = new Array<number>(days.length).fill(0);
    const seen = new Set<string>();
    for (const row of rows) {
      const person = row.person;
      if (seen.has(person.id) || hiddenIdSet.has(person.id)) continue;
      seen.add(person.id);
      for (let index = 0; index < days.length; index += 1) {
        if (siteOnDay(person, days[index])) counts[index] += 1;
      }
    }
    return counts;
  }, [days, hiddenIdSet, rows]);

  const visibleDayMeta = useMemo(
    () => dayMeta.slice(dayWindow.start, dayWindow.end),
    [dayMeta, dayWindow.end, dayWindow.start],
  );

  const visibleDayColumns = useMemo(() => {
    const leftPad = dayWindow.start * dayColRem;
    const rightPad = Math.max(0, days.length - dayWindow.end) * dayColRem;
    const parts: string[] = [];
    if (leftPad > 0) parts.push(`${leftPad}rem`);
    parts.push(`repeat(${Math.max(1, visibleDayMeta.length)}, ${dayColRem}rem)`);
    if (rightPad > 0) parts.push(`${rightPad}rem`);
    return parts.join(" ");
  }, [dayColRem, dayWindow.end, dayWindow.start, days.length, visibleDayMeta.length]);

  const monthBands = useMemo(() => {
    const bands: { key: string; label: string; count: number; startIndex: number }[] = [];
    days.forEach((iso, index) => {
      const key = iso.slice(0, 7);
      const last = bands[bands.length - 1];
      if (last?.key === key) {
        last.count += 1;
        return;
      }
      const label = formatDate(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1),
        "en-US",
        { month: "long" },
      );
      bands.push({ key, label, count: 1, startIndex: index });
    });
    return bands;
  }, [days]);

  function refreshDayWindow(force = false) {
    // All days are mounted; nothing to recompute while scrolling.
    if (dayWindow.start === 0 && dayWindow.end >= days.length) return;
    if (dayWindowRaf.current != null) return;
    dayWindowRaf.current = requestAnimationFrame(() => {
      dayWindowRaf.current = null;
      const main = mainScrollRef.current;
      if (!main || days.length === 0) return;
      const col = dayColPx || 1;
      const left = main.scrollLeft;
      const viewStart = Math.max(0, Math.floor(left / col));
      const viewEnd = Math.min(days.length, Math.ceil((left + main.clientWidth) / col));
      const prev = dayWindowRef.current;
      // Stay on the current mounted strip until the viewport nears either edge.
      if (
        !force &&
        viewStart >= prev.start + DAY_WINDOW_MARGIN &&
        viewEnd <= prev.end - DAY_WINDOW_MARGIN
      ) {
        return;
      }
      const start = Math.max(0, viewStart - DAY_WINDOW_BUFFER);
      const end = Math.min(days.length, viewEnd + DAY_WINDOW_BUFFER);
      if (prev.start === start && prev.end === end) return;
      dayWindowRef.current = { start, end };
      // Don't block the scroll thread with cell remounts.
      startTransition(() => setDayWindow({ start, end }));
    });
  }

  /** Names on the left stay locked to the day rows while scrolling vertically. */
  function syncVerticalScroll(from: "left" | "main") {
    const left = leftScrollRef.current;
    const main = mainScrollRef.current;
    if (!left || !main || syncingVertical.current) return;
    syncingVertical.current = true;
    if (from === "main") left.scrollTop = main.scrollTop;
    else main.scrollTop = left.scrollTop;
    syncingVertical.current = false;
  }

  // Virtualized rows can reset scrollLeft on re-layout, pin it back.
  const pinnedScrollLeft = useRef(0);

  function setDaysScrollLeft(left: number) {
    const main = mainScrollRef.current;
    const next = Math.max(0, left);
    pinnedScrollLeft.current = next;
    if (main) main.scrollLeft = next;
    refreshDayWindow(true);
  }

  useLayoutEffect(() => {
    const main = mainScrollRef.current;
    if (!main) return;
    if (Math.abs(main.scrollLeft - pinnedScrollLeft.current) > 1) {
      main.scrollLeft = pinnedScrollLeft.current;
    }
  }, [dayWindow.start, dayWindow.end]);

  /** Latest handlers for the memoised rows; the object passed down never changes. */
  const rowActionsRef = useRef<MonthRowActions | null>(null);
  rowActionsRef.current = {
    click(personId, iso) {
      if (canEdit) return;
      setTravelHover(null);
      setStaySelection(null);
      openDay(personId, iso);
    },
    pointerDown(event, personId, iso, hasSite) {
      if (!canEdit || event.button !== 0) return;
      event.preventDefault();
      setTravelHover(null);
      if (event.shiftKey && onToggleStopover && !hasSite) {
        applyStopover(personId, iso, "YK");
        return;
      }
      startDrag(personId, iso, event.button);
    },
    contextMenu(event, personId, iso) {
      if (!canEdit) return;
      event.preventDefault();
      setTravelHover(null);
      setRowMenu(null);
      openCellMenu(personId, iso, event.clientX, event.clientY);
    },
    pointerEnter(event, personId, iso, hasMark, plan) {
      if (canEdit) moveDrag(personId, iso);
      if (canEdit && dragRef.current) setDragTip({ x: event.clientX, y: event.clientY });
      if (!hasMark || cellMenu || dragRef.current) {
        setTravelHover(null);
        return;
      }
      setTravelHover({ personId, iso, x: event.clientX, y: event.clientY, plan });
    },
    pointerMove(event, personId, iso, hasMark) {
      if (!hasMark || cellMenu || dragRef.current) return;
      setTravelHover((prev) =>
        prev && prev.personId === personId && prev.iso === iso
          ? { ...prev, x: event.clientX, y: event.clientY }
          : prev,
      );
    },
    pointerLeave(personId, iso) {
      setTravelHover((prev) => (prev && prev.personId === personId && prev.iso === iso ? null : prev));
    },
  };
  const rowActions = useMemo<MonthRowActions>(
    () => ({
      click: (...args) => rowActionsRef.current!.click(...args),
      pointerDown: (...args) => rowActionsRef.current!.pointerDown(...args),
      contextMenu: (...args) => rowActionsRef.current!.contextMenu(...args),
      pointerEnter: (...args) => rowActionsRef.current!.pointerEnter(...args),
      pointerMove: (...args) => rowActionsRef.current!.pointerMove(...args),
      pointerLeave: (...args) => rowActionsRef.current!.pointerLeave(...args),
    }),
    [],
  );

  const listHeader = (
    <div
      className="flex shrink-0 flex-col bg-card"
      style={{ width: `${listColRem}rem` }}
    >
      <div className="flex h-8 items-center justify-center border-b border-border bg-muted/40 px-3 text-sm font-medium tracking-wide text-foreground">
        {year}
      </div>
      <div className="flex min-h-14">
        <div
          className={cn("flex items-center border-r border-border px-1.5", phone && "hidden")}
          style={{ width: `${typeColRem}rem` }}
        >
          <span className="truncate text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Type
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center px-2">
          <span className="truncate text-sm font-medium tracking-wide text-muted-foreground uppercase">
            Name
          </span>
        </div>
      </div>
    </div>
  );

  // Full-year header (not virtualized) so the top scrubber always has real scroll range.
  const daysHeader = (
    <div className="flex min-w-max flex-col bg-card" style={{ width: daysTrackWidth }}>
      {/*
        Month labels are absolutely placed by day index (rem), not CSS grid spans -
        spanned tracks drift from per-day columns and throw the blue month rule off.
      */}
      <div
        className="grid h-8 border-b border-border bg-muted/40"
        style={{ width: daysTrackWidth, minWidth: daysTrackWidth, gridTemplateColumns: dayTracks }}
      >
        {monthBands.map((band) => (
          <div
            key={band.key}
            title={`${band.label}: 1–${band.count}`}
            // Grid columns (not rem maths) so the month edge sits exactly on the day boxes at any zoom.
            style={{ gridColumn: `${band.startIndex + 1} / span ${band.count}`, gridRow: 1 }}
            className={cn(
              "flex min-w-0 items-center justify-center overflow-hidden border-l-2 border-l-primary px-1 text-center text-xs font-semibold tracking-wide text-foreground",
              Number(band.key.slice(5, 7)) % 2 === 0 && "bg-sky-50/80",
            )}
          >
            <span className="block truncate">{band.label}</span>
          </div>
        ))}
      </div>
      <div
        className="grid min-h-14"
        style={{
          gridTemplateColumns: `repeat(${days.length}, ${dayColRem}rem)`,
          width: daysTrackWidth,
          minWidth: daysTrackWidth,
        }}
      >
        {dayMeta.map((day, dayIndex) => (
          <div
            key={day.iso}
            title={`${formatMedium(day.iso)} · ${onSiteCounts[dayIndex]} on site`}
            className={cn(
              "flex min-w-0 flex-col justify-center overflow-hidden border-l border-border px-0.5 py-1 text-center text-xs leading-tight tabular-nums",
              day.weekend && "bg-muted/60",
              day.monthIndex % 2 === 1 && !day.weekend && "bg-sky-50/50",
              day.monthStartDay && "border-l-2 border-l-primary",
              day.isToday && "bg-rose-50 font-bold text-rose-700",
            )}
          >
            <div className="truncate">{day.d}</div>
            <div className="truncate text-muted-foreground">{day.weekday}</div>
            <div
              className={cn(
                "mx-auto mt-0.5 min-w-[1.25rem] rounded-sm px-0.5 text-[0.6875rem] font-semibold leading-4",
                onSiteCounts[dayIndex] ? "bg-primary/10 text-primary" : "text-muted-foreground/60",
              )}
            >
              {onSiteCounts[dayIndex]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  useEffect(() => {
    didScrollToToday.current = false;
  }, [year, scrollToIso]);

  useLayoutEffect(() => {
    // Prefetch / KeepAlive mounts Month while hidden (Overview → Calendar). Don't
    // burn the "open on today" scroll until the pane is actually visible.
    if (!active || didScrollToToday.current || days.length === 0) return;

    function applyScrollToOpenDay() {
      if (didScrollToToday.current) return true;
      const main = mainScrollRef.current;
      if (!main || main.clientWidth < 40) return false;
      // Open on this week (today a few days in from the left); a Year-tape deep link wins.
      const explicitMonth =
        scrollToIso &&
        (days.includes(scrollToIso) || days.some((iso) => iso.startsWith(scrollToIso.slice(0, 7))));
      const preferred = explicitMonth
        ? days.includes(scrollToIso!)
          ? scrollToIso!
          : days.find((iso) => iso.startsWith(scrollToIso!.slice(0, 7)))!
        : days.includes(today)
          ? addDays(today, -3)
          : days[0]!;
      const idx = Math.max(0, days.indexOf(preferred) >= 0 ? days.indexOf(preferred) : days.indexOf(today) - 3);
      setDaysScrollLeft(Math.max(0, idx * dayColPx));
      didScrollToToday.current = true;
      return true;
    }

    if (applyScrollToOpenDay()) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      if (applyScrollToOpenDay()) return;
      raf2 = requestAnimationFrame(() => {
        applyScrollToOpenDay();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [active, days, scrollToIso, dayColPx, today]);

  useEffect(() => {
    if (!active) return;
    refreshDayWindow();
    const main = mainScrollRef.current;
    if (!main || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => refreshDayWindow());
    observer.observe(main);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure viewport once days/col size settle
  }, [active, days.length, dayColPx]);

  function autoScrollToward(iso: string) {
    const main = mainScrollRef.current;
    if (!main) return;
    const idx = days.indexOf(iso);
    if (idx < 0) return;
    const cellLeft = idx * dayColPx;
    const cellRight = cellLeft + dayColPx;
    const viewLeft = main.scrollLeft;
    const viewRight = viewLeft + main.clientWidth;
    const maxLeft = Math.max(0, days.length * dayColPx - main.clientWidth);
    if (cellRight > viewRight - 48) {
      setDaysScrollLeft(Math.min(maxLeft, cellRight - main.clientWidth + 80));
    } else if (cellLeft < viewLeft + 48) {
      setDaysScrollLeft(Math.max(0, cellLeft - 80));
    }
  }

  const groups = useMemo(() => {
    const roleRank = (value: string) => {
      const key = normalizeRole(value);
      const index = (CREW_ROLE_ORDER as readonly string[]).indexOf(key as (typeof CREW_ROLE_ORDER)[number]);
      return index === -1 ? CREW_ROLE_ORDER.length : index;
    };
    const categoryRank = (value: CrewCategory) => {
      const index = CREW_CATEGORY_ORDER.indexOf(value);
      return index === -1 ? CREW_CATEGORY_ORDER.length : index;
    };
    const sorted = [...rows].sort(
      (a, b) =>
        roleRank(a.displayRole || a.person.role) - roleRank(b.displayRole || b.person.role) ||
        categoryRank(crewCategoryFor(a.person)) - categoryRank(crewCategoryFor(b.person)) ||
        a.person.name.localeCompare(b.person.name),
    );
    const out: { role: string; people: CrewPerson[] }[] = [];
    for (const row of sorted) {
      const role = normalizeRole(row.displayRole || row.person.role);
      const last = out[out.length - 1];
      if (!last || last.role !== role) {
        out.push({ role, people: [row.person] });
      } else {
        last.people.push(row.person);
      }
    }
    return out;
  }, [rows]);

  function openDay(personId: string, iso: string) {
    if (onOpenDay) onOpenDay(personId, iso);
    else onOpen(personId);
  }

  function selectPlan(plan: RosterRotationPlan, personId: string) {
    const note = getStayNote(roster, personId, plan.from, plan.out) || plan.note || "";
    setStaySelection({
      personId,
      planId: plan.id,
      from: plan.from,
      out: plan.out,
      note,
    });
    setNoteDraft(note);
  }

  function selectStay(personId: string, from: string, out: string, planId = "") {
    const note = getStayNote(roster, personId, from, out);
    setStaySelection({ personId, planId, from, out, note });
    setNoteDraft(note);
  }

  function planOnDay(personId: string, iso: string) {
    if (!roster) return null;
    return findRotationPlanAt(roster, personId, iso);
  }

  function clearSelectedPlacement() {
    if (!staySelection || !onRemoveRotation || !staySelection.planId) return;
    const ops = opsFor(opsBook, staySelection.personId);
    if (placementHasBookedFlights(ops)) {
      const ok = window.confirm(
        "This person already has booked or confirmed flights. Clear this placement anyway?",
      );
      if (!ok) return;
    }
    onRemoveRotation(staySelection.personId, staySelection.planId);
    closeCellMenu();
    showFlash("Cleared placement");
  }

  /** Whole-stay note for the selected stay (empty text clears it). */
  function saveWholeStayNote(
    text: string,
    target?: { personId: string; from: string; out: string; planId?: string },
  ) {
    const stay = target || staySelection;
    if (!stay) return;
    const next = text.slice(0, MAX_STAY_NOTE_CHARS).trim();
    if (onSetStayNote) onSetStayNote(stay.personId, stay.from, stay.out, next);
    else if (stay.planId && onSetRotationNote) onSetRotationNote(stay.personId, stay.planId, next);
    else return;
    if (staySelection && staySelection.personId === stay.personId && staySelection.from === stay.from) {
      setStaySelection({ ...staySelection, note: next, out: stay.out, planId: stay.planId || staySelection.planId });
    }
    setNoteDraft(next);
    showFlash(next ? `Note saved for the whole stay · ${next}` : "Note removed");
  }

  /** Stay under the open cell menu (so Add note can default to whole-stay). */
  function stayUnderCellMenu() {
    if (!cellMenu?.hasSite) return null;
    const person = peopleById.get(cellMenu.personId);
    const stint = person ? stintCovering(person, cellMenu.iso) : null;
    if (!stint) return null;
    const out = stint.out || scheduleYearOutExclusive(year);
    const plan = roster ? findRotationPlanAt(roster, cellMenu.personId, stint.from) : null;
    const note = getStayNote(roster, cellMenu.personId, stint.from, out) || plan?.note || "";
    return {
      personId: cellMenu.personId,
      from: stint.from,
      out,
      last: addDays(out, -1),
      planId: plan?.id || "",
      note,
    };
  }

  // Resolve real plan id / note after roster catches up from place or note save.
  useEffect(() => {
    if (!staySelection || !roster) return;
    const plans = roster.rotationPlans?.[staySelection.personId] ?? [];
    const plan =
      plans.find((row) => row.id === staySelection.planId) ||
      plans.find((row) => row.from === staySelection.from && row.out === staySelection.out);
    if (!plan) return;
    if (
      plan.id === staySelection.planId &&
      (plan.note || "") === staySelection.note &&
      plan.out === staySelection.out
    ) {
      return;
    }
    setStaySelection({
      personId: staySelection.personId,
      planId: plan.id,
      from: plan.from,
      out: plan.out,
      note: plan.note || "",
    });
    setNoteDraft(plan.note || "");
  }, [roster, staySelection]);

  // NAV-07: Delete / Backspace clears the selected app placement.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Month stays mounted behind other tabs; only react while it is on screen.
      if (mainScrollRef.current && mainScrollRef.current.offsetParent === null) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.key === "Escape") {
        closeCellMenu();
        setRowMenu(null);
        setRoleHiddenOpen(null);
        setPaintBrush(defaultSiteBrush());
        return;
      }
      if (!staySelection || !onRemoveRotation) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        clearSelectedPlacement();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // clearSelectedPlacement closes over latest selection/ops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staySelection, onRemoveRotation, opsBook]);

  function commitDrag() {
    const active = dragRef.current;
    dragRef.current = null;
    setDraft(null);
    if (!active) return;

    if (active.mode === "open") {
      // Open the person — do not leave a selection ring on the stay.
      setStaySelection(null);
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
      setStaySelection(null);
      showFlash("Cleared return window");
      return;
    }

    if (active.mode === "return") {
      const person = peopleById.get(active.personId);
      if (!person) return;
      // Click (no drag): from that day through OUT. Drag: paint exactly the days you cover.
      if (!active.moved) {
        addReturnWindowAt(active.personId, active.anchor);
        setStaySelection(null);
        return;
      }
      const range = orderedRange(active.start, active.end);
      setReturnWindow(active.personId, range.from, range.to);
      setStaySelection(null);
      showFlash(`Return window · ${formatMedium(range.from)} – ${formatMedium(range.to)}`);
      return;
    }

    if (active.mode === "extend") {
      const person = peopleById.get(active.personId);
      const stint = person ? stintCovering(person, active.anchor) : null;
      if (!stint || !onExtendStay) return;
      const newOut = addDays(active.end, 1);
      const oldOut = stint.out || addDays(scheduleYearLastDay(year), 1);
      if (newOut !== oldOut) {
        onExtendStay(active.personId, stint.from, newOut);
        showFlash(`${newOut > oldOut ? "Longer" : "Shorter"} stay · last day ${formatMedium(active.end)}`);
      }
      // Don't leave the black selection ring on after a drag change.
      setStaySelection(null);
      return;
    }

    if (active.mode === "moveIn") {
      const person = peopleById.get(active.personId);
      const stint = person ? stintCovering(person, active.anchor) : null;
      if (!stint || !onMoveStayIn) return;
      if (active.start !== stint.from) {
        onMoveStayIn(active.personId, stint.from, active.start);
        showFlash(`Stay starts ${formatMedium(active.start)}`);
      }
      setStaySelection(null);
      return;
    }

    if (active.mode !== "place") return;
    const painted = orderedRange(active.start, active.end);
    const finalRange = clampPlaceRange(painted.from, painted.to);
    const brush = paintBrushRef.current;
    const person = peopleById.get(active.personId);

    // Travel brush → open compact journey editor for the painted empty days.
    if (brush.kind === "travel") {
      if (!onApplyJourney) return;
      const dates: string[] = [];
      for (let d = finalRange.from; d <= finalRange.to; d = addDays(d, 1)) {
        if (person && siteOnDay(person, d)) break;
        dates.push(d);
      }
      if (!dates.length) {
        showFlash("Travel paints empty days between camp colours");
        setStaySelection(null);
        return;
      }
      const camp = person ? campAhead(person, dates[dates.length - 1]!) : null;
      setJourneyPlanner({
        personId: active.personId,
        personName: person?.name || active.personId,
        iso: dates[0]!,
        endIso: dates[dates.length - 1]!,
        site: camp,
        from: camp && siteOnDay(person!, addDays(dates[0]!, -1)) ? siteOnDay(person!, addDays(dates[0]!, -1)) || undefined : undefined,
        to: camp || undefined,
      });
      setStaySelection(null);
      return;
    }

    if (brush.kind !== "site") return;

    // Site brush → place immediately. Sheet: every IN has an OUT.
    placeStayNow(active.personId, finalRange.from, finalRange.to, brush.code);
    setStaySelection(null);
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

  /** Right-click stay day → yellow return window from that day through OUT. */
  function addReturnWindowAt(personId: string, iso: string) {
    const person = peopleById.get(personId);
    if (!person || !siteOnDay(person, iso)) return;
    const stint = stintCovering(person, iso);
    if (!stint) return;
    const range = returnWindowFromStayDay({
      clickIso: iso,
      stayFrom: stint.from,
      stayOutExclusive: stint.out,
      seasonEnd: scheduleYearLastDay(year),
    });
    if (!range) return;
    setReturnWindow(personId, range.from, range.to);
    showFlash(`Return window · ${formatMedium(range.from)} – ${formatMedium(range.to)}`);
  }

  function openCellMenu(personId: string, iso: string, clientX: number, clientY: number) {
    const person = peopleById.get(personId);
    if (!person) return;
    const hasSite = Boolean(siteOnDay(person, iso));
    const plan = hasSite ? planOnDay(personId, iso) : null;
    const stint = hasSite ? stintCovering(person, iso) : null;
    if (plan) selectPlan(plan, personId);
    else if (stint) selectStay(personId, stint.from, stint.out || scheduleYearOutExclusive(year));
    else setNoteDraft("");
    setDateNoteDraft(null);
    setCellMenu({
      personId,
      iso,
      x: clientX,
      y: clientY,
      hasSite,
      plan,
      noteOpen: false,
    });
  }

  function applyStopover(personId: string, iso: string, hub: string) {
    if (!onToggleStopover) return;
    const had = stopoverBook ? stopoverOnDay(stopoverBook, personId, iso) : null;
    onToggleStopover(personId, iso, hub);
    closeCellMenu();
    showFlash(
      had === hub
        ? `Removed travel ${hub} · ${formatMedium(iso)}`
        : `Travel ${hub} · ${formatMedium(iso)}`,
    );
  }

  /** Next camp colour on/after this day — sensible To default. */
  function campAhead(person: CrewPerson, iso: string) {
    const here = siteOnDay(person, iso);
    if (here) return here;
    for (let i = 1; i <= 21; i += 1) {
      const site = siteOnDay(person, addDays(iso, i));
      if (site) return site;
    }
    return null;
  }

  /** Click grey travel → reopen the journey editor for that booking. */
  function openTravelEditor(personId: string, iso: string) {
    if (!onApplyJourney) return;
    const person = peopleById.get(personId);
    const booking = flightBook ? bookingCoveringDay(flightBook, personId, iso) : null;
    const span = booking ? journeyDateSpan(booking.segments) : null;
    const segs = booking?.segments || [];
    const codes: string[] = [];
    for (const leg of segs) {
      if (leg.fromAirport) codes.push(leg.fromAirport);
      if (leg.toAirport) codes.push(leg.toAirport);
    }
    const path = codes.filter((code, i) => code && code !== codes[i - 1]);
    const overnight =
      Boolean(span && span.from !== span.to) ||
      segs.some((leg) => leg.departDate !== leg.arriveDate);
    setJourneyPlanner({
      personId,
      personName: person?.name || personId,
      iso: span?.from || iso,
      endIso: span?.to || iso,
      site: person ? campAhead(person, iso) : null,
      bookingId: booking?.id,
      from: path[0],
      to: path[path.length - 1],
      stops: path.length > 2 ? path.slice(1, -1) : [],
      direction: booking?.direction,
      overnight,
      overnightHub: path.length > 2 ? path[1] : "",
      notes: booking?.notes || "",
    });
  }

  function startDrag(personId: string, iso: string, button = 0) {
    // Only left button starts place / open / clear / extend.
    if (button !== 0) return;
    closeCellMenu();
    const person = peopleById.get(personId);
    if (!person) return;

    // View mode uses onClick, never start a drag (stops phone scroll wobble).
    if (!canEdit) return;

    if (siteOnDay(person, iso)) {
      if (paintBrushRef.current.kind === "travel") {
        showFlash("Travel paints empty days — not on a camp colour");
        return;
      }
      // Return brush: paint yellow booking window on stay days (click = that day → OUT).
      if (paintBrushRef.current.kind === "return") {
        dragRef.current = { personId, anchor: iso, start: iso, end: iso, mode: "return", moved: false };
        setDraft({ personId, start: iso, end: iso, mode: "return" });
        return;
      }
      // Click opens; drag extends the stay (yellow return is Return brush or right-click).
      dragRef.current = { personId, anchor: iso, start: iso, end: iso, mode: "open", moved: false };
      setDraft(null);
      return;
    }

    // Click grey travel → edit journey (Excel-simple; no right-click required).
    const paintedHub = stopoverBook ? stopoverOnDay(stopoverBook, personId, iso) : null;
    if (paintedHub) {
      openTravelEditor(personId, iso);
      return;
    }

    if (paintBrushRef.current.kind === "return") {
      showFlash("Return paints on a stay — click or drag camp days");
      return;
    }

    dragRef.current = { personId, anchor: iso, start: iso, end: iso, mode: "place", moved: false };
    setDraft({ personId, start: iso, end: iso, mode: "place" });
  }

  function moveDrag(personId: string, iso: string) {
    const active = dragRef.current;
    if (!active || active.personId !== personId || active.mode === "clear") return;

    // Return brush: yellow only on days that are still on this stay.
    if (active.mode === "return") {
      const person = peopleById.get(personId);
      const stint = person ? stintCovering(person, active.anchor) : null;
      if (!stint) return;
      const lastInclusive = stint.out ? addDays(stint.out, -1) : scheduleYearLastDay(year);
      let from = active.anchor <= iso ? active.anchor : iso;
      let to = active.anchor <= iso ? iso : active.anchor;
      if (from < stint.from) from = stint.from;
      if (to > lastInclusive) to = lastInclusive;
      if (to < from) to = from;
      dragRef.current = { ...active, start: from, end: to, moved: true };
      setDraft({ personId, start: from, end: to, mode: "return" });
      autoScrollToward(iso);
      return;
    }

    // Stay drag: grab the first box to move the IN, anywhere else to move the OUT.
    // Both go either way (earlier or later).
    if (active.mode === "open" || active.mode === "extend" || active.mode === "moveIn") {
      const person = peopleById.get(personId);
      const stint = person ? stintCovering(person, active.anchor) : null;
      if (iso === active.anchor && active.mode === "open") return;
      const currentLast = stint ? (stint.out ? addDays(stint.out, -1) : scheduleYearLastDay(year)) : "";
      const grabIn =
        active.mode === "moveIn" || (active.mode === "open" && Boolean(stint) && active.anchor === stint!.from && currentLast !== stint!.from);
      if (!stint || (grabIn ? !onMoveStayIn : !onExtendStay)) {
        dragRef.current = { ...active, moved: true };
        return;
      }
      if (grabIn) {
        let start = iso > currentLast ? currentLast : iso;
        if (start < stint.from) {
          // Earlier: stop at the day after the previous stay.
          let ok = stint.from;
          for (let d = addDays(stint.from, -1); d >= start; d = addDays(d, -1)) {
            if (siteOnDay(person!, d)) break;
            ok = d;
          }
          start = ok;
        }
        dragRef.current = { personId, anchor: active.anchor, start, end: currentLast, mode: "moveIn", moved: true, stayFrom: stint.from };
        setDraft({ personId, start, end: currentLast, mode: "moveIn", stayFrom: stint.from });
        autoScrollToward(iso);
        return;
      }
      let end = iso < stint.from ? stint.from : iso;
      if (end > currentLast) {
        // Later: stop before the next stay.
        let ok = currentLast;
        for (let d = addDays(currentLast, 1); d <= end; d = addDays(d, 1)) {
          if (siteOnDay(person!, d) && !(stint.from <= d && (!stint.out || d < stint.out))) break;
          ok = d;
        }
        end = ok;
      }
      end = clampPlaceRange(stint.from, end).to;
      dragRef.current = {
        personId,
        anchor: active.anchor,
        start: stint.from,
        end,
        mode: "extend",
        moved: true,
        stayFrom: stint.from,
      };
      setDraft({ personId, start: stint.from, end, mode: "extend", stayFrom: stint.from });
      autoScrollToward(iso);
      return;
    }

    const person = peopleById.get(personId);
    if (!person) return;
    let range = clampPlaceRange(active.anchor, iso);
    // Don't paint through an existing stay, stop before the conflict.
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

  const draftDays =
    draft && (draft.mode === "place" || draft.mode === "extend" || draft.mode === "moveIn")
      ? daysBetween(orderedRange(draft.start, draft.end).from, orderedRange(draft.start, draft.end).to) + 1
      : null;

  const menuOps = cellMenu ? opsFor(opsBook, cellMenu.personId) : null;
  const menuHasReturn =
    Boolean(cellMenu && menuOps && showReturnWindow(menuOps, cellMenu.iso));

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-2 py-2 sm:px-4 sm:py-3">
        {flash ? (
          // Floating, so the rows never jump under the mouse after an action.
          <p
            role="status"
            className="pointer-events-none fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 truncate rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-lg tabular-nums sm:bottom-6"
          >
            {flash}
          </p>
        ) : null}
        {/* Phones: colour key scrolls sideways on one line, View / Edit stays on the right. */}
        <div className="flex flex-nowrap items-center gap-2 text-xs sm:flex-wrap sm:text-[0.8125rem]">
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] sm:flex-none sm:flex-wrap sm:gap-2 sm:overflow-visible [&::-webkit-scrollbar]:hidden",
              !canEdit && "pointer-events-none opacity-50",
            )}
          >
            {siteList.map((site) => {
              const active = paintBrush.kind === "site" && paintBrush.code === site.code;
              const tone = siteColour(site);
              return (
                <button
                  key={site.code}
                  type="button"
                  disabled={!canEdit}
                  title={`${site.code}: drag empty days · first = IN · last = OUT`}
                  onClick={() => setPaintBrush({ kind: "site", code: site.code })}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 font-semibold transition-colors sm:px-2.5",
                    active
                      ? cn(tone.chip, "border-transparent ring-2 ring-inset ring-black/10")
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  <span className={cn("size-2.5 rounded-sm", tone.swatch)} aria-hidden />
                  {site.code}
                </button>
              );
            })}
            <button
              type="button"
              disabled={!canEdit}
              title="Travel: click or drag empty days, then enter From → To"
              onClick={() => setPaintBrush({ kind: "travel" })}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 font-semibold transition-colors sm:px-2.5",
                paintBrush.kind === "travel"
                  ? "border-stone-400 bg-stone-200 text-stone-900 ring-2 ring-inset ring-stone-400/40"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="size-2.5 rounded-sm bg-stone-500" aria-hidden />
              Travel
            </button>
            <button
              type="button"
              disabled={!canEdit}
              title="Return: click a stay day (that day → OUT), or drag the days to book"
              onClick={() => setPaintBrush({ kind: "return" })}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 font-semibold transition-colors sm:px-2.5",
                paintBrush.kind === "return"
                  ? "border-amber-400 bg-amber-100 text-amber-950 ring-2 ring-inset ring-amber-500/40"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              <span className="size-2.5 rounded-sm bg-[#FFD600]" aria-hidden />
              Return
            </button>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div
              className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5"
              role="group"
              aria-label="Calendar mode"
            >
              <button
                type="button"
                title="See the whole schedule — scroll only" aria-label="View"
                onClick={() => onInteractionModeChange?.("view")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors",
                  !canEdit ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Eye className="size-3.5" aria-hidden />
                <span className="hidden min-[400px]:inline">View</span>
              </button>
              <button
                type="button"
                title="Edit stays and plan travel from the coloured days" aria-label="Edit"
                onClick={() => onInteractionModeChange?.("edit")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors",
                  canEdit ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Pencil className="size-3.5" aria-hidden />
                <span className="hidden min-[400px]:inline">Edit</span>
              </button>
            </div>
            {canEdit && onTryPerson ? (
              <button
                type="button"
                title="Add crew to try on the schedule"
                onClick={() => {
                  setTryOpen((open) => !open);
                  setTryDraft({ name: "", role: "Labourer" });
                }}
                className="hidden h-8 sm:inline-flex items-center rounded-lg border border-input bg-card px-2.5 text-xs font-semibold hover:bg-muted"
              >
                Simulate
              </button>
            ) : null}
            {canEdit ? <CrewUndoButton className="h-8" /> : null}
          </div>
        </div>
        {canEdit && tryOpen && onTryPerson ? (
          <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2.5">
            <label className="grid gap-1 text-xs text-muted-foreground">
              <span>Name</span>
              <input
                value={tryDraft.name}
                onChange={(event) => setTryDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="John"
                className="h-8 w-44 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
                autoFocus
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              <span>Role</span>
              <input
                value={tryDraft.role}
                onChange={(event) => setTryDraft((current) => ({ ...current, role: event.target.value }))}
                list="crew-try-roles"
                className="h-8 w-36 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
              />
              <datalist id="crew-try-roles">
                {(CREW_ROLE_ORDER as readonly string[]).map((role) => (
                  <option key={role} value={role} />
                ))}
              </datalist>
            </label>
            <button
              type="button"
              onClick={() => {
                const name = tryDraft.name.trim();
                if (!name) return;
                const id = onTryPerson({ name, role: tryDraft.role.trim() || "Labourer" });
                setTryOpen(false);
                setTryDraft({ name: "", role: "Labourer" });
                showFlash(id ? `Draft · ${name}` : `Draft · ${name}`);
              }}
              className="h-8 rounded-lg bg-stone-900 px-3 text-xs font-semibold text-white hover:opacity-90"
            >
              Add draft
            </button>
            <button
              type="button"
              onClick={() => setTryOpen(false)}
              className="h-8 rounded-lg border border-input px-3 text-xs font-medium hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      {/* Type/Name fixed left; date header + boxes share one pane, scrollbar at the bottom. */}
      <div className="flex min-h-0 overflow-hidden" style={{ maxHeight: "var(--app-board-max-h)" }}>
          <div
            className="flex shrink-0 flex-col overflow-hidden border-r border-border"
            style={{ width: `${listColRem}rem` }}
          >
            {listHeader}
            <div
              ref={leftScrollRef}
              // No scrollbar of its own: it follows the day pane (which owns the scrollbars).
              className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={() => syncVerticalScroll("left")}
            >
            {groups.length === 0 ? (
              <p className="px-3 py-8 text-sm text-muted-foreground">No crew.</p>
            ) : (
              groups.map((group, groupIndex) => {
                const visiblePeople = group.people.filter((person) => !hiddenIdSet.has(person.id));
                const hiddenInRole = (hiddenPeople || []).filter(
                  (row) =>
                    normalizeRole(row.role || "") === group.role ||
                    (!row.role && group.people.some((person) => person.id === row.id && hiddenIdSet.has(row.id))),
                );
                return (
                  <div key={`list-${group.role}`}>
                    <div className="sticky top-0 z-20 h-10">
                      <CrewRoleHeader
                        role={roleSectionTitle(group.role)}
                        count={visiblePeople.length}
                        spaced={false}
                        className={cn(
                          "h-10 border-y border-slate-300 bg-slate-200 px-3 py-0 shadow-sm",
                          groupIndex > 0 && "border-t-2",
                        )}
                        onContextMenu={
                          onHidePerson || (hiddenInRole.length && onShowPerson)
                            ? (event) => {
                                event.preventDefault();
                                closeCellMenu();
                                setRoleHiddenOpen(null);
                                setRowMenu({
                                  kind: "role",
                                  role: group.role,
                                  x: event.clientX,
                                  y: event.clientY,
                                  canHide: Boolean(onHidePerson && visiblePeople.length),
                                  canUnhide: Boolean(onShowPerson && hiddenInRole.length),
                                  personIds: visiblePeople.map((p) => p.id),
                                  hiddenPeople: hiddenInRole.map((p) => ({ id: p.id, name: p.name })),
                                });
                              }
                            : undefined
                        }
                        trailing={
                          <div className="flex items-center gap-1.5">
                            {canEdit && onAddUnderRole ? (
                              <button
                                type="button"
                                title={`Add someone under ${roleSectionTitle(group.role)}`}
                                aria-label={`Add under ${roleSectionTitle(group.role)}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onAddUnderRole(group.role);
                                }}
                                className="inline-flex size-7 items-center justify-center rounded-md bg-slate-300/70 text-slate-800 hover:bg-slate-300"
                              >
                                <Plus className="size-3.5" aria-hidden />
                              </button>
                            ) : null}
                            {hiddenInRole.length && onShowPerson ? (
                              <div className="relative">
                                <button
                                  type="button"
                                  title={`${hiddenInRole.length} hidden in ${roleSectionTitle(group.role)}`}
                                  aria-expanded={roleHiddenOpen === group.role}
                                  aria-haspopup="menu"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setRowMenu(null);
                                    closeCellMenu();
                                    setRoleHiddenOpen((open) => (open === group.role ? null : group.role));
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md bg-slate-300/70 px-1.5 py-0.5 text-xs font-semibold text-slate-800 hover:bg-slate-300"
                                >
                                  <Eye className="size-3" aria-hidden />
                                  {hiddenInRole.length} hidden
                                  <ChevronDown
                                    className={cn(
                                      "size-3 transition-transform",
                                      roleHiddenOpen === group.role && "rotate-180",
                                    )}
                                    aria-hidden
                                  />
                                </button>
                                {roleHiddenOpen === group.role ? (
                                  <>
                                    <button
                                      type="button"
                                      aria-label="Close hidden list"
                                      className="fixed inset-0 z-40 cursor-default"
                                      onClick={() => setRoleHiddenOpen(null)}
                                    />
                                    <div
                                      role="menu"
                                      className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-border bg-card p-1 shadow-xl"
                                    >
                                      <p className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Hidden · {roleSectionTitle(group.role)}
                                      </p>
                                      <div className="max-h-48 overflow-y-auto">
                                        {hiddenInRole.map((person) => (
                                          <button
                                            key={person.id}
                                            type="button"
                                            role="menuitem"
                                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium hover:bg-muted"
                                            onClick={() => {
                                              onShowPerson(person.id, group.role);
                                              showFlash(`Shown · ${person.name}`);
                                              if (hiddenInRole.length <= 1) setRoleHiddenOpen(null);
                                            }}
                                          >
                                            <Eye className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                                            <span className="min-w-0 truncate">{person.name}</span>
                                          </button>
                                        ))}
                                      </div>
                                      {hiddenInRole.length > 1 ? (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="mt-0.5 flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                                          onClick={() => {
                                            hiddenInRole.forEach((person) =>
                                              onShowPerson(person.id, group.role),
                                            );
                                            setRoleHiddenOpen(null);
                                            showFlash(
                                              `Unhidden · ${hiddenInRole.length} ${roleSectionTitle(group.role)}`,
                                            );
                                          }}
                                        >
                                          Show all {hiddenInRole.length}
                                        </button>
                                      ) : null}
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        }
                      />
                    </div>
                    {visiblePeople.map((person) => {
                      const category = crewCategoryFor(person);
                      return (
                        <div
                          key={`${person.id}::${group.role}`}
                          className="flex h-11 items-stretch border-b border-border bg-card"
                        >
                          <div
                            className={cn("flex items-center overflow-hidden border-r border-border px-1.5", phone && "hidden")}
                            style={{ width: `${typeColRem}rem` }}
                            title={
                              category === "Subcontractor"
                                ? "Subcontractor (Gemtec)"
                                : category === "Local"
                                  ? "Local"
                                  : "Regular"
                            }
                          >
                            <span
                              className={cn(
                                "block w-full truncate text-sm font-medium leading-tight tracking-wide uppercase",
                                category === "Local"
                                  ? "text-teal-800"
                                  : category === "Subcontractor"
                                    ? "text-amber-800"
                                    : "text-blue-700",
                              )}
                            >
                              {crewCategoryLabel(category)}
                            </span>
                          </div>
                          <div
                            className="flex min-w-0 flex-1 items-center py-1 pr-1 pl-1"
                            onContextMenu={(event) => {
                              if (!onHidePerson) return;
                              event.preventDefault();
                              closeCellMenu();
                              setRoleHiddenOpen(null);
                              setRowMenu({
                                kind: "person",
                                personId: person.id,
                                personName: person.name,
                                sectionRole: group.role,
                                x: event.clientX,
                                y: event.clientY,
                              });
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => onOpen(person.id)}
                              className="min-w-0 flex-1 px-1.5 py-1 text-left hover:bg-muted/40"
                            >
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-sm font-medium">{person.name}</span>
                                {person.provisional ? (
                                  <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase">
                                    Draft
                                  </span>
                                ) : null}
                              </span>
                              {(person.roles?.length ?? 0) > 1 ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {roleLabel(person)}
                                </span>
                              ) : null}
                            </button>
                            {person.provisional && (onCommitProvisional || onDiscardProvisional) ? (
                              <div className="flex shrink-0 items-center gap-1 pr-1">
                                {onCommitProvisional ? (
                                  <button
                                    type="button"
                                    title="Keep this person on the roster"
                                    onClick={() => {
                                      onCommitProvisional(person.id);
                                      showFlash(`Saved · ${person.name}`);
                                    }}
                                    className="h-7 rounded-md border border-input bg-card px-2 text-xs font-semibold hover:bg-muted"
                                  >
                                    Save
                                  </button>
                                ) : null}
                                {onDiscardProvisional ? (
                                  <button
                                    type="button"
                                    title="Remove draft and placements"
                                    onClick={() => {
                                      const hasPlans = Boolean(roster?.rotationPlans?.[person.id]?.length);
                                      const ok = window.confirm(
                                        hasPlans
                                          ? `Discard ${person.name}? This removes the draft and their placements.`
                                          : `Discard ${person.name}?`,
                                      );
                                      if (!ok) return;
                                      onDiscardProvisional(person.id);
                                      showFlash(`Discarded · ${person.name}`);
                                    }}
                                    className="h-7 rounded-md border border-rose-200 bg-rose-50 px-2 text-xs font-semibold text-rose-900 hover:bg-rose-100"
                                  >
                                    Discard
                                  </button>
                                ) : null}
                              </div>
                            ) : onHidePerson ? (
                              <button
                                type="button"
                                title={`Hide ${person.name}`}
                                aria-label={`Hide ${person.name}`}
                                onClick={() => {
                                  onHidePerson(person.id, group.role);
                                  showFlash(`Hidden · ${person.name}`);
                                }}
                                className="hidden shrink-0 rounded-md sm:block p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <EyeOff className="size-3.5" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
            {/* Same height as the day pane's bottom scrollbar, so names and boxes line up all the way down. */}
            <div aria-hidden style={{ height: hScrollbarPx }} />
            </div>
          </div>

          <div
            ref={mainScrollRef}
            className="crew-days-h-scroll min-w-0 flex-1 overflow-auto"
            onScroll={() => {
              const main = mainScrollRef.current;
              if (!main) return;
              pinnedScrollLeft.current = main.scrollLeft;
              // Horizontal scrub must stay native, only sync names on vertical moves.
              if (main.scrollTop !== lastScrollTop.current) {
                lastScrollTop.current = main.scrollTop;
                syncVerticalScroll("main");
              }
              refreshDayWindow();
            }}
            onPointerUp={commitDrag}
            onPointerCancel={commitDrag}
          >
          <div className="sticky top-0 z-30 border-b border-border bg-card">{daysHeader}</div>
          <div className="relative">
          {/* Month rule: one straight blue line from the header to the bottom, over rows and role bars.
              Laid out on the same grid columns as the day boxes so it lines up at any zoom. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-[25] grid"
            style={{ width: daysTrackWidth, gridTemplateColumns: dayTracks }}
          >
            {monthBands.map((band) =>
              band.startIndex > 0 ? (
                <div
                  key={`rule-${band.key}`}
                  data-month-rule
                  className="h-full w-0.5 bg-primary"
                  style={{ gridColumn: band.startIndex + 1, gridRow: 1 }}
                />
              ) : null,
            )}
          </div>
          {groups.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">No crew match these filters.</p>
          ) : (
            groups.map((group, groupIndex) => {
              const visiblePeople = group.people.filter((person) => !hiddenIdSet.has(person.id));
              return (
              <div key={`days-${group.role}`}>
                <div
                  className={cn(
                    "sticky top-[5.5rem] z-20 h-10 border-y border-slate-300 bg-slate-200",
                    groupIndex > 0 && "border-t-2",
                  )}
                  style={{ width: daysTrackWidth, minWidth: daysTrackWidth }}
                  aria-hidden
                />
                {visiblePeople.map((person) => (
                  <MonthRow
                    key={`${person.id}::${group.role}`}
                    person={person}
                    opsEntry={opsBook[person.id]}
                    draft={draft?.personId === person.id ? draft : null}
                    stopoverBook={stopoverBook}
                    flightBook={flightBook}
                    roster={roster}
                    travelHubs={travelHubs}
                    siteList={siteList}
                    paintBrush={paintBrush}
                    canEdit={canEdit}
                    year={year}
                    dayMeta={dayMeta}
                    gridColumns={visibleDayColumns}
                    daysTrackWidth={daysTrackWidth}
                    dayColRem={dayColRem}
                    actions={rowActions}
                  />
                ))}
              </div>
              );
            })
          )}
          </div>
          </div>
      </div>

      {rowMenu ? (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setRowMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setRowMenu(null);
          }}
        >
          <div
            role="menu"
            className="absolute w-[min(16rem,calc(100vw-1rem))] rounded-xl border border-border bg-card p-1 shadow-xl"
            style={{
              left: Math.min(rowMenu.x, typeof window !== "undefined" ? window.innerWidth - 280 : rowMenu.x),
              top: Math.min(
                rowMenu.y,
                typeof window !== "undefined"
                  ? window.innerHeight - (rowMenu.kind === "role" ? 320 : 120)
                  : rowMenu.y,
              ),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {rowMenu.kind === "person" ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-muted"
                onClick={() => {
                  onHidePerson?.(rowMenu.personId, rowMenu.sectionRole);
                  setRowMenu(null);
                  showFlash(`Hidden · ${rowMenu.personName}`);
                }}
              >
                Hide row
              </button>
            ) : (
              <>
                {rowMenu.canHide ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-muted"
                    onClick={() => {
                      rowMenu.personIds.forEach((id) => onHidePerson?.(id, rowMenu.role));
                      setRowMenu(null);
                      showFlash(`Hidden · ${roleSectionTitle(rowMenu.role)}`);
                    }}
                  >
                    Hide {roleSectionTitle(rowMenu.role)}
                  </button>
                ) : null}
                {rowMenu.canUnhide ? (
                  <>
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Unhide one
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {rowMenu.hiddenPeople.map((person) => (
                        <button
                          key={person.id}
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-muted"
                          onClick={() => {
                            onShowPerson?.(person.id, rowMenu.role);
                            setRowMenu(null);
                            showFlash(`Shown · ${person.name}`);
                          }}
                        >
                          {person.name}
                        </button>
                      ))}
                    </div>
                    {rowMenu.hiddenPeople.length > 1 ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                        onClick={() => {
                          rowMenu.hiddenPeople.forEach((person) =>
                            onShowPerson?.(person.id, rowMenu.role),
                          );
                          setRowMenu(null);
                          showFlash(`Unhidden · ${rowMenu.hiddenPeople.length} ${roleSectionTitle(rowMenu.role)}`);
                        }}
                      >
                        Unhide all {rowMenu.hiddenPeople.length}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      {cellMenu ? (
        <div
          className="fixed inset-0 z-50"
          onClick={() => closeCellMenu()}
          onContextMenu={(event) => {
            event.preventDefault();
            closeCellMenu();
          }}
        >
          <div
            ref={cellMenuRef}
            role="menu"
            className="absolute max-h-[calc(100vh-1rem)] w-[min(20rem,calc(100vw-1rem))] overflow-auto rounded-xl border border-border bg-card p-2 shadow-xl"
            style={{
              left: Math.min(cellMenu.x, typeof window !== "undefined" ? window.innerWidth - 340 : cellMenu.x),
              top: Math.min(cellMenu.y, typeof window !== "undefined" ? window.innerHeight - 320 : cellMenu.y),
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="px-2 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {formatMedium(cellMenu.iso)}
            </p>

            {(() => {
              const person = peopleById.get(cellMenu.personId);
              const here = person ? siteOnDay(person, cellMenu.iso) : null;
              const startsHere = moveOnDay?.(cellMenu.personId, cellMenu.iso) ?? null;
              const inStay = person ? Boolean(stintCovering(person, cellMenu.iso)) : false;
              if (!onMoveSite || !inStay) return null;
              return (
                <div className="mb-1 border-b border-border px-2 pb-2">
                  {startsHere ? (
                    <div className="mb-2 space-y-1">
                      <p className="text-sm font-semibold">
                        Site transfer {startsHere.fromSite} → {startsHere.toSite} today
                      </p>
                      <div className="flex gap-1.5">
                        {onBookMove ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="h-8 flex-1 rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                            onClick={() => {
                              onBookMove(cellMenu.personId, cellMenu.iso);
                              closeCellMenu();
                            }}
                          >
                            Book the travel
                          </button>
                        ) : null}
                        <button
                          type="button"
                          role="menuitem"
                          className="h-8 flex-1 rounded-lg border border-input px-2 text-xs font-medium hover:bg-muted"
                          onClick={() => {
                            onMoveSite(cellMenu.personId, cellMenu.iso, null);
                            closeCellMenu();
                            showFlash("Site transfer removed");
                          }}
                        >
                          Undo transfer
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <p className="pb-1 text-xs text-muted-foreground">Transfer to another site from this day</p>
                  <div className="flex flex-wrap gap-1.5">
                    {siteList
                      .filter((row) => row.code !== here)
                      .map((row) => (
                        <button
                          key={row.code}
                          type="button"
                          role="menuitem"
                          className={cn(
                            "h-8 rounded-lg px-2.5 text-xs font-bold text-white shadow-sm hover:opacity-90",
                            siteTone(row.code, siteList),
                          )}
                          onClick={() => {
                            onMoveSite(cellMenu.personId, cellMenu.iso, row.code);
                            closeCellMenu();
                            showFlash(`${here || "Away"} → ${row.code} from ${formatMedium(cellMenu.iso)}`);
                          }}
                        >
                          {row.code}
                        </button>
                      ))}
                  </div>
                </div>
              );
            })()}

            {cellMenu.hasSite ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-amber-50"
                  onClick={() => {
                    addReturnWindowAt(cellMenu.personId, cellMenu.iso);
                    closeCellMenu();
                  }}
              >
                Return window (this day → OUT)
              </button>
            ) : null}

            {menuHasReturn ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-muted"
                onClick={() => {
                  onSetBookWindow(cellMenu.personId, (current) => ({
                    ...current,
                    returnBookFrom: null,
                    returnBookTo: null,
                    returnWindowPainted: false,
                    returnFlight:
                      current.returnFlight === "booked" || current.returnFlight === "confirmed"
                        ? current.returnFlight
                        : "not_started",
                  }));
                  closeCellMenu();
                  showFlash("Cleared return window");
                }}
              >
                Clear return window
              </button>
            ) : null}

            {cellMenu.hasSite && onExtendStay ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-muted"
                onClick={() => {
                  const person = peopleById.get(cellMenu.personId);
                  const stint = person ? stintCovering(person, cellMenu.iso) : null;
                  if (stint) {
                    // Inclusive click day becomes last day on site → exclusive out = next day.
                    onExtendStay(cellMenu.personId, stint.from, addDays(cellMenu.iso, 1));
                    showFlash(`Ended stay · ${formatMedium(cellMenu.iso)}`);
                  }
                  closeCellMenu();
                }}
              >
                End stay on this day
              </button>
            ) : null}

            {cellMenu.hasSite && onClearStayBooking ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm font-medium text-rose-800 hover:bg-rose-50"
                onClick={() => {
                  const person = peopleById.get(cellMenu.personId);
                  const stint = person ? stintCovering(person, cellMenu.iso) : null;
                  if (stint) {
                    const ok = window.confirm(
                      `Clear booking for ${person?.name || "this stay"}?\nFlights, hotels and travel stopovers for this stay will be removed.`,
                    );
                    if (!ok) return;
                    onClearStayBooking(cellMenu.personId, stint.from, stint.out);
                    showFlash("Cleared booking · flights, hotels & travel");
                  }
                  closeCellMenu();
                }}
              >
                Clear booking
              </button>
            ) : null}

            {cellMenu.plan && onRemoveRotation ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm font-medium text-rose-800 hover:bg-rose-50"
                onClick={() => {
                  clearSelectedPlacement();
                }}
              >
                Clear placement
              </button>
            ) : null}

            {onSetDateNote
              ? (() => {
                  const menuStay = stayUnderCellMenu();
                  const canWholeStay = Boolean(menuStay && (onSetStayNote || onSetRotationNote));
                  if (dateNoteDraft) {
                    return (
                      <DateNoteEditor
                        draft={dateNoteDraft}
                        onChange={setDateNoteDraft}
                        onCancel={() => setDateNoteDraft(null)}
                        stayRange={
                          canWholeStay && menuStay ? { from: menuStay.from, last: menuStay.last } : null
                        }
                        onSave={() => {
                          const trimmed = dateNoteDraft.note.trim();
                          if (dateNoteDraft.wholeStay && menuStay) {
                            saveWholeStayNote(trimmed, menuStay);
                            // A note that was on some dates and is now for the whole stay: move it.
                            if (dateNoteDraft.id) {
                              onSetDateNote({ ...dateNoteDraft, note: "", personId: cellMenu.personId });
                            }
                            setDateNoteDraft(null);
                            closeCellMenu();
                            return;
                          }
                          if (dateNoteDraft.wasWholeStay && menuStay) saveWholeStayNote("", menuStay);
                          onSetDateNote({ ...dateNoteDraft, personId: cellMenu.personId });
                          showFlash(
                            trimmed
                              ? `Note saved · ${formatMedium(dateNoteDraft.from)}${dateNoteDraft.to !== dateNoteDraft.from ? ` to ${formatMedium(dateNoteDraft.to)}` : ""}`
                              : "Note removed",
                          );
                          setDateNoteDraft(null);
                          closeCellMenu();
                        }}
                        onRemove={
                          dateNoteDraft.wasWholeStay
                            ? () => {
                                if (menuStay) saveWholeStayNote("", menuStay);
                                setDateNoteDraft(null);
                                closeCellMenu();
                              }
                            : dateNoteDraft.id
                              ? () => {
                                  onSetDateNote({
                                    ...dateNoteDraft,
                                    note: "",
                                    personId: cellMenu.personId,
                                  });
                                  showFlash("Note removed");
                                  setDateNoteDraft(null);
                                  closeCellMenu();
                                }
                              : undefined
                        }
                      />
                    );
                  }
                  const stayNoteText = menuStay?.note || "";
                  return (
                    <>
                      {menuStay && stayNoteText ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-muted"
                          onClick={() =>
                            setDateNoteDraft({
                              from: menuStay.from,
                              to: menuStay.last,
                              note: stayNoteText,
                              wholeStay: true,
                              wasWholeStay: true,
                            })
                          }
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full bg-stone-900" />
                          <span className="min-w-0 truncate">Edit note · {stayNoteText}</span>
                        </button>
                      ) : null}
                      {dateNotesOn(roster, cellMenu.personId, cellMenu.iso).map((row: DateNote) => (
                        <button
                          key={row.id}
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-muted"
                          onClick={() =>
                            setDateNoteDraft({ id: row.id, from: row.from, to: row.to, note: row.note })
                          }
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full bg-stone-400" />
                          <span className="min-w-0 truncate">Edit note · {row.note}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-muted"
                        onClick={() => {
                          // On a stay, default to whole-stay so notes span (not a 1-day scrap).
                          if (canWholeStay && menuStay) {
                            setDateNoteDraft({
                              from: menuStay.from,
                              to: menuStay.last,
                              note: "",
                              wholeStay: true,
                            });
                            return;
                          }
                          setDateNoteDraft({ from: cellMenu.iso, to: cellMenu.iso, note: "" });
                        }}
                      >
                        Add note
                      </button>
                    </>
                  );
                })()
              : null}

            {onApplyJourney &&
            stopoverBook &&
            stopoverOnDay(stopoverBook, cellMenu.personId, cellMenu.iso) ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm font-medium hover:bg-sky-50"
                onClick={() => {
                  openTravelEditor(cellMenu.personId, cellMenu.iso);
                  closeCellMenu();
                }}
              >
                Edit travel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {journeyPlanner && onApplyJourney ? (
        <CrewJourneyPlanner
          personName={journeyPlanner.personName}
          person={peopleById.get(journeyPlanner.personId)}
          initialDate={journeyPlanner.iso}
          initialEndDate={journeyPlanner.endIso}
          initialTo={journeyPlanner.to || journeyPlanner.site || undefined}
          initialFrom={journeyPlanner.from}
          initialDirection={journeyPlanner.direction}
          initialStops={journeyPlanner.stops}
          initialOvernight={journeyPlanner.overnight}
          initialOvernightHub={journeyPlanner.overnightHub}
          initialNotes={journeyPlanner.notes}
          bookingId={journeyPlanner.bookingId}
          onClose={() => setJourneyPlanner(null)}
          onApply={(plan) => {
            onApplyJourney(journeyPlanner.personId, plan);
            showFlash(`${plan.pathLabel} · ${formatMedium(plan.startDate)}`);
            setJourneyPlanner(null);
          }}
          onDelete={
            journeyPlanner.bookingId && onDeleteJourney
              ? () => {
                  onDeleteJourney(journeyPlanner.personId, journeyPlanner.bookingId!);
                  showFlash("Travel removed");
                  setJourneyPlanner(null);
                }
              : undefined
          }
        />
      ) : null}

      {canEdit && draft && draftDays != null && dragTip ? (
        <div
          className={cn(
            "pointer-events-none fixed z-50 rounded-xl px-3 py-2 text-white shadow-xl ring-1 ring-black/10",
            draftDays > STANDARD_ROTATION_DAYS ? "bg-amber-600" : "bg-stone-900",
          )}
          style={{
            left:
              typeof window !== "undefined" && dragTip.x + 240 > window.innerWidth
                ? Math.max(8, dragTip.x - 236)
                : dragTip.x + 16,
            top: Math.max(8, dragTip.y - 84),
          }}
        >
          <p className="text-lg font-bold leading-none tabular-nums">
            {draftDays}
            <span className="text-sm font-semibold opacity-80"> / {STANDARD_ROTATION_DAYS} days</span>
          </p>
          <p className="mt-1 text-[11px] font-medium opacity-85">
            {draftDays > STANDARD_ROTATION_DAYS
              ? `${draftDays - STANDARD_ROTATION_DAYS} day${draftDays - STANDARD_ROTATION_DAYS === 1 ? "" : "s"} past 6 weeks`
              : draftDays === STANDARD_ROTATION_DAYS
                ? "Full 6 weeks"
                : `${STANDARD_ROTATION_DAYS - draftDays} day${STANDARD_ROTATION_DAYS - draftDays === 1 ? "" : "s"} short of 6 weeks`}
            {" · OUT "}
            {formatMedium(orderedRange(draft.start, draft.end).to)}
          </p>
        </div>
      ) : null}
      {travelHover && !cellMenu ? (
        <div
          className="pointer-events-none fixed z-40 max-w-xs rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg"
          style={{
            left: Math.min(travelHover.x + 12, typeof window !== "undefined" ? window.innerWidth - 280 : travelHover.x),
            top: Math.min(travelHover.y + 12, typeof window !== "undefined" ? window.innerHeight - 80 : travelHover.y),
          }}
        >
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Journey</p>
          <p className="mt-0.5 font-medium leading-snug text-foreground">{travelHover.plan}</p>
        </div>
      ) : null}
    </section>
  );
});

export function monthStartFromIso(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function shiftMonth(monthStart: string, delta: number) {
  const [y, m] = monthStart.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1 + delta, 1);
  return toISODate(date).slice(0, 7) + "-01";
}

/** From / To / text for a note on dates you pick (inside the right-click menu). */
type DateNoteDraft = {
  id?: string;
  from: string;
  to: string;
  note: string;
  /** Ticked: the note covers the whole stay instead of the dates. */
  wholeStay?: boolean;
  /** Opened from the existing whole-stay note. */
  wasWholeStay?: boolean;
};

function DateNoteEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  onRemove,
  stayRange,
}: {
  draft: DateNoteDraft;
  onChange: (next: DateNoteDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onRemove?: () => void;
  /** The stay under this day, when there is one (enables the "Whole stay" box). */
  stayRange: { from: string; last: string } | null;
}) {
  const whole = Boolean(stayRange && draft.wholeStay);
  const days = whole && stayRange ? daysBetween(stayRange.from, stayRange.last) + 1 : Math.abs(daysBetween(draft.from, draft.to)) + 1;
  return (
    <div className="mt-1 grid gap-2 border-t border-border px-2 pt-2">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {draft.id || draft.wasWholeStay ? "Edit note" : "Add note"}
      </span>
      {stayRange ? (
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={whole}
            onChange={(event) => onChange({ ...draft, wholeStay: event.target.checked })}
            className="h-4 w-4 accent-stone-900"
          />
          Whole stay
          <span className="text-xs font-normal text-muted-foreground">
            {formatMedium(stayRange.from)} to {formatMedium(stayRange.last)}
          </span>
        </label>
      ) : null}
      {whole ? null : (
      <div className="grid grid-cols-2 gap-1.5">
        <label className="grid gap-0.5 text-[11px] font-medium text-muted-foreground">
          From
          <input
            type="date"
            value={draft.from}
            onChange={(event) => {
              const from = event.target.value;
              if (!from) return;
              onChange({ ...draft, from, to: draft.to < from ? from : draft.to });
            }}
            className="h-8 rounded-lg border border-input px-1.5 text-xs text-foreground"
          />
        </label>
        <label className="grid gap-0.5 text-[11px] font-medium text-muted-foreground">
          To
          <input
            type="date"
            value={draft.to}
            min={draft.from}
            onChange={(event) => {
              const to = event.target.value;
              if (!to) return;
              onChange({ ...draft, to: to < draft.from ? draft.from : to });
            }}
            className="h-8 rounded-lg border border-input px-1.5 text-xs text-foreground"
          />
        </label>
      </div>
      )}
      <label className="grid gap-1">
        <input
          value={draft.note}
          onChange={(event) => onChange({ ...draft, note: event.target.value.slice(0, MAX_STAY_NOTE_CHARS) })}
          placeholder="e.g. Lingering for snow"
          maxLength={MAX_STAY_NOTE_CHARS}
          spellCheck
          autoCapitalize="sentences"
          lang="en"
          aria-label="Note"
          className="h-9 rounded-lg border border-input px-2 text-sm"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSave();
            }
          }}
        />
        <span className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>
            {days} day{days === 1 ? "" : "s"}
          </span>
          <span>
            {draft.note.length}/{MAX_STAY_NOTE_CHARS}
          </span>
        </span>
      </label>
      <div className="flex gap-1.5">
        <button
          type="button"
          className="h-8 flex-1 rounded-lg bg-stone-900 text-sm font-medium text-white disabled:opacity-40"
          disabled={!draft.note.trim()}
          title={whole ? "Shows across the whole stay" : "Shows on these dates only"}
          onClick={onSave}
        >
          Save note
        </button>
        {onRemove ? (
          <button
            type="button"
            className="h-8 rounded-lg border border-rose-200 px-2 text-sm font-medium text-rose-800 hover:bg-rose-50"
            onClick={onRemove}
          >
            Remove
          </button>
        ) : (
          <button type="button" className="h-8 rounded-lg border border-input px-2 text-sm font-medium hover:bg-muted" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
