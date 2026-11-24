import { CREW_AVAILABLE_YEARS, CREW_SCHEDULE } from "@/lib/crew-schedule";

const STORAGE_KEY = "tower-arctic-crew-years";

/** Calendar year always exists so Jan 1 rolls the schedule forward automatically. */
function calendarYear() {
  return new Date().getFullYear();
}

/** From 2027 the app is the master: next year is always open for planning ahead. */
function planningYear() {
  return calendarYear() + 1;
}

/** Years managed in the app (Excel is not required going forward). */
export function loadScheduleYears(): number[] {
  const base = [...CREW_AVAILABLE_YEARS];
  const rolling = [CREW_SCHEDULE.year, calendarYear(), planningYear()];
  if (typeof window === "undefined") {
    return [...new Set([...base, ...rolling])].sort((a, b) => a - b);
  }
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    const extra = Array.isArray(raw)
      ? raw.map(Number).filter((year) => Number.isInteger(year) && year >= 2020 && year <= 2100)
      : [];
    return [...new Set([...base, ...rolling, ...extra])].sort((a, b) => a - b);
  } catch {
    return [...new Set([...base, ...rolling])].sort((a, b) => a - b);
  }
}

export function saveScheduleYears(years: number[]) {
  if (typeof window === "undefined") return;
  const extras = years.filter((year) => !(CREW_AVAILABLE_YEARS as readonly number[]).includes(year));
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(extras)].sort((a, b) => a - b)));
}

export function addScheduleYear(years: number[], year: number) {
  const next = [...new Set([...years, year])].sort((a, b) => a - b);
  saveScheduleYears(next);
  return next;
}
