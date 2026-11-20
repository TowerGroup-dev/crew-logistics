import { describe, expect, it } from "vitest";
import { emptyRoutesBook, flightPlaceOnDay, legsForRoute, readRoutesBook, routeAirports, routeBetweenSites, setRouteVia, tripPlan } from "./crew-routes";
import type { FlightSegment } from "./crew-flights";
import { applyRotationMoves, dropAssumedFlights, emptyTravel, newMove, type RotationBook, type RotationMove } from "./crew-rotations";
import { siteOnDay, travelSegmentOnDay } from "./crew-site-days";
import type { CrewPerson } from "./crew-schedule";

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
    expect(routeAirports(book, "POND", "YOW", "outbound")).toEqual(["YOW", "IQA", "POND"]);
  });

  it("moves between sites up north", () => {
    const book = emptyRoutesBook();
    expect(routeBetweenSites(book, "IQA", "POND")).toEqual(["IQA", "POND"]);
    expect(routeBetweenSites(book, "POND", "IQA")).toEqual(["POND", "IQA"]);
    expect(routeBetweenSites(book, "KUG", "IQA")).toEqual(["KUG", "YK", "IQA"]);
    expect(routeBetweenSites(book, "IQA", "KUG")).toEqual(["IQA", "YK", "KUG"]);
  });

  it("does not repeat a stop when the person starts there", () => {
    expect(routeAirports(emptyRoutesBook(), "KUG", "YK", "outbound")).toEqual(["YK", "KUG"]);
  });

  it("keeps edits and survives a reload", () => {
    const book = setRouteVia(emptyRoutesBook(), "ALRT", ["YOW"]);
    const again = readRoutesBook(JSON.parse(JSON.stringify(book)));
    expect(routeAirports(again, "ALRT", "YUL", "outbound")).toEqual(["YUL", "YOW", "ALRT"]);
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

describe("booked moves change the calendar", () => {
  const person = {
    id: "p1",
    name: "Bryan",
    role: "Surveyor",
    roles: ["Surveyor"],
    homeSites: ["IQA"],
    projectIds: [],
    inDate: null,
    outDate: null,
    rotationDays: 42,
    events: [],
    stints: [{ from: "2026-11-01", out: "2026-12-01", site: "IQA", sites: ["IQA"] }],
  } as unknown as CrewPerson;
  const book = (move: RotationMove) =>
    ({ version: 1, rotations: [{ personId: "p1", plannedIn: "2026-11-01", moves: [move] }] }) as unknown as RotationBook;

  it("shows the new site from the move day when no flights are booked yet", () => {
    const [out] = applyRotationMoves([person], book(newMove("IQA", "POND", "2026-11-20")));
    expect(siteOnDay(out!, "2026-11-19")).toBe("IQA");
    expect(siteOnDay(out!, "2026-11-20")).toBe("POND");
    expect(siteOnDay(out!, "2026-11-30")).toBe("POND");
  });

  it("is grey on a stopover night, then the new site on landing", () => {
    const move = newMove("KUG", "IQA", "2026-11-20");
    move.travel.segments = [
      { fromAirport: "KUG", toAirport: "YK", departDate: "2026-11-20", departTime: "", arriveDate: "2026-11-20", arriveTime: "", flightNumber: "" },
      { fromAirport: "YK", toAirport: "IQA", departDate: "2026-11-21", departTime: "", arriveDate: "2026-11-21", arriveTime: "", flightNumber: "" },
    ];
    const [out] = applyRotationMoves([person], book(move));
    expect(siteOnDay(out!, "2026-11-20")).toBeNull();
    expect(travelSegmentOnDay(out!, "2026-11-20")?.label).toBe("YK");
    expect(siteOnDay(out!, "2026-11-21")).toBe("IQA");
  });
});

describe("trip plan", () => {
  it("lists every leg and stopover night, and warns when a night has no hotel", () => {
    const legs = [
      { fromAirport: "KUG", toAirport: "YK", departDate: "2026-12-01", departTime: "", arriveDate: "2026-12-01", arriveTime: "", flightNumber: "", mode: "flight" as const },
      { fromAirport: "YK", toAirport: "IQA", departDate: "2026-12-03", departTime: "", arriveDate: "2026-12-03", arriveTime: "", flightNumber: "", mode: "road" as const },
    ];
    const plan = tripPlan(legs, []);
    expect(plan.steps.map((row) => row.kind)).toEqual(["leg", "stop", "leg"]);
    expect(plan.steps[1]).toMatchObject({ place: "YK", nights: 2, hotel: null });
    expect(plan.warnings[0]).toMatch(/2 nights in YK/);
    const booked = tripPlan(legs, [{ place: "YK", name: "Explorer", checkIn: "2026-12-01", checkOut: "2026-12-03" }]);
    expect(booked.warnings).toEqual([]);
    expect(booked.steps[1]).toMatchObject({ hotel: "Explorer" });
  });
});

describe("open stays carry into the next year", () => {
  it("stay at the site they last moved to, not the stay's first site", () => {
    const eric = {
      id: "eric",
      name: "Eric",
      role: "Manager",
      roles: ["Manager"],
      homeSites: ["IQA"],
      projectIds: [],
      inDate: null,
      outDate: null,
      rotationDays: 42,
      events: [],
      stints: [{ from: "2026-11-23", out: null, site: "IQA", sites: ["IQA"] }],
    } as unknown as CrewPerson;
    const book = {
      version: 1,
      rotations: [{ personId: "eric", plannedIn: "2026-11-23", moves: [newMove("IQA", "KUG", "2026-11-27")] }],
    } as unknown as RotationBook;
    const [out] = applyRotationMoves([eric], book);
    expect(siteOnDay(out!, "2026-12-31")).toBe("KUG");
    expect(siteOnDay(out!, "2027-01-01")).toBe("KUG");
    expect(siteOnDay(out!, "2027-03-15")).toBe("KUG");
  });
});
