"use client";

import { useMemo, useState } from "react";
import { BedDouble, Car, Plane, Plus, Route, Trash2 } from "lucide-react";
import { CrewTripPlan } from "@/components/crew-trip-plan";
import { AirportSelect, CAMP_AIRPORTS, useTravelHubs } from "@/components/crew-airport-select";
import { emptyHotel, emptySegment, type FlightHotel, type FlightSegment } from "@/lib/crew-flights";
import {
  legsForRoute,
  loadRoutes,
  routeAirports,
  routeBetweenSites,
  suggestRoutes,
  type RouteSuggestion,
} from "@/lib/crew-routes";
import { CREW_SCHEDULE } from "@/lib/crew-schedule";
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

/** Journeys the Excel recorded on travel days (e.g. "KUG → YK → IQA"), for route suggestions. */
const EXCEL_ROUTES: string[] = CREW_SCHEDULE.people.flatMap((person) =>
  (person.stints || []).flatMap((stint) =>
    (stint.excelSegments || stint.segments || []).map((piece) => piece.route || "").filter(Boolean),
  ),
);

/** Every trip already on file (to site, home, and moves), as legs. */
function pastTrips(book: RotationBook): FlightSegment[][] {
  return book.rotations.flatMap((rotation) => [
    rotation.outbound.segments,
    rotation.returnTravel.segments,
    ...(rotation.moves ?? []).map((move) => move.travel.segments),
  ]);
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

  // Ways to do this trip, best first: usual route, routes people took before, then direct.
  const tripEnds = move
    ? { from: move.fromSite, to: move.toSite }
    : direction === "outbound"
      ? { from: home, to: camp }
      : { from: camp, to: home };
  const suggestions = useMemo(
    () =>
      // Both ends needed (no guessing where someone flies from).
      !tripEnds.from || !tripEnds.to
        ? []
        : suggestRoutes({
        from: tripEnds.from,
        to: tripEnds.to,
        usual: chain.length > 1 ? chain : null,
        trips: pastTrips(book),
        routeTexts: EXCEL_ROUTES,
      }),
    // chain is derived from the same inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book, tripEnds.from, tripEnds.to, chain.join(">")],
  );

  function applySuggestion(suggestion: RouteSuggestion) {
    const next = legsForRoute(suggestion.airports, travelDate).map((leg, index) => ({
      ...leg,
      mode: suggestion.modes[index] ?? "flight",
    }));
    setLegs(next);
  }

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
        {suggestions.length ? (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Suggested routes {legs.length ? "(click to replace the legs)" : "(click to fill the legs)"}
            </p>
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.airports.join(">")}|${suggestion.modes.join(",")}`}
                type="button"
                onClick={() => applySuggestion(suggestion)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-sky-200 bg-card px-3 py-2 text-left hover:border-sky-400 hover:bg-sky-50"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1 font-semibold">
                    {suggestion.airports.map((code, index) => (
                      <span key={`${code}-${index}`} className="inline-flex items-center gap-1">
                        {index > 0 ? (
                          suggestion.modes[index - 1] === "road" ? (
                            <Car className="size-3.5 text-amber-700" aria-label="by road" />
                          ) : (
                            <Plane className="size-3.5 text-sky-700" aria-label="by air" />
                          )
                        ) : null}
                        {code}
                      </span>
                    ))}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {suggestion.airports.map((code) => placeName(code, hubs)).join(" → ")}
                    {suggestion.airports.length > 2
                      ? ` · ${suggestion.airports.length - 2} stop${suggestion.airports.length > 3 ? "s" : ""}`
                      : " · direct"}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
                  {suggestion.usual ? "Usual" : suggestion.uses ? `Used ${suggestion.uses}×` : "Direct"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Pick both ends to see suggested routes (the usual one, ones used before, and direct).
          </p>
        )}
      </section>

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Legs</p>
          <div className="flex gap-1.5">
            {(["flight", "road"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  const last = legs[legs.length - 1];
                  setLegs([
                    ...legs,
                    {
                      ...emptySegment(),
                      mode,
                      fromAirport: last?.toAirport || "",
                      departDate: last?.arriveDate || last?.departDate || travelDate,
                      arriveDate: last?.arriveDate || last?.departDate || travelDate,
                    },
                  ]);
                }}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2 text-xs font-medium hover:bg-muted"
              >
                <Plus className="size-3.5" /> {mode === "flight" ? "Flight" : "Drive"}
              </button>
            ))}
          </div>
        </div>
        {legs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No legs yet. Pick the route above, or add a flight or a drive.
          </p>
        ) : (
          legs.map((leg, index) => (
            <div
              key={index}
              className={cn(
                "grid grid-cols-2 gap-2 rounded-xl border p-3",
                leg.mode === "road" ? "border-amber-200 bg-amber-50/40" : "border-border",
              )}
            >
              <div className="col-span-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Leg {index + 1}</span>
                <div className="inline-flex rounded-lg border border-input bg-card p-0.5" role="group" aria-label={`Leg ${index + 1} by`}>
                  {(["flight", "road"] as const).map((mode) => {
                    const active = (leg.mode ?? "flight") === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={active}
                        onClick={() => patchLeg(index, { mode })}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold",
                          active ? (mode === "road" ? "bg-amber-600 text-white" : "bg-sky-700 text-white") : "text-muted-foreground",
                        )}
                      >
                        {mode === "road" ? <Car className="size-3.5" /> : <Plane className="size-3.5" />}
                        {mode === "road" ? "Road" : "Flight"}
                      </button>
                    );
                  })}
                </div>
              </div>
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
                <span className="text-xs text-muted-foreground">Leaves on</span>
                <input
                  type="date"
                  value={leg.departDate}
                  onChange={(event) =>
                    patchLeg(index, {
                      departDate: event.target.value,
                      arriveDate: !leg.arriveDate || leg.arriveDate <= leg.departDate ? event.target.value : leg.arriveDate,
                    })
                  }
                  className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                <span className="text-xs text-muted-foreground">Arrives on</span>
                <input
                  type="date"
                  value={leg.arriveDate || leg.departDate}
                  min={leg.departDate || undefined}
                  onChange={(event) => patchLeg(index, { arriveDate: event.target.value })}
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
                <span className="text-xs text-muted-foreground">Arrives</span>
                <input
                  type="time"
                  value={leg.arriveTime}
                  onChange={(event) => patchLeg(index, { arriveTime: event.target.value })}
                  className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
                />
              </label>
              <label className="col-span-2 grid min-w-0 gap-1">
                <span className="text-xs text-muted-foreground">{leg.mode === "road" ? "Vehicle / driver" : "Flight #"}</span>
                <input
                  value={leg.flightNumber}
                  onChange={(event) =>
                    patchLeg(index, {
                      flightNumber: leg.mode === "road" ? event.target.value : event.target.value.toUpperCase(),
                    })
                  }
                  placeholder={leg.mode === "road" ? "e.g. Company truck, driver John" : "5T 401"}
                  className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
                />
              </label>
              <button
                type="button"
                onClick={() => setLegs(legs.filter((_, i) => i !== index))}
                className="col-span-2 inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-input text-xs text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="size-3.5" /> Remove leg
              </button>
            </div>
          ))
        )}
      </section>

      <CrewTripPlan
        legs={legs}
        hotels={value.hotels}
        onAddHotel={(place, checkIn, checkOut) =>
          onChange({ hotels: [...value.hotels, { ...emptyHotel(place, checkIn), checkOut }] })
        }
      />

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
