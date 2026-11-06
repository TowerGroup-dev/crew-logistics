/** Overview dashboard intelligence, derived from live snapshots, ops, and flights. */

import { actionId, type ActionSeed } from "@/lib/crew-actions";
import { activeBookingFor, flightIsArranged, type FlightBook, type FlightBooking } from "@/lib/crew-flights";
import { bookingNeedsAttention, opsFor, type CrewBookingStatus, type CrewOpsBook } from "@/lib/crew-ops";
import { DEFAULT_ROTATION_DAYS, roleLabel, siteLabel, type CrewSnapshot } from "@/lib/crew-schedule";
import { addDays, daysBetween, formatMedium } from "@/lib/dates";

export type ReminderConfig = {
  planDays: number;
  checkDays: number;
  escalateDays: number;
};

export const DEFAULT_REMINDERS: ReminderConfig = {
  planDays: 14,
  checkDays: 7,
  escalateDays: 3,
};

export type LogisticsLaneStatus =
  | "not_started"
  | "needed"
  | "booked"
  | "awaiting_confirmation"
  | "confirmed"
  | "changed"
  | "cancelled";

export type LogisticsReadiness = "ready" | "incomplete" | "at_risk";

export type RotationIntel = {
  row: CrewSnapshot;
  rotationDay: number | null;
  rotationDays: number;
  daysLeft: number | null;
  progressPct: number;
  plannedIn: string | null;
  plannedOut: string | null;
  actualIn: string | null;
  actualOut: string | null;
  missingIn: boolean;
  missingOut: boolean;
  overdue: boolean;
  endingSoon: boolean;
  outbound: LogisticsLaneStatus;
  returnFlight: LogisticsLaneStatus;
  accommodation: LogisticsLaneStatus;
  /** Simple flags for the overview, booked or not, no status jargon. */
  hasTravel: boolean;
  hasAccommodation: boolean;
  readiness: LogisticsReadiness;
  outstanding: string[];
  replacementId: string | null;
  replacementName: string | null;
  handoverFrom: string | null;
  handoverTo: string | null;
};

export type DashboardFocus = "all" | "on_site" | "arriving" | "leaving" | "actions";

export type DashboardModel = {
  asOf: string;
  headlines: string[];
  kpis: {
    employees: number;
    onSite: number;
    arriving: number;
    leaving: number;
    actions: number;
  };
  upcoming: RotationIntel[];
  onSite: RotationIntel[];
  seeds: ActionSeed[];
};

function flightLane(booking: FlightBooking | null, opsStatus: CrewBookingStatus): LogisticsLaneStatus {
  if (booking) {
    if (booking.status === "cancelled") return "cancelled";
    if (booking.status === "changed") return "changed";
    if (booking.status === "confirmed" || booking.status === "completed") {
      const hasProof = Boolean(booking.pnr.trim() || booking.confirmationDataUrl || booking.confirmationName);
      return hasProof ? "confirmed" : "awaiting_confirmation";
    }
    if (booking.status === "booked") {
      return booking.pnr.trim() || booking.confirmationDataUrl ? "booked" : "awaiting_confirmation";
    }
    if (booking.status === "pending_booking") return "needed";
  }
  if (opsStatus === "confirmed") return "confirmed";
  if (opsStatus === "booked") return "booked";
  if (opsStatus === "needed") return "needed";
  if (opsStatus === "cancelled") return "cancelled";
  return "not_started";
}

function accommodationLane(status: CrewBookingStatus, confirmation: string, notes: string): LogisticsLaneStatus {
  if (status === "cancelled") return "cancelled";
  if (status === "confirmed") {
    return confirmation.trim() || notes.trim() ? "confirmed" : "awaiting_confirmation";
  }
  if (status === "booked") return confirmation.trim() || notes.trim() ? "booked" : "awaiting_confirmation";
  if (status === "needed") return "needed";
  return "not_started";
}

function laneOk(status: LogisticsLaneStatus) {
  return status === "confirmed";
}

function laneLabel(status: LogisticsLaneStatus) {
  if (status === "not_started") return "Not started";
  if (status === "needed") return "Action needed";
  if (status === "booked") return "Booked";
  if (status === "awaiting_confirmation") return "Awaiting confirmation";
  if (status === "confirmed") return "Confirmed";
  if (status === "changed") return "Changed";
  return "Cancelled";
}

