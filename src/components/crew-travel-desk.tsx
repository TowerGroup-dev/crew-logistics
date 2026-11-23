"use client";

import { useMemo, useState } from "react";
import { BedDouble, Car, Plane, PlaneLanding, PlaneTakeoff, Repeat } from "lucide-react";
import type { CrewOpsBook } from "@/lib/crew-ops";
import { flightStatusLabel, type FlightBook, type FlightBooking, type FlightDirection } from "@/lib/crew-flights";
import { lastStartAirport, loadRoutes, routeAirports, routeBetweenSites } from "@/lib/crew-routes";
import { ASSUMED_PNR, travelIsBooked, type RotationBook, type RotationTravel } from "@/lib/crew-rotations";
import { movesOnCalendar } from "@/lib/crew-site-days";
import { siteLabel, type CrewPerson, type CrewSnapshot } from "@/lib/crew-schedule";
import { formatJourneyPath } from "@/lib/crew-travel-hubs";
import { addDays, daysBetween, formatMedium } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { CrewTripPlan } from "@/components/crew-trip-plan";

type TripKind = "to_site" | "home" | "transfer";

type Trip = {
  key: string;
  person: CrewPerson;
  kind: TripKind;
  date: string;
  site: string;
  /** Transfers only: the camp they leave. */
  fromSite?: string;
  /** Transfers only: first day of the stay, to open it. */
  stayFrom?: string;
  booking: FlightBooking | null;
};

const WINDOWS = [
  { days: 14, label: "2 weeks" },
  { days: 28, label: "4 weeks" },
  { days: 56, label: "8 weeks" },
] as const;

function tripDates(booking: FlightBooking) {
  const legs = booking.segments.filter((row) => row.departDate);
  if (!legs.length) return { first: booking.rotationDate, last: booking.rotationDate };
  return {
    first: legs[0]!.departDate,
    last: legs[legs.length - 1]!.arriveDate || legs[legs.length - 1]!.departDate,
  };
}

/** A trip typed on the stay drawer, as a booking row (assumed placeholders count as not booked). */
function bookingFromTravel(travel: RotationTravel, personId: string, date: string): FlightBooking | null {
  const real = travelIsBooked(travel);
  if (!real && !travel.segments.length && !travel.hotels.length && !travel.carService) return null;
  return {
    id: `trip:${personId}:${travel.direction}:${date}`,
    personId,
    direction: travel.direction,
    rotationDate: date,
    airline: travel.airline,
    pnr: travel.pnr === ASSUMED_PNR ? "" : travel.pnr,
    ticketNumber: "",
    segments: travel.segments,
    status: real ? (travel.confirmed ? "confirmed" : "booked") : "pending_booking",
    bookedOn: travel.bookedOn,
    enteredBy: "",
    enteredAt: "",
    confirmationName: "",
    confirmationDataUrl: "",
    notes: travel.notes,
    hotels: travel.hotels,
    carService: travel.carService,
    history: [],
  };
}

/** The trip on the stay itself (drawer → Travel), for the stay that starts or ends on this day. */
function matchRotation(rotationBook: RotationBook | undefined, personId: string, direction: FlightDirection, date: string) {
  if (!rotationBook) return null;
  const rotation = rotationBook.rotations.find(
    (row) =>
      row.personId === personId &&
      (direction === "outbound" ? row.plannedIn === date : addDays(row.plannedOut, -1) === date),
  );
  if (!rotation) return null;
  return bookingFromTravel(direction === "outbound" ? rotation.outbound : rotation.returnTravel, personId, date);
}

/** The booking for this trip: same direction, within 3 days of the travel day. */
function matchBooking(flightBook: FlightBook, personId: string, direction: FlightDirection, date: string) {
  const near = (iso: string | null | undefined) => Boolean(iso) && Math.abs(daysBetween(date, iso!)) <= 3;
  return (
    flightBook.bookings.find((row) => {
      if (row.personId !== personId || row.direction !== direction || row.status === "cancelled") return false;
      const { first, last } = tripDates(row);
      return near(row.rotationDate) || near(direction === "outbound" ? last : first);
    }) ?? null
  );
}

