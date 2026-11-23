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
import type { RotationBook } from "@/lib/crew-rotations";
import {
  buildSituationReminders,
  formatRemindersForMail,
} from "@/lib/crew-situation-reminders";
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
  rotationBook?: RotationBook;
  recipientName?: string;
  recipientEmail?: string;
  previousBriefingAt?: string | null;
  appUrl?: string;
}): CrewBriefing {
  const overview = crewOverview(input.today, input.opsBook, input.people as Parameters<typeof crewOverview>[2]);
  const recipient = input.recipientName?.trim() || "Katrina";
  const montreal = montrealParts();
  const whenLabel = `Monday 8:30 AM · ${montreal.weekday}, ${montreal.month} ${montreal.day}`;
  const peopleById = new Map(input.people.map((person) => [person.id, person.name]));
  const actions = overview.rows
    .map((row) => actionFor(row, input.opsBook))
    .filter((item): item is BriefingAction => Boolean(item));
  const changes = recentChanges(input.opsBook, peopleById, input.previousBriefingAt ?? null);
  const appUrl = input.appUrl?.replace(/\/$/, "") || "http://127.0.0.1:47232";
  const reminderBoard = buildSituationReminders({
    rows: overview.rows,
    opsBook: input.opsBook,
    book: input.rotationBook || { version: 1, rotations: [] },
    asOf: input.today,
  });
  const reminderLines = formatRemindersForMail(reminderBoard);

  // One row per person per week, everything about them together (leaving, flights, check-ins).
  const rowById = new Map(overview.rows.map((row) => [row.person.id, row]));
  const weekRows = personRows(reminderBoard.week, rowById, input.today);
  const nextRows = personRows(reminderBoard.lookahead, rowById, input.today);
  // Accommodation still to confirm: its own short list (it is not tied to a week).
  const stayItems = [...reminderBoard.week, ...reminderBoard.lookahead]
    .filter((item) => item.section === "accommodation")
    .map((item) => {
      const row = rowById.get(item.personId);
      return { name: row?.person.name ?? item.personId, site: row?.site ?? "", arrived: row?.arrivedOn || row?.plannedIn || null };
    })
    .sort((a, b) => (a.arrived ?? "").localeCompare(b.arrived ?? "") || a.name.localeCompare(b.name));
  const leavingThisWeek = reminderBoard.week.filter((item) => item.section === "leaving").length;
  const leavingNextWeek = reminderBoard.lookahead.filter((item) => item.section === "leaving").length;
  const flightsToBook = [...reminderBoard.week, ...reminderBoard.lookahead].filter(
    (item) => item.section === "flights" || item.section === "check_in",
  ).length;
  const realChanges = changes.filter((line) => !line.startsWith("No new crew"));
  const dateLine = formatLong(input.today);
  const weekRange = `${emailDate(reminderBoard.weekStart)} to ${emailDate(reminderBoard.weekEnd)}`;
  const nextRange = `${emailDate(reminderBoard.lookaheadStart)} to ${emailDate(reminderBoard.lookaheadEnd)}`;
  const summary = summarySentence(leavingThisWeek, leavingNextWeek, flightsToBook, stayItems.length);

  const text = [
    "TOWER ARCTIC LTD.",
    "Crew Logistics · Weekly Briefing",
    dateLine,
    "",
    `Good morning ${recipient},`,
    "",
    summary,
    "",
    `On site: ${overview.onSite} · Leaving this week: ${leavingThisWeek} · Leaving next week: ${leavingNextWeek} · Flights to book: ${flightsToBook}`,
    "",
    `THIS WEEK (${weekRange})`,
    ...(weekRows.length ? weekRows.map((row) => `- ${row.date} · ${row.name}${row.site ? ` (${row.site})` : ""}: ${row.actions.join("; ")}`) : ["Nothing to action."]),
    "",
    `NEXT WEEK (${nextRange})`,
    ...(nextRows.length ? nextRows.map((row) => `- ${row.date} · ${row.name}${row.site ? ` (${row.site})` : ""}: ${row.actions.join("; ")}`) : ["Nothing to action."]),
    "",
    ...(stayItems.length
      ? [`ACCOMMODATION TO CONFIRM (${stayItems.length})`, ...stayItems.map((row) => `- ${row.name}${row.site ? ` (${row.site})` : ""}, arrived ${row.arrived ? emailDate(row.arrived) : "-"}`), ""]
      : []),
    "CHANGES SINCE THE LAST BRIEFING",
    ...(realChanges.length ? realChanges.map((line) => `- ${line}`) : ["No changes to crew dates, travel or accommodation."]),
    "",
    `Open Crew Logistics: ${appUrl}`,
    "",
    "Tower Arctic Ltd. · Crew Logistics",
    "This message is sent every Monday at 8:30 am.",
  ].join("\n");

  const html = emailFrame({
    kicker: "Weekly Briefing",
    date: dateLine,
    body: `
      <p style="margin:0 0 6px;font-size:16px;color:${INK}">Good morning ${escapeHtml(recipient)},</p>
      <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:${MUTED}">${escapeHtml(summary)}</p>
      ${tiles([
        ["On site", overview.onSite],
        ["Leaving this week", leavingThisWeek],
        ["Leaving next week", leavingNextWeek],
        ["Flights to book", flightsToBook],
      ])}
      ${sectionTitle("This week", weekRange)}
      ${personTable(weekRows, "Nothing to action this week.")}
      ${sectionTitle("Next week", nextRange)}
      ${personTable(nextRows, "Nothing to action next week.")}
      ${stayItems.length
        ? `${sectionTitle(`Accommodation to confirm (${stayItems.length})`, "Not yet marked as confirmed")}
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 26px;font-size:13px">
             ${stayItems
               .map(
                 (row) => `<tr>
                   <td style="padding:7px 0;border-bottom:1px solid ${LINE};color:${INK}">${escapeHtml(row.name)}</td>
                   <td style="padding:7px 8px;border-bottom:1px solid ${LINE};color:${MUTED};white-space:nowrap">${escapeHtml(row.site)}</td>
                   <td style="padding:7px 0;border-bottom:1px solid ${LINE};color:${MUTED};text-align:right;white-space:nowrap">Arrived ${row.arrived ? escapeHtml(emailDate(row.arrived)) : "-"}</td>
                 </tr>`,
               )
               .join("")}
           </table>`
        : ""}
      ${sectionTitle("Changes since the last briefing", "")}
      ${realChanges.length
        ? `<ul style="margin:0 0 26px;padding-left:18px;font-size:13px;line-height:1.6;color:${INK}">${realChanges.map((line) => `<li style="margin:0 0 4px">${escapeHtml(line)}</li>`).join("")}</ul>`
        : `<p style="margin:0 0 26px;font-size:13px;color:${MUTED}">No changes to crew dates, travel or accommodation.</p>`}
      ${button("Open Crew Logistics", appUrl)}
    `,
    footer: "This message is sent every Monday at 8:30 am. Recipients can be changed in Settings.",
  });

  return {
    title: `Crew Logistics · Weekly Briefing · ${emailDate(input.today)}`,
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

// Email look: formal, plain, works in Outlook (tables and inline styles only).
const NAVY = "#17324d";
const ACCENT = "#2f6fb5";
const INK = "#1d2733";
const MUTED = "#5b6675";
const LINE = "#e3e8ef";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "30 Nov 2026" (same short months as the app). */
function emailDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[(m || 1) - 1]} ${y}`;
}

/** "Mon 30 Nov" */
function emailDay(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y!, (m || 1) - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS[(m || 1) - 1]}`;
}

