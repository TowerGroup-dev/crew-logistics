/** Editable worksite catalog (local to this browser until a shared API exists). */

import { CREW_SCHEDULE } from "@/lib/crew-schedule";

export type SiteColour = {
  id: string;
  label: string;
  /** Calendar cell / legend swatch */
  swatch: string;
  /** List chips */
  chip: string;
  /** Filled month cell text */
  solid: string;
  /** Year tape bar */
  bar: string;
};

export const SITE_COLOURS: SiteColour[] = [
  { id: "sky", label: "Blue", swatch: "bg-sky-500", chip: "bg-sky-100 text-sky-950", solid: "bg-sky-500 text-white", bar: "bg-sky-600" },
  { id: "emerald", label: "Green", swatch: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-950", solid: "bg-emerald-500 text-white", bar: "bg-emerald-600" },
  { id: "amber", label: "Amber", swatch: "bg-amber-500", chip: "bg-amber-100 text-amber-950", solid: "bg-amber-500 text-white", bar: "bg-amber-600" },
  { id: "violet", label: "Violet", swatch: "bg-violet-500", chip: "bg-violet-100 text-violet-950", solid: "bg-violet-500 text-white", bar: "bg-violet-600" },
  { id: "rose", label: "Rose", swatch: "bg-rose-500", chip: "bg-rose-100 text-rose-950", solid: "bg-rose-500 text-white", bar: "bg-rose-600" },
  { id: "teal", label: "Teal", swatch: "bg-teal-500", chip: "bg-teal-100 text-teal-950", solid: "bg-teal-500 text-white", bar: "bg-teal-600" },
  { id: "orange", label: "Orange", swatch: "bg-orange-500", chip: "bg-orange-100 text-orange-950", solid: "bg-orange-500 text-white", bar: "bg-orange-600" },
  { id: "stone", label: "Stone", swatch: "bg-stone-500", chip: "bg-stone-100 text-stone-800", solid: "bg-stone-500 text-white", bar: "bg-stone-600" },
];

export type CrewSite = {
  code: string;
  name: string;
  colourId: string;
  /** Treat like camp/IQA for legacy helpers. */
  camp?: boolean;
};

export type CrewSitesBook = {
  version: 1;
  sites: CrewSite[];
};

const STORAGE_KEY = "tower-arctic-crew-sites-v1";

export const DEFAULT_SITES: CrewSite[] = [
  { code: "IQA", name: "Iqaluit", colourId: "sky", camp: true },
  { code: "POND", name: "Pond Inlet", colourId: "emerald" },
  { code: "ALRT", name: "Alert", colourId: "amber" },
  { code: "KUG", name: "Kugluktuk", colourId: "violet" },
];

/** Sheet marks / airports — not places you assign a rotation to. */
const NOT_WORKSITES = new Set([
  "IN",
  "OUT",
  "TRANSFER",
  "TBC",
  "YEG",
  "YF",
  "YK",
  "YFB",
  "YYZ",
  "YOW",
  "YYC",
  "YUL",
  "OFF",
  "HOME",
  "TRAVEL",
  "TRANSIT",
]);

export function isWorksiteCode(code: string) {
  const key = code.trim().toUpperCase();
  if (!key || NOT_WORKSITES.has(key)) return false;
  // Single-letter / weird marks from the sheet
  if (key.length < 2) return false;
  return true;
}

/** Pull a real camp/worksite code out of a sheet mark (ignore IN/OUT/airports). */
export function worksiteFromMark(mark: string | null | undefined): string | null {
  if (!mark) return null;
  for (const part of mark.split(/[/|,]/)) {
    const code = part.trim().toUpperCase();
    if (isWorksiteCode(code)) return code;
  }
  return null;
}

export function emptySitesBook(): CrewSitesBook {
  return { version: 1, sites: [...DEFAULT_SITES] };
}

function colourOrFallback(id: string) {
  return SITE_COLOURS.find((row) => row.id === id) || SITE_COLOURS[0]!;
}

function readSite(raw: unknown): CrewSite | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const code = typeof row.code === "string" ? row.code.trim().toUpperCase() : "";
  if (!code) return null;
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : code;
  const colourId =
    typeof row.colourId === "string" && SITE_COLOURS.some((c) => c.id === row.colourId)
      ? row.colourId
      : "stone";
  return {
    code,
    name,
    colourId,
    camp: Boolean(row.camp),
  };
}

