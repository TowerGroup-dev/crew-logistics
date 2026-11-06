import { bookingLabel, bookingNeedsAttention, opsFor, type CrewOpsBook } from "@/lib/crew-ops";
import {
  CREW_SCHEDULE,
  RETURN_SOON_DAYS,
  crewOverview,
  dutyLabel,
  projectLabel,
  type CrewProject,
  type CrewSnapshot,
} from "@/lib/crew-schedule";
import { formatLong, formatMedium } from "@/lib/dates";

export type BriefingAction = {
  level: "Urgent" | "Upcoming" | "Pending" | "Resolved";
  text: string;
  owner: string;
  personId?: string;
};

export type CrewBriefing = {
  title: string;
  to: string;
  whenLabel: string;
  year: number;
  today: string;
  counts: {
    onSite: number;
    offRotation: number;
    overdue: number;
    dueSoon: number;
    travelAttention: number;
  };
  actions: BriefingAction[];
  changes: string[];
  text: string;
  html: string;
};

function montrealParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montreal",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    month: get("month"),
    day: get("day"),
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
    dayPeriod: get("dayPeriod"),
  };
}

function actionFor(row: CrewSnapshot, opsBook: CrewOpsBook): BriefingAction | null {
  const ops = opsFor(opsBook, row.person.id);
  const owner = "Crew coordinator";
  if (row.overdue && bookingNeedsAttention(ops.returnFlight)) {
    return {
      level: "Urgent",
      text: `Return flight outstanding for ${row.person.name}. Planned departure ${row.plannedOut ? formatMedium(row.plannedOut) : "unknown"} has passed.`,
      owner,
      personId: row.person.id,
    };
  }
  if (row.overdue) {
    return {
      level: "Urgent",
      text: `Verify overdue departure for ${row.person.name} (${dutyLabel(row.duty)}${row.site ? ` · ${row.site}` : ""}).`,
      owner,
      personId: row.person.id,
    };
  }
  if (row.dueSoon && bookingNeedsAttention(ops.returnFlight)) {
    return {
      level: "Upcoming",
      text: `Rotation ends in ${row.daysUntilOut} day${row.daysUntilOut === 1 ? "" : "s"} for ${row.person.name}; return flight not confirmed.`,
      owner,
      personId: row.person.id,
    };
  }
  if (row.dueSoon) {
    return {
      level: "Upcoming",
      text: `${row.person.name} leaves in ${row.daysUntilOut} day${row.daysUntilOut === 1 ? "" : "s"}. Confirm replacement if needed.`,
      owner,
      personId: row.person.id,
    };
  }
  if (bookingNeedsAttention(ops.accommodation) && (row.duty === "on_site" || row.duty === "upcoming" || row.duty === "in_transit")) {
    return {
      level: "Pending",
      text: `Accommodation confirmation required for ${row.person.name}.`,
      owner,
      personId: row.person.id,
    };
  }
  if (bookingNeedsAttention(ops.outboundFlight) && row.duty === "upcoming") {
    return {
      level: "Pending",
      text: `Outbound flight still ${bookingLabel(ops.outboundFlight).toLowerCase()} for ${row.person.name}.`,
      owner,
      personId: row.person.id,
    };
  }
  return null;
}

function recentChanges(opsBook: CrewOpsBook, peopleById: Map<string, string>, sinceIso: string | null) {
  const changes: string[] = [];
  const since = sinceIso ? Date.parse(sinceIso) : 0;
  for (const [personId, ops] of Object.entries(opsBook)) {
    const name = peopleById.get(personId) ?? personId;
    for (const update of ops.updates) {
      if (since && Date.parse(update.at) < since) continue;
      changes.push(`${name}: ${update.text} (${update.by})`);
    }
    if (ops.plannedOutOverride && (!since || true)) {
      // Overrides are current state; include when there is a recent update already or always list active overrides after a reset briefing.
    }
  }
  if (changes.length === 0) {
    changes.push("No new crew assignment, date, travel, or lodging changes since the previous briefing.");
  }
  return changes.slice(0, 40);
}

