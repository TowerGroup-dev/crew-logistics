"use client";

import Link from "next/link";
import { startTransition, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Menu,
  MoreHorizontal,
} from "lucide-react";
import { CREW_AVAILABLE_YEARS, CREW_SCHEDULE } from "@/lib/crew-schedule";
import { loadScheduleYears } from "@/lib/crew-years";
import { cn } from "@/lib/cn";
import { CrewSyncStatus } from "@/components/crew-sync-status";

/** First-paint year list only (no localStorage) so server HTML matches the client. */
function defaultScheduleYears() {
  const now = new Date().getFullYear();
  const scheduleYear = CREW_SCHEDULE.year || now;
  return [...new Set([...CREW_AVAILABLE_YEARS, scheduleYear, now, now + 1])].sort((a, b) => a - b);
}

type Section = {
  key: string;
  href: string;
  label: string;
  icon: typeof ListChecks;
  match: (path: string) => boolean;
};

/** Primary work tabs, stay on the top bar. */
const PRIMARY: Section[] = [
  { key: "overview", href: "/", label: "Overview", icon: ListChecks, match: (path) => path === "/" },
  {
    key: "calendar",
    href: "/month",
    label: "Calendar",
    icon: CalendarDays,
    match: (path) =>
      path.startsWith("/month") || path.startsWith("/year") || path.startsWith("/list") || path.startsWith("/travel"),
  },
];

/** Right ☰ dropdown, plain list like B2W. */
const MENU_ITEMS: { key: string; href: string; label: string; match: (path: string) => boolean }[] = [
  { key: "employees", href: "/employees", label: "Employees", match: (path) => path.startsWith("/employees") },
  { key: "reports", href: "/reports", label: "Reports", match: (path) => path.startsWith("/reports") },
  { key: "settings", href: "/settings", label: "Settings", match: (path) => path.startsWith("/settings") },
];

const CALENDAR_VIEWS = [
  { href: "/month", label: "Month" },
  { href: "/year", label: "Year" },
  { href: "/list", label: "List" },
] as const;

function basePath(pathname: string) {
  for (const prefix of ["/month", "/year", "/list", "/travel", "/employees", "/reports", "/settings"]) {
    if (pathname.startsWith(prefix)) return prefix;
  }
  return "/";
}