function daysWord(days: number | null | undefined) {
  if (days == null) return "";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

type PersonRow = { date: string; dueOn: string; name: string; site: string; actions: string[]; urgent: boolean };

/** Reminders grouped by person: one line each, with everything that needs doing for them. */
function personRows(
  items: ReturnType<typeof buildSituationReminders>["week"],
  rowById: Map<string, CrewSnapshot>,
  today: string,
): PersonRow[] {
  const byPerson = new Map<string, PersonRow>();
  for (const item of items) {
    if (item.section === "accommodation") continue;
    const row = rowById.get(item.personId);
    const kind = item.id.slice(item.id.lastIndexOf(":") + 1);
    const action =
      kind === "leave"
        ? `Leaves ${row?.site || "site"} ${daysWord(row?.daysUntilOut)}`.trim()
        : kind === "return-flight"
          ? "Return flight not booked"
          : kind === "arrive"
            ? "Flight to site not booked"
            : kind === "return-window"
              ? `Book return flight (window ${item.dateLabel})`
              : kind === "outbound-window"
                ? `Book flight to site (window ${item.dateLabel})`
                : item.text;
    const due = item.dueOn || today;
    const current = byPerson.get(item.personId);
    const urgent = item.urgency === "now";
    if (current) {
      current.actions.push(action);
      if (due < current.dueOn) {
        current.dueOn = due;
        current.date = emailDay(due);
      }
      current.urgent ||= urgent;
    } else {
      byPerson.set(item.personId, {
        date: emailDay(due),
        dueOn: due,
        name: row?.person.name ?? item.personId,
        site: row?.site ?? "",
        actions: [action],
        urgent,
      });
    }
  }
  // "Leaves ..." first, then what to book.
  for (const row of byPerson.values()) row.actions.sort((a, b) => Number(!a.startsWith("Leaves")) - Number(!b.startsWith("Leaves")));
  return [...byPerson.values()].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.name.localeCompare(b.name));
}

function summarySentence(leavingThisWeek: number, leavingNextWeek: number, flightsToBook: number, stays: number) {
  const parts: string[] = [];
  parts.push(
    leavingThisWeek
      ? `${leavingThisWeek} ${leavingThisWeek === 1 ? "person leaves" : "people leave"} site this week`
      : "nobody leaves site this week",
  );
  if (leavingNextWeek) parts.push(`${leavingNextWeek} next week`);
  const first = `${parts.join(", and ")}.`;
  const second = flightsToBook
    ? ` ${flightsToBook} flight${flightsToBook === 1 ? " still needs" : "s still need"} to be booked`
    : " All flights in the next two weeks are booked";
  const third = stays ? `, and ${stays} accommodation booking${stays === 1 ? " is" : "s are"} not yet confirmed.` : ".";
  return `Here is the crew outlook for the next two weeks: ${first.charAt(0).toLowerCase()}${first.slice(1)}${second}${third}`;
}