/** Every flight someone needs between `from` and `to`: going in, coming home, and camp-to-camp moves. */
function tripsBetween(
  people: CrewPerson[],
  flightBook: FlightBook,
  rotationBook: RotationBook | undefined,
  from: string,
  to: string,
) {
  const find = (personId: string, direction: FlightDirection, date: string) => {
    const onStay = matchRotation(rotationBook, personId, direction, date);
    const record = matchBooking(flightBook, personId, direction, date);
    // A real ticket wins over a half-filled trip.
    if (onStay && onStay.status !== "pending_booking") return onStay;
    return record || onStay;
  };
  const trips: Trip[] = [];
  const inWindow = (iso: string) => iso >= from && iso <= to;
  for (const person of people) {
    for (const stint of person.stints || []) {
      const firstSite =
        stint.segments?.find((row) => row.kind === "site")?.site || stint.site || person.homeSites?.[0] || "";
      if (inWindow(stint.from)) {
        trips.push({
          key: `${person.id}|in|${stint.from}`,
          person,
          kind: "to_site",
          date: stint.from,
          site: firstSite,
          booking: find(person.id, "outbound", stint.from),
        });
      }
      // OUT is the last coloured day, the day they fly home.
      const outDay = stint.out ? addDays(stint.out, -1) : null;
      if (outDay && inWindow(outDay)) {
        const sites = (stint.segments || []).filter((row) => row.kind === "site");
        const lastSite = sites[sites.length - 1]?.site || firstSite;
        trips.push({
          key: `${person.id}|out|${outDay}`,
          person,
          kind: "home",
          date: outDay,
          site: lastSite,
          booking: find(person.id, "return", outDay),
        });
      }
      // Moves between sites inside one stay (e.g. IQA → POND): saved on the stay, plus any the calendar shows.
      const rotation = rotationBook?.rotations.find((row) => row.personId === person.id && row.plannedIn === stint.from);
      const saved = rotation?.moves ?? [];
      const stayEnd = stint.out || `${Number(stint.from.slice(0, 4)) + 1}-01-01`;
      const fromExcel = movesOnCalendar(person, stint.from, stayEnd).filter(
        (row) =>
          !saved.some(
            (move) =>
              move.fromSite === row.fromSite && move.toSite === row.toSite && Math.abs(daysBetween(move.date, row.date)) <= 3,
          ),
      );
      const allMoves: { fromSite: string; toSite: string; date: string; travel?: RotationTravel }[] = [...saved, ...fromExcel];
      for (const move of allMoves) {
        if (!inWindow(move.date)) continue;
        trips.push({
          key: `${person.id}|move|${move.fromSite}|${move.toSite}|${move.date}`,
          person,
          kind: "transfer",
          date: move.date,
          stayFrom: stint.from,
          site: move.toSite,
          fromSite: move.fromSite,
          booking: move.travel ? bookingFromTravel(move.travel, person.id, move.date) : null,
        });
      }
    }
  }
  return trips.sort((a, b) => a.date.localeCompare(b.date) || a.person.name.localeCompare(b.person.name));
}

function statusTone(trip: Trip, today: string) {
  const status = trip.booking?.status;
  if (status === "confirmed" || status === "completed") return "bg-emerald-100 text-emerald-900";
  if (status === "booked" || status === "changed") return "bg-sky-100 text-sky-900";
  if (status === "pending_booking") return "bg-amber-100 text-amber-950";
  return daysBetween(today, trip.date) <= 14 ? "bg-rose-100 text-rose-900" : "bg-amber-100 text-amber-950";
}