export function CrewNav({
  view,
  onNavigateView,
  onOpenReminders,
  reminderCount = 0,
}: {
  /** Optimistic board view — tabs highlight before the router finishes. */
  view?: string;
  onNavigateView?: (view: "overview" | "month" | "year" | "list" | "employees" | "reports" | "settings") => void;
  onOpenReminders?: () => void;
  reminderCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const yearParam = Number(search.get("year") || "");
  const monthParam = search.get("month");
  const [storedYears, setYears] = useState<number[]>(defaultScheduleYears);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  /** Avoid SSR/client mismatch for sync label and reminder badge (local data). */
  const [clientReady, setClientReady] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const year =
    yearParam && Number.isInteger(yearParam) ? yearParam : CREW_SCHEDULE.year || new Date().getFullYear();
  const activeView = view || (
    pathname.startsWith("/month") || pathname.startsWith("/travel")
      ? "month"
      : pathname.startsWith("/year")
        ? "year"
        : pathname.startsWith("/list")
          ? "list"
          : pathname.startsWith("/employees")
            ? "employees"
            : pathname.startsWith("/reports")
              ? "reports"
              : pathname.startsWith("/settings")
                ? "settings"
                : "overview"
  );
  const inCalendar = activeView === "month" || activeView === "year" || activeView === "list";
  const shownReminderCount = clientReady ? reminderCount : 0;

  function hrefFor(path: string, forYear = year) {
    const params = new URLSearchParams({ year: String(forYear) });
    if (path === "/month" && monthParam) params.set("month", monthParam);
    return `${path}?${params.toString()}`;
  }

  function goToYear(next: number) {
    // Keep the nav snappy; Month remounts the day strip in a transition.
    startTransition(() => {
      router.push(hrefFor(basePath(pathname), next), { scroll: false });
    });
  }

  function goTo(path: string, nextView: "overview" | "month" | "year" | "list" | "employees" | "reports" | "settings") {
    onNavigateView?.(nextView);
    router.push(hrefFor(path), { scroll: false });
  }

  useEffect(() => {
    setClientReady(true);
  }, []);

  useEffect(() => {
    setYears(loadScheduleYears());
  }, [yearParam]);

  useEffect(() => {
    setMenuOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [menuOpen]);

  // The year in the address is always offered, even before it has been saved to the list.
  const years = storedYears.includes(year) ? storedYears : [...storedYears, year].sort((a, b) => a - b);
  const yearIndex = years.indexOf(year);
  const prevYear = yearIndex > 0 ? years[yearIndex - 1] : null;
  const nextYear = yearIndex >= 0 && yearIndex < years.length - 1 ? years[yearIndex + 1] : null;

  const moreActive = MENU_ITEMS.some((item) => item.key === activeView);

  return (
    <>
    <nav className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-1.5 sm:py-2">
        {/* Phones use the tab bar at the bottom instead. */}
        <div className="-mb-px hidden flex-wrap items-center gap-1 sm:flex">
          {PRIMARY.map((section) => {
            const active =
              section.key === "calendar"
                ? inCalendar
                : section.key === "overview"
                  ? activeView === "overview"
                  : section.match(pathname);
            return (
              <NavTab
                key={section.key}
                section={section}
                href={hrefFor(section.href)}
                active={active}
                onNavigate={() =>
                  goTo(
                    section.href,
                    section.key === "calendar" ? "month" : "overview",
                  )
                }
              />
            );
          })}
        </div>

        {/* Phones: the page name sits where the tabs were. */}
        {!inCalendar ? (
          <h1 className="text-base font-semibold sm:hidden">
            {[...PRIMARY, ...MENU_ITEMS].find((item) => item.key === activeView || item.match(pathname))?.label ?? ""}
          </h1>
        ) : null}
        {inCalendar ? (
          <div className="flex rounded-lg border border-input bg-card p-0.5" role="group" aria-label="Calendar view">
            {CALENDAR_VIEWS.map((item) => {
              const active =
                (item.href === "/month" && activeView === "month") ||
                (item.href === "/year" && activeView === "year") ||
                (item.href === "/list" && activeView === "list");
              return (
                <button
                  key={item.href}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() =>
                    goTo(
                      item.href,
                      item.href === "/year" ? "year" : item.href === "/list" ? "list" : "month",
                    )
                  }
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <span className="hidden sm:contents">
            {clientReady ? <CrewSyncStatus /> : (
              <span className="inline-flex h-8 min-w-[5.5rem] items-center rounded-lg border border-input bg-card px-2.5 text-xs text-muted-foreground">
                Syncing...
              </span>
            )}
          </span>
          {onOpenReminders ? (
            <button
              type="button"
              onClick={onOpenReminders}
              aria-label={shownReminderCount ? `Reminders · ${shownReminderCount}` : "Reminders"}
              title="Reminders"
              className="relative flex size-8 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground transition hover:text-foreground"
            >
              <Bell className="size-4" aria-hidden />
              {shownReminderCount > 0 ? (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-semibold text-white">
                  {shownReminderCount > 99 ? "99+" : shownReminderCount}
                </span>
              ) : null}
            </button>
          ) : null}
          {/* Year control is for Calendar planning — hide on Overview. */}
          {activeView !== "overview" ? (
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
          ) : null}

          <div className="relative hidden sm:block" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-controls="crew-util-menu"
              title="Menu"
              className={cn(
                "flex size-8 items-center justify-center rounded-lg border transition",
                menuOpen
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <Menu className="size-4" aria-hidden />
            </button>

            {menuOpen ? (
              <div
                id="crew-util-menu"
                role="menu"
                className="absolute top-full right-0 z-50 mt-1 min-w-[14rem] overflow-hidden rounded-md border border-border bg-card py-0.5 shadow-lg"
              >
                {MENU_ITEMS.map((item) => {
                  const active = activeView === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="menuitem"
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        setMenuOpen(false);
                        goTo(
                          item.href,
                          item.key as "employees" | "reports" | "settings",
                        );
                      }}
                      className={cn(
                        "block w-full border-b border-border/70 px-4 py-2.5 text-left text-sm last:border-b-0",
                        active
                          ? "bg-muted font-medium text-foreground"
                          : "text-foreground hover:bg-muted",
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
                <TestModeLinks pathname={pathname} onPick={() => setMenuOpen(false)} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </nav>

    {/* Phone tab bar: big thumb targets, always at the bottom. */}
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      role="navigation"
      aria-label="Main"
    >
      {moreOpen ? (
        <div className="absolute inset-x-2 bottom-full mb-2 overflow-hidden rounded-2xl border border-border bg-card shadow-xl" role="menu">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">More</span>
            <CrewSyncStatus />
          </div>
          {MENU_ITEMS.map((item) => {
            const active = activeView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  setMoreOpen(false);
                  goTo(item.href, item.key as "employees" | "reports" | "settings");
                }}
                className={cn(
                  "block w-full border-b border-border/70 px-4 py-3.5 text-left text-base last:border-b-0",
                  active ? "bg-muted font-semibold text-foreground" : "text-foreground active:bg-muted",
                )}
              >
                {item.label}
              </button>
            );
          })}
          <TestModeLinks pathname={pathname} onPick={() => setMoreOpen(false)} large />
          <a
            role="menuitem"
            href="/api/auth/logout"
            className="block border-t border-border px-4 py-3.5 text-base text-rose-700 active:bg-rose-50"
          >
            Sign out
          </a>
        </div>
      ) : null}
      <div className="grid grid-cols-4">
        {PRIMARY.map((section) => {
          const Icon = section.icon;
          const active =
            !moreOpen &&
            (section.key === "calendar" ? inCalendar : activeView === "overview");
          return (
            <button
              key={section.key}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => {
                setMoreOpen(false);
                goTo(
                  section.href,
                  section.key === "calendar" ? "month" : "overview",
                );
              }}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium [@media(max-height:511px)]:h-10 [@media(max-height:511px)]:flex-row [@media(max-height:511px)]:gap-1.5 [@media(max-height:511px)]:text-xs",
                active ? "text-primary" : "text-slate-500",
              )}
            >
              <Icon className={cn("size-5", active && "stroke-[2.25]")} />
              {section.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          className={cn(
            "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium [@media(max-height:511px)]:h-10 [@media(max-height:511px)]:flex-row [@media(max-height:511px)]:gap-1.5 [@media(max-height:511px)]:text-xs",
            moreOpen || moreActive ? "text-primary" : "text-slate-500",
          )}
        >
          <MoreHorizontal className="size-5" />
          More
        </button>
      </div>
    </div>
    {moreOpen ? <div className="fixed inset-0 z-30 bg-black/20 sm:hidden" onClick={() => setMoreOpen(false)} aria-hidden /> : null}
    </>
  );
}

/**
 * Test Mode is opened in a NEW tab (it starts from a fresh copy of live data, and the page must
 * load with ?test=1 for that). The real tab stays as it was. "Test log" shows what testers did.
 */
function TestModeLinks({ pathname, onPick, large }: { pathname: string; onPick: () => void; large?: boolean }) {
  const row = large ? "block border-t border-border px-4 py-3.5 text-base" : "block border-t border-border px-4 py-2.5 text-sm";
  return (
    <>
      <a
        role="menuitem"
        href={`${pathname || "/"}?test=1`}
        target="_blank"
        rel="noopener"
        onClick={onPick}
        className={cn(row, "text-amber-900 hover:bg-amber-50")}
        title="Opens a new tab with a copy of live data. Changes are not saved and emails are not sent."
      >
        Open Test Mode (new tab)
      </a>
      <Link role="menuitem" href="/test-log" onClick={onPick} className={cn(row, "text-foreground hover:bg-sky-50")}>
        Test log
      </Link>
    </>
  );
}

function NavTab({
  section,
  href,
  active,
  onNavigate,
}: {
  section: Section;
  href: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = section.icon;
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      suppressHydrationWarning
      onClick={(event) => {
        if (!onNavigate) return;
        event.preventDefault();
        onNavigate();
      }}
      className={cn(
        "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium",
        active
          ? "border-primary text-primary"
          : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900",
      )}
    >
      <Icon className="size-4" aria-hidden suppressHydrationWarning />
      {section.label}
    </Link>
  );
}
