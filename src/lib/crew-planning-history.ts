/**
 * "Who is often there": days each person spent on site, per site, from the Calendar.
 * Used on the Crew-Project Overlook to help pick crew. Read only.
 */

import { addDays } from "@/lib/dates";
import { siteOnDay } from "@/lib/crew-site-days";
import { crewCategoryFor, roleLabel, siteLabel, type CrewCategory, type CrewPerson } from "@/lib/crew-schedule";

export type PersonSiteHistory = {
  personId: string;
  name: string;
  firstName: string;
  role: string;
  category: CrewCategory;
  /** Days on any site in the period. */
  total: number;
  /** Days per site, keyed by full site name (e.g. "Iqaluit"). */
  bySite: Record<string, number>;
  /** Site with the most days, or null if never on site. */
  usualSite: string | null;
};

export function firstNameOf(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

/** Count on-site days for each person from `from` to `to` (inclusive ISO dates). */
export function buildSiteHistory(people: CrewPerson[], from: string, to: string): Map<string, PersonSiteHistory> {
  const out = new Map<string, PersonSiteHistory>();
  for (const person of people) {
    const bySite: Record<string, number> = {};
    let total = 0;
    for (let iso = from; iso <= to; iso = addDays(iso, 1)) {
      const code = siteOnDay(person, iso);
      if (!code) continue;
      const site = siteLabel(code);
      bySite[site] = (bySite[site] || 0) + 1;
      total += 1;
    }
    let usualSite: string | null = null;
    for (const [site, days] of Object.entries(bySite)) {
      if (!usualSite || days > (bySite[usualSite] || 0)) usualSite = site;
    }
    out.set(person.id, {
      personId: person.id,
      name: person.name,
      firstName: firstNameOf(person.name),
      role: roleLabel(person),
      category: crewCategoryFor(person),
      total,
      bySite,
      usualSite,
    });
  }
  return out;
}

/** Days at one site (matching by full name, case-insensitive). */
export function daysAtSite(history: PersonSiteHistory | undefined, site: string) {
  if (!history || !site.trim()) return 0;
  const key = site.trim().toLowerCase();
  for (const [name, days] of Object.entries(history.bySite)) {
    if (name.toLowerCase() === key) return days;
  }
  return 0;
}

/** Crew order on a job: managers, foremen, surveyors, mechanics, operators, labourers, others. */
export function roleRank(role: string | null | undefined): number {
  const key = (role || "").toLowerCase();
  if (/manager/.test(key)) return 0;
  if (/superintendent|super\b|foreman|lead/.test(key)) return 1;
  if (/survey/.test(key)) return 2;
  if (/mechanic/.test(key)) return 3;
  if (/operator|truck|driver/.test(key)) return 4;
  if (/labou?r/.test(key)) return 5;
  return 6;
}
