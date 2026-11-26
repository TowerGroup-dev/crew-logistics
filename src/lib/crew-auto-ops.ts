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
    // Skip if the user cleared the window on purpose (must survive refresh).
    if (
      snap.plannedIn &&
      !patched.outboundWindowCleared &&
      (!patched.outboundBookFrom || !patched.outboundBookTo)
    ) {
      patched = {
        ...patched,
        outboundBookFrom: patched.outboundBookFrom || addDays(snap.plannedIn, -RETURN_SOON_DAYS),
        outboundBookTo: patched.outboundBookTo || snap.plannedIn,
      };
      dirty = true;
    }
    // Stay with no OUT date yet (still there): no return window until an OUT is set.
    // Clears one the app filled in itself; a window painted by hand is kept.
    const stay = (person.stints || []).find((row) => row.from === snap.plannedIn);
    const openStay = Boolean(stay && !stay.out);
    if (openStay && !patched.returnWindowPainted && (patched.returnBookFrom || patched.returnBookTo)) {
      patched = { ...patched, returnBookFrom: null, returnBookTo: null };
      dirty = true;
    }
    if (
      !openStay &&
      snap.plannedOut &&
      !patched.returnWindowCleared &&
      (!patched.returnBookFrom || !patched.returnBookTo)
    ) {
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
