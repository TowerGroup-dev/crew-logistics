/**
 * Reports: one place that turns the schedule, rotations, flights and planning log
 * into (a) tidy tables for Power BI / Excel and (b) month or year analytics for the
 * Reports page. Everything is keyed by PersonId so the tables join cleanly.
 */

import type { CrewActivityLog } from "@/lib/crew-activity-log";
import type { FlightBook } from "@/lib/crew-flights";
import { crewCategoryFor, normalizeRole, type CrewPerson } from "@/lib/crew-schedule";
import type { CrewRotation, RotationBook, RotationTravel } from "@/lib/crew-rotations";
import { roleOnDay, siteOnDay } from "@/lib/crew-site-days";
import { worksiteFromMark } from "@/lib/crew-sites";
import { formatJourneyNames, type TravelHub } from "@/lib/crew-travel-hubs";
import { addDays, daysBetween } from "@/lib/dates";

export type BookingStatus = "Confirmed" | "Booked" | "Not booked" | "No record";

/* ---------------------------------------------------------------- tables */

export type PersonRow = {
  PersonId: string;
  Name: string;
  HomeRole: string;
  Category: string;
  Status: "Active" | "Inactive";
  HomeSites: string;
  DaysOnSiteInYear: number;
};

export type StayRow = {
  StayId: string;
  PersonId: string;
  Name: string;
  Role: string;
  Site: string;
  FirstDay: string;
  LastDay: string;
  Days: number;
  OpenEnded: boolean;
  Source: "Schedule" | "Added in app";
  Note: string;
};

export type DailyRow = {
  Date: string;
  PersonId: string;
  Name: string;
  Role: string;
  Category: string;
  Site: string;
};

export type FlightRow = {
  FlightId: string;
  PersonId: string;
  Name: string;
  Direction: "To site" | "Home";
  Status: string;
  Source: "Booking" | "Schedule sheet";
  Airline: string;
  PNR: string;
  TicketNumber: string;
  DepartDate: string;
  ArriveDate: string;
  FromAirport: string;
  ToAirport: string;
  Route: string;
  Legs: number;
  BookedOn: string;
  EnteredBy: string;
  Reference: string;
};

export type RotationRow = {
  RotationId: string;
  PersonId: string;
  Name: string;
  Role: string;
  Site: string;
  PlannedIn: string;
  PlannedLastDay: string;
  PlannedDays: number;
  ActualIn: string;
  ActualOut: string;
  FlightToSite: BookingStatus;
  FlightHome: BookingStatus;
  Room: BookingStatus;
  ReplacedBy: string;
  Replaces: string;
};

export type ActivityRow = {
  ActivityId: string;
  Timestamp: string;
  Date: string;
  Kind: string;
  PersonId: string;
  Name: string;
  Detail: string;
};

export type ReportTables = {
  year: number;
  people: PersonRow[];
  stays: StayRow[];
  daily: DailyRow[];
  flights: FlightRow[];
  rotations: RotationRow[];
  activity: ActivityRow[];
};

export type ReportInput = {
  year: number;
  people: CrewPerson[];
  flightBook: FlightBook;
  rotationBook: RotationBook;
  activityLog: CrewActivityLog;
  travelHubs?: TravelHub[];
};

export function yearDays(year: number) {
  const days: string[] = [];
  for (let d = `${year}-01-01`; d <= `${year}-12-31`; d = addDays(d, 1)) days.push(d);
  return days;
}

export function travelStatus(travel: RotationTravel | undefined): BookingStatus {
  if (!travel) return "No record";
  if (travel.confirmed) return "Confirmed";
  if (travel.pnr.trim()) return "Booked";
  return "Not booked";
}

export function roomStatus(rotation: CrewRotation | undefined): BookingStatus {
  if (!rotation) return "No record";
  if (rotation.stay.confirmed) return "Confirmed";
  if (rotation.stay.room.trim() || rotation.stay.notes.trim()) return "Booked";
  return "Not booked";
}

function homeRole(person: CrewPerson) {
  return normalizeRole(person.role || "Crew");
}

function stintSite(stint: { site: string; sites: string[] }) {
  return worksiteFromMark(stint.site) || stint.sites.map(worksiteFromMark).find(Boolean) || stint.site || "";
}

function flightStatusLabel(status: string) {
  switch (status) {
    case "pending_booking":
      return "Pending";
    case "booked":
      return "Booked";
    case "confirmed":
      return "Confirmed";
    case "changed":
      return "Changed";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Flown";
    default:
      return status;
  }
}