function findReplacement(
  leaving: CrewSnapshot,
  rows: CrewSnapshot[],
  opsBook: CrewOpsBook,
): { id: string | null; name: string | null; from: string | null; to: string | null } {
  const ops = opsFor(opsBook, leaving.person.id);
  if (ops.incomingReplacementId) {
    const match = rows.find((row) => row.person.id === ops.incomingReplacementId);
    return {
      id: ops.incomingReplacementId,
      name: match?.person.name ?? ops.incomingReplacementId,
      from: ops.handoverFrom ?? match?.plannedIn ?? null,
      to: ops.handoverTo ?? leaving.plannedOut ?? null,
    };
  }

  if (!leaving.plannedOut) {
    return { id: null, name: null, from: null, to: null };
  }

  const windowStart = addDays(leaving.plannedOut, -7);
  const windowEnd = addDays(leaving.plannedOut, 7);
  const candidate = rows.find((row) => {
    if (row.person.id === leaving.person.id) return false;
    if (!row.plannedIn) return false;
    if (row.plannedIn < windowStart || row.plannedIn > windowEnd) return false;
    return (
      row.person.role === leaving.person.role ||
      (row.person.roles || []).includes(leaving.person.role) ||
      (leaving.person.roles || []).includes(row.person.role)
    );
  });

  if (!candidate?.plannedIn) return { id: null, name: null, from: null, to: null };
  return {
    id: candidate.person.id,
    name: candidate.person.name,
    from: candidate.plannedIn,
    to: leaving.plannedOut,
  };
}

export function buildRotationIntel(
  row: CrewSnapshot,
  opsBook: CrewOpsBook,
  flightBook: FlightBook,
  rows: CrewSnapshot[],
  asOf: string,
  reminders: ReminderConfig = DEFAULT_REMINDERS,
): RotationIntel {
  const ops = opsFor(opsBook, row.person.id);
  const rotationDays = row.rotationDays || DEFAULT_ROTATION_DAYS;
  const rotationDay = row.rotationDay;
  const daysLeft = row.daysUntilOut;
  const progressPct =
    rotationDay == null ? 0 : Math.min(100, Math.round((rotationDay / rotationDays) * 100));

  const outboundBooking = activeBookingFor(flightBook, row.person.id, "outbound");
  const returnBooking = activeBookingFor(flightBook, row.person.id, "return");
  const outbound = flightLane(outboundBooking, ops.outboundFlight);
  const returnFlight = flightLane(returnBooking, ops.returnFlight);
  const accommodation = accommodationLane(ops.accommodation, ops.confirmation, ops.accommodationNotes);

  const endingSoon = Boolean(
    row.duty === "on_site" &&
      ((daysLeft != null && daysLeft >= 0 && daysLeft <= reminders.planDays) || row.dueSoon || row.overdue),
  );
  const replacement = endingSoon || row.overdue ? findReplacement(row, rows, opsBook) : { id: null, name: null, from: null, to: null };

  const outstanding: string[] = [];
  const needsOutbound =
    row.duty === "upcoming" ||
    row.duty === "in_transit" ||
    Boolean(row.plannedIn && row.plannedIn >= asOf && row.plannedIn <= addDays(asOf, reminders.planDays));
  const needsReturn = row.duty === "on_site" && (endingSoon || row.overdue);
  const needsAccommodation =
    row.duty === "on_site" ||
    row.duty === "in_transit" ||
    row.duty === "upcoming" ||
    needsOutbound;

  const outboundBooked =
    laneOk(outbound) ||
    flightIsArranged(outboundBooking) ||
    ops.outboundFlight === "booked" ||
    ops.outboundFlight === "confirmed";
  const returnBooked =
    laneOk(returnFlight) ||
    flightIsArranged(returnBooking) ||
    ops.returnFlight === "booked" ||
    ops.returnFlight === "confirmed";
  const stayBooked =
    laneOk(accommodation) || ops.accommodation === "booked" || ops.accommodation === "confirmed";

  const hasTravel = (!needsOutbound || outboundBooked) && (!needsReturn || returnBooked);
  const hasAccommodation = !needsAccommodation || stayBooked;

  if (!hasTravel) outstanding.push("Travel");
  if (!hasAccommodation) outstanding.push("Accommodation");
  if ((endingSoon || row.overdue) && !replacement.id) outstanding.push("Replacement");

  let readiness: LogisticsReadiness = "ready";
  if (outstanding.length) readiness = "incomplete";
  if (
    outstanding.length &&
    ((daysLeft != null && daysLeft <= reminders.checkDays) ||
      row.overdue ||
      (row.plannedIn && daysBetween(asOf, row.plannedIn) <= reminders.escalateDays && daysBetween(asOf, row.plannedIn) >= 0))
  ) {
    readiness = "at_risk";
  }
  if (!outstanding.length) readiness = "ready";

  return {
    row,
    rotationDay,
    rotationDays,
    daysLeft,
    progressPct,
    plannedIn: row.plannedIn,
    plannedOut: row.plannedOut,
    actualIn: ops.actualIn,
    actualOut: ops.actualOut,
    missingIn: Boolean(row.duty === "on_site" && !row.plannedIn && !ops.actualIn),
    missingOut: Boolean(row.duty === "on_site" && !row.plannedOut),
    overdue: row.overdue,
    endingSoon,
    outbound,
    returnFlight,
    accommodation,
    hasTravel,
    hasAccommodation,
    readiness,
    outstanding,
    replacementId: replacement.id,
    replacementName: replacement.name,
    handoverFrom: replacement.from,
    handoverTo: replacement.to,
  };
}