export function CrewTravelDesk({
  rows,
  flightBook,
  rotationBook,
  today,
  onOpen,
}: {
  rows: CrewSnapshot[];
  opsBook?: CrewOpsBook;
  flightBook: FlightBook;
  rotationBook?: RotationBook;
  today: string;
  /** Opens the stay on the trip's day, on the Travel tab for that direction. */
  onOpen: (personId: string, iso?: string, travel?: "outbound" | "return" | "moves" | null) => void;
}) {
  const [windowDays, setWindowDays] = useState<number>(28);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const routes = useMemo(() => loadRoutes(), []);
  const people = useMemo(() => rows.map((row) => row.person), [rows]);

  const trips = useMemo(
    () => tripsBetween(people, flightBook, rotationBook, addDays(today, -2), addDays(today, windowDays)),
    [people, flightBook, rotationBook, today, windowDays],
  );
  const notBooked = trips.filter((trip) => !trip.booking || trip.booking.status === "pending_booking");
  const shown = onlyOpen ? notBooked : trips;
  const openTrip = (trip: Trip) =>
    onOpen(
      trip.person.id,
      trip.kind === "transfer" ? trip.stayFrom || trip.date : trip.date,
      trip.kind === "to_site" ? "outbound" : trip.kind === "home" ? "return" : "moves",
    );
  const urgent = notBooked.filter((trip) => daysBetween(today, trip.date) <= 14).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Plane className="size-5 text-primary" /> Travel to book
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone travelling in, home or between sites (by air or road), in date order. Open a name to plan the itinerary,
            stopovers, hotel and car service.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5" role="group" aria-label="How far ahead">
            {WINDOWS.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => setWindowDays(option.days)}
                aria-pressed={windowDays === option.days}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition",
                  windowDays === option.days ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
            <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} />
            Not booked yet only
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Trips" value={trips.length} />
        <Stat label="Not booked yet" value={notBooked.length} />
        <Stat label="Within 2 weeks, not booked" value={urgent} />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {onlyOpen ? "Everything in this window is booked." : "No one travels in this window."}
        </p>
      ) : (
        <>
        {/* Phone: one card per trip, big Book / Open button. */}
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card sm:hidden">
          {shown.map((trip) => {
            const home = lastStartAirport(flightBook, trip.person.id);
            const usual =
              trip.kind === "transfer"
                ? routeBetweenSites(routes, trip.fromSite || "", trip.site).join(" → ")
                : routeAirports(routes, trip.site, home || "HOME", trip.kind === "to_site" ? "outbound" : "return")
                    .filter((code) => code !== "HOME")
                    .join(" → ");
            const away = daysBetween(today, trip.date);
            const hotels = trip.booking?.hotels ?? [];
            return (
              <li key={trip.key} className="px-3 py-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2 text-[13px] tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{formatMedium(trip.date)}</span>
                      {away === 0 ? "Today" : away === 1 ? "Tomorrow" : away < 0 ? `${-away} days ago` : `in ${away} days`}
                    </p>
                    <button type="button" onClick={() => openTrip(trip)} className="mt-0.5 block max-w-full truncate text-left text-[15px] font-semibold">
                      {trip.person.name}
                    </button>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-medium">
                      {trip.kind === "to_site" ? (
                        <PlaneLanding className="size-4 shrink-0 text-emerald-700" />
                      ) : trip.kind === "home" ? (
                        <PlaneTakeoff className="size-4 shrink-0 text-sky-700" />
                      ) : (
                        <Repeat className="size-4 shrink-0 text-violet-700" />
                      )}
                      <span className="truncate">
                        {trip.kind === "to_site"
                          ? `IN to ${trip.site}`
                          : trip.kind === "home"
                            ? `OUT from ${trip.site}`
                            : `Transfer ${trip.fromSite} → ${trip.site}`}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusTone(trip, today))}>
                      {trip.booking ? flightStatusLabel(trip.booking.status) : "Not booked"}
                    </span>
                    <button
                      type="button"
                      onClick={() => openTrip(trip)}
                      className={cn(
                        "h-9 rounded-lg px-4 text-sm font-semibold",
                        trip.booking ? "border border-input" : "bg-primary text-primary-foreground",
                      )}
                    >
                      {trip.booking ? "Open" : "Book"}
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-[13px] text-muted-foreground">
                  {trip.booking?.segments.length ? (
                    <CrewTripPlan compact legs={trip.booking.segments} hotels={hotels} />
                  ) : (
                    <p>{usual}</p>
                  )}
                  {trip.booking?.pnr ? <p className="mt-1 tabular-nums">PNR {trip.booking.pnr}</p> : null}
                  {hotels.length || trip.booking?.carService ? (
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {hotels.map((hotel, index) => (
                        <span key={index} className="inline-flex items-center gap-1">
                          <BedDouble className="size-3.5 shrink-0" />
                          {hotel.name || "Hotel"}
                          {hotel.place ? ` · ${hotel.place}` : ""}
                        </span>
                      ))}
                      {trip.booking?.carService ? (
                        <span className="inline-flex items-center gap-1">
                          <Car className="size-3.5 shrink-0" />
                          {trip.booking.carService}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card sm:block">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">
                <th className="px-4 py-2.5">Date</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Trip</th>
                <th className="px-3 py-2.5">Route</th>
                <th className="px-3 py-2.5">Flight</th>
                <th className="px-3 py-2.5">Hotel · car</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((trip) => {
                const home = lastStartAirport(flightBook, trip.person.id);
                const booked = trip.booking?.segments.length
                  ? formatJourneyPath(trip.booking.segments.flatMap((row) => [row.fromAirport, row.toAirport]).filter(Boolean))
                  : "";
                const usual =
                  trip.kind === "transfer"
                    ? routeBetweenSites(routes, trip.fromSite || "", trip.site).join(" → ")
                    : routeAirports(routes, trip.site, home || "HOME", trip.kind === "to_site" ? "outbound" : "return")
                        .filter((code) => code !== "HOME")
                        .join(" → ");
                const away = daysBetween(today, trip.date);
                return (
                  <tr key={trip.key} className="align-top hover:bg-muted/30">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-semibold tabular-nums">{formatMedium(trip.date)}</p>
                      <p className="text-xs text-muted-foreground">
                        {away === 0 ? "Today" : away === 1 ? "Tomorrow" : away < 0 ? `${-away} days ago` : `in ${away} days`}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => openTrip(trip)} className="text-left font-semibold hover:text-primary">
                        {trip.person.name}
                      </button>
                      <p className="text-xs text-muted-foreground">{trip.person.role}</p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        {trip.kind === "to_site" ? (
                          <PlaneLanding className="size-4 text-emerald-700" />
                        ) : trip.kind === "home" ? (
                          <PlaneTakeoff className="size-4 text-sky-700" />
                        ) : (
                          <Repeat className="size-4 text-violet-700" />
                        )}
                        {trip.kind === "to_site"
                          ? `IN to ${trip.site}`
                          : trip.kind === "home"
                            ? `OUT from ${trip.site}`
                            : `Transfer ${trip.fromSite} → ${trip.site}`}
                      </span>
                      <p className="text-xs text-muted-foreground">{trip.site ? siteLabel(trip.site) : ""}</p>
                    </td>
                    <td className="px-3 py-3">
                      {booked && trip.booking ? (
                        <CrewTripPlan compact legs={trip.booking.segments} hotels={trip.booking.hotels ?? []} />
                      ) : (
                        <p className="text-muted-foreground">{usual}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusTone(trip, today))}>
                        {trip.booking ? flightStatusLabel(trip.booking.status) : "Not booked"}
                      </span>
                      {trip.booking?.pnr ? <p className="mt-1 px-2 text-xs tabular-nums text-muted-foreground">{trip.booking.pnr}</p> : null}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {trip.booking?.hotels?.length ? (
                        trip.booking.hotels.map((hotel, index) => (
                          <p key={index} className="flex items-center gap-1">
                            <BedDouble className="size-3.5 shrink-0 text-muted-foreground" />
                            {hotel.name || "Hotel"}
                            {hotel.place ? ` · ${hotel.place}` : ""}
                          </p>
                        ))
                      ) : null}
                      {trip.booking?.carService ? (
                        <p className="flex items-center gap-1">
                          <Car className="size-3.5 shrink-0 text-muted-foreground" />
                          {trip.booking.carService}
                        </p>
                      ) : null}
                      {!trip.booking?.hotels?.length && !trip.booking?.carService ? (
                        <span className="text-muted-foreground">-</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openTrip(trip)}
                        className={cn(
                          "h-8 rounded-lg px-3 text-xs font-semibold",
                          trip.booking
                            ? "border border-input hover:bg-muted"
                            : "bg-primary text-primary-foreground hover:opacity-90",
                        )}
                      >
                        {trip.booking ? "Open" : "Book"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-2.5 py-2 sm:px-4 sm:py-3",
        // Plain tiles: the numbers speak for themselves (no yellow / red backgrounds).
        "border-border bg-card",
      )}
    >
      <p className="text-[10px] leading-tight font-medium tracking-wide text-muted-foreground uppercase sm:text-xs">{label}</p>
      <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
