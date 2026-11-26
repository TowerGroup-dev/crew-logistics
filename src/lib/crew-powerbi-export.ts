/**
 * Shared Power BI / Excel CSV table builders.
 * Used by the Reports zip download and by GET /api/powerbi.
 */

import { toCsv } from "@/lib/crew-export";
import type { ReportTables } from "@/lib/crew-report-data";

export type PowerBiExportTable = {
  /** Stable API slug: people, daily, stays, rotations, flights, activity */
  slug: string;
  file: string;
  title: string;
  description: string;
  rows: number;
  csv: () => string;
};

export const POWERBI_TABLE_SLUGS = [
  "people",
  "daily",
  "stays",
  "rotations",
  "flights",
  "activity",
] as const;

export type PowerBiTableSlug = (typeof POWERBI_TABLE_SLUGS)[number];

export function isPowerBiTableSlug(value: string): value is PowerBiTableSlug {
  return (POWERBI_TABLE_SLUGS as readonly string[]).includes(value);
}

/** Normalize route param: "daily.csv" / "crew_daily_onsite_2026" → "daily". */
export function normalizePowerBiTableParam(raw: string): PowerBiTableSlug | null {
  const base = raw.trim().toLowerCase().replace(/\.csv$/i, "");
  if (isPowerBiTableSlug(base)) return base;
  const aliases: Record<string, PowerBiTableSlug> = {
    crew_people: "people",
    people: "people",
    crew_daily_onsite: "daily",
    daily_onsite: "daily",
    daily: "daily",
    crew_stays: "stays",
    stays: "stays",
    crew_rotations: "rotations",
    rotations: "rotations",
    crew_flights: "flights",
    flights: "flights",
    crew_activity: "activity",
    activity: "activity",
    planning_log: "activity",
  };
  const stripped = base.replace(/_\d{4}$/, "");
  return aliases[stripped] ?? aliases[base] ?? null;
}

