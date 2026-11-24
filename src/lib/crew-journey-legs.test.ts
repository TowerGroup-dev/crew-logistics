import { describe, expect, it } from "vitest";
import type { FlightSegment } from "@/lib/crew-flights";
import {
  captionFromSheetRoute,
  formatLegCaption,
  journeyDayCaption,
  journeyDayDestination,
  journeyDayLeaveCaption,
  normalizeAirportCode,
  segmentsForPersonDay,
} from "@/lib/crew-journey-legs";

const leg = (
  fromAirport: string,
  toAirport: string,
  departDate: string,
  arriveDate = departDate,
): FlightSegment => ({
  fromAirport,
  toAirport,
  departDate,
  departTime: "",
  arriveDate,
  arriveTime: "",
  flightNumber: "5T100",
});

describe("normalizeAirportCode", () => {
  it("normalises short sheet codes", () => {
    expect(normalizeAirportCode("iq")).toBe("IQA");
    expect(normalizeAirportCode("PND")).toBe("POND");
    expect(normalizeAirportCode("via YK")).toBe("YK");
  });

  it("rejects sheet prose and TRV placeholders", () => {
    expect(
      normalizeAirportCode("Leaving Iqaluit, 18 to 20 Dec, route not booked yet (confirmed by Yimika, 20 Nov 2026)"),
    ).toBe("");
    expect(normalizeAirportCode("TRV")).toBe("");
  });
});

describe("captionFromSheetRoute prose", () => {
  it("does not paint Leaving / confirmed-by notes into the day box", () => {
    expect(
      captionFromSheetRoute(
        "Leaving Iqaluit, 18 to 20 Dec, route not booked yet (confirmed by Yimika, 20 Nov 2026)",
        "2026-12-18",
      ),
    ).toBe("");
  });
});

describe("same-day journey into camp", () => {
  it("shows YUL → YK inside the IQA-coloured arrival day", () => {
    const segments = [leg("YUL", "YK", "2026-12-01"), leg("YK", "IQA", "2026-12-01")];
    expect(journeyDayCaption(segments, "2026-12-01", { siteOnIso: "IQA" })).toBe("YUL → YK");
  });

  it("handles a direct hop as from-code inside the camp box", () => {
    const segments = [leg("YOW", "IQA", "2026-12-01")];
    expect(journeyDayCaption(segments, "2026-12-01", { siteOnIso: "IQA" })).toBe("→ YOW");
  });
});

describe("overnight journey into camp", () => {
  it("greys the travel day as YUL → YK and arrival as → YK", () => {
    const segments = [leg("YUL", "YK", "2026-12-01"), leg("YK", "IQA", "2026-12-02")];
    expect(journeyDayCaption(segments, "2026-12-01", { siteOnIso: null })).toBe("YUL → YK");
    expect(journeyDayCaption(segments, "2026-12-02", { siteOnIso: "IQA" })).toBe("→ YK");
  });

  it("shows overnight hub while sitting between legs", () => {
    const segments = [leg("YUL", "YK", "2026-12-01"), leg("YK", "IQA", "2026-12-03")];
    expect(journeyDayCaption(segments, "2026-12-02", { siteOnIso: null })).toBe("→ YK");
  });

  it("colours by that day's destination (hub grey, camp purple)", () => {
    const segments = [leg("YUL", "YK", "2026-12-01"), leg("YK", "KUG", "2026-12-02")];
    expect(journeyDayDestination(segments, "2026-12-01")).toBe(null);
    expect(journeyDayDestination(segments, "2026-12-02")).toBe("KUG");
  });
});

describe("journeyDayDestination same-day into camp", () => {
  it("uses the camp for a same-day YUL → YK → KUG hop", () => {
    const segments = [leg("YUL", "YK", "2026-12-01"), leg("YK", "KUG", "2026-12-01")];
    expect(journeyDayDestination(segments, "2026-12-01")).toBe("KUG");
  });

  it("stays grey when flying home", () => {
    const segments = [leg("KUG", "YK", "2026-12-20"), leg("YK", "YUL", "2026-12-20")];
    expect(journeyDayDestination(segments, "2026-12-20")).toBe(null);
  });
});

describe("journeyDayLeaveCaption", () => {
  it("shows → YUL on the OUT day when leaving camp", () => {
    const segments = [leg("KUG", "YUL", "2026-12-20")];
    expect(journeyDayLeaveCaption(segments, "2026-12-20", { siteOnIso: "KUG" })).toBe("→ YUL");
  });

  it("shows YK → YUL when leaving via a hub", () => {
    const segments = [leg("KUG", "YK", "2026-12-20"), leg("YK", "YUL", "2026-12-20")];
    expect(journeyDayLeaveCaption(segments, "2026-12-20", { siteOnIso: "KUG" })).toBe("YK → YUL");
  });

  it("does not treat inbound as leave", () => {
    const segments = [leg("YUL", "YK", "2026-12-01"), leg("YK", "KUG", "2026-12-01")];
    expect(journeyDayLeaveCaption(segments, "2026-12-01", { siteOnIso: "KUG" })).toBe("");
  });
});

describe("formatLegCaption", () => {
  it("joins codes and collapses duplicates", () => {
    expect(formatLegCaption(["YUL", "YK", "YK", "IQA"])).toBe("YUL → YK → IQA");
    expect(formatLegCaption(["YK"])).toBe("→ YK");
  });
});

describe("captionFromSheetRoute", () => {
  it("mirrors same-day and overnight sheet routes", () => {
    expect(captionFromSheetRoute("YUL → YK → IQA", "2026-12-01", { siteOnIso: "IQA" })).toBe("YUL → YK");
    expect(
      captionFromSheetRoute("YUL → YK → IQA", "2026-12-01", {
        siteOnIso: null,
        departDate: "2026-12-01",
        arriveDate: "2026-12-02",
      }),
    ).toBe("YUL → YK");
    expect(
      captionFromSheetRoute("YUL → YK → IQA", "2026-12-02", {
        siteOnIso: "IQA",
        departDate: "2026-12-01",
        arriveDate: "2026-12-02",
      }),
    ).toBe("→ YK");
  });
});

describe("segmentsForPersonDay", () => {
  it("picks the booking that covers the day", () => {
    const bookings = [
      {
        personId: "p1",
        direction: "outbound",
        status: "booked",
        rotationDate: "2026-12-01",
        segments: [leg("YUL", "IQA", "2026-12-01")],
      },
      {
        personId: "p1",
        direction: "return",
        status: "booked",
        rotationDate: "2026-12-20",
        segments: [leg("IQA", "YUL", "2026-12-20")],
      },
    ];
    expect(segmentsForPersonDay(bookings, "p1", "2026-12-01", "2026-12-01", "2026-12-21")).toEqual(
      bookings[0]!.segments,
    );
    expect(segmentsForPersonDay(bookings, "p1", "2026-12-20", "2026-12-01", "2026-12-21")).toEqual(
      bookings[1]!.segments,
    );
  });
});
