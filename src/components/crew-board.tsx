"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import {
  buildCrewBriefing,
  buildInstantAlert,
  describeOpsChange,
} from "@/lib/crew-briefing";
import {
  CREW_BOOKING_STATUSES,
  bookingLabel,
  loadCrewOps,
  opsFor,
  saveCrewOps,
  type CrewBookingStatus,
  type CrewOpsBook,
  type CrewPersonOps,
  type CrewUpdate,
} from "@/lib/crew-ops";
import {
  loadNotifySettings,
  saveNotifySettings,
  shouldOfferWeeklyBriefing,
  type CrewNotifySettings,
} from "@/lib/crew-notify-settings";
import {
  CREW_PROJECTS,
  CREW_ROLE_ORDER,
  CREW_ROLES,
  CREW_SCHEDULE,
  crewOverview,
  dutyLabel,
  isCampSite,
  isOffRotation,
  personSegments,
  roleLabel,
  rotationFor,
  siteLabel,
  type CrewDutyStatus,
  type CrewProject,
  type CrewSnapshot,
} from "@/lib/crew-schedule";
import {
  addNextRotation,
  extendStay,
  emptyRoster,
  loadRoster,
  mergePeople,
  mergeProjects,
  saveRoster,
  setEmploymentStatus,
  slugEmployee,
  type CrewRosterBook,
  type EmploymentStatus,
} from "@/lib/crew-roster";
import { CrewFlightPanel } from "@/components/crew-flight-panel";
import { CrewMonthGrid, monthStartFromIso, shiftMonth } from "@/components/crew-month-grid";
import { CrewNextRotationForm } from "@/components/crew-next-rotation";
import { CrewOverview, CrewReminders } from "@/components/crew-overview";
import { buildSituationReminders } from "@/lib/crew-situation-reminders";
import { CrewRoleHeader } from "@/components/crew-role-header";
import { CrewAccommodationDesk } from "@/components/crew-accommodation-desk";
import { CrewTravelDesk } from "@/components/crew-travel-desk";
import { CrewYearTape } from "@/components/crew-year-tape";
import { CrewRotationDrawer } from "@/components/crew-rotation-drawer";
import {
  currentRotationForPerson,
  extendRotationOut,
  loadRotations,
  mergeRotationBook,
  assumeFlightsBooked,
  migrateOpsIntoRotations,
  rotationForPersonOnDay,
  saveRotations,
  type RotationBook,
} from "@/lib/crew-rotations";
import { autoSeedTravelOps } from "@/lib/crew-auto-ops";
import {
  emptyFlightBook,
  loadFlights,
  saveFlights,
  syncOpsFromFlights,
  upsertFlightBooking,
  type FlightBook,
  type FlightBooking,
} from "@/lib/crew-flights";
import { addScheduleYear, loadScheduleYears } from "@/lib/crew-years";
import {
  emptyScheduleViewPrefs,
  hidePerson,
  loadScheduleViewPrefs,
  saveScheduleViewPrefs,
  showAllPeople,
  showPerson,
  type CrewScheduleViewPrefs,
} from "@/lib/crew-schedule-view";
import {
  emptyRolesBook,
  loadRolesBook,
  saveRolesBook,
  type CrewRolesBook,
} from "@/lib/crew-roles-catalog";
import {
  emptySitesBook,
  loadSitesBook,
  saveSitesBook,
  siteColour,
  catalogSiteLabel,
  type CrewSitesBook,
} from "@/lib/crew-sites";
import { CrewSettingsPanel } from "@/components/crew-settings-panel";
import { formatLong, formatMedium, toISODate } from "@/lib/dates";
import { cn } from "@/lib/cn";

export type CrewBoardView =
  | "overview"
  | "year"
  | "month"
  | "list"
  | "travel"
  | "accommodation"
  | "alerts"
  | "employees"
  | "settings";

function siteTone(site: string | null, sitesBook?: CrewSitesBook) {
  if (!site) return "bg-muted text-muted-foreground";
  if (sitesBook) {
    const hit = sitesBook.sites.find(
      (row) => site.toUpperCase() === row.code || site.toUpperCase().includes(row.code),
    );
    if (hit) return siteColour(hit).chip;
  }
  return siteColour(site).chip;
}

function statusTone(duty: CrewDutyStatus) {
  if (duty === "on_site") return "bg-sky-100 text-sky-950";
  if (duty === "in_transit") return "bg-amber-100 text-amber-950";
  if (duty === "upcoming") return "bg-indigo-100 text-indigo-950";
  if (duty === "unassigned") return "bg-rose-50 text-rose-900";
  return "bg-muted text-muted-foreground";
}

function markTone(mark: string | null) {
  if (!mark || isOffRotation(mark)) return "bg-muted text-muted-foreground";
  return siteTone(mark.split(" / ")[0]?.trim() || mark);
}

function departureLabel(row: CrewSnapshot) {
  if (row.daysUntilOut == null) return "-";
  if (row.daysUntilOut < 0) return `${Math.abs(row.daysUntilOut)}d overdue`;
  if (row.daysUntilOut === 0) return "Today";
  return `${row.daysUntilOut}d left`;
}