/** Everything as flat tables for one schedule year. */
export function buildReportTables(input: ReportInput): ReportTables {
  const { year, people, flightBook, rotationBook, activityLog, travelHubs } = input;
  const days = yearDays(year);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const nameOf = new Map(people.map((person) => [person.id, person.name]));

  const daily: DailyRow[] = [];
  const daysByPerson = new Map<string, number>();
  for (const person of people) {
    const category = crewCategoryFor(person);
    const role = homeRole(person);
    let count = 0;
    for (const iso of days) {
      const site = siteOnDay(person, iso);
      if (!site) continue;
      count += 1;
      daily.push({
        Date: iso,
        PersonId: person.id,
        Name: person.name,
        Role: normalizeRole(roleOnDay(person, iso) || role),
        Category: category,
        Site: site,
      });
    }
    daysByPerson.set(person.id, count);
  }

  daily.sort((a, b) => a.Date.localeCompare(b.Date) || a.Name.localeCompare(b.Name));

  const peopleRows: PersonRow[] = people.map((person) => ({
    PersonId: person.id,
    Name: person.name,
    HomeRole: homeRole(person),
    Category: crewCategoryFor(person),
    Status: person.active === false ? "Inactive" : "Active",
    HomeSites: (person.homeSites || []).join(" "),
    DaysOnSiteInYear: daysByPerson.get(person.id) ?? 0,
  }));

  const stays: StayRow[] = [];
  for (const person of people) {
    for (const stint of person.stints || []) {
      const lastDayRaw = stint.out ? addDays(stint.out, -1) : last;
      if (lastDayRaw < first || stint.from > last) continue;
      const firstDay = stint.from < first ? first : stint.from;
      const lastDay = lastDayRaw > last ? last : lastDayRaw;
      if (lastDay < firstDay) continue;
      const appAdded = /Added in app/.test(stint.note || "") || stint.arrival === "app";
      stays.push({
        StayId: `${person.id}|${stint.from}`,
        PersonId: person.id,
        Name: person.name,
        Role: normalizeRole(stint.role || homeRole(person)),
        Site: stintSite(stint),
        FirstDay: firstDay,
        LastDay: lastDay,
        Days: daysBetween(firstDay, lastDay) + 1,
        OpenEnded: !stint.out,
        Source: appAdded ? "Added in app" : "Schedule",
        Note: (stint.note || "").replace(/\s*·?\s*Added in app(?: · [^·]+)?$/, "").trim(),
      });
    }
  }
  stays.sort((a, b) => a.FirstDay.localeCompare(b.FirstDay) || a.Name.localeCompare(b.Name));

  const flights: FlightRow[] = [];
  for (const booking of flightBook.bookings) {
    const segments = booking.segments.filter((seg) => seg.fromAirport || seg.toAirport || seg.departDate);
    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];
    const depart = firstSeg?.departDate || booking.rotationDate || "";
    if (depart && depart.slice(0, 4) !== String(year)) continue;
    const airports = segments.flatMap((seg) => [seg.fromAirport, seg.toAirport]).filter(Boolean);
    flights.push({
      FlightId: booking.id,
      PersonId: booking.personId,
      Name: nameOf.get(booking.personId) || booking.personId,
      Direction: booking.direction === "outbound" ? "To site" : "Home",
      Status: flightStatusLabel(booking.status),
      Source: "Booking",
      Airline: booking.airline,
      PNR: booking.pnr,
      TicketNumber: booking.ticketNumber,
      DepartDate: depart,
      ArriveDate: lastSeg?.arriveDate || "",
      FromAirport: firstSeg?.fromAirport || "",
      ToAirport: lastSeg?.toAirport || "",
      Route: airports.length ? formatJourneyNames(airports, travelHubs) : "",
      Legs: segments.length,
      BookedOn: booking.bookedOn || "",
      EnteredBy: booking.enteredBy,
      Reference: "",
    });
  }
  for (const person of people) {
    (person.flights || []).forEach((flight, index) => {
      if (flight.arriveIqa && flight.arriveIqa.startsWith(String(year))) {
        flights.push({
          FlightId: `sheet|${person.id}|in|${index}`,
          PersonId: person.id,
          Name: person.name,
          Direction: "To site",
          Status: "From schedule",
          Source: "Schedule sheet",
          Airline: "",
          PNR: "",
          TicketNumber: "",
          DepartDate: "",
          ArriveDate: flight.arriveIqa,
          FromAirport: "",
          ToAirport: "YFB",
          Route: "",
          Legs: 0,
          BookedOn: "",
          EnteredBy: "",
          Reference: flight.arriveRef || "",
        });
      }
      if (flight.departIqa && flight.departIqa.startsWith(String(year))) {
        flights.push({
          FlightId: `sheet|${person.id}|out|${index}`,
          PersonId: person.id,
          Name: person.name,
          Direction: "Home",
          Status: "From schedule",
          Source: "Schedule sheet",
          Airline: "",
          PNR: "",
          TicketNumber: "",
          DepartDate: flight.departIqa,
          ArriveDate: "",
          FromAirport: "YFB",
          ToAirport: "",
          Route: "",
          Legs: 0,
          BookedOn: "",
          EnteredBy: "",
          Reference: flight.departRef || "",
        });
      }
    });
  }
  flights.sort((a, b) => (a.DepartDate || a.ArriveDate).localeCompare(b.DepartDate || b.ArriveDate));

  const rotationById = new Map(rotationBook.rotations.map((rotation) => [rotation.id, rotation]));
  const rotations: RotationRow[] = rotationBook.rotations
    .filter((rotation) => nameOf.has(rotation.personId))
    .filter((rotation) => rotation.plannedIn <= last && addDays(rotation.plannedOut, -1) >= first)
    .map((rotation) => {
      const lastDay = addDays(rotation.plannedOut, -1);
      const next = rotation.replacedByRotationId ? rotationById.get(rotation.replacedByRotationId) : null;
      const prev = rotation.replacesRotationId ? rotationById.get(rotation.replacesRotationId) : null;
      return {
        RotationId: rotation.id,
        PersonId: rotation.personId,
        Name: nameOf.get(rotation.personId) || rotation.personId,
        Role: normalizeRole(rotation.role),
        Site: worksiteFromMark(rotation.site) || rotation.site,
        PlannedIn: rotation.plannedIn,
        PlannedLastDay: lastDay,
        PlannedDays: daysBetween(rotation.plannedIn, lastDay) + 1,
        ActualIn: rotation.actualIn || "",
        ActualOut: rotation.actualOut || "",
        FlightToSite: travelStatus(rotation.outbound),
        FlightHome: travelStatus(rotation.returnTravel),
        Room: roomStatus(rotation),
        ReplacedBy: next ? nameOf.get(next.personId) || next.personId : "",
        Replaces: prev ? nameOf.get(prev.personId) || prev.personId : "",
      };
    })
    .sort((a, b) => a.PlannedIn.localeCompare(b.PlannedIn) || a.Name.localeCompare(b.Name));

  const activity: ActivityRow[] = activityLog.entries
    .filter((entry) => entry.at.startsWith(String(year)) || entry.year === year)
    .map((entry) => ({
      ActivityId: entry.id,
      Timestamp: entry.at,
      Date: entry.at.slice(0, 10),
      Kind: entry.kind.replace(/_/g, " "),
      PersonId: entry.personId || "",
      Name: entry.personName || (entry.personId ? nameOf.get(entry.personId) || "" : ""),
      Detail: entry.text,
    }))
    .sort((a, b) => b.Timestamp.localeCompare(a.Timestamp));

  return { year, people: peopleRows, stays, daily, flights, rotations, activity };
}

