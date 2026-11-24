import { describe, expect, it } from "vitest";
import { suggestRoutesFor } from "@/lib/crew-route-suggestions";
import type { FlightBook } from "@/lib/crew-flights";

function booking(
  id: string,
  path: [string, string][],
): FlightBook["bookings"][number] {
  return {
    id,
    personId: "p1",
    direction: "outbound",
    rotationDate: "2026-11-01",
    airline: "Canadian North",
    pnr: "",
    ticketNumber: "",
    segments: path.map(([from, to], i) => ({
      fromAirport: from,
      toAirport: to,
      departDate: `2026-11-0${i + 1}`,
      departTime: "",
      arriveDate: `2026-11-0${i + 1}`,
      arriveTime: "",
      flightNumber: "",
      mode: "flight" as const,
    })),
    status: "pending_booking",
    bookedOn: null,
    enteredBy: "",
    enteredAt: "",
    confirmationName: "",
    confirmationDataUrl: "",
    notes: "",
    hotels: [],
    carService: "",
    history: [],
  };
}

describe("suggestRoutesFor", () => {
  it("ranks common Ottawa → Edmonton → IQA over rare direct", () => {
    const book: FlightBook = {
      bookings: [
        booking("a", [
          ["YOW", "YEG"],
          ["YEG", "IQA"],
        ]),
        booking("b", [
          ["YOW", "YEG"],
          ["YEG", "IQA"],
        ]),
        booking("c", [["YOW", "IQA"]]),
      ],
    };
    const suggestions = suggestRoutesFor(book, "YOW", "IQA");
    expect(suggestions[0]?.pathLabel).toBe("YOW → YEG → IQA");
    expect(suggestions[0]?.uses).toBe(2);
    expect(suggestions.some((row) => row.pathLabel === "YOW → IQA")).toBe(true);
  });

  it("returns nothing when origin/destination missing", () => {
    expect(suggestRoutesFor({ bookings: [] }, "", "IQA")).toEqual([]);
  });
});