function travelLabel(ops: ReturnType<typeof opsFor> | null, row: CrewSnapshot) {
  if (!row.duty || (row.duty !== "on_site" && row.duty !== "in_transit" && row.duty !== "upcoming")) {
    return "Not required";
  }
  if (!ops) return row.overdue || row.dueSoon ? "Pending" : "-";
  const status = row.duty === "upcoming" ? ops.outboundFlight : ops.returnFlight;
  if (status === "confirmed" || status === "booked") return bookingLabel(status);
  if (status === "cancelled") return "Cancelled";
  if (row.overdue || row.dueSoon || status === "needed" || status === "not_started") return "Pending";
  return bookingLabel(status);
}

export function CrewBoard({
  view,
  remindersOpen = false,
  onCloseReminders,
  onReminderCountChange,
}: {
  view: CrewBoardView;
  remindersOpen?: boolean;
  onCloseReminders?: () => void;
  onReminderCountChange?: (count: number) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = toISODate(new Date());
  const boardView = view;
  const [opsBook, setOpsBook] = useState<CrewOpsBook>({});
  const [flightBook, setFlightBook] = useState<FlightBook>(emptyFlightBook);
  const [roster, setRoster] = useState<CrewRosterBook>(emptyRoster());
  const [hydrated, setHydrated] = useState(false);
  const [role, setRole] = useState("");
  const [site, setSite] = useState("");
  const [scheduleYear, setScheduleYear] = useState<number>(CREW_SCHEDULE.year);
  const [scheduleYears, setScheduleYears] = useState<number[]>(() => [...loadScheduleYears()]);
  const [monthCursor, setMonthCursor] = useState(() => `${CREW_SCHEDULE.year || new Date().getFullYear()}-11-01`);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRotationId, setSelectedRotationId] = useState<string | null>(null);
  const [rotationBook, setRotationBook] = useState<RotationBook>({ version: 1, rotations: [] });
  const [staffName, setStaffName] = useState("Crew coordinator");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [notify, setNotify] = useState<CrewNotifySettings>(() => loadNotifySettings());
  const [scheduleView, setScheduleView] = useState<CrewScheduleViewPrefs>(() => emptyScheduleViewPrefs());
  const [sitesBook, setSitesBook] = useState<CrewSitesBook>(() => emptySitesBook());
  const [rolesBook, setRolesBook] = useState<CrewRolesBook>(() => emptyRolesBook());
  const [newEmployee, setNewEmployee] = useState({ name: "", role: "Labourer", sites: "" });

  useEffect(() => {
    const yearParam = Number(searchParams.get("year") || "");
    if (yearParam && Number.isInteger(yearParam)) {
      setScheduleYear(yearParam);
      setScheduleYears((current) => (current.includes(yearParam) ? current : addScheduleYear(current, yearParam)));
    }
    const monthParam = searchParams.get("month") || searchParams.get("start");
    if (monthParam && /^\d{4}-\d{2}/.test(monthParam)) {
      setMonthCursor(monthStartFromIso(monthParam.length === 7 ? `${monthParam}-01` : monthParam));
    }
    const personParam = searchParams.get("person");
    if (personParam) setSelectedId(personParam);
  }, [searchParams]);

  useEffect(() => {
    const todayIso = toISODate(new Date());
    const loadedOps = loadCrewOps();
    const seededOps = autoSeedTravelOps(CREW_SCHEDULE.people, loadedOps, todayIso);
    if (seededOps !== loadedOps) saveCrewOps(seededOps);
    setOpsBook(seededOps);
    const flights = loadFlights();
    setFlightBook(flights);

    const loadedRoster = loadRoster();
    setRoster(loadedRoster);
    setNotify(loadNotifySettings());
    setScheduleView(loadScheduleViewPrefs());
    const cleanedSites = loadSitesBook();
    setSitesBook(cleanedSites);
    saveSitesBook(cleanedSites);
    setRolesBook(loadRolesBook());
    setScheduleYears(loadScheduleYears());

    const mergedPeople = mergePeople(CREW_SCHEDULE.people, loadedRoster);
    const merged = mergeRotationBook(mergedPeople, loadRotations());
    const migrated = migrateOpsIntoRotations(merged, seededOps, flights);
    const withFlights = assumeFlightsBooked(migrated);
    setRotationBook(withFlights);
    saveRotations(withFlights);

    setHydrated(true);
    const params = new URLSearchParams(window.location.search);
    const person = params.get("person");
    if (person) setSelectedId(person);
  }, []);

  useEffect(() => {
    if (!selectedId && !selectedRotationId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
        setSelectedRotationId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [selectedId, selectedRotationId]);

  async function dispatchMail(payload: { kind: "briefing" | "alert"; to: string; subject: string; text: string; html: string }) {
    const response = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !body.ok) throw new Error(body.error || "Notification could not be sent.");
  }

  function patchNotify(recipe: (current: CrewNotifySettings) => CrewNotifySettings) {
    setNotify((prev) => {
      const next = recipe(prev);
      saveNotifySettings(next);
      return next;
    });
  }

  function patchOps(personId: string, recipe: (current: CrewPersonOps) => CrewPersonOps) {
    setOpsBook((prev) => {
      const before = opsFor(prev, personId);
      const after = recipe(before);
      const next = { ...prev, [personId]: after };
      saveCrewOps(next);
      const delta = describeOpsChange(before, after);
      if (delta?.critical && notify.instantAlerts && notify.recipientEmail) {
        const personName =
          CREW_SCHEDULE.people.find((row) => row.id === personId)?.name ??
          roster.employees.find((row) => row.id === personId)?.name ??
          personId;
        const alert = buildInstantAlert({
          personName,
          personId,
          change: delta.change,
          actionNeeded: true,
          owner: staffName,
          appUrl: typeof window !== "undefined" ? window.location.origin : undefined,
        });
        if (!notify.sentAlertFingerprints.includes(alert.fingerprint)) {
          void dispatchMail({
            kind: "alert",
            to: notify.recipientEmail,
            subject: alert.subject,
            text: alert.text,
            html: alert.html,
          })
            .then(() => {
              patchNotify((settings) => ({
                ...settings,
                sentAlertFingerprints: [...settings.sentAlertFingerprints, alert.fingerprint].slice(-200),
              }));
            })
            .catch(() => {
              /* keep quiet in UI when mail is not configured */
            });
        }
      }
      return next;
    });
  }

  function patchRoster(recipe: (current: CrewRosterBook) => CrewRosterBook) {
    setRoster((prev) => {
      const next = recipe(prev);
      saveRoster(next);
      return next;
    });
  }

  function saveFlightBooking(booking: FlightBooking) {
    const nextFlights = upsertFlightBooking(flightBook, booking);
    setFlightBook(nextFlights);
    saveFlights(nextFlights);
    patchOps(booking.personId, (current) =>
      syncOpsFromFlights({ [booking.personId]: current }, nextFlights, booking.personId),
    );
  }

  const people = useMemo(() => mergePeople(CREW_SCHEDULE.people, roster), [roster]);
  const projects = useMemo(
    () => mergeProjects(CREW_PROJECTS as CrewProject[], roster),
    [roster],
  );
  /** Overview / list / travel follow the selected year (live today inside the current year). */
  const asOf = useMemo(() => {
    const calendarYear = Number(today.slice(0, 4));
    if (scheduleYear === calendarYear) return today;
    if (scheduleYear < calendarYear) return `${scheduleYear}-12-31`;
    return `${scheduleYear}-01-01`;
  }, [scheduleYear, today]);

  function openPersonRotation(personId: string, iso = asOf) {
    // Prefer the stay covering the clicked day, else current/next from today — never a past rotation.
    const hit =
      rotationForPersonOnDay(rotationBook, personId, iso) ||
      currentRotationForPerson(rotationBook, personId, asOf) ||
      (iso !== asOf ? currentRotationForPerson(rotationBook, personId, iso) : null);
    if (hit) {
      setSelectedRotationId(hit.id);
      setSelectedId(null);
      return;
    }
    setSelectedId(personId);
  }

  function saveRotationBook(next: RotationBook) {
    setRotationBook(next);
    saveRotations(next);
  }

  // Keep rotation book in sync when roster people/stints change
  useEffect(() => {
    if (!hydrated) return;
    setRotationBook((prev) => {
      const merged = assumeFlightsBooked(mergeRotationBook(people, prev));
      const same =
        merged.rotations.length === prev.rotations.length &&
        merged.rotations.every((row, index) => {
          const prior = prev.rotations[index];
          return (
            prior &&
            prior.id === row.id &&
            prior.plannedIn === row.plannedIn &&
            prior.plannedOut === row.plannedOut &&
            prior.outbound.confirmed === row.outbound.confirmed &&
            prior.returnTravel.confirmed === row.returnTravel.confirmed
          );
        });
      if (same) return prev;
      saveRotations(merged);
      return merged;
    });
  }, [hydrated, people]);

  const selectedRotation = useMemo(
    () => rotationBook.rotations.find((row) => row.id === selectedRotationId) ?? null,
    [rotationBook.rotations, selectedRotationId],
  );
  const selectedRotationPerson = useMemo(
    () => (selectedRotation ? people.find((row) => row.id === selectedRotation.personId) ?? null : null),
    [people, selectedRotation],
  );

  const overview = useMemo(() => crewOverview(asOf, opsBook, people), [asOf, opsBook, people]);
  const activeOverviewRows = useMemo(
    () => overview.rows.filter((row) => row.person.active !== false),
    [overview.rows],
  );
  const reminderCount = useMemo(
    () => {
      const board = buildSituationReminders({
        rows: activeOverviewRows,
        opsBook,
        book: rotationBook,
        asOf,
        planDays: notify.reminderPlanDays,
      });
      return board.week.length + board.lookahead.length;
    },
    [activeOverviewRows, asOf, opsBook, rotationBook, notify.reminderPlanDays],
  );

  useEffect(() => {
    onReminderCountChange?.(reminderCount);
  }, [onReminderCountChange, reminderCount]);

  const includeInactive = boardView === "employees";
  const workingRows = useMemo(
    () => (includeInactive ? overview.rows : activeOverviewRows),
    [activeOverviewRows, includeInactive, overview.rows],
  );

  function withYearQuery(path: string, extra?: Record<string, string>) {
    const params = new URLSearchParams({ year: String(scheduleYear), ...(extra || {}) });
    return `${path}?${params.toString()}`;
  }

  function makeBriefing() {
    return buildCrewBriefing({
      today,
      opsBook,
      people,
      projects,
      rotationBook,
      recipientName: notify.recipientName,
      recipientEmail: notify.recipientEmail,
      previousBriefingAt: notify.lastBriefingAt,
      appUrl: typeof window !== "undefined" ? window.location.origin : undefined,
    });
  }

  async function sendBriefing() {
    try {
      const briefing = makeBriefing();
      if (!notify.recipientEmail) return;
      await dispatchMail({
        kind: "briefing",
        to: notify.recipientEmail,
        subject: briefing.title,
        text: briefing.text,
        html: briefing.html,
      });
      patchNotify((settings) => ({
        ...settings,
        lastBriefingAt: new Date().toISOString(),
        lastBriefingFingerprint: `${briefing.today}:${briefing.counts.overdue}:${briefing.counts.dueSoon}:${briefing.counts.travelAttention}`,
      }));
    } catch {
      /* keep quiet in UI when mail is not configured */
    }
  }

  useEffect(() => {
    if (!hydrated || !notify.dailyBriefing) return;
    if (!shouldOfferWeeklyBriefing(notify)) return;
    if (!notify.recipientEmail) return;
    void sendBriefing();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when hydrated after Monday 8:30
  }, [hydrated]);

  function addEmployee() {
    const name = newEmployee.name.trim();
    if (!name) return;
    const roleName = newEmployee.role.trim() || "Crew";
    const id = slugEmployee(name, roleName);
    if (people.some((person) => person.id === id)) {
      setSelectedId(id);
      setShowAddEmployee(false);
      return;
    }
    const homeSites = newEmployee.sites
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    patchRoster((current) => ({
      ...current,
      employees: [
        ...current.employees,
        {
          id,
          name,
          role: roleName,
          homeSites,
          projectIds: [],
          rotationDays: 42,
          notes: "",
          createdAt: new Date().toISOString(),
          employmentStatus: "active",
        },
      ],
      employmentStatus: { ...current.employmentStatus, [id]: "active" },
    }));
    setNewEmployee({ name: "", role: "Labourer", sites: "" });
    setShowAddEmployee(false);
    setSelectedId(id);
  }

  function patchScheduleView(recipe: (current: CrewScheduleViewPrefs) => CrewScheduleViewPrefs) {
    setScheduleView((prev) => {
      const next = recipe(prev);
      saveScheduleViewPrefs(next);
      return next;
    });
  }

  const hiddenIdSet = useMemo(
    () => new Set(scheduleView.hiddenPersonIds),
    [scheduleView.hiddenPersonIds],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workingRows
      .filter((row) => {
        const roles = row.person.roles?.length ? row.person.roles : [row.person.role];
        if (role && !roles.includes(role)) return false;
        if (site && row.site !== site) return false;
        if (
          needle &&
          !row.person.name.toLowerCase().includes(needle) &&
          !roles.some((entry) => entry.toLowerCase().includes(needle))
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const roleRank = (value: string) => {
          const index = (CREW_ROLE_ORDER as readonly string[]).indexOf(value);
          return index === -1 ? CREW_ROLE_ORDER.length : index;
        };
        const urgency = (row: CrewSnapshot) => {
          if (row.overdue) return 0;
          if (row.dueSoon) return 1;
          if (row.alerts.length) return 2;
          if (row.duty === "on_site") return 3;
          if (row.duty === "upcoming") return 4;
          return 5;
        };
        if (boardView === "employees") {
          const aInactive = a.person.active === false ? 1 : 0;
          const bInactive = b.person.active === false ? 1 : 0;
          return (
            aInactive - bInactive ||
            roleRank(a.person.role) - roleRank(b.person.role) ||
            a.person.name.localeCompare(b.person.name)
          );
        }
        return (
          roleRank(a.person.role) - roleRank(b.person.role) ||
          urgency(a) - urgency(b) ||
          a.person.name.localeCompare(b.person.name)
        );
      });
  }, [boardView, query, role, site, workingRows]);

  const scheduleRows = useMemo(
    () => rows.filter((row) => !hiddenIdSet.has(row.person.id)),
    [hiddenIdSet, rows],
  );

  const hiddenPeople = useMemo(() => {
    const byId = new Map(overview.rows.map((row) => [row.person.id, row.person.name]));
    return scheduleView.hiddenPersonIds.map((id) => ({
      id,
      name: byId.get(id) || id,
    }));
  }, [overview.rows, scheduleView.hiddenPersonIds]);

  const selected = overview.rows.find((row) => row.person.id === selectedId) ?? null;
  const selectedOps = selected ? opsFor(opsBook, selected.person.id) : null;

  return (
    <div className="flex flex-col gap-4">
      {showAddEmployee ? (
        <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Name</span>
            <input
              value={newEmployee.name}
              onChange={(event) => setNewEmployee({ ...newEmployee, name: event.target.value })}
              className="h-9 rounded-lg border border-input bg-card px-2"
              placeholder="Full name"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Role</span>
            <input
              value={newEmployee.role}
              onChange={(event) => setNewEmployee({ ...newEmployee, role: event.target.value })}
              className="h-9 rounded-lg border border-input bg-card px-2"
              list="crew-roles"
            />
            <datalist id="crew-roles">
              {CREW_ROLES.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Home sites</span>
            <input
              value={newEmployee.sites}
              onChange={(event) => setNewEmployee({ ...newEmployee, sites: event.target.value })}
              className="h-9 rounded-lg border border-input bg-card px-2"
              placeholder="IQA, POND"
            />
          </label>
          <div className="flex items-end gap-2">
            <button type="button" onClick={addEmployee} className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
              Save employee
            </button>
            <button type="button" onClick={() => setShowAddEmployee(false)} className="h-9 rounded-lg border border-input px-3 text-sm">
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section
        className={cn(
          boardView === "overview" || boardView === "settings"
            ? ""
            : "overflow-hidden rounded-2xl border border-border bg-card",
        )}
      >
        {boardView !== "overview" && boardView !== "settings" ? (
          <div className="flex flex-wrap items-end gap-3 border-b border-border px-3 py-3 sm:px-4">
            <label className="grid gap-1 text-sm text-muted-foreground">
              <span>Search</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or role"
                className="h-9 w-44 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
              />
            </label>
            <label className="grid gap-1 text-sm text-muted-foreground">
              <span>Role</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
              >
                <option value="">All roles</option>
                {CREW_ROLES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-muted-foreground">
              <span>Site</span>
              <select
                value={site}
                onChange={(event) => setSite(event.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
              >
                <option value="">All sites</option>
                {sitesBook.sites.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.code}
                  </option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex flex-wrap items-end gap-2 pb-0.5">
              <p className="pb-2 text-sm text-muted-foreground">{hydrated ? `${rows.length} people` : "Loading…"}</p>
              <button
                type="button"
                onClick={() => setShowAddEmployee((open) => !open)}
                className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Add employee
              </button>
            </div>
          </div>
        ) : null}

        {boardView === "overview" ? (
          <CrewOverview
            rows={overview.rows.filter((row) => row.person.active !== false)}
            rotationBook={rotationBook}
            opsBook={opsBook}
            asOf={asOf}
            reminders={{
              planDays: notify.reminderPlanDays,
              checkDays: notify.reminderCheckDays,
              escalateDays: notify.reminderEscalateDays,
            }}
            onOpenPerson={openPersonRotation}
            onOpenRotation={(rotationId) => {
              setSelectedRotationId(rotationId);
              setSelectedId(null);
            }}
          />
        ) : null}

        {boardView === "travel" ? (
          <div className="border-t border-border p-3 sm:p-4">
            <CrewTravelDesk
              rows={rows}
              opsBook={opsBook}
              flightBook={flightBook}
              today={asOf}
              onOpen={openPersonRotation}
            />
          </div>
        ) : null}

        {boardView === "accommodation" ? (
          <div className="border-t border-border p-3 sm:p-4">
            <CrewAccommodationDesk
              rows={rows}
              opsBook={opsBook}
              today={asOf}
              onOpen={openPersonRotation}
              onMarkBooked={(personId) =>
                patchOps(personId, (current) => ({ ...current, accommodation: "booked" }))
              }
            />
          </div>
        ) : null}

        {boardView === "year" ? (
          <div className="max-h-[min(70vh,40rem)] overflow-auto border-t border-border p-3 sm:p-4">
            <CrewYearTape
              year={scheduleYear}
              today={today}
              rows={scheduleRows.map((row) => ({ person: row.person }))}
              sites={sitesBook.sites}
              onOpen={openPersonRotation}
              onMonthClick={(year, monthIndex, personId) => {
                const month = String(monthIndex).padStart(2, "0");
                const monthIso = `${year}-${month}-01`;
                setMonthCursor(monthIso);
                setScheduleYear(year);
                router.push(
                  withYearQuery("/month", {
                    month: `${year}-${month}`,
                    ...(personId ? { person: personId } : {}),
                  }),
                  { scroll: false },
                );
              }}
              onAddRotation={(personId, input) =>
                patchRoster((current) => addNextRotation(current, personId, input))
              }
              onHidePerson={(personId) => patchScheduleView((current) => hidePerson(current, personId))}
              hiddenPeople={hiddenPeople}
              onShowPerson={(personId) => patchScheduleView((current) => showPerson(current, personId))}
              onShowAllHidden={() => patchScheduleView((current) => showAllPeople(current))}
            />
          </div>
        ) : null}

        {boardView === "month" ? (
          <div className="flex flex-col gap-4 border-t border-border p-3 sm:p-4">
            <CrewMonthGrid
              monthStart={monthCursor}
              today={today}
              rows={scheduleRows.map((row) => ({ person: row.person }))}
              opsBook={opsBook}
              sites={sitesBook.sites}
              onOpen={(personId) => openPersonRotation(personId, asOf)}
              onOpenDay={(personId, iso) => openPersonRotation(personId, iso)}
              onPrev={() => setMonthCursor((current) => shiftMonth(current, -1))}
              onNext={() => setMonthCursor((current) => shiftMonth(current, 1))}
              onThisMonth={() => setMonthCursor(`${scheduleYear}-11-01`)}
              onSetBookWindow={(personId, recipe) => patchOps(personId, recipe)}
              onAddRotation={(personId, input) =>
                patchRoster((current) => addNextRotation(current, personId, input))
              }
              onExtendStay={(personId, stintFrom, newOut) => {
                // Place end is Out — extending the bar moves Out everywhere.
                patchRoster((current) => extendStay(current, personId, stintFrom, newOut));
                setRotationBook((current) => {
                  const hit = current.rotations.find(
                    (row) => row.personId === personId && row.plannedIn === stintFrom,
                  );
                  if (!hit) return current;
                  const next = extendRotationOut(current, hit.id, newOut);
                  saveRotations(next);
                  return next;
                });
              }}
              onHidePerson={(personId) => patchScheduleView((current) => hidePerson(current, personId))}
              hiddenPeople={hiddenPeople}
              onShowPerson={(personId) => patchScheduleView((current) => showPerson(current, personId))}
              onShowAllHidden={() => patchScheduleView((current) => showAllPeople(current))}
            />
          </div>
        ) : null}

        {boardView === "settings" ? (
          <CrewSettingsPanel
            sitesBook={sitesBook}
            rolesBook={rolesBook}
            notify={notify}
            years={scheduleYears}
            onSitesChange={(book) => {
              setSitesBook(book);
              saveSitesBook(book);
            }}
            onRolesChange={(book) => {
              setRolesBook(book);
              saveRolesBook(book);
            }}
            onNotifyChange={patchNotify}
            onYearsChange={setScheduleYears}
          />
        ) : null}

        {boardView === "employees" ? (
          <div className="max-h-[min(70vh,40rem)] overflow-y-auto border-t border-border">
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">No crew match these filters.</p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => {
                  const isActive = row.person.active !== false;
                  return (
                    <li key={row.person.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openPersonRotation(row.person.id)}
                        className="min-w-0 flex-1 text-left hover:opacity-80"
                      >
                        <p className="text-sm font-medium">{row.person.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {roleLabel(row.person)}
                          {row.person.manual ? " · Manual" : ""}
                        </p>
                      </button>
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                          isActive ? "bg-emerald-100 text-emerald-950" : "bg-stone-200 text-stone-700",
                        )}
                      >
                        {isActive ? "Active" : "Inactive"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.person.id)}
                        className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
                      >
                        {isActive ? "Add rotation" : "Set active + add rotation"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          patchRoster((current) =>
                            setEmploymentStatus(current, row.person.id, isActive ? "inactive" : "active"),
                          )
                        }
                        className="h-8 rounded-lg border border-input px-3 text-xs font-medium hover:bg-muted"
                      >
                        {isActive ? "Set inactive" : "Set active"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}

        <div className={cn("min-w-0 max-h-[min(70vh,40rem)] overflow-auto", boardView !== "list" && "hidden")}>
          <div className="sticky top-0 z-10 grid min-w-[56rem] grid-cols-[minmax(9rem,1.2fr)_4.5rem_6.5rem_7rem_6.5rem_6.5rem_6rem_5.5rem_5.5rem] gap-2 border-b border-border bg-card px-4 py-2 text-[13px] font-medium tracking-wide text-muted-foreground uppercase">
            <span>Crew</span>
            <span>Site</span>
            <span>Status</span>
            <span>IN</span>
            <span>OUT</span>
            <span>Rotation</span>
            <span>Departure</span>
            <span>Return</span>
            <span>Action</span>
          </div>
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">No crew match these filters.</p>
          ) : (
            <ul>
              {rows.map((row, index) => {
                const ops = opsFor(opsBook, row.person.id);
                const progress =
                  row.daysOnSite == null ? null : Math.min(100, Math.round((row.daysOnSite / row.rotationDays) * 100));
                const previous = index > 0 ? rows[index - 1] : null;
                const showRoleHeader = !previous || previous.person.role !== row.person.role;
                return (
                  <li key={row.person.id} className="border-b border-border">
                    {showRoleHeader ? (
                      <CrewRoleHeader
                        role={row.person.role}
                        spaced={index > 0}
                        count={rows.filter((entry) => entry.person.role === row.person.role).length}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openPersonRotation(row.person.id)}
                      className="grid min-w-[56rem] w-full grid-cols-[minmax(9rem,1.2fr)_4.5rem_6.5rem_7rem_6.5rem_6.5rem_6rem_5.5rem_5.5rem] items-center gap-2 px-4 py-3 text-left hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{row.person.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {row.site ? catalogSiteLabel(row.site, sitesBook) : "Off site"}
                          {row.fourWeeksOut ? " · 4 weeks out" : ""}
                        </span>
                      </span>
                      <span>
                        {row.site ? (
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", siteTone(row.site, sitesBook))}>
                            {row.site}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </span>
                      <span>
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", statusTone(row.duty))}>
                          {dutyLabel(row.duty)}
                        </span>
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {row.plannedIn ? formatMedium(row.plannedIn) : "-"}
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {row.plannedOut ? formatMedium(row.plannedOut) : "-"}
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {row.rotationDay == null ? "-" : `Day ${row.rotationDay} of ${row.rotationDays}`}
                        {progress != null ? <span className="mt-0.5 block text-[13px]">{progress}%</span> : null}
                      </span>
                      <span
                        className={cn(
                          "text-sm tabular-nums",
                          row.overdue && "font-semibold text-rose-700",
                          row.dueSoon && !row.overdue && "font-medium text-amber-800",
                          !row.overdue && !row.dueSoon && "text-muted-foreground",
                        )}
                      >
                        {departureLabel(row)}
                      </span>
                      <span className="text-xs text-muted-foreground">{travelLabel(ops, row)}</span>
                      <span className="text-xs font-medium text-primary">{row.alerts.length ? "Resolve" : "Open"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {selected && selectedOps ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/45 p-0 sm:p-4" role="presentation">
          <button type="button" aria-label="Close crew detail" className="absolute inset-0" onClick={() => setSelectedId(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="crew-person-title"
            className="relative z-10 flex h-full w-full max-w-5xl flex-col overflow-hidden bg-card shadow-2xl sm:h-[min(92dvh,56rem)] sm:rounded-2xl"
          >
            <PersonProfile
              snap={selected}
              ops={selectedOps}
              staffName={staffName}
              year={CREW_SCHEDULE.year}
              flightBook={flightBook}
              onClose={() => setSelectedId(null)}
              onChange={(recipe) => patchOps(selected.person.id, recipe)}
              onSaveFlight={saveFlightBooking}
              onEmploymentStatus={(status) =>
                patchRoster((current) => setEmploymentStatus(current, selected.person.id, status))
              }
              onAddRotation={(input) =>
                patchRoster((current) => addNextRotation(current, selected.person.id, input))
              }
            />
          </div>
        </div>
      ) : null}

      {selectedRotation && selectedRotationPerson ? (
        <CrewRotationDrawer
          key={selectedRotation.id}
          rotation={selectedRotation}
          person={selectedRotationPerson}
          people={people}
          book={rotationBook}
          asOf={asOf}
          staffName={staffName}
          sites={sitesBook.sites}
          roles={[...new Set([...CREW_ROLES, ...rolesBook.extras])]}
          personOps={opsFor(opsBook, selectedRotationPerson.id)}
          onClose={() => setSelectedRotationId(null)}
          onSaveBook={saveRotationBook}
          onSaveRoster={patchRoster}
          onPatchOps={(recipe) => patchOps(selectedRotationPerson.id, recipe)}
        />
      ) : null}

      {remindersOpen && onCloseReminders ? (
        <CrewReminders
          rows={activeOverviewRows}
          rotationBook={rotationBook}
          opsBook={opsBook}
          asOf={asOf}
          planDays={notify.reminderPlanDays}
          onClose={onCloseReminders}
          onOpenPerson={(personId) => {
            openPersonRotation(personId);
            onCloseReminders();
          }}
          onOpenRotation={(rotationId) => {
            setSelectedRotationId(rotationId);
            setSelectedId(null);
            onCloseReminders();
          }}
        />
      ) : null}
    </div>
  );
}

function PersonProfile({
  snap,
  ops,
  staffName,
  year,
  flightBook,
  onClose,
  onChange,
  onSaveFlight,
  onEmploymentStatus,
  onAddRotation,
}: {
  snap: CrewSnapshot;
  ops: CrewPersonOps;
  staffName: string;
  year: number;
  flightBook: FlightBook;
  onClose: () => void;
  onChange: (recipe: (current: CrewPersonOps) => CrewPersonOps) => void;
  onSaveFlight: (booking: FlightBooking) => void;
  onEmploymentStatus: (status: EmploymentStatus) => void;
  onAddRotation: (input: { site: string; from: string; out: string; role: string }) => void;
}) {
  const [note, setNote] = useState("");
  const segments = personSegments(snap.person);
  const progress =
    snap.daysOnSite == null ? null : Math.min(100, Math.round((snap.daysOnSite / snap.rotationDays) * 100));
  const cameIn = snap.plannedIn;
  const goingOut = snap.expectedOut || snap.plannedOut;
  const isActive = snap.person.active !== false;

  function addUpdate() {
    const text = note.trim();
    if (!text) return;
    const entry: CrewUpdate = {
      id: `u-${Date.now()}`,
      text,
      by: staffName,
      at: new Date().toISOString(),
    };
    onChange((current) => ({ ...current, updates: [entry, ...current.updates] }));
    setNote("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Schedule year {year}
          </p>
          <h2 id="crew-person-title" className="mt-1 text-lg font-semibold tracking-tight">
            {snap.person.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{roleLabel(snap.person)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", statusTone(snap.duty))}>
              {dutyLabel(snap.duty)}
            </span>
            {snap.site ? (
              <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", siteTone(snap.site))}>
                {siteLabel(snap.site)}
              </span>
            ) : null}
            {snap.overdue ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-900">
                <AlertTriangle className="size-3.5" /> Overdue
              </span>
            ) : null}
            {snap.fourWeeksOut ? (
              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950">
                4 weeks out
              </span>
            ) : null}
            {snap.dueSoon && !snap.overdue ? (
              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950">
                Leave in {snap.daysUntilOut}d
              </span>
            ) : null}
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                isActive ? "bg-emerald-100 text-emerald-950" : "bg-stone-200 text-stone-700",
              )}
            >
              {isActive ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <div>
          <p className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">Employment</p>
          <p className="mt-1 text-sm">
            {isActive
              ? "Included in live ops, travel, and action lists."
              : "Hidden from live ops until set active again."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onEmploymentStatus(isActive ? "inactive" : "active")}
          className="h-9 rounded-lg border border-input bg-card px-3 text-sm font-medium hover:bg-muted"
        >
          {isActive ? "Set inactive" : "Set active"}
        </button>
      </section>

      <CrewNextRotationForm
        defaultSite={snap.site || snap.person.homeSites[0] || "IQA"}
        defaultRole={snap.person.role}
        defaultDays={rotationFor(snap.person)}
        isActive={isActive}
        onSave={onAddRotation}
      />

      <section className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
        <Fact label="Year" value={String(year)} />
        <Fact label="IN" value={cameIn ? formatMedium(cameIn) : "-"} />
        <Fact
          label="OUT"
          value={
            goingOut
              ? `${formatMedium(goingOut)}${
                  snap.daysUntilOut == null
                    ? ""
                    : snap.daysUntilOut < 0
                      ? ` · ${Math.abs(snap.daysUntilOut)}d overdue`
                      : ` · in ${snap.daysUntilOut}d`
                }`
              : "-"
          }
        />
      </section>

      <section className="grid gap-3 rounded-xl bg-muted/40 p-3">
        <p className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">Current assignment</p>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Fact label="Site" value={snap.site ? siteLabel(snap.site) : "No current assignment"} />
          <Fact label="Status" value={dutyLabel(snap.duty)} />
          <Fact label="Planned rotation" value={`${snap.rotationDays} days`} />
          <Fact
            label="Days on site"
            value={
              snap.rotationDay == null
                ? "-"
                : `Day ${snap.rotationDay} of ${snap.rotationDays}${progress != null ? ` · ${progress}%` : ""}`
            }
          />
          <Fact label="IN" value={snap.plannedIn ? formatMedium(snap.plannedIn) : "-"} />
          <Fact
            label="OUT"
            value={snap.plannedOut ? `${formatMedium(snap.plannedOut)} · end of stay` : "-"}
          />
        </dl>
        {progress != null ? (
          <div className="mt-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", snap.overdue ? "bg-rose-600" : snap.dueSoon ? "bg-amber-500" : "bg-primary")}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-3">
        <p className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">IN &amp; OUT</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <DateField
            label="IN"
            value={ops.plannedInOverride ?? ""}
            onChange={(value) => onChange((current) => ({ ...current, plannedInOverride: value || null }))}
          />
          <DateField
            label="OUT"
            value={ops.plannedOutOverride ?? ""}
            onChange={(value) => onChange((current) => ({ ...current, plannedOutOverride: value || null }))}
          />
        </div>
      </section>

      <CrewFlightPanel
        personId={snap.person.id}
        personName={snap.person.name}
        role={snap.person.role}
        site={snap.site}
        plannedIn={snap.plannedIn}
        plannedOut={snap.plannedOut}
        staffName={staffName}
        flightBook={flightBook}
        onSave={onSaveFlight}
      />

      <section className="grid gap-3">
        <p className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">
          Accommodation
        </p>
        <label className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={ops.accommodation === "booked" || ops.accommodation === "confirmed"}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                accommodation: event.target.checked ? "booked" : "needed",
              }))
            }
          />
          <span className="font-semibold">Accommodation booked</span>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Accommodation confirmation #</span>
          <input
            value={ops.accommodationNotes}
            onChange={(event) => onChange((current) => ({ ...current, accommodationNotes: event.target.value }))}
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
            placeholder="Hotel / camp confirmation"
          />
        </label>
        {(snap.person.flights?.length ?? 0) > 0 ? (
          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <p className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">Sheet flights</p>
            <ul className="space-y-2 text-sm">
              {snap.person.flights!.map((flight, index) => (
                <li key={`${snap.person.id}-flight-${index}`} className="rounded-lg bg-muted/50 px-3 py-2">
                  {flight.arriveIqa ? (
                    <p>
                      <span className="font-semibold text-teal-800">Inbound</span>
                      {" · "}
                      {formatMedium(flight.arriveIqa)}
                      {flight.arriveRef ? ` · ${flight.arriveRef}` : ""}
                    </p>
                  ) : null}
                  {flight.departIqa ? (
                    <p>
                      <span className="font-semibold text-sky-800">Outbound</span>
                      {" · "}
                      {formatMedium(flight.departIqa)}
                      {flight.departRef ? ` · ${flight.departRef}` : ""}
                    </p>
                  ) : null}
                  {(flight.camp || flight.note) && (
                    <p className="text-xs text-muted-foreground">
                      {[flight.camp, flight.note].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="grid gap-3">
        <p className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">Updates</p>
        <div className="flex gap-2">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addUpdate();
              }
            }}
            placeholder="Update"
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-2 text-sm"
          />
          <button
            type="button"
            onClick={addUpdate}
            className="rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Add
          </button>
        </div>
        {ops.updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No updates yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ops.updates.map((entry) => (
              <li key={entry.id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <p>{entry.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.by} · {new Date(entry.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <p className="text-[13px] font-medium tracking-wide text-muted-foreground uppercase">Work & travel timeline</p>
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dated marks for this person yet.</p>
        ) : (
          <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
            {segments.map((segment) => (
              <li
                key={`${segment.from}-${segment.mark}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm"
              >
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", markTone(segment.mark))}>
                  {isOffRotation(segment.mark) ? "Out" : segment.mark}
                </span>
                <span className="text-muted-foreground">
                  {segment.from === segment.to
                    ? formatMedium(segment.from)
                    : `${formatMedium(segment.from)} - ${formatMedium(segment.to)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
      />
    </label>
  );
}

function StatusField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CrewBookingStatus;
  onChange: (value: CrewBookingStatus) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as CrewBookingStatus)}
        className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
      >
        {CREW_BOOKING_STATUSES.map((row) => (
          <option key={row.value} value={row.value}>
            {row.label}
          </option>
        ))}
      </select>
    </label>
  );
}