export function buildDashboard(
  rows: CrewSnapshot[],
  opsBook: CrewOpsBook,
  flightBook: FlightBook,
  asOf: string,
  reminders: ReminderConfig = DEFAULT_REMINDERS,
): DashboardModel {
  const active = rows.filter((row) => row.person.active !== false);
  const intel = active.map((row) => buildRotationIntel(row, opsBook, flightBook, active, asOf, reminders));

  const onSite = intel
    .filter((item) => item.row.duty === "on_site" || item.row.duty === "in_transit")
    .sort(
      (a, b) =>
        (a.daysLeft ?? 999) - (b.daysLeft ?? 999) || a.row.person.name.localeCompare(b.row.person.name),
    );

  const arriving = intel
    .filter(
      (item) =>
        item.plannedIn &&
        item.plannedIn >= asOf &&
        item.plannedIn <= addDays(asOf, reminders.planDays),
    )
    .sort((a, b) => (a.plannedIn || "").localeCompare(b.plannedIn || ""));

  const leaving = intel
    .filter((item) => item.endingSoon || item.overdue)
    .sort((a, b) => (a.daysLeft ?? -1) - (b.daysLeft ?? -1));

  const upcoming = [...leaving, ...arriving.filter((item) => !leaving.some((l) => l.row.person.id === item.row.person.id))]
    .sort((a, b) => {
      const aDate = a.endingSoon || a.overdue ? a.plannedOut : a.plannedIn;
      const bDate = b.endingSoon || b.overdue ? b.plannedOut : b.plannedIn;
      return (aDate || "").localeCompare(bDate || "");
    });

  const seeds: ActionSeed[] = [];
  for (const item of intel) {
    const { row } = item;
    const name = row.person.name;

    if (item.overdue) {
      seeds.push({
        id: actionId("rotation_overdue", row.person.id, row.plannedOut),
        kind: "rotation_overdue",
        personId: row.person.id,
        personName: name,
        title: "Rotation overdue",
        detail: `Planned departure ${row.plannedOut ? formatMedium(row.plannedOut) : "unknown"} has passed.`,
        priority: "urgent",
        dueOn: row.plannedOut,
      });
    }

    if (item.endingSoon && !item.overdue) {
      seeds.push({
        id: actionId("rotation_ending", row.person.id, row.plannedOut),
        kind: "rotation_ending",
        personId: row.person.id,
        personName: name,
        title: "Rotation ending within planning window",
        detail: `${item.daysLeft ?? "?"} day(s) left · planned out ${row.plannedOut ? formatMedium(row.plannedOut) : "-"}.`,
        priority: item.daysLeft != null && item.daysLeft <= reminders.escalateDays ? "urgent" : "high",
        dueOn: row.plannedOut,
      });
    }

    if ((item.endingSoon || item.overdue) && !item.replacementId) {
      seeds.push({
        id: actionId("replacement", row.person.id, row.plannedOut),
        kind: "replacement",
        personId: row.person.id,
        personName: name,
        title: "Replacement not assigned",
        detail: `${siteLabel(row.site || "") || "Site"} · ${roleLabel(row.person)}`,
        priority: item.overdue || (item.daysLeft != null && item.daysLeft <= reminders.escalateDays) ? "urgent" : "high",
        dueOn: row.plannedOut,
      });
    }

    if (
      (row.duty === "upcoming" || (row.plannedIn && row.plannedIn >= asOf && row.plannedIn <= addDays(asOf, reminders.planDays))) &&
      !laneOk(item.outbound)
    ) {
      seeds.push({
        id: actionId("outbound_flight", row.person.id, row.plannedIn),
        kind: "outbound_flight",
        personId: row.person.id,
        personName: name,
        title: "Incoming flight not confirmed",
        detail: `${laneLabel(item.outbound)} · IN ${row.plannedIn ? formatMedium(row.plannedIn) : "-"}`,
        priority: row.plannedIn && daysBetween(asOf, row.plannedIn) <= reminders.checkDays ? "urgent" : "high",
        dueOn: row.plannedIn,
      });
    }

    if ((item.endingSoon || item.overdue) && !laneOk(item.returnFlight)) {
      seeds.push({
        id: actionId("return_flight", row.person.id, row.plannedOut),
        kind: "return_flight",
        personId: row.person.id,
        personName: name,
        title: "Outgoing flight not confirmed",
        detail: `${laneLabel(item.returnFlight)} · OUT ${row.plannedOut ? formatMedium(row.plannedOut) : "-"}`,
        priority: "urgent",
        dueOn: row.plannedOut,
      });
    }

    if (
      (row.duty === "on_site" || row.duty === "upcoming" || row.duty === "in_transit") &&
      !laneOk(item.accommodation) &&
      (bookingNeedsAttention(opsFor(opsBook, row.person.id).accommodation) ||
        item.accommodation === "awaiting_confirmation" ||
        item.accommodation === "not_started" ||
        item.accommodation === "booked")
    ) {
      seeds.push({
        id: actionId("accommodation", row.person.id, row.plannedIn || row.plannedOut),
        kind: "accommodation",
        personId: row.person.id,
        personName: name,
        title: "Accommodation not confirmed",
        detail: laneLabel(item.accommodation),
        priority: row.duty === "upcoming" || item.endingSoon ? "high" : "normal",
        dueOn: row.plannedIn || row.plannedOut,
      });
    }

    if (row.duty === "on_site" && !item.actualIn && row.plannedIn && row.plannedIn <= asOf) {
      seeds.push({
        id: actionId("actual_arrival", row.person.id, row.plannedIn),
        kind: "actual_arrival",
        personId: row.person.id,
        personName: name,
        title: "Confirm actual arrival",
        detail: `Planned IN ${formatMedium(row.plannedIn)}`,
        priority: "normal",
        dueOn: asOf,
      });
    }

    if (item.overdue && !item.actualOut) {
      seeds.push({
        id: actionId("actual_departure", row.person.id, row.plannedOut),
        kind: "actual_departure",
        personId: row.person.id,
        personName: name,
        title: "Confirm actual departure",
        detail: `Planned OUT ${row.plannedOut ? formatMedium(row.plannedOut) : "-"}`,
        priority: "urgent",
        dueOn: asOf,
      });
    }

    if (item.replacementId && item.handoverFrom && item.handoverTo && item.handoverFrom <= addDays(asOf, reminders.planDays)) {
      // Handover outstanding only if either side missing flight/accommodation heavily, skip noise
    }
  }

  // Dedupe seeds by id
  const seedMap = new Map(seeds.map((seed) => [seed.id, seed]));
  const uniqueSeeds = [...seedMap.values()];

  const leavingCount = leaving.length;
  const needBook = upcoming.filter((item) => !item.hasTravel || !item.hasAccommodation).length;
  const missingReplacement = leaving.filter((item) => !item.replacementId).length;

  const headlines: string[] = [];
  if (leavingCount) {
    headlines.push(
      `${leavingCount} employee${leavingCount === 1 ? "" : "s"} due to leave within the next ${reminders.planDays} days.`,
    );
  }
  if (needBook) {
    headlines.push(
      `${needBook} rotation${needBook === 1 ? "" : "s"} still need travel or accommodation booked.`,
    );
  }
  if (missingReplacement) {
    headlines.push(
      `${missingReplacement} replacement${missingReplacement === 1 ? " has" : "s have"} not been assigned.`,
    );
  }
  if (!headlines.length) {
    headlines.push("Nothing urgent in the current planning window.");
  }

  return {
    asOf,
    headlines,
    kpis: {
      employees: active.length,
      onSite: onSite.length,
      arriving: arriving.length,
      leaving: leavingCount,
      actions: uniqueSeeds.length,
    },
    upcoming,
    onSite,
    seeds: uniqueSeeds,
  };
}

export function readinessLabel(value: LogisticsReadiness) {
  if (value === "ready") return "Ready";
  if (value === "at_risk") return "At risk";
  return "Incomplete";
}

export function readinessTone(value: LogisticsReadiness) {
  if (value === "ready") return "bg-emerald-50 text-emerald-900 border-emerald-200";
  if (value === "at_risk") return "bg-rose-50 text-rose-900 border-rose-200";
  return "bg-amber-50 text-amber-950 border-amber-200";
}

export function laneTone(status: LogisticsLaneStatus) {
  if (status === "confirmed") return "bg-emerald-50 text-emerald-900";
  if (status === "booked" || status === "awaiting_confirmation") return "bg-amber-50 text-amber-950";
  if (status === "changed" || status === "needed") return "bg-rose-50 text-rose-900";
  if (status === "cancelled") return "bg-stone-200 text-stone-700";
  return "bg-stone-100 text-stone-600";
}

export { laneLabel };