export function exportPowerBiTables(tables: ReportTables): PowerBiExportTable[] {
  const y = tables.year;
  return [
    {
      slug: "people",
      file: `crew_people_${y}.csv`,
      title: "People",
      description:
        "One row per person: home role, hire type, status, days on site this year. PersonId is the key.",
      rows: tables.people.length,
      csv: () =>
        toCsv(tables.people, [
          { header: "PersonId", value: (r) => r.PersonId },
          { header: "Name", value: (r) => r.Name },
          { header: "HomeRole", value: (r) => r.HomeRole },
          { header: "Category", value: (r) => r.Category },
          { header: "Status", value: (r) => r.Status },
          { header: "HomeSites", value: (r) => r.HomeSites },
          { header: "DaysOnSiteInYear", value: (r) => r.DaysOnSiteInYear },
        ]),
    },
    {
      slug: "daily",
      file: `crew_daily_onsite_${y}.csv`,
      title: "Daily on site",
      description:
        "One row per person per day on site (Date, PersonId, Role, Site). Count rows for headcount; sum for person-days.",
      rows: tables.daily.length,
      csv: () =>
        toCsv(tables.daily, [
          { header: "Date", value: (r) => r.Date },
          { header: "PersonId", value: (r) => r.PersonId },
          { header: "Name", value: (r) => r.Name },
          { header: "Role", value: (r) => r.Role },
          { header: "Category", value: (r) => r.Category },
          { header: "Site", value: (r) => r.Site },
        ]),
    },
    {
      slug: "stays",
      file: `crew_stays_${y}.csv`,
      title: "Stays",
      description:
        "One row per stay: site, role, first and last day, length, whether it came from the sheet or the app.",
      rows: tables.stays.length,
      csv: () =>
        toCsv(tables.stays, [
          { header: "StayId", value: (r) => r.StayId },
          { header: "PersonId", value: (r) => r.PersonId },
          { header: "Name", value: (r) => r.Name },
          { header: "Role", value: (r) => r.Role },
          { header: "Site", value: (r) => r.Site },
          { header: "FirstDay", value: (r) => r.FirstDay },
          { header: "LastDay", value: (r) => r.LastDay },
          { header: "Days", value: (r) => r.Days },
          { header: "OpenEnded", value: (r) => r.OpenEnded },
          { header: "Source", value: (r) => r.Source },
          { header: "Note", value: (r) => r.Note },
        ]),
    },
    {
      slug: "rotations",
      file: `crew_rotations_${y}.csv`,
      title: "Rotations and bookings",
      description:
        "One row per rotation: planned and actual dates, flight to site, flight home, room, replacement.",
      rows: tables.rotations.length,
      csv: () =>
        toCsv(tables.rotations, [
          { header: "RotationId", value: (r) => r.RotationId },
          { header: "PersonId", value: (r) => r.PersonId },
          { header: "Name", value: (r) => r.Name },
          { header: "Role", value: (r) => r.Role },
          { header: "Site", value: (r) => r.Site },
          { header: "PlannedIn", value: (r) => r.PlannedIn },
          { header: "PlannedLastDay", value: (r) => r.PlannedLastDay },
          { header: "PlannedDays", value: (r) => r.PlannedDays },
          { header: "ActualIn", value: (r) => r.ActualIn },
          { header: "ActualOut", value: (r) => r.ActualOut },
          { header: "FlightToSite", value: (r) => r.FlightToSite },
          { header: "FlightHome", value: (r) => r.FlightHome },
          { header: "Room", value: (r) => r.Room },
          { header: "ReplacedBy", value: (r) => r.ReplacedBy },
          { header: "Replaces", value: (r) => r.Replaces },
        ]),
    },
    {
      slug: "flights",
      file: `crew_flights_${y}.csv`,
      title: "Flights",
      description: "Every flight booking and sheet flight: direction, route, PNR, status, dates.",
      rows: tables.flights.length,
      csv: () =>
        toCsv(tables.flights, [
          { header: "FlightId", value: (r) => r.FlightId },
          { header: "PersonId", value: (r) => r.PersonId },
          { header: "Name", value: (r) => r.Name },
          { header: "Direction", value: (r) => r.Direction },
          { header: "Status", value: (r) => r.Status },
          { header: "Source", value: (r) => r.Source },
          { header: "Airline", value: (r) => r.Airline },
          { header: "PNR", value: (r) => r.PNR },
          { header: "TicketNumber", value: (r) => r.TicketNumber },
          { header: "DepartDate", value: (r) => r.DepartDate },
          { header: "ArriveDate", value: (r) => r.ArriveDate },
          { header: "FromAirport", value: (r) => r.FromAirport },
          { header: "ToAirport", value: (r) => r.ToAirport },
          { header: "Route", value: (r) => r.Route },
          { header: "Legs", value: (r) => r.Legs },
          { header: "BookedOn", value: (r) => r.BookedOn },
          { header: "EnteredBy", value: (r) => r.EnteredBy },
          { header: "Reference", value: (r) => r.Reference },
        ]),
    },
    {
      slug: "activity",
      file: `crew_activity_${y}.csv`,
      title: "Planning log",
      description: "Every change logged in the app with its timestamp and person.",
      rows: tables.activity.length,
      csv: () =>
        toCsv(tables.activity, [
          { header: "ActivityId", value: (r) => r.ActivityId },
          { header: "Timestamp", value: (r) => r.Timestamp },
          { header: "Date", value: (r) => r.Date },
          { header: "Kind", value: (r) => r.Kind },
          { header: "PersonId", value: (r) => r.PersonId },
          { header: "Name", value: (r) => r.Name },
          { header: "Detail", value: (r) => r.Detail },
        ]),
    },
  ];
}

export function powerBiZipReadme(year: number) {
  return [
    `Crew Schedule data pack for ${year}`,
    `Exported ${new Date().toISOString()}`,
    "",
    "Tables (CSV, UTF-8, dates as YYYY-MM-DD):",
    "  crew_people           one row per person (key: PersonId)",
    "  crew_daily_onsite     one row per person per day on site",
    "  crew_stays            one row per stay",
    "  crew_rotations        one row per rotation, with flight and room status",
    "  crew_flights          one row per flight booking or sheet flight",
    "  crew_activity         planning log",
    "",
    "Power BI setup (once):",
    "  1. Unzip into a OneDrive or SharePoint folder, e.g. Crew Schedule/Power BI.",
    "  2. Power BI Desktop: Get data > Text/CSV, load each file (or SharePoint folder and filter by name).",
    "  3. Model view: link crew_people[PersonId] one-to-many to PersonId in every other table.",
    "  4. Add a date table and link it to crew_daily_onsite[Date].",
    "  5. Useful measures:",
    "       Person-days = COUNTROWS(crew_daily_onsite)",
    '       Headcount = DISTINCTCOUNT(crew_daily_onsite[PersonId])   (per day on a date axis)',
    '       Flights not booked = COUNTROWS(FILTER(crew_rotations, crew_rotations[FlightHome] = "Not booked"))',
    "",
    "Live API (no zip): set CREW_POWERBI_KEY, then Get data > Web with",
    `  https://<host>/api/powerbi/daily.csv?year=${year}&key=YOUR_KEY`,
    "  Repeat for people, stays, rotations, flights, activity. Refresh pulls current server data.",
    "",
    "To refresh a zip pack: export again, replace the files in the same folder (keep the file names), then Refresh in Power BI.",
    "",
  ].join("\r\n");
}
