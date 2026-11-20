import { describe, expect, it } from "vitest";
import { emptyRoutesBook, flightPlaceOnDay, legsForRoute, readRoutesBook, routeAirports, setRouteVia } from "./crew-routes";
import type { FlightSegment } from "./crew-flights";
import { dropAssumedFlights, emptyTravel, type RotationBook } from "./crew-rotations";

const leg = (fromAirport: string, toAirport: string, departDate: string, arriveDate = departDate): FlightSegment => ({
  fromAirport,
  toAirport,
  departDate,
  departTime: "",
  arriveDate,
  arriveTime: "",
  flightNumber: "",
});

describe("usual routes", () => {
  it("goes out through the stops and comes home the reverse way", () => {
    const book = emptyRoutesBook();
    expect(routeAirports(book, "KUG", "YOW", "outbound")).toEqual(["YOW", "YK", "KUG"]);
    expect(routeAirports(book, "KUG", "YOW", "return")).toEqual(["KUG", "YK", "YOW"]);
    expect(routeAirports(book, "IQA", "YOW", "outbound")).toEqual(["YOW", "IQA"]);
  });

  it("does not repeat a stop when the person starts there", () => {
    expect(routeAirports(emptyRoutesBook(), "KUG", "YK", "outbound")).toEqual(["YK", "KUG"]);
  });

  it("keeps edits and survives a reload", () => {
    const book = setRouteVia(emptyRoutesBook(), "POND", ["IQA"]);
    const again = readRoutesBook(JSON.parse(JSON.stringify(book)));
    expect(routeAirports(again, "POND", "YUL", "outbound")).toEqual(["YUL", "IQA", "POND"]);
  });

  it("makes one leg per hop", () => {
    const legs = legsForRoute(["YOW", "YK", "KUG"], "2026-12-01");
    expect(legs.map((row) => `${row.fromAirport}-${row.toAirport}`)).toEqual(["YOW-YK", "YK-KUG"]);
    expect(legs[0]!.departDate).toBe("2026-12-01");
  });
});

describe("where a person is during a booked trip", () => {
  const trip = [leg("YOW", "YK", "2026-12-01"), leg("YK", "KUG", "2026-12-03")];

  it("sleeps over at the stopover between legs", () => {
    expect(flightPlaceOnDay(trip, "2026-12-01")).toBe("YK");
    expect(flightPlaceOnDay(trip, "2026-12-02")).toBe("YK");
    expect(flightPlaceOnDay(trip, "2026-12-03")).toBe("KUG");
  });

  it("same-day connections land at the final airport", () => {
    expect(flightPlaceOnDay([leg("YOW", "YK", "2026-12-01"), leg("YK", "KUG", "2026-12-01")], "2026-12-01")).toBe("KUG");
  });

  it("is empty outside the trip", () => {
    expect(flightPlaceOnDay(trip, "2026-11-30")).toBeNull();
    expect(flightPlaceOnDay(trip, "2026-12-04")).toBeNull();
  });
});

describe("no assumed flights", () => {
  it("clears the ASSUMED placeholder but keeps real bookings", () => {
    const assumed = { ...emptyTravel("outbound"), pnr: "ASSUMED", confirmed: true, bookedOn: "2026-11-01", departDate: "2026-11-15", notes: "Assumed booked, replace with real confirmation when available." };
    const real = { ...emptyTravel("return"), pnr: "XKQ7PL", confirmed: true, bookedOn: "2026-11-17" };
    const book = { version: 1, rotations: [{ id: "r1", outbound: assumed, returnTravel: real }] } as unknown as RotationBook;
    const out = dropAssumedFlights(book).rotations[0]!;
    expect(out.outbound.pnr).toBe("");
    expect(out.outbound.confirmed).toBe(false);
    expect(out.outbound.bookedOn).toBeNull();
    expect(out.outbound.notes).toBe("");
    expect(out.returnTravel).toBe(real);
  });
});
