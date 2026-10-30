"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, Plane, X } from "lucide-react";
import {
  buildCrewBriefing,
  buildInstantAlert,
  describeOpsChange,
} from "@/lib/crew-briefing";
import { catalogProjects } from "@/lib/crew-catalog";
import {
  CREW_BOOKING_STATUSES,
  bookingLabel,
  emptyCrewOps,
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
  shouldOfferMorningBriefing,
  type CrewNotifySettings,
} from "@/lib/crew-notify-settings";
import {
  CREW_PROJECTS,
  CREW_ROLES,
  CREW_SCHEDULE,
  RETURN_SOON_DAYS,
  crewOverview,
  dutyLabel,
  isCampSite,
  isOffRotation,
  personSegments,
  projectLabel,
  siteLabel,
  type CrewDutyStatus,
  type CrewProject,
  type CrewSnapshot,
} from "@/lib/crew-schedule";
import {
  emptyRoster,
  loadRoster,
  mergePeople,
  mergeProjects,
  saveRoster,
  slugEmployee,
  slugProject,
  type CrewRosterBook,
} from "@/lib/crew-roster";
import { formatLong, formatMedium, toISODate } from "@/lib/dates";
import { cn } from "@/lib/cn";

type FocusFilter = "all" | "on_site" | "off" | "upcoming" | "unassigned" | "overdue" | "due_soon" | "travel";

const FILTER_SITES = ["IQA", "POND", "ALRT", "KUG"] as const;

function siteTone(site: string | null) {
  if (!site) return "bg-muted text-muted-foreground";
  if (isCampSite(site)) return "bg-sky-100 text-sky-950";
  if (site.includes("POND")) return "bg-emerald-100 text-emerald-950";
  if (site.includes("ALRT")) return "bg-amber-100 text-amber-950";
  if (site.includes("KUG")) return "bg-violet-100 text-violet-950";
  return "bg-stone-100 text-stone-800";
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
  if (row.daysUntilOut == null) return "—";
  if (row.daysUntilOut < 0) return `${Math.abs(row.daysUntilOut)}d overdue`;
  if (row.daysUntilOut === 0) return "Today";
  return `${row.daysUntilOut}d left`;
}

function travelLabel(ops: ReturnType<typeof opsFor> | null, row: CrewSnapshot) {
  if (!row.duty || (row.duty !== "on_site" && row.duty !== "in_transit" && row.duty !== "upcoming")) {
    return "Not required";
  }
  if (!ops) return row.overdue || row.dueSoon ? "Pending" : "—";
  const status = row.duty === "upcoming" ? ops.outboundFlight : ops.returnFlight;
  if (status === "confirmed" || status === "booked") return bookingLabel(status);
  if (status === "cancelled") return "Cancelled";
  if (row.overdue || row.dueSoon || status === "needed" || status === "not_started") return "Pending";
  return bookingLabel(status);
}

