"use client";

import { useMemo, useState } from "react";
import { BedDouble, Car, Plus, Route, Trash2 } from "lucide-react";
import { AirportSelect, CAMP_AIRPORTS, useTravelHubs } from "@/components/crew-airport-select";
import { emptyHotel, emptySegment, type FlightHotel, type FlightSegment } from "@/lib/crew-flights";
import { legsForRoute, loadRoutes, routeAirports, routeBetweenSites } from "@/lib/crew-routes";
import { ASSUMED_PNR, type RotationBook, type RotationTravel } from "@/lib/crew-rotations";
import { travelHubName } from "@/lib/crew-travel-hubs";
import { cn } from "@/lib/cn";
import { todayInZone } from "@/lib/dates";

/** The south end of this person's last trip on file (where they usually fly from). */
function usualHomeAirport(book: RotationBook, personId: string) {
  const trips = book.rotations
    .filter((row) => row.personId === personId)
    .sort((a, b) => b.plannedIn.localeCompare(a.plannedIn));
  for (const rotation of trips) {
    const out = rotation.outbound.segments[0]?.fromAirport;
    if (out) return out;
    const back = rotation.returnTravel.segments[rotation.returnTravel.segments.length - 1]?.toAirport;
    if (back) return back;
  }
  return "";
}

/** Full place name: sites (Iqaluit, Pond Inlet...) and airports from Settings. */
function placeName(code: string, hubs: Parameters<typeof travelHubName>[1]) {
  return CAMP_AIRPORTS.find((row) => row.code === code)?.name || travelHubName(code, hubs);
}

/** Fields that mirror the legs, so older screens and reports keep working. */
function summaryFromLegs(legs: FlightSegment[]): Partial<RotationTravel> {
  const first = legs[0];
  const last = legs[legs.length - 1] || first;
  return {
    segments: legs,
    fromAirport: first?.fromAirport || "",
    toAirport: last?.toAirport || "",
    departDate: first?.departDate || null,
    departTime: first?.departTime || "",
    arriveDate: last?.arriveDate || last?.departDate || null,
    arriveTime: last?.arriveTime || "",
  };
}

