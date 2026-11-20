/** Airports / stopovers on the way to camp, not rotation worksites. Editable in Settings. */

export type TravelHub = {
  /** Short form shown in Month cells / right-click boxes. */
  code: string;
  name: string;
};

export type CrewTravelHubsBook = {
  version: 1;
  hubs: TravelHub[];
};

const STORAGE_KEY = "tower-arctic-crew-travel-hubs-v1";

/**
 * Pass-through airports / hubs only, not the camp worksites (IQA, KUG, POND, ALRT).
 * Those stay in the site legend; these are places people connect through.
 */
export const DEFAULT_TRAVEL_HUBS: TravelHub[] = [
  { code: "YOW", name: "Ottawa" },
  { code: "YYZ", name: "Toronto" },
  { code: "YUL", name: "Montreal" },
  { code: "YVR", name: "Vancouver" },
  { code: "YEG", name: "Edmonton" },
  { code: "CAM", name: "Campbell" },
  { code: "YK", name: "Yellowknife" },
  { code: "YF", name: "Yellowknife" },
  { code: "YXP", name: "Pangnirtung" },
  { code: "YHZ", name: "Halifax" },
  { code: "YYT", name: "St Johns" },
  { code: "YDF", name: "Deer Lake" },
  { code: "YYC", name: "Calgary" },
  { code: "YRT", name: "Rankin Inlet" },
];

/** Main rotation worksites, never treat these as pass-through hub menu entries. */
export const WORK_SITE_CODES = new Set(["IQA", "KUG", "POND", "ALRT", "KU", "IQ"]);

/** @deprecated use DEFAULT_TRAVEL_HUBS or loadTravelHubs() */
export const TRAVEL_HUBS = DEFAULT_TRAVEL_HUBS;

/** Sheet aliases → canonical short code. */
const HUB_ALIASES: Record<string, string> = {
  YF: "YK",
  YXY: "YK",
  YZF: "YK",
  YMQ: "YUL",
};

export function emptyTravelHubsBook(): CrewTravelHubsBook {
  return { version: 1, hubs: [...DEFAULT_TRAVEL_HUBS] };
}

function readHub(raw: unknown): TravelHub | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{2,8}$/.test(code)) return null;
  let name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : code;
  // YUL was saved as "Dorval" before; the office calls it Montreal.
  if (code === "YUL" && name === "Dorval") name = "Montreal";
  return { code, name };
}

export function readTravelHubsBook(raw: unknown): CrewTravelHubsBook {
  if (!raw || typeof raw !== "object") return emptyTravelHubsBook();
  const hubs = Array.isArray((raw as CrewTravelHubsBook).hubs)
    ? (raw as CrewTravelHubsBook).hubs
        .map(readHub)
        .filter((item): item is TravelHub => Boolean(item) && !WORK_SITE_CODES.has(item!.code))
        // Drop old airport codes that duplicated camp city names (YCO/YFB/YIO).
        .filter((item) => !["YCO", "YFB", "YIO"].includes(item.code))
    : [];
  return hubs.length ? { version: 1, hubs } : emptyTravelHubsBook();
}