export function readSitesBook(raw: unknown): CrewSitesBook {
  if (!raw || typeof raw !== "object") return emptySitesBook();
  const data = raw as Record<string, unknown>;
  const sites = Array.isArray(data.sites)
    ? data.sites
        .map(readSite)
        .filter((row): row is CrewSite => Boolean(row) && isWorksiteCode(row!.code))
    : [];
  if (!sites.length) return emptySitesBook();
  const seen = new Set<string>();
  const unique = sites.filter((row) => {
    if (seen.has(row.code)) return false;
    seen.add(row.code);
    return true;
  });
  return { version: 1, sites: unique };
}

/**
 * Keep the four camp defaults present. Do not pull sheet status marks
 * (IN/OUT/Transfer) or airports into the worksite list.
 */
export function ensureDefaultSites(book: CrewSitesBook): CrewSitesBook {
  const byCode = new Map(
    book.sites.filter((row) => isWorksiteCode(row.code)).map((row) => [row.code, row]),
  );
  for (const site of DEFAULT_SITES) {
    if (!byCode.has(site.code)) byCode.set(site.code, site);
  }
  return {
    version: 1,
    sites: [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code)),
  };
}

/** @deprecated use ensureDefaultSites */
export function mergeSheetSites(book: CrewSitesBook): CrewSitesBook {
  return ensureDefaultSites(book);
}

export function loadSitesBook(): CrewSitesBook {
  if (typeof window === "undefined") return ensureDefaultSites(emptySitesBook());
  try {
    const stored = readSitesBook(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
    const cleaned = ensureDefaultSites(stored);
    // Persist the cleanup so the junk codes do not keep coming back.
    if (cleaned.sites.length !== stored.sites.length) saveSitesBook(cleaned);
    return cleaned;
  } catch {
    return ensureDefaultSites(emptySitesBook());
  }
}

export function saveSitesBook(book: CrewSitesBook) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, sites: book.sites }));
}

export function siteColour(site: CrewSite | string | null | undefined): SiteColour {
  if (!site) return colourOrFallback("stone");
  if (typeof site === "string") {
    const book = typeof window !== "undefined" ? loadSitesBook() : emptySitesBook();
    const hit = book.sites.find((row) => row.code === site.toUpperCase() || site.toUpperCase().includes(row.code));
    return colourOrFallback(hit?.colourId || "stone");
  }
  return colourOrFallback(site.colourId);
}

export function catalogSiteLabel(code: string, book?: CrewSitesBook) {
  const key = code.trim().toUpperCase();
  const sites = book?.sites || (typeof window !== "undefined" ? loadSitesBook().sites : DEFAULT_SITES);
  const hit = sites.find((row) => row.code === key);
  if (hit) return hit.name === hit.code ? hit.code : hit.name;
  return CREW_SCHEDULE.sites[key] || CREW_SCHEDULE.sites[code] || code;
}

export function upsertSite(book: CrewSitesBook, site: CrewSite): CrewSitesBook {
  const code = site.code.trim().toUpperCase();
  if (!code) return book;
  const next: CrewSite = {
    code,
    name: site.name.trim() || code,
    colourId: site.colourId,
    camp: Boolean(site.camp),
  };
  const index = book.sites.findIndex((row) => row.code === code);
  if (index === -1) return { ...book, sites: [...book.sites, next].sort((a, b) => a.code.localeCompare(b.code)) };
  const sites = book.sites.slice();
  sites[index] = next;
  return { ...book, sites };
}

export function removeSite(book: CrewSitesBook, code: string): CrewSitesBook {
  const key = code.toUpperCase();
  return { ...book, sites: book.sites.filter((row) => row.code !== key) };
}

export function nextColourId(book: CrewSitesBook) {
  const used = new Set(book.sites.map((row) => row.colourId));
  const free = SITE_COLOURS.find((row) => !used.has(row.id));
  return free?.id || SITE_COLOURS[book.sites.length % SITE_COLOURS.length]!.id;
}