function emailFrame(input: { kicker: string; date: string; body: string; footer: string }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f9">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;border-collapse:collapse">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;border-collapse:collapse;background:#ffffff;border:1px solid ${LINE};font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:${INK}">
      <tr><td style="padding:24px 28px 16px;border-bottom:2px solid ${ACCENT}">
        <p style="margin:0;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${ACCENT};font-weight:700">Tower Arctic Ltd.</p>
        <p style="margin:4px 0 0;font-size:21px;color:${ACCENT};font-weight:600">Crew Logistics &middot; ${escapeHtml(input.kicker)}</p>
        <p style="margin:6px 0 0;font-size:13px;color:${MUTED}">${escapeHtml(input.date)}</p>
      </td></tr>
      <tr><td style="padding:26px 28px 8px">${input.body}</td></tr>
      <tr><td style="padding:18px 28px 24px;border-top:1px solid ${LINE};font-size:11px;line-height:1.6;color:${MUTED}">
        <strong style="color:${INK}">Tower Arctic Ltd.</strong> &middot; Crew Logistics<br>${escapeHtml(input.footer)}
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function tiles(items: [string, number][]) {
  const cells = items
    .map(
      ([label, value], index) => `<td width="25%" style="padding:12px 10px;text-align:center;border:1px solid ${LINE};${index ? "border-left:0;" : ""}background:#f8fafc">
        <div style="font-size:24px;font-weight:700;color:${NAVY};line-height:1.1">${value}</div>
        <div style="margin-top:4px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:${MUTED}">${escapeHtml(label)}</div>
      </td>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 28px"><tr>${cells}</tr></table>`;
}

function sectionTitle(title: string, sub: string) {
  // A two-cell row (not a float), so a long note never runs into the rule under the title.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-bottom:2px solid ${NAVY}"><tr>
    <td valign="bottom" style="padding:0 8px 6px 0;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${NAVY}">${escapeHtml(title)}</td>
    ${sub ? `<td valign="bottom" align="right" style="padding:0 0 6px;font-size:12px;color:${MUTED}">${escapeHtml(sub)}</td>` : ""}
  </tr></table>`;
}

function personTable(rows: PersonRow[], empty: string) {
  if (!rows.length) return `<p style="margin:10px 0 26px;font-size:13px;color:${MUTED}">${escapeHtml(empty)}</p>`;
  const body = rows
    .map(
      (row) => `<tr>
        <td valign="top" style="padding:9px 10px 9px 0;border-bottom:1px solid ${LINE};font-size:13px;white-space:nowrap;color:${row.urgent ? "#b42318" : MUTED};font-weight:${row.urgent ? 700 : 400}">${escapeHtml(row.date)}</td>
        <td valign="top" style="padding:9px 10px 9px 0;border-bottom:1px solid ${LINE};font-size:13px;color:${INK}"><strong>${escapeHtml(row.name)}</strong>${row.site ? `<br><span style="color:${MUTED};font-size:12px">${escapeHtml(row.site)}</span>` : ""}</td>
        <td valign="top" style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:13px;line-height:1.55;color:${INK}">${row.actions.map((action) => escapeHtml(action)).join("<br>")}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 26px">
    <tr>
      <td style="padding:8px 10px 6px 0;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};width:90px">Date</td>
      <td style="padding:8px 10px 6px 0;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};width:38%">Crew member</td>
      <td style="padding:8px 0 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED}">To do</td>
    </tr>${body}</table>`;
}

function button(label: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 22px"><tr>
    <td style="background:${ACCENT};border-radius:4px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a></td>
  </tr></table>`;
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
    `Changed by: ${owner}`,
    "",
    `Open record: ${appUrl}`,
  ].join("\n");
  const field = (label: string, value: string, strong = false) => `<tr>
      <td valign="top" style="padding:9px 12px 9px 0;border-bottom:1px solid ${LINE};font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:${MUTED};width:140px">${escapeHtml(label)}</td>
      <td valign="top" style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK};${strong ? "font-weight:700;" : ""}">${escapeHtml(value)}</td>
    </tr>`;
  const html = emailFrame({
    kicker: input.actionNeeded ? "Action Needed" : "Update",
    date: formatLong(new Date().toISOString().slice(0, 10)),
    body: `
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:${INK}">An important change was just made to a crew record${input.actionNeeded ? " and needs your attention" : ""}.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px">
        ${field("Crew member", input.personName, true)}
        ${field("What changed", input.change)}
        ${field("Action needed", input.actionNeeded ? "Yes" : "No")}
        ${field("Changed by", owner)}
      </table>
      ${button("Open this crew record", appUrl)}
    `,
    footer: "Sent automatically when a crew date, flight or accommodation changes. Alerts can be turned off in Settings.",
  });
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
