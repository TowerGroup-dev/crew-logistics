"use client";

import { SYNC_CHANGE_EVENT } from "@/lib/crew-sync";
import { siteOnDay } from "@/lib/crew-site-days";
import { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, SlidersHorizontal, X } from "lucide-react";
import { useCrewUndo } from "@/components/crew-undo-provider";
import {
  buildCrewBriefing,
  buildInstantAlert,
  describeOpsChange,
} from "@/lib/crew-briefing";
import {
  CREW_BOOKING_STATUSES,
  bookingLabel,
  clearOpsForPerson,
  clearReturnWindowIfConfirmed,
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
  normalizeRole,
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
  addProvisionalEmployee,
  commitProvisionalEmployee,
  discardProvisionalEmployee,
  loadRoster,
  mergePeople,
  mergeProjects,
  removeManualEmployee,
  removeRotationPlan,
  saveRoster,
  setEmploymentStatus,
  setRotationPlanNote,
  setStayNote,
  setDateNote,
  setStayIn,
  setStayOut,
  slugEmployee,
  upsertEmployeeProfile,
  type CrewRosterBook,
  type EmploymentStatus,
} from "@/lib/crew-roster";
import { CrewFlightPanel } from "@/components/crew-flight-panel";
import { CrewMonthGrid, monthStartFromIso } from "@/components/crew-month-grid";
import { KeepAlive } from "@/components/crew-keep-alive";
import { CrewNextRotationForm } from "@/components/crew-next-rotation";
import { CrewOverview, CrewReminders } from "@/components/crew-overview";
import { buildSituationReminders } from "@/lib/crew-situation-reminders";
import { CrewRoleHeader } from "@/components/crew-role-header";
import { CrewRoleAddDialog } from "@/components/crew-role-add-dialog";
import { CrewMonthlyReportPanel } from "@/components/crew-reports";
import { CrewAccommodationDesk } from "@/components/crew-accommodation-desk";
import { CrewTravelDesk } from "@/components/crew-travel-desk";
import { CrewYearTape } from "@/components/crew-year-tape";
import { CrewRotationDrawer } from "@/components/crew-rotation-drawer";
import {
  appendActivity,
  loadActivityLog,
  saveActivityLog,
  type CrewActivityLog,
} from "@/lib/crew-activity-log";
import {
  currentRotationForPerson,
  extendRotationOut,
  loadRotations,
  mergeRotationBook,
  dropAssumedFlights,
  applyRotationMoves,
  newMove,
  upsertRotation,
  bookingsFromRotations,
  migrateOpsIntoRotations,
  rotationForPersonOnDay,
  saveRotations,
  type RotationBook,
} from "@/lib/crew-rotations";
import { autoSeedTravelOps } from "@/lib/crew-auto-ops";
import {
  clearFlightsForPerson,
  loadFlights,
  saveFlights,
  syncOpsFromFlights,
  upsertFlightBooking,
  type FlightBook,
  type FlightBooking,
} from "@/lib/crew-flights";
import {
  loadStopovers,
  saveStopovers,
  clearStopoversForPerson,
  paintStopoverDays,
  toggleStopover,
  type CrewStopoverBook,
} from "@/lib/crew-stopovers";
import { addScheduleYear, loadScheduleYears } from "@/lib/crew-years";
import {
  addPersonUnderRole,
  hidePerson,
  hideRoleRow,
  hiddenRoleRows,
  isRoleRowHidden,
  loadScheduleViewPrefs,
  membershipsForPerson,
  resetPersonRoleSections,
  saveScheduleViewPrefs,
  setCalendarMode,
  showAllPeople,
  showPerson,
  unhideRoleRow,
  type CrewScheduleViewPrefs,
} from "@/lib/crew-schedule-view";
import {
  loadRolesBook,
  saveRolesBook,
  type CrewRolesBook,
} from "@/lib/crew-roles-catalog";
import {
  DEFAULT_SITES,
  loadSitesBook,
  saveSitesBook,
  siteColour,
  catalogSiteLabel,
  type CrewSite,
  type CrewSitesBook,
} from "@/lib/crew-sites";
import {
  loadTravelHubs,
  saveTravelHubs,
  type CrewTravelHubsBook,
} from "@/lib/crew-travel-hubs";
import { CrewSettingsPanel } from "@/components/crew-settings-panel";
import { addDays, daysBetween, formatLong, formatMedium, todayInZone } from "@/lib/dates";
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
  | "reports"
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

