/**
 * Build Power BI report tables from the shared server store (not the browser).
 */

import { readActivityLog } from "@/lib/crew-activity-log";
import { readFlightBook } from "@/lib/crew-flights";
import {
  exportPowerBiTables,
  type PowerBiExportTable,
  type PowerBiTableSlug,
} from "@/lib/crew-powerbi-export";
import { buildReportTables, type ReportTables } from "@/lib/crew-report-data";
import { emptyRoster, mergePeople, readRoster } from "@/lib/crew-roster";
import {
  applyRotationMoves,
  dropAssumedFlights,
  mergeRotationBook,
  readRotationBook,
} from "@/lib/crew-rotations";
import { CREW_SCHEDULE } from "@/lib/crew-schedule";
import { readAll } from "@/lib/crew-store-server";
import { readTravelHubsBook } from "@/lib/crew-travel-hubs";

const POWERBI_KEYS = [
  "tower-arctic-crew-roster",
  "tower-arctic-crew-rotations-v1",
  "tower-arctic-crew-flights",
  "tower-arctic-crew-activity-log-v1",
  "tower-arctic-crew-travel-hubs-v1",
] as const;

export function powerBiKeyConfigured() {
  return Boolean(process.env.CREW_POWERBI_KEY?.trim());
}

/** True when request presents the matching CREW_POWERBI_KEY. */
export function authorizePowerBiRequest(request: Request) {
  const expected = process.env.CREW_POWERBI_KEY?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  return header === expected || key === expected;
}

export function resolvePowerBiYear(request: Request, fallback = CREW_SCHEDULE.year) {
  const raw = new URL(request.url).searchParams.get("year");
  const year = raw ? Number(raw) : fallback;
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return fallback;
  return Math.floor(year);
}

/** Same people + books the Reports page uses, loaded from disk. */
export async function loadPowerBiReportTables(year: number): Promise<ReportTables> {
  const docs = await readAll(POWERBI_KEYS);
  const roster = readRoster(docs["tower-arctic-crew-roster"]?.value ?? emptyRoster());
  const basePeople = mergePeople(CREW_SCHEDULE.people, roster);
  const storedRotations = readRotationBook(docs["tower-arctic-crew-rotations-v1"]?.value);
  const rotationBook = dropAssumedFlights(mergeRotationBook(basePeople, storedRotations));
  const people = applyRotationMoves(basePeople, rotationBook).filter(
    (person) => person.active !== false && !person.provisional,
  );
  const flightBook = readFlightBook(docs["tower-arctic-crew-flights"]?.value);
  const activityLog = readActivityLog(docs["tower-arctic-crew-activity-log-v1"]?.value);
  const travelHubs = readTravelHubsBook(docs["tower-arctic-crew-travel-hubs-v1"]?.value).hubs;

  return buildReportTables({
    year,
    people,
    flightBook,
    rotationBook,
    activityLog,
    travelHubs,
  });
}

export async function loadPowerBiExportTables(year: number): Promise<PowerBiExportTable[]> {
  return exportPowerBiTables(await loadPowerBiReportTables(year));
}

export async function loadPowerBiCsv(
  year: number,
  slug: PowerBiTableSlug,
): Promise<{ file: string; csv: string; rows: number } | null> {
  const tables = await loadPowerBiExportTables(year);
  const hit = tables.find((row) => row.slug === slug);
  if (!hit) return null;
  return { file: hit.file, csv: hit.csv(), rows: hit.rows };
}