/* ------------------------------------------------------------- analytics */

export type ReportPeriod = { year: number; month: number | null };

export type PeriodSummary = {
  label: string;
  from: string;
  last: string;
  days: string[];
  /** Total people on site per day (index matches `days`). */
  headcount: number[];
  /** Per-site headcount per day. */
  headcountBySite: Record<string, number[]>;
  sites: string[];
  personDays: number;
  averageHeadcount: number;
  peak: { count: number; date: string };
  low: { count: number; date: string };
  peopleOnSite: number;
  bySite: { site: string; personDays: number; people: number; peak: number; share: number }[];
  byRole: { role: string; personDays: number; people: number }[];
  byCategory: { category: string; personDays: number; people: number }[];
  crew: {
    personId: string;
    name: string;
    role: string;
    category: string;
    sites: string;
    daysOnSite: number;
    firstDay: string;
    lastDay: string;
    flightToSite: BookingStatus;
    flightHome: BookingStatus;
    room: BookingStatus;
    rotationId: string | null;
  }[];
  arrivals: { personId: string; name: string; site: string; date: string; flight: BookingStatus; room: BookingStatus; rotationId: string | null }[];
  departures: { personId: string; name: string; site: string; date: string; flight: BookingStatus; replacement: string; rotationId: string | null }[];
  openItems: { personId: string; name: string; item: string; date: string; rotationId: string | null }[];
  activity: ActivityRow[];
  flightsInPeriod: FlightRow[];
  /** Month-by-month rows (only for a full-year period). */
  byMonth: {
    month: number;
    label: string;
    personDays: number;
    averageHeadcount: number;
    peak: number;
    people: number;
    arrivals: number;
    departures: number;
  }[];
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function periodLabel(period: ReportPeriod) {
  return period.month ? `${MONTHS[period.month - 1]} ${period.year}` : `${period.year} (full year)`;
}

function rotationStarting(book: RotationBook, personId: string, from: string) {
  return (
    book.rotations.find((rotation) => rotation.personId === personId && rotation.plannedIn === from) ||
    book.rotations.find(
      (rotation) => rotation.personId === personId && rotation.plannedIn <= from && from < rotation.plannedOut,
    ) ||
    null
  );
}

export function summarisePeriod(
  tables: ReportTables,
  period: ReportPeriod,
  rotationBook: RotationBook,
  siteOrder: string[] = [],
): PeriodSummary {
  const all = yearDays(period.year);
  const days = period.month
    ? all.filter((iso) => Number(iso.slice(5, 7)) === period.month)
    : all;
  const from = days[0]!;
  const last = days[days.length - 1]!;
  const index = new Map(days.map((iso, i) => [iso, i]));
  const inPeriod = (iso: string) => Boolean(iso) && iso >= from && iso <= last;

  const daily = tables.daily.filter((row) => index.has(row.Date));
  const siteSet = new Set(daily.map((row) => row.Site));
  const sites = [
    ...siteOrder.filter((code) => siteSet.has(code)),
    ...[...siteSet].filter((code) => !siteOrder.includes(code)).sort(),
  ];

  const headcount = new Array<number>(days.length).fill(0);
  const headcountBySite: Record<string, number[]> = {};
  for (const site of sites) headcountBySite[site] = new Array<number>(days.length).fill(0);
  const personSites = new Map<string, Set<string>>();
  const personDays = new Map<string, number>();
  const personFirst = new Map<string, string>();
  const personLast = new Map<string, string>();
  const roleAgg = new Map<string, { personDays: number; people: Set<string> }>();
  const categoryAgg = new Map<string, { personDays: number; people: Set<string> }>();
  const siteAgg = new Map<string, { personDays: number; people: Set<string> }>();

  for (const row of daily) {
    const i = index.get(row.Date)!;
    headcount[i] += 1;
    headcountBySite[row.Site]![i] += 1;
    personDays.set(row.PersonId, (personDays.get(row.PersonId) ?? 0) + 1);
    if (!personSites.has(row.PersonId)) personSites.set(row.PersonId, new Set());
    personSites.get(row.PersonId)!.add(row.Site);
    if (!personFirst.has(row.PersonId) || row.Date < personFirst.get(row.PersonId)!) personFirst.set(row.PersonId, row.Date);
    if (!personLast.has(row.PersonId) || row.Date > personLast.get(row.PersonId)!) personLast.set(row.PersonId, row.Date);
    for (const [map, key] of [
      [roleAgg, row.Role],
      [categoryAgg, row.Category],
      [siteAgg, row.Site],
    ] as const) {
      const entry = map.get(key) ?? { personDays: 0, people: new Set<string>() };
      entry.personDays += 1;
      entry.people.add(row.PersonId);
      map.set(key, entry);
    }
  }

  const totalPersonDays = daily.length;
  let peak = { count: -1, date: from };
  let low = { count: Number.POSITIVE_INFINITY, date: from };
  headcount.forEach((count, i) => {
    if (count > peak.count) peak = { count, date: days[i]! };
    if (count < low.count) low = { count, date: days[i]! };
  });
  if (peak.count < 0) peak = { count: 0, date: from };
  if (!Number.isFinite(low.count)) low = { count: 0, date: from };

  const bySite = sites.map((site) => {
    const agg = siteAgg.get(site)!;
    return {
      site,
      personDays: agg.personDays,
      people: agg.people.size,
      peak: Math.max(...headcountBySite[site]!),
      share: totalPersonDays ? agg.personDays / totalPersonDays : 0,
    };
  });
  const byRole = [...roleAgg]
    .map(([role, agg]) => ({ role, personDays: agg.personDays, people: agg.people.size }))
    .sort((a, b) => b.personDays - a.personDays);
  const byCategory = [...categoryAgg]
    .map(([category, agg]) => ({ category, personDays: agg.personDays, people: agg.people.size }))
    .sort((a, b) => b.personDays - a.personDays);

  const peopleById = new Map(tables.people.map((row) => [row.PersonId, row]));
  const crew = [...personDays.keys()]
    .map((personId) => {
      const person = peopleById.get(personId)!;
      const firstDay = personFirst.get(personId)!;
      const rotation = rotationStarting(rotationBook, personId, firstDay);
      const roles = new Set(daily.filter((row) => row.PersonId === personId).map((row) => row.Role));
      return {
        personId,
        name: person?.Name || personId,
        role: [...roles].join(" / "),
        category: person?.Category || "",
        sites: [...(personSites.get(personId) ?? [])].join(", "),
        daysOnSite: personDays.get(personId) ?? 0,
        firstDay,
        lastDay: personLast.get(personId)!,
        flightToSite: travelStatus(rotation?.outbound),
        flightHome: travelStatus(rotation?.returnTravel),
        room: roomStatus(rotation ?? undefined),
        rotationId: rotation?.id ?? null,
      };
    })
    .sort((a, b) => b.daysOnSite - a.daysOnSite || a.name.localeCompare(b.name));

  // Movements come from stays: a real first day / last day inside the period.
  const yearEnd = `${period.year}-12-31`;
  const arrivals: PeriodSummary["arrivals"] = [];
  const departures: PeriodSummary["departures"] = [];
  for (const stay of tables.stays) {
    const startsHere = stay.StayId.split("|")[1] === stay.FirstDay;
    if (startsHere && inPeriod(stay.FirstDay)) {
      const rotation = rotationStarting(rotationBook, stay.PersonId, stay.FirstDay);
      arrivals.push({
        personId: stay.PersonId,
        name: stay.Name,
        site: stay.Site,
        date: stay.FirstDay,
        flight: travelStatus(rotation?.outbound),
        room: roomStatus(rotation ?? undefined),
        rotationId: rotation?.id ?? null,
      });
    }
    if (!stay.OpenEnded && inPeriod(stay.LastDay) && stay.LastDay <= yearEnd) {
      const rotation = rotationStarting(rotationBook, stay.PersonId, stay.StayId.split("|")[1]!);
      const next = rotation?.replacedByRotationId
        ? rotationBook.rotations.find((row) => row.id === rotation.replacedByRotationId)
        : null;
      departures.push({
        personId: stay.PersonId,
        name: stay.Name,
        site: stay.Site,
        date: stay.LastDay,
        flight: travelStatus(rotation?.returnTravel),
        replacement: next ? peopleById.get(next.personId)?.Name || next.personId : "",
        rotationId: rotation?.id ?? null,
      });
    }
  }
  arrivals.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  departures.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const openItems: PeriodSummary["openItems"] = [];
  for (const row of arrivals) {
    if (row.flight === "Not booked") openItems.push({ ...pick(row), item: `Flight to ${row.site} not booked`, date: row.date });
    if (row.room === "Not booked") openItems.push({ ...pick(row), item: `Room at ${row.site} not confirmed`, date: row.date });
  }
  for (const row of departures) {
    if (row.flight === "Not booked") openItems.push({ ...pick(row), item: "Flight home not booked", date: row.date });
  }
  openItems.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const byMonth: PeriodSummary["byMonth"] = [];
  if (!period.month) {
    for (let m = 1; m <= 12; m += 1) {
      const key = `${period.year}-${String(m).padStart(2, "0")}`;
      const idx = days.map((iso, i) => (iso.startsWith(key) ? i : -1)).filter((i) => i >= 0);
      const people = new Set(daily.filter((row) => row.Date.startsWith(key)).map((row) => row.PersonId));
      const total = idx.reduce((sum, i) => sum + headcount[i]!, 0);
      byMonth.push({
        month: m,
        label: MONTHS[m - 1]!,
        personDays: total,
        averageHeadcount: idx.length ? total / idx.length : 0,
        peak: idx.length ? Math.max(...idx.map((i) => headcount[i]!)) : 0,
        people: people.size,
        arrivals: arrivals.filter((row) => row.date.startsWith(key)).length,
        departures: departures.filter((row) => row.date.startsWith(key)).length,
      });
    }
  }

  const activity = tables.activity.filter((row) => inPeriod(row.Date));
  const flightsInPeriod = tables.flights.filter((row) => inPeriod(row.DepartDate || row.ArriveDate));

  return {
    label: periodLabel(period),
    from,
    last,
    days,
    headcount,
    headcountBySite,
    sites,
    personDays: totalPersonDays,
    averageHeadcount: days.length ? totalPersonDays / days.length : 0,
    peak,
    low,
    peopleOnSite: personDays.size,
    bySite,
    byRole,
    byCategory,
    crew,
    arrivals,
    departures,
    openItems,
    activity,
    flightsInPeriod,
    byMonth,
  };

  function pick(row: { personId: string; name: string; rotationId: string | null }) {
    return { personId: row.personId, name: row.name, rotationId: row.rotationId };
  }
}