/** One trip (to site, home, or between sites): route, legs, booking, hotels and car service. */
export function CrewTripForm({
  value,
  direction,
  site,
  travelDate,
  personId,
  book,
  move,
  onChange,
}: {
  value: RotationTravel;
  direction: "outbound" | "return";
  site: string;
  /** IN day (outbound), OUT day (return) or the move day. */
  travelDate: string;
  personId: string;
  book: RotationBook;
  /** Set for a flight between two sites up north; the route is site to site. */
  move?: { fromSite: string; toSite: string };
  onChange: (patch: Partial<RotationTravel>) => void;
}) {
  const hubs = useTravelHubs();
  const routes = useMemo(() => loadRoutes(), []);
  const legs = value.segments;
  const assumed = value.pnr === ASSUMED_PNR;
  const siteCode = CAMP_AIRPORTS.some((row) => row.code === site.toUpperCase()) ? site.toUpperCase() : "";
  const [camp, setCamp] = useState(() => {
    const end = direction === "outbound" ? legs[legs.length - 1]?.toAirport : legs[0]?.fromAirport;
    return (end && CAMP_AIRPORTS.some((row) => row.code === end) ? end : siteCode) || "";
  });
  const [home, setHome] = useState(() => {
    const end = direction === "outbound" ? legs[0]?.fromAirport : legs[legs.length - 1]?.toAirport;
    return end || usualHomeAirport(book, personId);
  });
  const chain = move
    ? routeBetweenSites(routes, move.fromSite, move.toSite)
    : home && camp
      ? routeAirports(routes, camp, home, direction)
      : [];

  function setLegs(next: FlightSegment[]) {
    onChange(summaryFromLegs(next));
  }

  function fillRoute(nextHome = home, nextCamp = camp) {
    if (move) {
      setLegs(legsForRoute(chain, travelDate));
      return;
    }
    if (!nextHome || !nextCamp) return;
    setLegs(legsForRoute(routeAirports(routes, nextCamp, nextHome, direction), travelDate));
  }

  function patchLeg(index: number, patch: Partial<FlightSegment>) {
    setLegs(legs.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function patchHotel(index: number, patch: Partial<FlightHotel>) {
    onChange({ hotels: value.hotels.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  }

  return (
    <div className="grid gap-4 text-sm">
      {assumed ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
          Shown as booked so the schedule works, but no ticket is on file. Add the real booking below.
        </p>
      ) : null}

      <section className="rounded-xl border border-sky-200 bg-sky-50/50 p-3">
        <p className="flex items-center gap-2 font-semibold">
          <Route className="size-4 text-sky-700" /> Route
        </p>
        {move ? (
          <p className="mt-2 text-base font-semibold">
            {move.fromSite} → {move.toSite}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {placeName(move.fromSite, hubs)} to {placeName(move.toSite, hubs)}
            </span>
          </p>
        ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">{direction === "outbound" ? "Flying from" : "Going home to"}</span>
            <AirportSelect
              value={home}
              hubs={hubs}
              placeholder="Pick the airport"
              onChange={(code) => {
                setHome(code);
                if (!legs.length) fillRoute(code, camp);
              }}
            />
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">{direction === "outbound" ? "To site" : "From site"}</span>
            <select
              value={camp}
              onChange={(event) => {
                setCamp(event.target.value);
                if (!legs.length) fillRoute(home, event.target.value);
              }}
              className={cn("h-9 w-full min-w-0 rounded-lg border border-input bg-card px-2", !camp && "text-muted-foreground")}
            >
              <option value="">Pick the site</option>
              {CAMP_AIRPORTS.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.code} · {row.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        )}
        {chain.length > 1 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p>
              <span className="text-muted-foreground">Usual route </span>
              <span className="font-semibold">{chain.join(" → ")}</span>
              <span className="block text-xs text-muted-foreground">
                {chain.map((code) => placeName(code, hubs)).join(" → ")}
              </span>
            </p>
            <button
              type="button"
              onClick={() => fillRoute()}
              className="h-8 rounded-lg bg-sky-700 px-3 text-xs font-semibold text-white hover:opacity-90"
            >
              {legs.length ? "Use usual route" : "Fill legs"}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Pick both ends to fill the legs from Settings → Usual routes.</p>
        )}
      </section>

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Flights</p>
          <button
            type="button"
            onClick={() => {
              const last = legs[legs.length - 1];
              setLegs([
                ...legs,
                { ...emptySegment(), fromAirport: last?.toAirport || "", departDate: last?.arriveDate || travelDate },
              ]);
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2 text-xs font-medium hover:bg-muted"
          >
            <Plus className="size-3.5" /> Flight
          </button>
        </div>
        {legs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No flights yet. Pick the route above or add a flight.
          </p>
        ) : (
          legs.map((leg, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3">
              <AirportSelect
                value={leg.fromAirport}
                hubs={hubs}
                placeholder="From"
                ariaLabel={`Flight ${index + 1} from`}
                onChange={(code) => patchLeg(index, { fromAirport: code })}
              />
              <AirportSelect
                value={leg.toAirport}
                hubs={hubs}
                placeholder="To"
                ariaLabel={`Flight ${index + 1} to`}
                onChange={(code) => {
                  const next = legs.map((row, i) =>
                    i === index ? { ...row, toAirport: code } : i === index + 1 && !row.fromAirport ? { ...row, fromAirport: code } : row,
                  );
                  setLegs(next);
                }}
              />
              <label className="grid min-w-0 gap-1">
                <span className="text-xs text-muted-foreground">Date</span>
                <input
                  type="date"
                  value={leg.departDate}
                  onChange={(event) =>
                    patchLeg(index, {
                      departDate: event.target.value,
                      arriveDate: !leg.arriveDate || leg.arriveDate === leg.departDate ? event.target.value : leg.arriveDate,
                    })
                  }
                  className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-xs text-muted-foreground">Flight #</span>
                <input
                  value={leg.flightNumber}
                  onChange={(event) => patchLeg(index, { flightNumber: event.target.value.toUpperCase() })}
                  placeholder="5T 401"
                  className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-xs text-muted-foreground">Departs</span>
                <input
                  type="time"
                  value={leg.departTime}
                  onChange={(event) => patchLeg(index, { departTime: event.target.value })}
                  className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-xs text-muted-foreground">Lands</span>
                <input
                  type="time"
                  value={leg.arriveTime}
                  onChange={(event) => patchLeg(index, { arriveTime: event.target.value })}
                  className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
                />
              </label>
              <button
                type="button"
                onClick={() => setLegs(legs.filter((_, i) => i !== index))}
                className="col-span-2 inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-input text-xs text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="size-3.5" /> Remove flight
              </button>
            </div>
          ))
        )}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <label className="grid min-w-0 gap-1">
          <span className="text-muted-foreground">Booking reference (PNR)</span>
          <input
            value={assumed ? "" : value.pnr}
            onChange={(event) =>
              onChange(
                assumed
                  ? { pnr: event.target.value.toUpperCase(), confirmed: false, bookedOn: todayInZone() }
                  : { pnr: event.target.value.toUpperCase() },
              )
            }
            className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
            placeholder="ABC123"
          />
        </label>
        <label className="grid min-w-0 gap-1">
          <span className="text-muted-foreground">Booked on</span>
          <input
            type="date"
            value={assumed ? "" : value.bookedOn || ""}
            onChange={(event) => onChange({ bookedOn: event.target.value || null })}
            className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
          />
        </label>
        <label className="col-span-2 inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.confirmed && !assumed}
            disabled={assumed && !value.pnr}
            onChange={(event) => onChange({ confirmed: event.target.checked })}
          />
          <span>Flight confirmed</span>
        </label>
      </section>

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 font-semibold">
            <BedDouble className="size-4 text-muted-foreground" /> Hotels
          </p>
          <button
            type="button"
            onClick={() => {
              // Suggest the first overnight stop: a flight that lands a day before the next one leaves.
              const stop = legs.find((row, i) => legs[i + 1] && row.arriveDate && legs[i + 1]!.departDate > row.arriveDate);
              onChange({
                hotels: [
                  ...value.hotels,
                  emptyHotel(stop?.toAirport || legs[0]?.toAirport || "", stop?.arriveDate || travelDate),
                ],
              });
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2 text-xs font-medium hover:bg-muted"
          >
            <Plus className="size-3.5" /> Hotel
          </button>
        </div>
        {value.hotels.length === 0 ? (
          <p className="text-xs text-muted-foreground">No overnight stop on this trip.</p>
        ) : (
          value.hotels.map((hotel, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3">
              <AirportSelect value={hotel.place} hubs={hubs} placeholder="Where" onChange={(code) => patchHotel(index, { place: code })} />
              <input
                value={hotel.name}
                onChange={(event) => patchHotel(index, { name: event.target.value })}
                placeholder="Hotel name"
                className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
              />
              <label className="grid min-w-0 gap-1">
                <span className="text-xs text-muted-foreground">Check in</span>
                <input
                  type="date"
                  value={hotel.checkIn}
                  onChange={(event) => patchHotel(index, { checkIn: event.target.value })}
                  className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-xs text-muted-foreground">Check out</span>
                <input
                  type="date"
                  value={hotel.checkOut}
                  min={hotel.checkIn || undefined}
                  onChange={(event) => patchHotel(index, { checkOut: event.target.value })}
                  className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
                />
              </label>
              <input
                value={hotel.confirmation}
                onChange={(event) => patchHotel(index, { confirmation: event.target.value })}
                placeholder="Confirmation #"
                className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
              />
              <button
                type="button"
                onClick={() => onChange({ hotels: value.hotels.filter((_, i) => i !== index) })}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-input text-xs text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="size-3.5" /> Remove
              </button>
            </div>
          ))
        )}
      </section>

      <label className="grid min-w-0 gap-1">
        <span className="flex items-center gap-2 font-semibold">
          <Car className="size-4 text-muted-foreground" /> Car service
        </span>
        <input
          value={value.carService}
          onChange={(event) => onChange({ carService: event.target.value })}
          placeholder="e.g. Pickup at home 5:30 am to YOW (blank if not needed)"
          className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
        />
      </label>

      <label className="grid min-w-0 gap-1">
        <span className="text-muted-foreground">Notes</span>
        <textarea
          value={value.notes.startsWith("Assumed booked") ? "" : value.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          rows={2}
          className="rounded-lg border border-input px-2 py-1.5"
        />
      </label>
    </div>
  );
}
