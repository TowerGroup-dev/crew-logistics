import { describe, expect, it } from "vitest";
import { clearStayBooking } from "@/lib/crew-clear-booking";
import { emptyFlightBook, type FlightBooking } from "@/lib/crew-flights";
import { emptyTravel, type CrewRotation, type RotationBook } from "@/lib/crew-rotations";
import { emptyStopoverBook, setStopover } from "@/lib/crew-stopovers";

function booking(partial: Partial<FlightBooking> & Pick<FlightBooking, "id" | "personId" | "direction">): FlightBooking {
  return {
    rotationDate: null,
    airline: "Canadian North",
    pnr: "ABC123",
    ticketNumber: "",
    segments: [
      {
        fromAirport: "YUL",
        toAirport: "IQA",
        departDate: "2026-12-01",
        departTime: "09:00",
        arriveDate: "2026-12-01",
        arriveTime: "14:00",
        flightNumber: "5T100",
      },
    ],
    status: "booked",
    bookedOn: "2026-11-01",
    enteredBy: "",
    enteredAt: "",
    confirmationName: "",
    confirmationDataUrl: "",
    notes: "",
    hotels: [{ place: "YK", name: "Explorer", confirmation: "H1", checkIn: "2026-11-30", checkOut: "2026-12-01" }],
    carService: "Pickup at YFB",
    history: [],
    ...partial,
  };
}

function rotation(partial: Partial<CrewRotation> & Pick<CrewRotation, "id" | "personId" | "plannedIn" | "plannedOut">): CrewRotation {
  return {
    role: "Labourer",
    site: "IQA",
    actualIn: null,
    actualOut: null,
    actualInTime: "",
    actualOutTime: "",
    rotationDays: 42,
    outbound: {
      ...emptyTravel("outbound"),
      pnr: "OUT1",
      confirmed: true,
      segments: booking({ id: "x", personId: "p1", direction: "outbound" }).segments,
      hotels: [{ place: "YK", name: "Explorer", confirmation: "H1", checkIn: "2026-11-30", checkOut: "2026-12-01" }],
    },
    returnTravel: {
      ...emptyTravel("return"),
      pnr: "RET1",
      confirmed: true,
      segments: [
        {
          fromAirport: "IQA",
          toAirport: "YUL",
          departDate: "2026-12-20",
          departTime: "",
          arriveDate: "2026-12-20",
          arriveTime: "",
          flightNumber: "5T200",
        },
      ],
    },
    stay: { site: "IQA", room: "12", checkIn: null, checkOut: null, confirmed: true, document: null, notes: "" },
    replacesRotationId: null,
    replacedByRotationId: null,
    replacementNeeded: true,
    handoverFrom: null,
    handoverTo: null,
    notes: "",
    source: "app",
    moves: [],
    ...partial,
  };
}

describe("clearStayBooking", () => {
  it("clears flights, hotels, stopovers and typed rotation travel for that stay", () => {
    let stopovers = emptyStopoverBook();
    stopovers = setStopover(stopovers, "p1", "2026-11-30", "YK");
    stopovers = setStopover(stopovers, "p1", "2026-12-01", "YK");
    stopovers = setStopover(stopovers, "p2", "2026-12-01", "YOW");

    const flightBook = {
      bookings: [
        booking({ id: "f1", personId: "p1", direction: "outbound", rotationDate: "2026-12-01" }),
        booking({
          id: "f2",
          personId: "p1",
          direction: "return",
          rotationDate: "2026-12-20",
          segments: [
            {
              fromAirport: "IQA",
              toAirport: "YUL",
              departDate: "2026-12-20",
              departTime: "",
              arriveDate: "2026-12-20",
              arriveTime: "",
              flightNumber: "5T200",
            },
          ],
          hotels: [],
        }),
        booking({ id: "other", personId: "p2", direction: "outbound", rotationDate: "2026-12-01" }),
      ],
    };

    const rotationBook: RotationBook = {
      version: 1,
      rotations: [rotation({ id: "r1", personId: "p1", plannedIn: "2026-12-01", plannedOut: "2026-12-21" })],
    };

    const result = clearStayBooking({
      personId: "p1",
      stayFrom: "2026-12-01",
      stayOutExclusive: "2026-12-21",
      flightBook,
      stopoverBook: stopovers,
      rotationBook,
    });

    expect(result.cleared.flights).toBe(2);
    expect(result.flightBook.bookings.map((row) => row.id)).toEqual(["other"]);
    expect(result.stopoverBook.p1).toBeUndefined();
    expect(result.stopoverBook.p2?.["2026-12-01"]).toBe("YOW");
    expect(result.cleared.stopoverDays).toBe(2);

    const clearedRotation = result.rotationBook.rotations[0]!;
    expect(clearedRotation.outbound.pnr).toBe("");
    expect(clearedRotation.outbound.segments).toEqual([]);
    expect(clearedRotation.outbound.hotels).toEqual([]);
    expect(clearedRotation.returnTravel.pnr).toBe("");
    expect(clearedRotation.returnTravel.segments).toEqual([]);
    expect(result.cleared.rotationTrips).toBeGreaterThanOrEqual(2);
  });

  it("does not touch another stay for the same person", () => {
    const rotationBook: RotationBook = {
      version: 1,
      rotations: [
        rotation({ id: "r1", personId: "p1", plannedIn: "2026-12-01", plannedOut: "2026-12-21" }),
        rotation({ id: "r2", personId: "p1", plannedIn: "2027-02-01", plannedOut: "2027-03-01" }),
      ],
    };
    const result = clearStayBooking({
      personId: "p1",
      stayFrom: "2026-12-01",
      stayOutExclusive: "2026-12-21",
      flightBook: emptyFlightBook(),
      stopoverBook: emptyStopoverBook(),
      rotationBook,
    });
    expect(result.rotationBook.rotations[1]!.outbound.pnr).toBe("OUT1");
  });
});
