/**
 * One-shot clear for a stay: flights + hotels + stopovers + typed rotation travel.
 */

import { addDays } from "@/lib/dates";
import type { FlightBook, FlightBooking } from "@/lib/crew-flights";
import { emptyTravel, type CrewRotation, type RotationBook, type RotationTravel } from "@/lib/crew-rotations";
import {
  setStopover,
  type CrewStopoverBook,
} from "@/lib/crew-stopovers";

export type ClearStayBookingInput = {
  personId: string;
  /** Inclusive stay start (IN). */
  stayFrom: string;
  /** Exclusive stay end (stint.out), or null when open. */
  stayOutExclusive: string | null;
  flightBook: FlightBook;
  stopoverBook: CrewStopoverBook;
  rotationBook: RotationBook;
};

export type ClearStayBookingResult = {
  flightBook: FlightBook;
  stopoverBook: CrewStopoverBook;
  rotationBook: RotationBook;
  cleared: {
    flights: number;
    stopoverDays: number;
    rotationTrips: number;
  };
};

function wipeTravel(travel: RotationTravel, direction: RotationTravel["direction"]): RotationTravel {
  return {
    ...emptyTravel(direction),
    // Keep direction; drop every booking detail.
    airline: travel.airline || emptyTravel(direction).airline,
  };
}

function bookingTouchesStay(booking: FlightBooking, stayFrom: string, stayOutExclusive: string | null) {
  if (booking.status === "cancelled") return false;
  const from = stayFrom.slice(0, 10);
  const out = stayOutExclusive?.slice(0, 10) || "9999-12-31";
  const windowStart = addDays(from, -14);
  // Last travel day for return is typically the last on-site day (out - 1).
  const windowEnd = out;

  if (booking.rotationDate) {
    const rot = booking.rotationDate.slice(0, 10);
    if (booking.direction === "outbound" && rot === from) return true;
    if (booking.direction === "return" && rot >= from && rot < out) return true;
    if (rot >= windowStart && rot < windowEnd) {
      // Near the stay, same person — count it when segments also overlap the window.
    }
  }

  const legs = booking.segments.filter((row) => row.departDate);
  if (!legs.length) {
    return Boolean(booking.rotationDate && booking.rotationDate >= windowStart && booking.rotationDate < windowEnd);
  }
  return legs.some((leg) => {
    const depart = leg.departDate.slice(0, 10);
    const arrive = (leg.arriveDate || leg.departDate).slice(0, 10);
    return depart < windowEnd && arrive >= windowStart;
  });
}

function clearRotationTrips(rotation: CrewRotation): { rotation: CrewRotation; count: number } {
  let count = 0;
  let next = rotation;
  const hasOutbound =
    Boolean(rotation.outbound.pnr) ||
    rotation.outbound.confirmed ||
    rotation.outbound.segments.length > 0 ||
    rotation.outbound.hotels.length > 0 ||
    Boolean(rotation.outbound.carService);
  const hasReturn =
    Boolean(rotation.returnTravel.pnr) ||
    rotation.returnTravel.confirmed ||
    rotation.returnTravel.segments.length > 0 ||
    rotation.returnTravel.hotels.length > 0 ||
    Boolean(rotation.returnTravel.carService);
  if (hasOutbound) {
    next = { ...next, outbound: wipeTravel(rotation.outbound, "outbound") };
    count += 1;
  }
  if (hasReturn) {
    next = { ...next, returnTravel: wipeTravel(rotation.returnTravel, "return") };
    count += 1;
  }
  if (rotation.moves?.length) {
    const moves = rotation.moves.map((move) => {
      const travel = move.travel;
      const dirty =
        Boolean(travel.pnr) ||
        travel.confirmed ||
        travel.segments.length > 0 ||
        travel.hotels.length > 0 ||
        Boolean(travel.carService);
      if (!dirty) return move;
      count += 1;
      return { ...move, travel: wipeTravel(travel, travel.direction || "outbound") };
    });
    next = { ...next, moves };
  }
  return { rotation: next, count };
}

/** Clear flights, hotels, stopovers and typed trips for one stay. */
export function clearStayBooking(input: ClearStayBookingInput): ClearStayBookingResult {
  const personId = input.personId;
  const stayFrom = input.stayFrom.slice(0, 10);
  const stayOut = input.stayOutExclusive?.slice(0, 10) || null;
  const windowStart = addDays(stayFrom, -14);
  const windowEnd = stayOut || "9999-12-31";

  const keptFlights: FlightBook["bookings"] = [];
  let flightsCleared = 0;
  for (const booking of input.flightBook.bookings) {
    if (booking.personId === personId && bookingTouchesStay(booking, stayFrom, stayOut)) {
      flightsCleared += 1;
      continue;
    }
    keptFlights.push(booking);
  }

  let stopoverDays = 0;
  let stopoverBook = input.stopoverBook;
  const dates = Object.keys(stopoverBook[personId] || {});
  for (const iso of dates) {
    if (iso >= windowStart && iso < windowEnd) {
      stopoverBook = setStopover(stopoverBook, personId, iso, null);
      stopoverDays += 1;
    }
  }

  let rotationTrips = 0;
  const rotations = input.rotationBook.rotations.map((rotation) => {
    if (rotation.personId !== personId || rotation.plannedIn !== stayFrom) return rotation;
    const cleared = clearRotationTrips(rotation);
    rotationTrips += cleared.count;
    return cleared.rotation;
  });

  return {
    flightBook: { bookings: keptFlights },
    stopoverBook,
    rotationBook: { version: 1, rotations },
    cleared: { flights: flightsCleared, stopoverDays, rotationTrips },
  };
}