export function loadTravelHubs(): CrewTravelHubsBook {
  if (typeof window === "undefined") return emptyTravelHubsBook();
  try {
    return readTravelHubsBook(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return emptyTravelHubsBook();
  }
}

export function saveTravelHubs(book: CrewTravelHubsBook) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

export function upsertTravelHub(book: CrewTravelHubsBook, hub: TravelHub): CrewTravelHubsBook {
  const code = hub.code.trim().toUpperCase();
  const name = hub.name.trim() || code;
  if (!/^[A-Z0-9]{2,8}$/.test(code)) return book;
  if (WORK_SITE_CODES.has(code)) return book;
  const next = { code, name };
  const index = book.hubs.findIndex((row) => row.code === code);
  if (index < 0) return { ...book, hubs: [...book.hubs, next] };
  const hubs = [...book.hubs];
  hubs[index] = next;
  return { ...book, hubs };
}

export function removeTravelHub(book: CrewTravelHubsBook, code: string): CrewTravelHubsBook {
  const key = code.trim().toUpperCase();
  const hubs = book.hubs.filter((row) => row.code !== key);
  return hubs.length ? { ...book, hubs } : book;
}

export function normalizeHubCode(code: string) {
  const key = code.trim().toUpperCase();
  return HUB_ALIASES[key] || key;
}

function hubMap(hubs: TravelHub[]) {
  return new Map(hubs.map((hub) => [hub.code, hub]));
}

export function isTravelHubCode(code: string, hubs: TravelHub[] = DEFAULT_TRAVEL_HUBS) {
  const key = normalizeHubCode(code);
  const map = hubMap(hubs);
  return map.has(key) || map.has(code.trim().toUpperCase());
}

export function travelHubLabel(code: string, hubs: TravelHub[] = DEFAULT_TRAVEL_HUBS) {
  const key = normalizeHubCode(code);
  const map = hubMap(hubs);
  const hub = map.get(key) || map.get(code.trim().toUpperCase());
  return hub ? `${hub.code} · ${hub.name}` : code.toUpperCase();
}

/** Pass-through display name (Yellowknife, Ottawa, …). Worksite codes stay as codes. */
export function travelHubName(code: string, hubs: TravelHub[] = DEFAULT_TRAVEL_HUBS) {
  const key = normalizeHubCode(code.replace(/^via\s+/i, ""));
  if (WORK_SITE_CODES.has(key) || key === "KU" || key === "IQ") {
    // Connecting through a camp city, keep the short code so it doesn't look like a second worksite.
    return key === "KU" ? "KUG" : key === "IQ" ? "IQA" : key;
  }
  const map = hubMap(hubs);
  const hub = map.get(key) || map.get(code.trim().toUpperCase());
  return hub?.name || key || code;
}

/** Deduped airport / hub codes in journey order. */
export function journeyCodes(airports: string[]) {
  const cleaned = airports.map((code) => normalizeHubCode(code) || code.trim().toUpperCase()).filter(Boolean);
  const deduped: string[] = [];
  for (const code of cleaned) {
    if (deduped[deduped.length - 1] !== code) deduped.push(code);
  }
  return deduped;
}

const PASS_THROUGH_CAMP: Record<string, string> = {
  IQA: "IQA",
  IQ: "IQA",
  KUG: "KUG",
  KU: "KUG",
  POND: "POND",
  PND: "POND",
  PD: "POND",
  PN: "POND",
  ALRT: "ALRT",
  ALERT: "ALRT",
};

/**
 * Pass-through mark for a day (YK, YF, via IQA, …).
 * Worksite codes only count when the sheet marked them as connecting (`via …`),
 * so a real KUG stay stays a coloured worksite, not a stone “small Kug”.
 */
export function hubFromMark(mark: string | null | undefined, hubs: TravelHub[] = DEFAULT_TRAVEL_HUBS): string | null {
  if (!mark) return null;
  const via = /^via\s+/i.test(mark.trim());
  const cleaned = mark.replace(/^via\s+/i, "");
  for (const part of cleaned.split(/[/|,→>\-]+/)) {
    const raw = part.trim().toUpperCase();
    if (!raw || raw === "IN" || raw === "OUT" || raw === "TRANSFER" || raw === "TBC" || raw === "VIA") continue;
    if (isTravelHubCode(raw, hubs)) return normalizeHubCode(raw);
    if (via && PASS_THROUGH_CAMP[raw]) return PASS_THROUGH_CAMP[raw];
  }
  return null;
}

/** Compact journey string: YHZ → YOW → YK → IQA */
export function formatJourneyPath(airports: string[]) {
  return journeyCodes(airports).join(" → ");
}

/** Named journey string: Halifax → Ottawa → Yellowknife → IQA */
export function formatJourneyNames(airports: string[], hubs: TravelHub[] = DEFAULT_TRAVEL_HUBS) {
  return journeyCodes(airports)
    .map((code) => travelHubName(code, hubs))
    .join(" → ");
}

/**
 * Place name on a transit day box (Excel-style), with → when the move continues.
 * e.g. Yellowknife→ · →Ottawa→ · →Halifax
 */
export function transitCellMark(
  code: string,
  opts: { fromTravel: boolean; toTravel: boolean },
  hubs: TravelHub[] = DEFAULT_TRAVEL_HUBS,
) {
  const name = travelHubName(code, hubs);
  if (opts.fromTravel && opts.toTravel) return `→${name}→`;
  if (!opts.fromTravel && opts.toTravel) return `${name}→`;
  if (opts.fromTravel && !opts.toTravel) return `→${name}`;
  return name;
}

/** Right-click pass-through boxes, never the worksite camps from the legend. */
export function stopoverMenuHubs(hubs: TravelHub[] = DEFAULT_TRAVEL_HUBS): TravelHub[] {
  const preferred = new Set([
    "YOW",
    "YYZ",
    "YUL",
    "YVR",
    "YEG",
    "CAM",
    "YK",
    "YXP",
    "YHZ",
    "YYT",
    "YDF",
    "YYC",
    "YRT",
  ]);
  const usable = hubs.filter(
    (hub) => !WORK_SITE_CODES.has(hub.code) && !["YCO", "YFB", "YIO", "YF"].includes(hub.code),
  );
  const primary = usable.filter((hub) => preferred.has(hub.code));
  const extras = usable.filter((hub) => !preferred.has(hub.code));
  return [...primary, ...extras];
}

/** @deprecated use stopoverMenuHubs(loadTravelHubs().hubs) */
export const STOPOVER_MENU_HUBS = stopoverMenuHubs(DEFAULT_TRAVEL_HUBS);