export function buildCrewBriefing(input: {
  today: string;
  opsBook: CrewOpsBook;
  people: { id: string; name: string; projectIds: string[] }[];
  projects: CrewProject[];
  recipientName?: string;
  recipientEmail?: string;
  previousBriefingAt?: string | null;
  appUrl?: string;
}): CrewBriefing {
  const overview = crewOverview(input.today, input.opsBook, input.people as Parameters<typeof crewOverview>[2]);
  const recipient = input.recipientName?.trim() || "Katrina";
  const montreal = montrealParts();
  const whenLabel = `8:00 AM · ${montreal.weekday}, ${montreal.month} ${montreal.day}`;
  const peopleById = new Map(input.people.map((person) => [person.id, person.name]));
  const actions = overview.rows
    .map((row) => actionFor(row, input.opsBook))
    .filter((item): item is BriefingAction => Boolean(item));
  const changes = recentChanges(input.opsBook, peopleById, input.previousBriefingAt ?? null);
  const appUrl = input.appUrl?.replace(/\/$/, "") || "http://127.0.0.1:47232";

  const priorityLines = actions.length
    ? actions.map((action, index) => `${index + 1}. [${action.level}] ${action.text} · Owner: ${action.owner}`)
    : ["1. No urgent crew logistics actions this morning. Continue monitoring rotations."];

  const text = [
    "Crew Logistics Daily Briefing",
    "",
    `To: ${recipient}${input.recipientEmail ? ` <${input.recipientEmail}>` : ""} · ${whenLabel}`,
    `Schedule year: ${CREW_SCHEDULE.year}`,
    "",
    `Good morning, ${recipient}.`,
    "",
    "Here is today's crew logistics summary.",
    "",
    "On site",
    `# ${overview.onSite}`,
    "",
    "Overdue departures",
    `# ${overview.overdue}`,
    "",
    `Due within ${RETURN_SOON_DAYS} days`,
    `# ${overview.dueSoon}`,
    "",
    "Travel attention",
    `# ${overview.travelAttention}`,
    "",
    "Priority actions",
    ...priorityLines,
    "",
    "Changes since the previous briefing",
    ...changes.map((line) => `- ${line}`),
    "",
    `Open Crew Logistics to review the full roster: ${appUrl}`,
    "",
    `Confirmed facts are from the ${CREW_SCHEDULE.year} schedule and recorded ops. Missing flights or lodging are marked as action needed until confirmed.`,
  ].join("\n");

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#152033;line-height:1.5;max-width:640px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#5a6578">Crew Logistics Daily Briefing · ${CREW_SCHEDULE.year}</p>
      <h1 style="margin:0 0 8px;font-size:22px">Good morning, ${escapeHtml(recipient)}</h1>
      <p style="margin:0 0 20px;color:#5a6578">${escapeHtml(whenLabel)} · ${escapeHtml(formatLong(input.today))}</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
        ${statRow("On site", overview.onSite)}
        ${statRow("Overdue departures", overview.overdue)}
        ${statRow(`Due within ${RETURN_SOON_DAYS} days`, overview.dueSoon)}
        ${statRow("Travel attention", overview.travelAttention)}
      </table>
      <h2 style="font-size:16px;margin:0 0 8px">Priority actions</h2>
      <ol style="margin:0 0 20px;padding-left:18px">
        ${actions.length
          ? actions
              .map(
                (action) =>
                  `<li style="margin:0 0 8px"><strong>${escapeHtml(action.level)}</strong>: ${escapeHtml(action.text)} <span style="color:#5a6578">· ${escapeHtml(action.owner)}</span></li>`,
              )
              .join("")
          : "<li>No urgent crew logistics actions this morning.</li>"}
      </ol>
      <h2 style="font-size:16px;margin:0 0 8px">Changes since the previous briefing</h2>
      <ul style="margin:0 0 20px;padding-left:18px">
        ${changes.map((line) => `<li style="margin:0 0 6px">${escapeHtml(line)}</li>`).join("")}
      </ul>
      <p style="margin:0"><a href="${escapeHtml(appUrl)}" style="color:#3d72c4">Open Crew Logistics</a> to review the full roster and resolve outstanding actions.</p>
    </div>
  `;

  return {
    title: `Crew Logistics Daily Briefing · ${formatMedium(input.today)}`,
    to: input.recipientEmail?.trim() || "",
    whenLabel,
    year: CREW_SCHEDULE.year,
    today: input.today,
    counts: {
      onSite: overview.onSite,
      offRotation: overview.offRotation,
      overdue: overview.overdue,
      dueSoon: overview.dueSoon,
      travelAttention: overview.travelAttention,
    },
    actions,
    changes,
    text,
    html,
  };
}

function statRow(label: string, value: number) {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #e8edf3;color:#5a6578">${escapeHtml(label)}</td>
    <td style="padding:10px 0;border-bottom:1px solid #e8edf3;text-align:right;font-size:22px;font-weight:700"># ${value}</td>
  </tr>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type InstantAlert = {
  subject: string;
  text: string;
  html: string;
  fingerprint: string;
};

/** Critical change → immediate Katrina alert. Returns null when the change is routine. */
export function buildInstantAlert(input: {
  personName: string;
  personId: string;
  change: string;
  actionNeeded: boolean;
  owner?: string;
  appUrl?: string;
}): InstantAlert {
  const owner = input.owner ?? "Crew coordinator";
  const appUrl = `${(input.appUrl ?? "http://127.0.0.1:47232").replace(/\/$/, "")}?person=${encodeURIComponent(input.personId)}`;
  const subject = input.actionNeeded
    ? `Crew action needed · ${input.personName}`
    : `Crew update · ${input.personName}`;
  const text = [
    subject,
    "",
    `Who: ${input.personName}`,
    `What changed: ${input.change}`,
    `Action needed: ${input.actionNeeded ? "Yes" : "No"}`,
    `Responsible: ${owner}`,
    "",
    `Open record: ${appUrl}`,
  ].join("\n");
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#152033;line-height:1.5">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#5a6578">Crew Logistics · Instant update</p>
    <h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(subject)}</h1>
    <p><strong>Who:</strong> ${escapeHtml(input.personName)}</p>
    <p><strong>What changed:</strong> ${escapeHtml(input.change)}</p>
    <p><strong>Action needed:</strong> ${input.actionNeeded ? "Yes" : "No"}</p>
    <p><strong>Responsible:</strong> ${escapeHtml(owner)}</p>
    <p style="margin-top:16px"><a href="${escapeHtml(appUrl)}" style="color:#3d72c4">Open this crew record</a></p>
  </div>`;
  return {
    subject,
    text,
    html,
    fingerprint: `${input.personId}:${input.change}`.slice(0, 200),
  };
}

