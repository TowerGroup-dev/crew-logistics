import { bookingNeedsAttention, opsFor, type CrewOpsBook, type CrewPersonOps } from "@/lib/crew-ops";
import { addDays, daysBetween } from "@/lib/dates";
import {
  FOUR_WEEK_TRACK_DAYS,
  RETURN_SOON_DAYS,
  crewSnapshot,
  type CrewPerson,
} from "@/lib/crew-schedule";

/**
 * Auto-fill travel statuses + flight booking windows (when → when Katrina should book).
 */
export function autoSeedTravelOps(people: CrewPerson[], opsBook: CrewOpsBook, today: string): CrewOpsBook {
  let changed = false;
  const next: CrewOpsBook = { ...opsBook };

  for (const person of people) {
    const snap = crewSnapshot(person, today, opsFor(next, person.id));
    const current = opsFor(next, person.id);
    let patched: CrewPersonOps = { ...current };
    let dirty = false;

    const latest = person.flights?.[person.flights.length - 1];
    if (latest?.arriveIqa && bookingNeedsAttention(patched.outboundFlight)) {
      patched = { ...patched, outboundFlight: "booked", confirmation: patched.confirmation || latest.arriveRef || "" };
      dirty = true;
    }
    if (latest?.departIqa && bookingNeedsAttention(patched.returnFlight)) {
      patched = { ...patched, returnFlight: "booked", confirmation: patched.confirmation || latest.departRef || "" };
      dirty = true;
    }

    // Default booking windows (editable): outbound in the 2 weeks before IN; inbound from 4 weeks before OUT.
    if (snap.plannedIn && (!patched.outboundBookFrom || !patched.outboundBookTo)) {
      patched = {
        ...patched,
        outboundBookFrom: patched.outboundBookFrom || addDays(snap.plannedIn, -RETURN_SOON_DAYS),
        outboundBookTo: patched.outboundBookTo || snap.plannedIn,
      };
      dirty = true;
    }
    if (snap.plannedOut && (!patched.returnBookFrom || !patched.returnBookTo)) {
      patched = {
        ...patched,
        returnBookFrom: patched.returnBookFrom || addDays(snap.plannedOut, -FOUR_WEEK_TRACK_DAYS),
        returnBookTo: patched.returnBookTo || snap.plannedOut,
      };
      dirty = true;
    }

    // 4 weeks on site → Katrina starts tracking leave booking; 2 weeks / overdue → escalate.
    if (snap.fourWeeksOut || snap.dueSoon || snap.overdue) {
      if (patched.returnFlight === "not_started") {
        patched = { ...patched, returnFlight: "needed" };
        dirty = true;
      }
    }
    if (snap.dueSoon || snap.overdue) {
      if (patched.accommodation === "not_started") {
        patched = { ...patched, accommodation: "needed" };
        dirty = true;
      }
    }

    if (
      snap.duty === "upcoming" &&
      snap.plannedIn &&
      daysBetween(today, snap.plannedIn) <= RETURN_SOON_DAYS &&
      patched.outboundFlight === "not_started"
    ) {
      patched = { ...patched, outboundFlight: "needed" };
      dirty = true;
    }

    if (dirty) {
      next[person.id] = patched;
      changed = true;
    }
  }

  return changed ? next : opsBook;
}