export function CrewBoard() {
  const today = toISODate(new Date());
  const [opsBook, setOpsBook] = useState<CrewOpsBook>({});
  const [roster, setRoster] = useState<CrewRosterBook>(emptyRoster());
  const [hydrated, setHydrated] = useState(false);
  const [role, setRole] = useState("");
  const [site, setSite] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [focus, setFocus] = useState<FocusFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [staffName, setStaffName] = useState("Crew coordinator");
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showNotify, setShowNotify] = useState(false);
  const [notify, setNotify] = useState<CrewNotifySettings>(() => loadNotifySettings());
  const [notifyMsg, setNotifyMsg] = useState("");
  const [briefingPreview, setBriefingPreview] = useState("");
  const [newEmployee, setNewEmployee] = useState({ name: "", role: "Labourers", sites: "", projects: "" });
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    setOpsBook(loadCrewOps());
    const loaded = loadRoster();
    const year = CREW_SCHEDULE.year;
    const seeded = catalogProjects(year);
    const known = new Set([
      ...CREW_PROJECTS.map((project) => project.id),
      ...loaded.projects.map((project) => project.id),
    ]);
    const missing = seeded.filter((project) => !known.has(project.id));
    const nextRoster =
      missing.length > 0
        ? { ...loaded, projects: [...loaded.projects, ...missing] }
        : loaded;
    if (missing.length > 0) saveRoster(nextRoster);
    setRoster(nextRoster);
    setNotify(loadNotifySettings());
    setHydrated(true);
    const params = new URLSearchParams(window.location.search);
    const person = params.get("person");
    if (person) setSelectedId(person);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [selectedId]);

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
            .catch((error) => {
              setNotifyMsg(error instanceof Error ? error.message : "Instant alert failed.");
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

  const people = useMemo(() => mergePeople(CREW_SCHEDULE.people, roster), [roster]);
  const projects = useMemo(() => mergeProjects(CREW_PROJECTS as CrewProject[], roster), [roster]);
  const overview = useMemo(() => crewOverview(today, opsBook, people), [opsBook, people, today]);

  function makeBriefing() {
    return buildCrewBriefing({
      today,
      opsBook,
      people,
      projects,
      recipientName: notify.recipientName,
      recipientEmail: notify.recipientEmail,
      previousBriefingAt: notify.lastBriefingAt,
      appUrl: typeof window !== "undefined" ? window.location.origin : undefined,
    });
  }

  async function sendBriefing(manual = false) {
    setNotifyMsg("");
    try {
      const briefing = makeBriefing();
      setBriefingPreview(briefing.text);
      if (!notify.recipientEmail) {
        setNotifyMsg("Add Katrina’s email, then send again. Preview is ready below.");
        setShowNotify(true);
        return;
      }
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
      setNotifyMsg(manual ? "Daily briefing sent to Katrina." : "8:00 AM briefing sent to Katrina.");
    } catch (error) {
      setNotifyMsg(error instanceof Error ? error.message : "Briefing could not be sent.");
      setShowNotify(true);
    }
  }

  useEffect(() => {
    if (!hydrated || !notify.dailyBriefing) return;
    if (!shouldOfferMorningBriefing(notify)) return;
    if (!notify.recipientEmail) {
      setNotifyMsg("Morning briefing is due (8:00 AM Montreal). Add Katrina’s email to send it.");
      return;
    }
    void sendBriefing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when hydrated after 8 AM
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
    const projectIds = newEmployee.projects
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const existing = projects.find((project) => project.name.toLowerCase() === item.toLowerCase() || project.id === item);
        return existing?.id ?? slugProject(item);
      });
    patchRoster((current) => {
      const nextProjects = [...current.projects];
      for (const projectId of projectIds) {
        if (!nextProjects.some((project) => project.id === projectId) && !CREW_PROJECTS.some((project) => project.id === projectId)) {
          nextProjects.push({ id: projectId, name: projectId.replace(/-/g, " "), source: "manual", year: CREW_SCHEDULE.year });
        }
      }
      return {
        ...current,
        projects: nextProjects,
        employees: [
          ...current.employees,
          {
            id,
            name,
            role: roleName,
            homeSites,
            projectIds,
            rotationDays: 42,
            notes: "",
            createdAt: new Date().toISOString(),
          },
        ],
      };
    });
    setNewEmployee({ name: "", role: "Labourers", sites: "", projects: "" });
    setShowAddEmployee(false);
    setSelectedId(id);
  }

  function addProject() {
    const name = newProjectName.trim();
    if (!name) return;
    const id = slugProject(name);
    patchRoster((current) => {
      if (current.projects.some((project) => project.id === id) || CREW_PROJECTS.some((project) => project.id === id)) {
        return current;
      }
      return {
        ...current,
        projects: [...current.projects, { id, name, source: "manual", year: CREW_SCHEDULE.year }],
      };
    });
    setNewProjectName("");
    setShowAddProject(false);
  }

  function setPersonProjects(personId: string, projectIds: string[]) {
    patchRoster((current) => {
      const manualIndex = current.employees.findIndex((employee) => employee.id === personId);
      if (manualIndex >= 0) {
        const employees = current.employees.map((employee, index) =>
          index === manualIndex ? { ...employee, projectIds } : employee,
        );
        return { ...current, employees };
      }
      return {
        ...current,
        projectLinks: { ...current.projectLinks, [personId]: projectIds },
      };
    });
  }

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of overview.rows) counts.set(row.person.name, (counts.get(row.person.name) ?? 0) + 1);
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name));
  }, [overview.rows]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return overview.rows
      .filter((row) => {
        if (role && row.person.role !== role) return false;
        if (site && row.site !== site) return false;
        if (focus === "on_site" && row.duty !== "on_site") return false;
        if (focus === "off" && row.duty !== "off_rotation") return false;
        if (focus === "upcoming" && row.duty !== "upcoming") return false;
        if (focus === "unassigned" && row.duty !== "unassigned") return false;
        if (focus === "overdue" && !row.overdue) return false;
        if (focus === "due_soon" && !row.dueSoon) return false;
        if (
          focus === "travel" &&
          !row.alerts.some((alert) => alert === "return_flight" || alert === "outbound_flight" || alert === "accommodation")
        ) {
          return false;
        }
        if (projectFilter && !row.person.projectIds.includes(projectFilter)) return false;
        if (
          needle &&
          !row.person.name.toLowerCase().includes(needle) &&
          !row.person.role.toLowerCase().includes(needle) &&
          !row.person.projectIds.some((id) => projectLabel(projects, id).toLowerCase().includes(needle))
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const rank = (row: CrewSnapshot) => {
          if (row.overdue) return 0;
          if (row.dueSoon) return 1;
          if (row.alerts.length) return 2;
          if (row.duty === "on_site") return 3;
          if (row.duty === "upcoming") return 4;
          return 5;
        };
        return rank(a) - rank(b) || a.person.name.localeCompare(b.person.name) || a.person.role.localeCompare(b.person.role);
      });
  }, [focus, overview.rows, projectFilter, projects, query, role, site]);

  const selected = overview.rows.find((row) => row.person.id === selectedId) ?? null;
  const selectedOps = selected ? opsFor(opsBook, selected.person.id) : null;
  const reconciled =
    overview.onSite + overview.offRotation + overview.inTransit + overview.upcoming + overview.unassigned;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">Crew logistics</p>
          <h1 className="mt-2 font-heading text-3xl tracking-tight sm:text-4xl">Crew {CREW_SCHEDULE.year}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Who is on site, how far through the 42-day rotation, when they leave, and whether return travel and
            accommodation are arranged. Reminders start {RETURN_SOON_DAYS} days before planned Out. In = arrive on
            site · Out = leave site. Year {CREW_SCHEDULE.year} from {CREW_SCHEDULE.sheet || CREW_SCHEDULE.source}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setBriefingPreview(makeBriefing().text);
              setShowNotify(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Bell className="size-4" />
            Katrina alerts
          </button>
          <button
            type="button"
            onClick={() => setShowAddProject((open) => !open)}
            className="rounded-lg border border-input bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Add project
          </button>
          <button
            type="button"
            onClick={() => setShowAddEmployee((open) => !open)}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Add employee
          </button>
        </div>
      </header>

      {notifyMsg ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{notifyMsg}</p>
      ) : null}

      {showNotify ? (
        <section className="grid gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Notifications</p>
              <h2 className="mt-1 font-heading text-2xl tracking-tight">Katrina daily briefing &amp; alerts</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Email the 8:00 AM Montreal briefing and critical change alerts. Instant alerts fire when planned dates,
                flights, or lodging change. Routine notes stay in the daily summary.
              </p>
            </div>
            <button type="button" onClick={() => setShowNotify(false)} className="rounded-lg border border-input px-3 py-1.5 text-sm">
              Close
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Recipient name</span>
              <input
                value={notify.recipientName}
                onChange={(event) => patchNotify((settings) => ({ ...settings, recipientName: event.target.value }))}
                className="h-9 rounded-lg border border-input bg-card px-2"
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-1 lg:col-span-2">
              <span className="text-muted-foreground">Email</span>
              <input
                type="email"
                value={notify.recipientEmail}
                onChange={(event) => patchNotify((settings) => ({ ...settings, recipientEmail: event.target.value.trim() }))}
                placeholder="katrina@towerarctic.ca"
                className="h-9 rounded-lg border border-input bg-card px-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Your name on updates</span>
              <input
                value={staffName}
                onChange={(event) => setStaffName(event.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-2"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={notify.dailyBriefing}
                onChange={(event) => patchNotify((settings) => ({ ...settings, dailyBriefing: event.target.checked }))}
              />
              Auto 8:00 AM briefing
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={notify.instantAlerts}
                onChange={(event) => patchNotify((settings) => ({ ...settings, instantAlerts: event.target.checked }))}
              />
              Instant alerts for critical changes
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setBriefingPreview(makeBriefing().text)}
              className="rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              Preview briefing
            </button>
            <button
              type="button"
              onClick={() => void sendBriefing(true)}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Send briefing now
            </button>
          </div>
          {briefingPreview ? (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-xs leading-relaxed text-foreground">
              {briefingPreview}
            </pre>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Last briefing: {notify.lastBriefingAt ? new Date(notify.lastBriefingAt).toLocaleString() : "not sent yet"}.
            Delivery uses the same Microsoft Graph mail settings as Camp Bookings when configured.
          </p>
        </section>
      ) : null}

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
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Projects</span>
            <input
              value={newEmployee.projects}
              onChange={(event) => setNewEmployee({ ...newEmployee, projects: event.target.value })}
              className="h-9 rounded-lg border border-input bg-card px-2"
              placeholder="Side 1, AV328"
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

      {showAddProject ? (
        <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
          <label className="grid min-w-[16rem] flex-1 gap-1 text-sm">
            <span className="text-muted-foreground">Project name</span>
            <input
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              className="h-9 rounded-lg border border-input bg-card px-2"
              placeholder="NRC - 2308"
            />
          </label>
          <button type="button" onClick={addProject} className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            Save project
          </button>
          <button type="button" onClick={() => setShowAddProject(false)} className="h-9 rounded-lg border border-input px-3 text-sm">
            Cancel
          </button>
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="On site" value={String(overview.onSite)} hint={formatLong(today)} />
        <Stat label="Off rotation" value={String(overview.offRotation)} hint="Away from work sites" />
        <Stat
          label="Other status"
          value={String(overview.inTransit + overview.upcoming + overview.unassigned)}
          hint={`${overview.inTransit} transit · ${overview.upcoming} upcoming · ${overview.unassigned} unassigned`}
        />
        <Stat label="Due soon" value={String(overview.dueSoon)} hint={`Planned Out within ${RETURN_SOON_DAYS} days`} />
        <Stat label="Overdue" value={String(overview.overdue)} hint="Past planned Out" tone="rose" />
        <Stat label="Travel attention" value={String(overview.travelAttention)} hint="Flights or lodging" />
      </div>
      <p className="text-xs text-muted-foreground">
        {overview.total} people · {reconciled} accounted in status buckets
        {reconciled !== overview.total ? " · counts need review" : ""}
      </p>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
          <label className="grid gap-1 text-sm text-muted-foreground">
            Search
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or role"
              className="h-9 w-44 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
            />
          </label>
          <label className="grid gap-1 text-sm text-muted-foreground">
            Role
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
            Site
            <select
              value={site}
              onChange={(event) => setSite(event.target.value)}
              className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
            >
              <option value="">All sites</option>
              {FILTER_SITES.map((code) => (
                <option key={code} value={code}>
                  {siteLabel(code)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-muted-foreground">
            Project
            <select
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
              className="h-9 max-w-[12rem] rounded-lg border border-input bg-card px-2 text-sm text-foreground"
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-muted-foreground">
            Focus
            <select
              value={focus}
              onChange={(event) => setFocus(event.target.value as FocusFilter)}
              className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
            >
              <option value="all">Everyone</option>
              <option value="on_site">On site</option>
              <option value="off">Off rotation</option>
              <option value="upcoming">Upcoming</option>
              <option value="unassigned">Unassigned</option>
              <option value="due_soon">Due soon</option>
              <option value="overdue">Overdue</option>
              <option value="travel">Travel / lodging</option>
            </select>
          </label>
          <p className="ml-auto pb-2 text-sm text-muted-foreground">{hydrated ? `${rows.length} people` : "Loading…"}</p>
        </div>

        <div className="min-w-0 overflow-x-auto">
          <div className="grid min-w-[56rem] grid-cols-[minmax(9rem,1.2fr)_4.5rem_6.5rem_7rem_6.5rem_6.5rem_6rem_5.5rem_5.5rem] gap-2 border-b border-border px-4 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <span>Crew</span>
            <span>Site</span>
            <span>Status</span>
            <span>Came in</span>
            <span>Going out</span>
            <span>Rotation</span>
            <span>Departure</span>
            <span>Return</span>
            <span>Action</span>
          </div>
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">No crew match these filters.</p>
          ) : (
            <ul>
              {rows.map((row) => {
                const ops = opsFor(opsBook, row.person.id);
                const progress =
                  row.daysOnSite == null ? null : Math.min(100, Math.round((row.daysOnSite / row.rotationDays) * 100));
                return (
                  <li key={row.person.id} className="border-b border-border">
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.person.id)}
                      className="grid min-w-[56rem] w-full grid-cols-[minmax(9rem,1.2fr)_4.5rem_6.5rem_7rem_6.5rem_6.5rem_6rem_5.5rem_5.5rem] items-center gap-2 px-4 py-3 text-left hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{row.person.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {row.person.role}
                          {row.person.manual ? " · added" : ""}
                          {duplicateNames.has(row.person.name) ? " · separate sheet row" : ""}
                          {row.person.projectIds.length
                            ? ` · ${row.person.projectIds.map((id) => projectLabel(projects, id)).join(", ")}`
                            : ""}
                        </span>
                      </span>
                      <span>
                        {row.site ? (
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", siteTone(row.site))}>
                            {row.site}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </span>
                      <span>
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", statusTone(row.duty))}>
                          {dutyLabel(row.duty)}
                        </span>
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {row.plannedIn ? formatMedium(row.plannedIn) : "—"}
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {row.plannedOut ? formatMedium(row.plannedOut) : "—"}
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {row.rotationDay == null ? "—" : `Day ${row.rotationDay} of ${row.rotationDays}`}
                        {progress != null ? <span className="mt-0.5 block text-[11px]">{progress}%</span> : null}
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

      {CREW_SCHEDULE.note ? <p className="text-xs text-muted-foreground">{CREW_SCHEDULE.note}</p> : null}

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
              projects={projects}
              staffName={staffName}
              year={CREW_SCHEDULE.year}
              onClose={() => setSelectedId(null)}
              onChange={(recipe) => patchOps(selected.person.id, recipe)}
              onProjectsChange={(projectIds) => setPersonProjects(selected.person.id, projectIds)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "rose";
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card px-5 py-4", tone === "rose" && "border-rose-200")}>
      <p className="text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-2 font-heading text-3xl tracking-tight", tone === "rose" && "text-rose-800")}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function PersonProfile({
  snap,
  ops,
  projects,
  staffName,
  year,
  onClose,
  onChange,
  onProjectsChange,
}: {
  snap: CrewSnapshot;
  ops: CrewPersonOps;
  projects: CrewProject[];
  staffName: string;
  year: number;
  onClose: () => void;
  onChange: (recipe: (current: CrewPersonOps) => CrewPersonOps) => void;
  onProjectsChange: (projectIds: string[]) => void;
}) {
  const [note, setNote] = useState("");
  const segments = personSegments(snap.person);
  const onSite = snap.duty === "on_site" || snap.duty === "in_transit";
  const progress =
    snap.daysOnSite == null ? null : Math.min(100, Math.round((snap.daysOnSite / snap.rotationDays) * 100));
  const cameIn = ops.actualIn || snap.plannedIn;
  const goingOut = ops.actualOut || snap.expectedOut || snap.plannedOut;

  function toggleProject(projectId: string) {
    const current = snap.person.projectIds;
    onProjectsChange(
      current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId],
    );
  }

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
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Schedule year {year}
          </p>
          <h2 id="crew-person-title" className="mt-1 font-heading text-3xl tracking-tight">
            {snap.person.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {snap.person.role}
            {snap.person.manual ? " · added in app" : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", statusTone(snap.duty))}>
              {dutyLabel(snap.duty)}
            </span>
            {snap.site ? (
              <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", siteTone(snap.site))}>
                {siteLabel(snap.site)}
              </span>
            ) : null}
            {snap.person.projectIds.map((projectId) => (
              <span key={projectId} className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-800">
                {projectLabel(projects, projectId)}
              </span>
            ))}
            {snap.overdue ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-900">
                <AlertTriangle className="size-3.5" /> Overdue
              </span>
            ) : null}
            {snap.dueSoon && !snap.overdue ? (
              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950">
                Leave in {snap.daysUntilOut}d · start replacement
              </span>
            ) : null}
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
      <section className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
        <Fact label="Year" value={String(year)} />
        <Fact
          label="Came in"
          value={
            cameIn
              ? `${formatMedium(cameIn)}${ops.actualIn ? " · actual" : " · planned"}`
              : "Not recorded"
          }
        />
        <Fact
          label="Going out"
          value={
            goingOut
              ? `${formatMedium(goingOut)}${
                  snap.daysUntilOut == null
                    ? ""
                    : snap.daysUntilOut < 0
                      ? ` · ${Math.abs(snap.daysUntilOut)}d overdue`
                      : ` · in ${snap.daysUntilOut}d`
                }${ops.actualOut ? " · actual" : ""}`
              : "Not recorded"
          }
        />
      </section>

      <section className="grid gap-3 rounded-xl bg-muted/40 p-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Current assignment</p>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Fact label="Site" value={snap.site ? siteLabel(snap.site) : "No current assignment"} />
          <Fact label="Status" value={dutyLabel(snap.duty)} />
          <Fact label="Planned rotation" value={`${snap.rotationDays} days`} />
          <Fact
            label="Days on site"
            value={
              snap.rotationDay == null
                ? "—"
                : `Day ${snap.rotationDay} of ${snap.rotationDays}${progress != null ? ` · ${progress}%` : ""}`
            }
          />
          <Fact label="Planned In" value={snap.plannedIn ? formatMedium(snap.plannedIn) : "—"} />
          <Fact label="Planned Out" value={snap.plannedOut ? formatMedium(snap.plannedOut) : "—"} />
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
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Projects</p>
        <p className="text-xs text-muted-foreground">A person can be on more than one project at the same time.</p>
        <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet. Add one from the header.</p>
          ) : (
            projects.map((project) => {
              const checked = snap.person.projectIds.includes(project.id);
              return (
                <label key={project.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60">
                  <input type="checkbox" checked={checked} onChange={() => toggleProject(project.id)} />
                  <span className="min-w-0 truncate">{project.name}</span>
                </label>
              );
            })
          )}
        </div>
      </section>

      <section className="grid gap-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Came in &amp; going out</p>
        <p className="text-xs text-muted-foreground">
          Year {year}. Planned dates come from the {year} schedule. Override them or record actual In / Out when plans change.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <DateField
            label="Came in (planned override)"
            value={ops.plannedInOverride ?? ""}
            onChange={(value) => onChange((current) => ({ ...current, plannedInOverride: value || null }))}
          />
          <DateField
            label="Going out (planned override)"
            value={ops.plannedOutOverride ?? ""}
            onChange={(value) => onChange((current) => ({ ...current, plannedOutOverride: value || null }))}
          />
          <DateField
            label="Actual In"
            value={ops.actualIn ?? ""}
            onChange={(value) => onChange((current) => ({ ...current, actualIn: value || null }))}
          />
          <DateField
            label="Actual Out"
            value={ops.actualOut ?? ""}
            onChange={(value) => onChange((current) => ({ ...current, actualOut: value || null }))}
          />
        </div>
      </section>

      <section className="grid gap-3">
        <p className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <Plane className="size-3.5" /> Travel & accommodation
        </p>
        <StatusField
          label="Outbound flight"
          value={ops.outboundFlight}
          onChange={(value) => onChange((current) => ({ ...current, outboundFlight: value }))}
        />
        <StatusField
          label="Return flight"
          value={ops.returnFlight}
          onChange={(value) => onChange((current) => ({ ...current, returnFlight: value }))}
        />
        <StatusField
          label="Accommodation"
          value={ops.accommodation}
          onChange={(value) => onChange((current) => ({ ...current, accommodation: value }))}
        />
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Confirmation #</span>
          <input
            value={ops.confirmation}
            onChange={(event) => onChange((current) => ({ ...current, confirmation: event.target.value }))}
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
            placeholder="Flight or lodging reference"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Flight notes</span>
          <textarea
            value={ops.flightNotes}
            onChange={(event) => onChange((current) => ({ ...current, flightNotes: event.target.value }))}
            rows={2}
            className="rounded-lg border border-input bg-card px-2 py-1.5 text-sm"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Accommodation notes</span>
          <textarea
            value={ops.accommodationNotes}
            onChange={(event) => onChange((current) => ({ ...current, accommodationNotes: event.target.value }))}
            rows={2}
            className="rounded-lg border border-input bg-card px-2 py-1.5 text-sm"
          />
        </label>
        {(ops.returnFlight === "not_started" || ops.returnFlight === "needed") && onSite ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Action needed: return flight is {bookingLabel(ops.returnFlight).toLowerCase()}.
          </p>
        ) : null}
      </section>

      <section className="grid gap-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Updates</p>
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
            placeholder="Record a change or reminder"
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
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Work & travel timeline</p>
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No dated marks in the spreadsheet for this person.</p>
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

      <button
        type="button"
        className="text-left text-xs text-muted-foreground hover:text-foreground"
        onClick={() => onChange(() => emptyCrewOps(snap.person.id))}
      >
        Clear ops for this person
      </button>
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