export function describeOpsChange(
  before: ReturnType<typeof opsFor>,
  after: ReturnType<typeof opsFor>,
): { change: string; critical: boolean } | null {
  if (before.plannedOutOverride !== after.plannedOutOverride) {
    return {
      change: `Planned Out changed to ${after.plannedOutOverride ?? "schedule default"}`,
      critical: true,
    };
  }
  if (before.plannedInOverride !== after.plannedInOverride) {
    return {
      change: `Planned In changed to ${after.plannedInOverride ?? "schedule default"}`,
      critical: true,
    };
  }
  if (before.actualOut !== after.actualOut) {
    return { change: `Actual Out recorded as ${after.actualOut ?? "cleared"}`, critical: true };
  }
  if (before.actualIn !== after.actualIn) {
    return { change: `Actual In recorded as ${after.actualIn ?? "cleared"}`, critical: true };
  }
  if (before.returnFlight !== after.returnFlight) {
    return {
      change: `Return flight → ${bookingLabel(after.returnFlight)}`,
      critical: true,
    };
  }
  if (before.outboundFlight !== after.outboundFlight) {
    return {
      change: `Outbound flight → ${bookingLabel(after.outboundFlight)}`,
      critical: true,
    };
  }
  if (before.accommodation !== after.accommodation) {
    return {
      change: `Accommodation → ${bookingLabel(after.accommodation)}`,
      critical: after.accommodation === "cancelled" || after.accommodation === "confirmed",
    };
  }
  if (before.updates.length < after.updates.length) {
    const latest = after.updates[0];
    return { change: latest?.text || "New crew update posted", critical: false };
  }
  return null;
}

/** Unused import guard for project labels in future enrichment. */
export function projectNames(projects: CrewProject[], ids: string[]) {
  return ids.map((id) => projectLabel(projects, id));
}
