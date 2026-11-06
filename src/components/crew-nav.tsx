"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Contact, ListChecks, Rows3, Settings } from "lucide-react";
import { CREW_SCHEDULE } from "@/lib/crew-schedule";
import { loadScheduleYears } from "@/lib/crew-years";
import { cn } from "@/lib/cn";

type Section = {
  key: string;
  href: string;
  label: string;
  icon: typeof ListChecks;
  match: (path: string) => boolean;
};

const SECTIONS: Section[] = [
  { key: "overview", href: "/", label: "Overview", icon: ListChecks, match: (path) => path === "/" },
  {
    key: "calendar",
    href: "/month",
    label: "Calendar",
    icon: CalendarDays,
    match: (path) => path.startsWith("/month") || path.startsWith("/year"),
  },
  { key: "list", href: "/list", label: "Crew list", icon: Rows3, match: (path) => path.startsWith("/list") },
  { key: "employees", href: "/employees", label: "Employees", icon: Contact, match: (path) => path.startsWith("/employees") },
];

const SETTINGS: Section = {
  key: "settings",
  href: "/settings",
  label: "Settings",
  icon: Settings,
  match: (path) => path.startsWith("/settings"),
};

const CALENDAR_VIEWS = [
  { href: "/month", label: "Month" },
  { href: "/year", label: "Year" },
] as const;

function basePath(pathname: string) {
  for (const prefix of ["/month", "/year", "/list", "/employees", "/settings"]) {
    if (pathname.startsWith(prefix)) return prefix;
  }
  return "/";
}

export function CrewNav({
  onOpenReminders,
  reminderCount = 0,
}: {
  onOpenReminders?: () => void;
  reminderCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const yearParam = Number(search.get("year") || "");
  const monthParam = search.get("month");
  const [years, setYears] = useState<number[]>(() => [...loadScheduleYears()]);
  const year =
    yearParam && Number.isInteger(yearParam) ? yearParam : CREW_SCHEDULE.year || new Date().getFullYear();
  const inCalendar = pathname.startsWith("/month") || pathname.startsWith("/year");

  function hrefFor(path: string, forYear = year) {
    const params = new URLSearchParams({ year: String(forYear) });
    if (path === "/month" && monthParam) params.set("month", monthParam);
    return `${path}?${params.toString()}`;
  }

  function goToYear(next: number) {
    router.push(hrefFor(basePath(pathname), next), { scroll: false });
  }

  useEffect(() => {
    setYears(loadScheduleYears());
  }, [yearParam]);

  const yearIndex = years.indexOf(year);
  const prevYear = yearIndex > 0 ? years[yearIndex - 1] : null;
  const nextYear = yearIndex >= 0 && yearIndex < years.length - 1 ? years[yearIndex + 1] : null;

  return (
    <nav className="sticky top-0 z-30 -mx-5 border-b border-border bg-background/95 px-5 backdrop-blur sm:-mx-8 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
        <div className="-mb-px flex flex-wrap items-center gap-1">
          {SECTIONS.map((section) => (
            <NavTab key={section.key} section={section} href={hrefFor(section.href)} active={section.match(pathname)} />
          ))}
        </div>

        {inCalendar ? (
          <div className="flex rounded-lg border border-input bg-card p-0.5" role="group" aria-label="Calendar view">
            {CALENDAR_VIEWS.map((view) => {
              const active = pathname.startsWith(view.href);
              return (
                <Link
                  key={view.href}
                  href={hrefFor(view.href)}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium transition",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {view.label}
                </Link>
              );
            })}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {onOpenReminders ? (
            <button
              type="button"
              onClick={onOpenReminders}
              aria-label={reminderCount ? `Reminders · ${reminderCount}` : "Reminders"}
              title="Reminders"
              className="relative flex size-8 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground transition hover:text-foreground"
            >
              <Bell className="size-4" />
              {reminderCount > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
                  {reminderCount > 99 ? "99+" : reminderCount}
                </span>
              ) : null}
            </button>
          ) : null}
          <div className="flex items-center rounded-lg border border-input bg-card">
            <button
              type="button"
              onClick={() => prevYear != null && goToYear(prevYear)}
              disabled={prevYear == null}
              aria-label="Previous year"
              className="flex h-8 w-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <label className="sr-only" htmlFor="crew-nav-year">
              Schedule year
            </label>
            <select
              id="crew-nav-year"
              value={year}
              onChange={(event) => goToYear(Number(event.target.value))}
              className="h-8 appearance-none bg-transparent px-1 text-center text-sm font-semibold tabular-nums text-foreground focus:outline-none"
            >
              {years.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => nextYear != null && goToYear(nextYear)}
              disabled={nextYear == null}
              aria-label="Next year"
              className="flex h-8 w-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <Link
            href={hrefFor(SETTINGS.href)}
            scroll={false}
            aria-label="Settings"
            title="Settings"
            className={cn(
              "flex size-8 items-center justify-center rounded-lg border transition",
              SETTINGS.match(pathname)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <Settings className="size-4" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

function NavTab({ section, href, active }: { section: Section; href: string; active: boolean }) {
  const Icon = section.icon;
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition",
        active
          ? "border-primary text-primary"
          : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900",
      )}
    >
      <Icon className="size-4" />
      {section.label}
    </Link>
  );
}