/** Length of the current stay in days (In to Out), falling back to the standard rotation. */
function stayLength(row: CrewSnapshot) {
  if (row.plannedIn && row.expectedOut && row.expectedOut > row.plannedIn) {
    return Math.max(1, daysBetween(row.plannedIn, row.expectedOut));
  }
  return row.rotationDays;
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
  const today = todayInZone();
  const boardView = view;
  /** Eager client load, board is dynamic(ssr:false), so first paint already has local data. */
  const [opsBook, setOpsBook] = useState<CrewOpsBook>(() => loadCrewOps());
  const [flightBook, setFlightBook] = useState<FlightBook>(() => loadFlights());
  const [stopoverBook, setStopoverBook] = useState<CrewStopoverBook>(() => loadStopovers());
  const [roster, setRoster] = useState<CrewRosterBook>(() => loadRoster());
  const [hydrated, setHydrated] = useState(false);
  const [role, setRole] = useState("");
  const [site, setSite] = useState("");
  const [scheduleYear, setScheduleYear] = useState<number>(CREW_SCHEDULE.year);
  const [scheduleYears, setScheduleYears] = useState<number[]>(() => [...loadScheduleYears()]);
  /** Only set when jumping from Year tape, keeps Month free-scroll starting at January. */
  const [monthScrollTo, setMonthScrollTo] = useState<string | null>(null);
  /** Month picked in the address or from the Year view (null: follow today). */
  const [monthCursor, setMonthCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** Phones: Role / Site / Add employee folded away behind a Filters button. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRotationId, setSelectedRotationId] = useState<string | null>(null);
  const [rotationBook, setRotationBook] = useState<RotationBook>(() => loadRotations());
  /** Which trip to open on the Travel tab when a stay drawer opens from the Flights list. */
  const [openTravelFor, setOpenTravelFor] = useState<"outbound" | "return" | "moves" | null>(null);
  // Calendar draws both flight records and trips typed on stays (route, legs, overnight stops).
  const calendarFlightBook = useMemo<FlightBook>(
    () => ({ bookings: [...flightBook.bookings, ...bookingsFromRotations(rotationBook)] }),
    [flightBook, rotationBook],
  );
  const [staffName, setStaffName] = useState("Crew coordinator");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [notify, setNotify] = useState<CrewNotifySettings>(() => loadNotifySettings());
  const [scheduleView, setScheduleView] = useState<CrewScheduleViewPrefs>(() => loadScheduleViewPrefs());
  const [activityLog, setActivityLog] = useState<CrewActivityLog>(() => loadActivityLog());
  const [roleAddSection, setRoleAddSection] = useState<string | null>(null);
  /** Keep heavy calendar panes mounted after first open so tab switches do not rebuild them. */
  const [seenViews, setSeenViews] = useState<Partial<Record<CrewBoardView, true>>>(() => ({
    [view]: true,
  }));
  const [employeeEditId, setEmployeeEditId] = useState<string | null>(null);
  const [employeeEditDraft, setEmployeeEditDraft] = useState({
    name: "",
    role: "",
    notes: "",
    category: "" as "" | "Regular" | "Local" | "Subcontractor",
  });
  const [sitesBook, setSitesBook] = useState<CrewSitesBook>(() => loadSitesBook());
  const [travelHubsBook, setTravelHubsBook] = useState<CrewTravelHubsBook>(() => loadTravelHubs());
  const [rolesBook, setRolesBook] = useState<CrewRolesBook>(() => loadRolesBook());
  const [newEmployee, setNewEmployee] = useState({ name: "", role: "Labourer" });
  const { pushSnapshot, registerRestorer } = useCrewUndo();
  const booksRef = useRef({
    opsBook,
    roster,
    rotationBook,
    flightBook,
    stopoverBook,
  });
  const skipHistoryRef = useRef(false);
  booksRef.current = { opsBook, roster, rotationBook, flightBook, stopoverBook };

  useEffect(() => {
    setSeenViews((current) => (current[boardView] ? current : { ...current, [boardView]: true }));
  }, [boardView]);

  function captureHistory() {
    if (!hydrated || skipHistoryRef.current) return;
    pushSnapshot(booksRef.current);
  }

  useEffect(() => {
    registerRestorer((snapshot) => {
      skipHistoryRef.current = true;
      setOpsBook(snapshot.opsBook);
      saveCrewOps(snapshot.opsBook);
      setRoster(snapshot.roster);
      saveRoster(snapshot.roster);
      setRotationBook(snapshot.rotationBook);
      saveRotations(snapshot.rotationBook);
      setFlightBook(snapshot.flightBook);
      saveFlights(snapshot.flightBook);
      setStopoverBook(snapshot.stopoverBook || {});
      saveStopovers(snapshot.stopoverBook || {});
      skipHistoryRef.current = false;
    });
    return () => registerRestorer(null);
  }, [registerRestorer]);

  useEffect(() => {
    const yearParam = Number(searchParams.get("year") || "");
    if (yearParam && Number.isInteger(yearParam)) {
      setScheduleYear(yearParam);
      setScheduleYears((current) => (current.includes(yearParam) ? current : addScheduleYear(current, yearParam)));
    }
    const monthParam = searchParams.get("month") || searchParams.get("start");
    if (monthParam && /^\d{4}-\d{2}/.test(monthParam)) {
      const monthIso = monthStartFromIso(monthParam.length === 7 ? `${monthParam}-01` : monthParam);
      setMonthCursor(monthIso);
      setMonthScrollTo(monthIso);
    }
    const personParam = searchParams.get("person");
    if (personParam) setSelectedId(personParam);
  }, [searchParams]);

  // First paint already has local books; unlock undo/sync immediately, migrate in the background.
  useLayoutEffect(() => {
    saveSitesBook(sitesBook);
    saveTravelHubs(travelHubsBook);
    setHydrated(true);
    const person = new URLSearchParams(window.location.search).get("person");
    if (person) setSelectedId(person);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot boot from eager state
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const todayIso = todayInZone();
    const loadedOps = opsBook;
    const flights = flightBook;
    const loadedRoster = roster;

    startTransition(() => {
      const seededOps = autoSeedTravelOps(CREW_SCHEDULE.people, loadedOps, todayIso);
      if (seededOps !== loadedOps) {
        saveCrewOps(seededOps);
        setOpsBook(seededOps);
      }

      const mergedPeople = mergePeople(CREW_SCHEDULE.people, loadedRoster);
      const merged = mergeRotationBook(mergedPeople, rotationBook);
      const migrated = migrateOpsIntoRotations(merged, seededOps, flights);
      const withFlights = dropAssumedFlights(migrated);
      setRotationBook(withFlights);
      saveRotations(withFlights);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- migrate once after hydrate
  }, [hydrated]);

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

  function patchOps(
    personId: string,
    recipe: (current: CrewPersonOps) => CrewPersonOps,
    options?: { history?: boolean },
  ) {
    // Undo is only for Month calendar edits (opt in with history: true).
    if (options?.history) captureHistory();
    setOpsBook((prev) => {
      const before = opsFor(prev, personId);
      const after = clearReturnWindowIfConfirmed(recipe(before));
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

  function patchRoster(recipe: (current: CrewRosterBook) => CrewRosterBook, options?: { history?: boolean }) {
    // Undo is only for Month calendar edits (opt in with history: true).
    if (options?.history) captureHistory();
    setRoster((prev) => {
      const next = recipe(prev);
      saveRoster(next);
      return next;
    });
  }

  /** Clear placements / ops / flights / stopovers for a discarded or deleted hire. */
  function purgePersonSideState(personId: string) {
    setStopoverBook((prev) => {
      const next = clearStopoversForPerson(prev, personId);
      saveStopovers(next);
      return next;
    });
    setOpsBook((prev) => {
      const next = clearOpsForPerson(prev, personId);
      saveCrewOps(next);
      return next;
    });
    setFlightBook((prev) => {
      const next = clearFlightsForPerson(prev, personId);
      saveFlights(next);
      return next;
    });
    setRotationBook((prev) => {
      const next = {
        ...prev,
        rotations: prev.rotations.filter((row) => row.personId !== personId),
      };
      saveRotations(next);
      return next;
    });
    if (selectedId === personId) setSelectedId(null);
  }

  function saveFlightBooking(booking: FlightBooking) {
    const nextFlights = upsertFlightBooking(flightBook, booking);
    setFlightBook(nextFlights);
    saveFlights(nextFlights);
    patchOps(booking.personId, (current) =>
      syncOpsFromFlights({ [booking.personId]: current }, nextFlights, booking.personId),
    );
  }

  // Stays from the Excel and the roster; booked moves between sites then reshape them for display.
  const basePeople = useMemo(() => mergePeople(CREW_SCHEDULE.people, roster), [roster]);
  const people = useMemo(() => applyRotationMoves(basePeople, rotationBook), [basePeople, rotationBook]);
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

  function openPersonRotation(personId: string, iso = asOf, travel: "outbound" | "return" | "moves" | null = null) {
    setOpenTravelFor(travel);
    // Prefer the stay covering the clicked day, else current/next from today, never a past rotation.
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

  // Opening the Calendar always starts in View (Edit is a deliberate click each time).
  useEffect(() => {
    if (boardView === "month" || boardView === "year" || boardView === "list") {
      setScheduleView((current) => setCalendarMode(current, "view"));
    }
  }, [boardView]);

  // Someone on another computer saved: reload just the books that changed.
  useEffect(() => {
    function onShared(event: Event) {
      const keys = new Set((event as CustomEvent<{ keys: string[] }>).detail?.keys ?? []);
      if (keys.has("tower-arctic-crew-roster")) setRoster(loadRoster());
      if (keys.has("tower-arctic-crew-rotations-v1")) setRotationBook(loadRotations());
      if (keys.has("tower-arctic-crew-ops")) setOpsBook(loadCrewOps());
      if (keys.has("tower-arctic-crew-flights")) setFlightBook(loadFlights());
      if (keys.has("tower-arctic-crew-stopovers-v1")) setStopoverBook(loadStopovers());
      if (keys.has("tower-arctic-crew-notify")) setNotify(loadNotifySettings());
      if (keys.has("tower-arctic-crew-activity-log-v1")) setActivityLog(loadActivityLog());
      if (keys.has("tower-arctic-crew-sites-v1")) setSitesBook(loadSitesBook());
      if (keys.has("tower-arctic-crew-travel-hubs-v1")) setTravelHubsBook(loadTravelHubs());
      if (keys.has("tower-arctic-crew-roles-v1")) setRolesBook(loadRolesBook());
      if (keys.has("tower-arctic-crew-years")) setScheduleYears([...loadScheduleYears()]);
    }
    window.addEventListener(SYNC_CHANGE_EVENT, onShared);
    return () => window.removeEventListener(SYNC_CHANGE_EVENT, onShared);
  }, []);

  // Keep rotation book in sync when roster people/stints change
  useEffect(() => {
    if (!hydrated) return;
    setRotationBook((prev) => {
      const merged = dropAssumedFlights(mergeRotationBook(basePeople, prev));
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
  }, [hydrated, basePeople]);

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
    patchRoster((current) => ({
      ...current,
      employees: [
        ...current.employees,
        {
          id,
          name,
          role: roleName,
          homeSites: [],
          projectIds: [],
          rotationDays: 42,
          notes: "",
          createdAt: new Date().toISOString(),
          employmentStatus: "active",
        },
      ],
      employmentStatus: { ...current.employmentStatus, [id]: "active" },
    }));
    setNewEmployee({ name: "", role: "Labourer" });
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

  function logActivity(
    input: Omit<Parameters<typeof appendActivity>[1], "at"> & { at?: string },
  ) {
    setActivityLog((prev) => {
      const next = appendActivity(prev, input);
      saveActivityLog(next);
      return next;
    });
  }

  function hideCalendarPerson(personId: string, sectionRole?: string) {
    patchScheduleView((current) =>
      sectionRole ? hideRoleRow(current, personId, sectionRole) : hidePerson(current, personId),
    );
  }

  function showCalendarPerson(personId: string, sectionRole?: string) {
    const person = overview.rows.find((row) => row.person.id === personId)?.person;
    const homeRole = person?.role || sectionRole || "Labourer";
    if (sectionRole) {
      patchScheduleView((current) => unhideRoleRow(current, personId, sectionRole, homeRole));
      logActivity({
        kind: "role_section_move",
        personId,
        personName: person?.name,
        text: `${person?.name || personId} shown under ${sectionRole}`,
      });
      return;
    }
    patchScheduleView((current) => showPerson(current, personId));
  }

  function openEmployeeEdit(personId: string) {
    const person = overview.rows.find((row) => row.person.id === personId)?.person;
    if (!person) return;
    const overlay = roster.employees.find((row) => row.id === personId);
    setEmployeeEditId(personId);
    setEmployeeEditDraft({
      name: person.name,
      role: person.role,
      notes: overlay?.notes || "",
      category:
        person.category === "Regular" ||
        person.category === "Local" ||
        person.category === "Subcontractor"
          ? person.category
          : "",
    });
  }

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

  const calendarRows = useMemo(() => {
    const out: { person: (typeof rows)[number]["person"]; displayRole: string }[] = [];
    for (const row of rows) {
      if (scheduleView.hiddenPersonIds.includes(row.person.id)) continue;
      const memberships = membershipsForPerson(scheduleView, row.person.id, row.person.role);
      for (const displayRole of memberships) {
        if (isRoleRowHidden(scheduleView, row.person.id, displayRole)) continue;
        out.push({ person: row.person, displayRole });
      }
    }
    return out;
  }, [rows, scheduleView]);

  const hiddenPeople = useMemo(() => {
    const byId = new Map(overview.rows.map((row) => [row.person.id, row.person]));
    const out: { id: string; name: string; role?: string }[] = [];
    for (const id of scheduleView.hiddenPersonIds) {
      const person = byId.get(id);
      out.push({ id, name: person?.name || id, role: person?.role });
    }
    for (const row of hiddenRoleRows(scheduleView)) {
      if (scheduleView.hiddenPersonIds.includes(row.personId)) continue;
      const person = byId.get(row.personId);
      out.push({ id: row.personId, name: person?.name || row.personId, role: row.role });
    }
    return out;
  }, [overview.rows, scheduleView]);

  const roleCatalog = useMemo(
    () => [...new Set([...CREW_ROLES, ...rolesBook.extras])],
    [rolesBook.extras],
  );

  // Reports open on the month you picked, else this month (it was always January).
  // A past year opens on December, a future one on January (asOf handles that).
  const reportMonth = useMemo(() => {
    const iso = monthCursor && Number(monthCursor.slice(0, 4)) === scheduleYear ? monthCursor : asOf;
    return { year: scheduleYear, month: Number(iso.slice(5, 7)) || 1 };
  }, [asOf, monthCursor, scheduleYear]);

  const selected = overview.rows.find((row) => row.person.id === selectedId) ?? null;
  const selectedOps = selected ? opsFor(opsBook, selected.person.id) : null;

  return (
    <div className="flex flex-col gap-4">
      {showAddEmployee ? (
        <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
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
          boardView === "overview" ? "" : "overflow-hidden rounded-2xl border border-border bg-card",
        )}
      >
        {boardView !== "overview" && boardView !== "settings" && boardView !== "reports" ? (
          <div className="flex flex-wrap items-end gap-2 border-b border-border px-2 py-2 sm:gap-3 sm:px-4 sm:py-3">
            <label className="grid min-w-0 flex-1 gap-1 text-sm text-muted-foreground sm:flex-none">
              <span className="hidden sm:inline">Search</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or role"
                aria-label="Search"
                type="search"
                className="h-10 w-full rounded-lg border border-input bg-card px-2 text-sm text-foreground sm:h-9 sm:w-44"
              />
            </label>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
              className={cn(
                "flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium sm:hidden",
                filtersOpen || role || site ? "border-primary bg-primary/10 text-primary" : "border-input bg-card text-foreground",
              )}
            >
              <SlidersHorizontal className="size-4" />
              Filters{role || site ? ` · ${[role, site].filter(Boolean).length}` : ""}
            </button>
            <label className={cn("gap-1 text-sm text-muted-foreground sm:grid", filtersOpen ? "grid flex-1" : "hidden")}>
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
            <label className={cn("gap-1 text-sm text-muted-foreground sm:grid", filtersOpen ? "grid flex-1" : "hidden")}>
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
            <div className={cn("ml-auto flex-wrap items-end gap-2 pb-0.5 sm:flex", filtersOpen ? "flex w-full justify-between sm:w-auto" : "hidden")}>
              <p className="pb-2 text-sm text-muted-foreground">{rows.length} people</p>
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

        {seenViews.overview ? (
          <KeepAlive active={boardView === "overview"}>
          <div className={cn(boardView !== "overview" && "hidden")}>
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
          </div>
          </KeepAlive>
        ) : null}

        {seenViews.travel ? (
          <KeepAlive active={boardView === "travel"}>
          <div className={cn("border-t border-border p-3 sm:p-4", boardView !== "travel" && "hidden")}>
            <CrewTravelDesk
              rows={rows}
              opsBook={opsBook}
              flightBook={flightBook}
              rotationBook={rotationBook}
              today={asOf}
              onOpen={openPersonRotation}
            />
          </div>
          </KeepAlive>
        ) : null}

        {seenViews.accommodation ? (
          <KeepAlive active={boardView === "accommodation"}>
          <div className={cn("border-t border-border p-3 sm:p-4", boardView !== "accommodation" && "hidden")}>
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
          </KeepAlive>
        ) : null}

        {seenViews.year ? (
          <KeepAlive active={boardView === "year"}>
          <div
            className={cn(
              "overflow-auto border-t border-border p-3 sm:p-4",
              boardView !== "year" && "hidden",
            )}
            style={{ maxHeight: "var(--app-board-max-h)" }}
          >
            <CrewYearTape
              year={scheduleYear}
              today={today}
              rows={calendarRows}
              sites={sitesBook.sites}
              roles={roleCatalog}
              onOpen={openPersonRotation}
              onMonthClick={(year, monthIndex, personId) => {
                const month = String(monthIndex).padStart(2, "0");
                const monthIso = `${year}-${month}-01`;
                setMonthCursor(monthIso);
                setMonthScrollTo(monthIso);
                setScheduleYear(year);
                router.push(
                  withYearQuery("/month", {
                    month: `${year}-${month}`,
                    ...(personId ? { person: personId } : {}),
                  }),
                  { scroll: false },
                );
              }}
              onAddRotation={(personId, input) => {
                let planId = "";
                patchRoster((current) => {
                  const next = addNextRotation(current, personId, input);
                  const plans = next.rotationPlans?.[personId] ?? [];
                  planId =
                    plans.find((plan) => plan.from === input.from && plan.out === input.out)?.id ||
                    plans[plans.length - 1]?.id ||
                    "";
                  return next;
                }, { history: true });
                const person = overview.rows.find((row) => row.person.id === personId)?.person;
                logActivity({
                  kind: "stay_place",
                  personId,
                  personName: person?.name,
                  text: `${person?.name || personId} placed ${input.site} as ${input.role} · ${input.from}`,
                });
                return planId;
              }}
              onHidePerson={hideCalendarPerson}
              hiddenPeople={hiddenPeople}
              onShowPerson={showCalendarPerson}
              onShowAllHidden={() => patchScheduleView((current) => showAllPeople(current))}
              onAddUnderRole={(sectionRole) => setRoleAddSection(sectionRole)}
            />
          </div>
          </KeepAlive>
        ) : null}

        {seenViews.month ? (
          <KeepAlive active={boardView === "month"}>
          <div
            className={cn(
              "flex min-w-0 flex-col gap-4 overflow-x-hidden border-t border-border p-3 sm:p-4",
              boardView !== "month" && "hidden",
            )}
          >
            <CrewMonthGrid
              year={scheduleYear}
              today={today}
              scrollToIso={monthScrollTo}
              rows={calendarRows}
              opsBook={opsBook}
              flightBook={calendarFlightBook}
              stopoverBook={stopoverBook}
              roster={roster}
              sites={sitesBook.sites}
              travelHubs={travelHubsBook.hubs}
              active={boardView === "month"}
              interactionMode={scheduleView.calendarMode === "edit" ? "edit" : "view"}
              onInteractionModeChange={(mode) =>
                patchScheduleView((current) => setCalendarMode(current, mode))
              }
              onTravelHubsChange={(book) => {
                setTravelHubsBook(book);
                saveTravelHubs(book);
              }}
              onOpen={(personId) => openPersonRotation(personId, asOf)}
              onOpenDay={(personId, iso) => openPersonRotation(personId, iso)}
              onSetBookWindow={(personId, recipe) => patchOps(personId, recipe, { history: true })}
              onToggleStopover={(personId, iso, hub) => {
                captureHistory();
                setStopoverBook((prev) => {
                  const next = toggleStopover(prev, personId, iso, hub || "YK");
                  saveStopovers(next);
                  return next;
                });
              }}
              onPaintStopovers={(personId, dates, hub) => {
                captureHistory();
                setStopoverBook((prev) => {
                  const next = paintStopoverDays(prev, personId, dates, hub || "YK");
                  saveStopovers(next);
                  return next;
                });
              }}
              onAddRotation={(personId, input) => {
                let planId = "";
                patchRoster((current) => {
                  const next = addNextRotation(current, personId, input);
                  const plans = next.rotationPlans?.[personId] ?? [];
                  planId =
                    plans.find((plan) => plan.from === input.from && plan.out === input.out)?.id ||
                    plans[plans.length - 1]?.id ||
                    "";
                  return next;
                }, { history: true });
                const person = overview.rows.find((row) => row.person.id === personId)?.person;
                logActivity({
                  kind: "stay_place",
                  personId,
                  personName: person?.name,
                  text: `${person?.name || personId} placed ${input.site} as ${input.role} · ${input.from}`,
                });
                return planId;
              }}
              onRemoveRotation={(personId, planId) =>
                patchRoster((current) => removeRotationPlan(current, personId, planId), { history: true })
              }
              onSetRotationNote={(personId, planId, note) =>
                patchRoster((current) => setRotationPlanNote(current, personId, planId, note), {
                  history: true,
                })
              }
              onSetDateNote={(input) => patchRoster((current) => setDateNote(current, input), { history: true })}
              onSetStayNote={(personId, from, out, note) =>
                patchRoster((current) => setStayNote(current, personId, from, out, note), {
                  history: true,
                })
              }
              onMoveSite={(personId, iso, toSite) => {
                // Right-click a stay day → move to another site from that day (undo-able).
                const rotation = rotationForPersonOnDay(rotationBook, personId, iso);
                if (!rotation) return;
                captureHistory();
                const others = (rotation.moves ?? []).filter((row) => row.date !== iso);
                let moves = others;
                if (toSite) {
                  const person = people.find((row) => row.id === personId);
                  const before = person ? siteOnDay(person, addDays(iso, -1)) : null;
                  const fromSite = before || rotation.site;
                  if (fromSite === toSite && iso !== rotation.plannedIn) return;
                  moves = [...others, newMove(fromSite, toSite, iso)];
                }
                saveRotationBook(upsertRotation(rotationBook, { ...rotation, moves }));
              }}
              moveOnDay={(personId, iso) => {
                const rotation = rotationForPersonOnDay(rotationBook, personId, iso);
                const move = rotation?.moves?.find((row) => row.date === iso);
                return move ? { fromSite: move.fromSite, toSite: move.toSite } : null;
              }}
              onBookMove={(personId, iso) => openPersonRotation(personId, iso, "moves")}
              onExtendStay={(personId, stintFrom, newOut) => {
                // Sheet + app stays: set exclusive OUT (extend or end early).
                captureHistory();
                patchRoster((current) => setStayOut(current, personId, stintFrom, newOut));
                setRotationBook((current) => {
                  const hit = current.rotations.find(
                    (row) => row.personId === personId && row.plannedIn <= stintFrom && stintFrom < row.plannedOut,
                  ) ?? current.rotations.find((row) => row.personId === personId && row.plannedIn === stintFrom);
                  if (!hit) return current;
                  const next = extendRotationOut(current, hit.id, newOut);
                  saveRotations(next);
                  return next;
                });
                const person = overview.rows.find((row) => row.person.id === personId)?.person;
                logActivity({
                  kind: "stay_extend",
                  personId,
                  personName: person?.name,
                  text: `${person?.name || personId} stay changed · out ${newOut}`,
                });
              }}
              onMoveStayIn={(personId, stintFrom, newFrom) => {
                // Start the stay earlier or later; OUT, bookings, transfers and notes stay put.
                captureHistory();
                patchRoster((current) => setStayIn(current, personId, stintFrom, newFrom));
                const person = overview.rows.find((row) => row.person.id === personId)?.person;
                logActivity({
                  kind: "stay_extend",
                  personId,
                  personName: person?.name,
                  text: `${person?.name || personId} stay changed · in ${newFrom}`,
                });
              }}
              onHidePerson={hideCalendarPerson}
              hiddenPeople={hiddenPeople}
              onShowPerson={showCalendarPerson}
              onShowAllHidden={() => patchScheduleView((current) => showAllPeople(current))}
              onAddUnderRole={(sectionRole) => setRoleAddSection(sectionRole)}
              onTryPerson={({ name, role }) => {
                let personId = "";
                patchRoster(
                  (current) => {
                    const created = addProvisionalEmployee(current, { name, role });
                    if (!created) return current;
                    personId = created.personId;
                    return created.roster;
                  },
                  { history: true },
                );
                return personId || undefined;
              }}
              onCommitProvisional={(personId, name) => {
                patchRoster((current) => commitProvisionalEmployee(current, personId, name), {
                  history: true,
                });
              }}
              onDiscardProvisional={(personId) => {
                captureHistory();
                patchRoster((current) => discardProvisionalEmployee(current, personId));
                purgePersonSideState(personId);
                patchScheduleView((current) => showPerson(current, personId));
              }}
            />
          </div>
          </KeepAlive>
        ) : null}

        {seenViews.reports ? (
          <KeepAlive active={boardView === "reports"}>
          <div className={cn(boardView !== "reports" && "hidden")}>
            <CrewMonthlyReportPanel
              year={scheduleYear}
              month={reportMonth.month}
              people={people}
              opsBook={opsBook}
              flightBook={flightBook}
              stopoverBook={stopoverBook}
              activityLog={activityLog}
              travelHubs={travelHubsBook.hubs}
              rotationBook={rotationBook}
              sites={sitesBook.sites}
              onOpen={openPersonRotation}
            />
          </div>
          </KeepAlive>
        ) : null}

        {seenViews.settings ? (
          <KeepAlive active={boardView === "settings"}>
          <div className={cn(boardView !== "settings" && "hidden")}>
            <CrewSettingsPanel
              sitesBook={sitesBook}
              travelHubsBook={travelHubsBook}
              rolesBook={rolesBook}
              notify={notify}
              years={scheduleYears}
              onSitesChange={(book) => {
                setSitesBook(book);
                saveSitesBook(book);
              }}
              onTravelHubsChange={(book) => {
                setTravelHubsBook(book);
                saveTravelHubs(book);
              }}
              onRolesChange={(book) => {
                setRolesBook(book);
                saveRolesBook(book);
              }}
              onNotifyChange={patchNotify}
              onYearsChange={setScheduleYears}
            />
          </div>
          </KeepAlive>
        ) : null}

        {seenViews.employees ? (
          <KeepAlive active={boardView === "employees"}>
          <div
            className={cn(
              "overflow-y-auto border-t border-border",
              boardView !== "employees" && "hidden",
            )}
            style={{ maxHeight: "var(--app-board-max-h)" }}
          >
            {employeeEditId ? (
              <div className="border-b border-border bg-muted/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold tracking-tight">Edit employee info</h3>
                  <button
                    type="button"
                    onClick={() => setEmployeeEditId(null)}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Name</span>
                    <input
                      value={employeeEditDraft.name}
                      onChange={(event) =>
                        setEmployeeEditDraft((current) => ({ ...current, name: event.target.value }))
                      }
                      className="h-9 rounded-lg border border-input bg-card px-2"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Home role</span>
                    <input
                      value={employeeEditDraft.role}
                      onChange={(event) =>
                        setEmployeeEditDraft((current) => ({ ...current, role: event.target.value }))
                      }
                      list="employee-edit-roles"
                      className="h-9 rounded-lg border border-input bg-card px-2"
                    />
                    <datalist id="employee-edit-roles">
                      {roleCatalog.map((entry) => (
                        <option key={entry} value={entry} />
                      ))}
                    </datalist>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Category</span>
                    <select
                      value={employeeEditDraft.category}
                      onChange={(event) =>
                        setEmployeeEditDraft((current) => ({
                          ...current,
                          category: event.target.value as "" | "Regular" | "Local" | "Subcontractor",
                        }))
                      }
                      className="h-9 rounded-lg border border-input bg-card px-2"
                    >
                      <option value="">-</option>
                      <option value="Regular">Regular</option>
                      <option value="Local">Local</option>
                      <option value="Subcontractor">Subcontractor</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-4">
                    <span className="text-muted-foreground">Notes</span>
                    <input
                      value={employeeEditDraft.notes}
                      onChange={(event) =>
                        setEmployeeEditDraft((current) => ({ ...current, notes: event.target.value }))
                      }
                      className="h-9 rounded-lg border border-input bg-card px-2"
                      placeholder="Optional"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!employeeEditDraft.name.trim()}
                    onClick={() => {
                      const personId = employeeEditId;
                      const seed = overview.rows.find((row) => row.person.id === personId)?.person;
                      const nextRole = employeeEditDraft.role.trim();
                      const roleChanged =
                        Boolean(seed?.role) &&
                        normalizeRole(seed!.role) !== normalizeRole(nextRole || seed!.role);
                      patchRoster(
                        (current) =>
                          upsertEmployeeProfile(
                            current,
                            personId,
                            {
                              name: employeeEditDraft.name,
                              role: employeeEditDraft.role,
                              notes: employeeEditDraft.notes,
                              category: employeeEditDraft.category || null,
                            },
                            seed
                              ? { name: seed.name, role: seed.role }
                              : undefined,
                          ),
                        { history: true },
                      );
                      // Home role is the single calendar section, drop leftover multi-section rows.
                      if (roleChanged) {
                        patchScheduleView((current) => resetPersonRoleSections(current, personId));
                      }
                      logActivity({
                        kind: "employee_edit",
                        personId,
                        personName: employeeEditDraft.name.trim(),
                        text: `Updated ${employeeEditDraft.name.trim()} · ${employeeEditDraft.role}`,
                      });
                      setEmployeeEditId(null);
                    }}
                    className="h-9 rounded-lg bg-stone-900 px-3 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Save info
                  </button>
                </div>
              </div>
            ) : null}
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-sm text-muted-foreground">No crew match these filters.</p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => {
                  const isActive = row.person.active !== false;
                  // Only true hires (not sheet people with a profile overlay) can be deleted.
                  const canDelete = row.person.manual === true;
                  return (
                    <li key={row.person.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEmployeeEdit(row.person.id)}
                        className="min-w-0 flex-1 text-left hover:opacity-80"
                      >
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                          <span>{row.person.name}</span>
                          {row.person.provisional ? (
                            <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide text-muted-foreground uppercase">
                              Draft
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">{roleLabel(row.person)}</p>
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
                        onClick={() => openEmployeeEdit(row.person.id)}
                        className="h-8 rounded-lg border border-input px-3 text-xs font-medium hover:bg-muted"
                      >
                        Edit info
                      </button>
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
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => {
                            const ok = window.confirm(
                              `Delete ${row.person.name}? This removes the hire and any placements painted for them.`,
                            );
                            if (!ok) return;
                            captureHistory();
                            patchRoster((current) => removeManualEmployee(current, row.person.id));
                            purgePersonSideState(row.person.id);
                            patchScheduleView((current) => showPerson(current, row.person.id));
                          }}
                          className="h-8 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-900 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          </KeepAlive>
        ) : null}

        <div
          className={cn("min-w-0 overflow-auto", boardView !== "list" && "hidden")}
          style={{ maxHeight: "var(--app-board-max-h)" }}
        >
          <div className="sticky top-0 z-10 hidden min-w-[56rem] sm:grid grid-cols-[minmax(9rem,1.2fr)_4.5rem_6.5rem_7rem_6.5rem_6.5rem_6rem_5.5rem_5.5rem] gap-2 border-b border-border bg-card px-4 py-2 text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">
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
                  row.daysOnSite == null ? null : Math.min(100, Math.round((row.daysOnSite / stayLength(row)) * 100));
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
                      className="block w-full px-3 py-2.5 text-left hover:bg-muted/50 sm:grid sm:min-w-[56rem] sm:grid-cols-[minmax(9rem,1.2fr)_4.5rem_6.5rem_7rem_6.5rem_6.5rem_6rem_5.5rem_5.5rem] sm:items-center sm:gap-2 sm:px-4 sm:py-3"
                    >
                      {/* Phone: one card per person instead of a wide table. */}
                      <span className="flex flex-col gap-1 sm:hidden">
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{row.person.name}</span>
                          {row.site ? (
                            <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", siteTone(row.site, sitesBook))}>
                              {row.site}
                            </span>
                          ) : null}
                          <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", statusTone(row.duty))}>
                            {dutyLabel(row.duty)}
                          </span>
                        </span>
                        <span className="flex flex-wrap gap-x-3 text-[13px] tabular-nums text-muted-foreground">
                          <span>IN {row.plannedIn ? formatMedium(row.plannedIn) : "-"}</span>
                          <span>OUT {row.plannedOut ? formatMedium(row.plannedOut) : "-"}</span>
                          {row.rotationDay != null ? <span>Day {row.rotationDay}/{stayLength(row)}</span> : null}
                        </span>
                        <span
                          className={cn(
                            "text-[13px]",
                            row.overdue ? "font-semibold text-rose-700" : row.dueSoon ? "font-medium text-amber-800" : "text-muted-foreground",
                          )}
                        >
                          {departureLabel(row)} · {travelLabel(ops, row)}
                        </span>
                      </span>
                      <span className="phone:hidden min-w-0">
                        <span className="block truncate text-sm font-medium">{row.person.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {row.site ? catalogSiteLabel(row.site, sitesBook) : "Off site"}
                          {row.fourWeeksOut ? " · 4 weeks out" : ""}
                        </span>
                      </span>
                      <span className="phone:hidden">
                        {row.site ? (
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", siteTone(row.site, sitesBook))}>
                            {row.site}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </span>
                      <span className="phone:hidden">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", statusTone(row.duty))}>
                          {dutyLabel(row.duty)}
                        </span>
                      </span>
                      <span className="phone:hidden text-sm tabular-nums text-muted-foreground">
                        {row.plannedIn ? formatMedium(row.plannedIn) : "-"}
                      </span>
                      <span className="phone:hidden text-sm tabular-nums text-muted-foreground">
                        {row.plannedOut ? formatMedium(row.plannedOut) : "-"}
                      </span>
                      <span className="phone:hidden text-sm tabular-nums text-muted-foreground">
                        {row.rotationDay == null ? "-" : `Day ${row.rotationDay} of ${stayLength(row)}`}
                        {progress != null ? <span className="mt-0.5 block text-[0.8125rem]">{progress}%</span> : null}
                      </span>
                      <span
                        className={cn(
                          "phone:hidden",
                          "text-sm tabular-nums",
                          row.overdue && "font-semibold text-rose-700",
                          row.dueSoon && !row.overdue && "font-medium text-amber-800",
                          !row.overdue && !row.dueSoon && "text-muted-foreground",
                        )}
                      >
                        {departureLabel(row)}
                      </span>
                      <span className="phone:hidden text-xs text-muted-foreground">{travelLabel(ops, row)}</span>
                      <span className="phone:hidden text-xs font-medium text-primary">{row.alerts.length ? "Resolve" : "Open"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {roleAddSection ? (
        <CrewRoleAddDialog
          sectionRole={roleAddSection}
          people={overview.rows.map((row) => ({
            id: row.person.id,
            name: row.person.name,
            role: row.person.role,
          }))}
          onClose={() => setRoleAddSection(null)}
          onPickExisting={(personId) => {
            const person = overview.rows.find((row) => row.person.id === personId)?.person;
            if (!person) return;
            // Calendar-only move: their home role (Employees page) stays as it is.
            patchScheduleView((current) =>
              addPersonUnderRole(current, personId, person.role, roleAddSection),
            );
            logActivity({
              kind: "role_section_move",
              personId,
              personName: person.name,
              text: `${person.name} moved under ${roleAddSection}`,
            });
            setRoleAddSection(null);
          }}
          onCreateNew={({ name, role }) => {
            let personId = "";
            patchRoster(
              (current) => {
                const created = addProvisionalEmployee(current, {
                  name,
                  role: role || roleAddSection,
                });
                if (!created) return current;
                personId = created.personId;
                return created.roster;
              },
              { history: true },
            );
            if (personId) {
              patchScheduleView((current) =>
                addPersonUnderRole(current, personId, role || roleAddSection, roleAddSection),
              );
              logActivity({
                kind: "role_section_move",
                personId,
                personName: name,
                text: `New ${name} under ${roleAddSection}`,
              });
            }
            setRoleAddSection(null);
          }}
        />
      ) : null}

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
              sites={sitesBook.sites}
              roles={roleCatalog}
              onClose={() => setSelectedId(null)}
              onChange={(recipe) => patchOps(selected.person.id, recipe)}
              onSaveFlight={saveFlightBooking}
              onEmploymentStatus={(status) =>
                patchRoster((current) => setEmploymentStatus(current, selected.person.id, status))
              }
              onAddRotations={(inputs) => {
                // Whole repeat pattern in one change (one Undo step).
                patchRoster(
                  (current) => inputs.reduce((book, input) => addNextRotation(book, selected.person.id, input), current),
                  { history: true },
                );
                logActivity({
                  kind: "stay_place",
                  personId: selected.person.id,
                  personName: selected.person.name,
                  text: `${selected.person.name}: ${inputs.length} rotations at ${inputs[0]?.site} from ${inputs[0]?.from}`,
                });
              }}
              onAddRotation={(input) => {
                patchRoster((current) => addNextRotation(current, selected.person.id, input), {
                  history: true,
                });
                logActivity({
                  kind: "stay_place",
                  personId: selected.person.id,
                  personName: selected.person.name,
                  text: `${selected.person.name} next rotation ${input.site} as ${input.role} · ${input.from}`,
                });
              }}
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
          roster={roster}
          onPatchOps={(recipe) => patchOps(selectedRotationPerson.id, recipe)}
          openTravel={openTravelFor}
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
  sites = DEFAULT_SITES,
  roles = [],
  onClose,
  onChange,
  onSaveFlight,
  onEmploymentStatus,
  onAddRotation,
  onAddRotations,
}: {
  snap: CrewSnapshot;
  ops: CrewPersonOps;
  staffName: string;
  year: number;
  sites?: CrewSite[];
  roles?: string[];
  flightBook: FlightBook;
  onClose: () => void;
  onChange: (recipe: (current: CrewPersonOps) => CrewPersonOps) => void;
  onSaveFlight: (booking: FlightBooking) => void;
  onEmploymentStatus: (status: EmploymentStatus) => void;
  onAddRotation: (input: { site: string; from: string; out: string; role: string }) => void;
  onAddRotations?: (inputs: { site: string; from: string; out: string; role: string }[]) => void;
}) {
  const [note, setNote] = useState("");
  const segments = personSegments(snap.person);
  const progress =
    snap.daysOnSite == null ? null : Math.min(100, Math.round((snap.daysOnSite / stayLength(snap)) * 100));
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
          <p className="text-[0.8125rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
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
          <p className="text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">Employment</p>
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
        defaultSite={snap.site || sites[0]?.code || "IQA"}
        defaultRole={snap.person.role}
        defaultDays={rotationFor(snap.person)}
        isActive={isActive}
        roles={roles}
        onSave={onAddRotation}
        onSaveMany={onAddRotations}
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
        <p className="text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">Current assignment</p>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Fact label="Site" value={snap.site ? siteLabel(snap.site) : "No current assignment"} />
          <Fact label="Status" value={dutyLabel(snap.duty)} />
          <Fact label="Planned stay" value={`${stayLength(snap)} days`} />
          <Fact
            label="Days on site"
            value={
              snap.rotationDay == null
                ? "-"
                : `Day ${snap.rotationDay} of ${stayLength(snap)}${progress != null ? ` · ${progress}%` : ""}`
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

      <section className="grid gap-2">
        <p className="text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">
          Rotations · {year}
        </p>
        {(snap.person.stints?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No rotations on the schedule yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {[...(snap.person.stints ?? [])]
              .sort((a, b) => a.from.localeCompare(b.from))
              .map((stint) => {
                const lastInclusive = stint.out ? addDays(stint.out, -1) : null;
                return (
                  <li
                    key={`${stint.from}-${stint.site}-${stint.out ?? "open"}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-sm"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-950">
                        {stint.site}
                      </span>
                      {stint.role ? (
                        <span className="text-xs text-muted-foreground">{stint.role}</span>
                      ) : null}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMedium(stint.from)}
                      {" – "}
                      {lastInclusive ? formatMedium(lastInclusive) : "open"}
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <p className="text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">IN &amp; OUT</p>
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
        <p className="text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">
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
            <p className="text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">Sheet flights</p>
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
        <p className="text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">Updates</p>
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
        <p className="text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">Work & travel timeline</p>
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
