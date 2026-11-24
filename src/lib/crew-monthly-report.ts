/** Assemble a full monthly who/what/where report from live books + activity log. */

import { activitiesForMonth, type CrewActivityLog } from "@/lib/crew-activity-log";
import type { FlightBook } from "@/lib/crew-flights";
import { activeBookingFor, flightIsArranged } from "@/lib/crew-flights";
import type { CrewOpsBook } from "@/lib/crew-ops";
import { opsFor } from "@/lib/crew-ops";
import type { CrewPerson } from "@/lib/crew-schedule";
import type { CrewStopoverBook } from "@/lib/crew-stopovers";
import { stopoverDatesFor, stopoverOnDay } from "@/lib/crew-stopovers";
import { formatJourneyNames, type TravelHub } from "@/lib/crew-travel-hubs";
import { addDays, dayCountLabel, formatMedium } from "@/lib/dates";

export type MonthlyReportLine = {
  id: string;
  sort: string;
  text: string;
  personId?: string;
};

export type MonthlyReport = {
  year: number;
  month: number;
  label: string;
  lines: MonthlyReportLine[];
};

function monthWindow(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const out = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { from, out, last: addDays(out, -1) };
}

function overlaps(aFrom: string, aTo: string, bFrom: string, bOut: string) {
  return aFrom < bOut && aTo >= bFrom;
}

export function buildMonthlyReport(input: {
  year: number;
  month: number;
  people: CrewPerson[];
  opsBook: CrewOpsBook;
  flightBook: FlightBook;
  stopoverBook: CrewStopoverBook;
  activityLog: CrewActivityLog;
  travelHubs?: TravelHub[];
}): MonthlyReport {
  const { year, month, people, opsBook, flightBook, stopoverBook, activityLog, travelHubs = [] } =
    input;
  const { from, last } = monthWindow(year, month);
  const label = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const lines: MonthlyReportLine[] = [];

  for (const person of people) {
    if (person.active === false) continue;
    const stints = person.stints ?? [];
    for (const stint of stints) {
      const stintLast = stint.out ? addDays(stint.out, -1) : last;
      if (!overlaps(from, last, stint.from, addDays(stintLast, 1))) continue;
      lines.push({
        id: `stay-${person.id}-${stint.from}`,
        sort: stint.from,
        personId: person.id,
        text: `${person.name} · on site ${stint.site}${stint.role ? ` as ${stint.role}` : ""} · ${formatMedium(stint.from)} – ${formatMedium(stintLast)}`,
      });
      if (stint.from >= from && stint.from <= last) {
        lines.push({
          id: `in-${person.id}-${stint.from}`,
          sort: stint.from,
          personId: person.id,
          text: `${person.name} · arrives ${stint.site} · ${formatMedium(stint.from)}`,
        });
      }
      if (stint.out && stint.out > from && addDays(stint.out, -1) <= last) {
        lines.push({
          id: `out-${person.id}-${stint.out}`,
          sort: addDays(stint.out, -1),
          personId: person.id,
          text: `${person.name} · leaves ${stint.site} · ${formatMedium(addDays(stint.out, -1))}`,
        });
      }
    }

    const stopDates = stopoverDatesFor(stopoverBook, person.id, year).filter(
      (iso) => iso >= from && iso <= last,
    );
    if (stopDates.length) {
      const hubs = [
        ...new Set(
          stopDates
            .map((iso) => stopoverOnDay(stopoverBook, person.id, iso))
            .filter((hub): hub is string => Boolean(hub)),
        ),
      ];
      lines.push({
        id: `stop-${person.id}-${from}`,
        sort: stopDates[0]!,
        personId: person.id,
        text: `${person.name} · stopovers ${hubs.join(", ")} · ${dayCountLabel(stopDates.length)} in ${label}`,
      });
    }

    const outbound = activeBookingFor(flightBook, person.id, "outbound");
    const inbound = activeBookingFor(flightBook, person.id, "return");
    if (outbound && flightIsArranged(outbound)) {
      const depart = outbound.segments[0]?.departDate || "";
      if (depart && depart >= from && depart <= last) {
        const path = formatJourneyNames(
          outbound.segments.flatMap((seg) => [seg.fromAirport, seg.toAirport]).filter(Boolean),
          travelHubs,
        );
        lines.push({
          id: `fly-out-${person.id}-${outbound.id}`,
          sort: depart,
          personId: person.id,
          text: `${person.name} · outbound flight${path ? ` · ${path}` : ""} · ${formatMedium(depart)}${outbound.pnr ? ` · ${outbound.pnr}` : ""}`,
        });
      }
    }
    if (inbound && flightIsArranged(inbound)) {
      const depart = inbound.segments[0]?.departDate || "";
      if (depart && depart >= from && depart <= last) {
        const path = formatJourneyNames(
          inbound.segments.flatMap((seg) => [seg.fromAirport, seg.toAirport]).filter(Boolean),
          travelHubs,
        );
        lines.push({
          id: `fly-ret-${person.id}-${inbound.id}`,
          sort: depart,
          personId: person.id,
          text: `${person.name} · return flight${path ? ` · ${path}` : ""} · ${formatMedium(depart)}${inbound.pnr ? ` · ${inbound.pnr}` : ""}`,
        });
      }
    }

    const ops = opsFor(opsBook, person.id);
    if (ops.accommodation === "booked" || ops.accommodation === "confirmed") {
      lines.push({
        id: `acc-${person.id}`,
        sort: from,
        personId: person.id,
        text: `${person.name} · accommodation ${ops.accommodation}${ops.accommodationNotes ? ` · ${ops.accommodationNotes}` : ""}`,
      });
    }

    for (const flight of person.flights ?? []) {
      if (flight.arriveIqa && flight.arriveIqa >= from && flight.arriveIqa <= last) {
        lines.push({
          id: `sheet-in-${person.id}-${flight.arriveIqa}`,
          sort: flight.arriveIqa,
          personId: person.id,
          text: `${person.name} · sheet inbound · ${formatMedium(flight.arriveIqa)}${flight.arriveRef ? ` · ${flight.arriveRef}` : ""}`,
        });
      }
      if (flight.departIqa && flight.departIqa >= from && flight.departIqa <= last) {
        lines.push({
          id: `sheet-out-${person.id}-${flight.departIqa}`,
          sort: flight.departIqa,
          personId: person.id,
          text: `${person.name} · sheet outbound · ${formatMedium(flight.departIqa)}${flight.departRef ? ` · ${flight.departRef}` : ""}`,
        });
      }
    }
  }

  for (const act of activitiesForMonth(activityLog, year, month)) {
    lines.push({
      id: `act-${act.id}`,
      sort: act.at.slice(0, 10),
      personId: act.personId,
      text: `${formatMedium(act.at.slice(0, 10))} · ${act.text}`,
    });
  }

  lines.sort((a, b) => a.sort.localeCompare(b.sort) || a.text.localeCompare(b.text));
  return { year, month, label, lines };
}
