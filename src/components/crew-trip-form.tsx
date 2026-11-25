"use client";

import { useState } from "react";
import { Plane, Plus, Trash2 } from "lucide-react";
import { AirportSelect, CAMP_AIRPORTS, useTravelHubs } from "@/components/crew-airport-select";
import { emptyHotel, emptySegment, type FlightHotel, type FlightSegment } from "@/lib/crew-flights";
import { legsForRoute } from "@/lib/crew-routes";
import {
  ASSUMED_PNR,
  travelIsBooked,
  type RotationBook,
  type RotationTravel,
} from "@/lib/crew-rotations";
import { travelHubName } from "@/lib/crew-travel-hubs";
import { cn } from "@/lib/cn";
import { addDays, todayInZone } from "@/lib/dates";

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
  const [wantHotel, setWantHotel] = useState(() => value.hotels.length > 0);
  const [wantCar, setWantCar] = useState(() => Boolean(value.carService.trim()));
  const [savedFlash, setSavedFlash] = useState(false);
  const [askStop, setAskStop] = useState(false);

  const tripEnds = move
    ? { from: move.fromSite, to: move.toSite }
    : direction === "outbound"
      ? { from: home, to: camp }
      : { from: camp, to: home };

  function setLegs(next: FlightSegment[]) {
    onChange(summaryFromLegs(next));
  }

  function connectStop(code: string) {
    const start = legs[0]?.fromAirport || tripEnds.from;
    const end = legs[legs.length - 1]?.toAirport || tripEnds.to;
    if (!start || !end || !code || code === start || code === end) return;
    if (legs.length <= 1) {
      setLegs(legsForRoute([start, code, end], travelDate));
    } else {
      const last = legs[legs.length - 1]!;
      const leave = last.departDate || travelDate;
      const land = last.arriveDate || leave;
      setLegs([
        ...legs.slice(0, -1),
        {
          ...emptySegment(),
          mode: "flight",
          fromAirport: last.fromAirport,
          toAirport: code,
          departDate: leave,
          arriveDate: leave,
        },
        {
          ...emptySegment(),
          mode: "flight",
          fromAirport: code,
          toAirport: last.toAirport,
          departDate: land,
          arriveDate: land,
        },
      ]);
    }
    setAskStop(false);
  }

  function patchLeg(index: number, patch: Partial<FlightSegment>) {
    setLegs(legs.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function patchHotel(index: number, patch: Partial<FlightHotel>) {
    onChange({ hotels: value.hotels.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  }

  const fromCode = move?.fromSite || legs[0]?.fromAirport || home;
  const toCode = move?.toSite || legs[legs.length - 1]?.toAirport || camp;
  const departIso = legs[0]?.departDate || value.departDate || travelDate;
  const booked = !assumed && (value.confirmed || travelIsBooked(value));
  const statusLabel = assumed
    ? "Not booked"
    : value.confirmed
      ? "Confirmed"
      : booked
        ? "Booked"
        : "Not booked";

  const places: {
    code: string;
    date: string;
    role: "departure" | "stop" | "arrival";
    overnight: boolean;
    legIndex: number;
  }[] = [];
  if (legs.length) {
    places.push({
      code: legs[0]!.fromAirport || fromCode,
      date: legs[0]!.departDate || departIso || "",
      role: "departure",
      overnight: false,
      legIndex: 0,
    });
    legs.forEach((leg, index) => {
      const next = legs[index + 1];
      const land = leg.arriveDate || leg.departDate || "";
      const leaveNext = next?.departDate || "";
      const isLast = index === legs.length - 1;
      places.push({
        code: leg.toAirport || (isLast ? toCode : ""),
        date: isLast ? land : leaveNext || land,
        role: isLast ? "arrival" : "stop",
        overnight: Boolean(next && land && leaveNext && leaveNext > land),
        legIndex: index,
      });
    });
  }

  function seedOrPatchFrom(code: string) {
    if (direction === "outbound") setHome(code);
    else setCamp(code);
    if (legs.length) {
      patchLeg(0, { fromAirport: code });
      return;
    }
    if (code && toCode) setLegs(legsForRoute([code, toCode], travelDate));
  }

  function seedOrPatchTo(code: string) {
    if (direction === "outbound") setCamp(code);
    else setHome(code);
    if (legs.length) {
      patchLeg(legs.length - 1, { toAirport: code });
      return;
    }
    if (fromCode && code) setLegs(legsForRoute([fromCode, code], travelDate));
  }

  function setStopOvernight(stopLegIndex: number, on: boolean) {
    const leg = legs[stopLegIndex];
    const next = legs[stopLegIndex + 1];
    if (!leg || !next) return;
    const land = leg.arriveDate || leg.departDate || travelDate;
    if (on) {
      const leave = next.departDate && next.departDate > land ? next.departDate : addDays(land, 1);
      patchLeg(stopLegIndex, { arriveDate: land });
      patchLeg(stopLegIndex + 1, { departDate: leave });
    } else {
      patchLeg(stopLegIndex, { arriveDate: land });
      patchLeg(stopLegIndex + 1, { departDate: land, arriveDate: next.arriveDate || land });
    }
  }

  const stopPlaces = places.filter((place) => place.role === "stop");
  const isDirect = Boolean(fromCode && toCode && stopPlaces.length === 0 && !askStop);

  function makeDirect() {
    if (fromCode && toCode) setLegs(legsForRoute([fromCode, toCode], travelDate));
    setAskStop(false);
  }

  function removeStop(legIndex: number) {
    const start = legs[0]?.fromAirport || fromCode;
    const end = legs[legs.length - 1]?.toAirport || toCode;
    const remaining = stopPlaces
      .filter((row) => row.legIndex !== legIndex)
      .map((row) => row.code)
      .filter(Boolean);
    if (start && end) setLegs(legsForRoute([start, ...remaining, end], travelDate));
    setAskStop(false);
  }

  const headingClass =
    "text-[13px] font-medium tracking-[0.14em] text-slate-950 uppercase";
  const fieldClass =
    "text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase";

  return (
    <div className="grid gap-6 text-sm">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className={headingClass}>Journey</p>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold",
              booked && !assumed
                ? "bg-emerald-100 text-emerald-900"
                : "bg-amber-100 text-amber-950",
            )}
          >
            {statusLabel}
          </span>
        </div>

        <section className="mt-2 grid gap-3 border-t border-border pt-3">
        {move ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="min-w-0 text-center">
              <p className={fieldClass}>Leaving from</p>
              <p className="mt-1 text-base font-semibold">{placeName(move.fromSite, hubs)}</p>
              <p className="text-xs text-muted-foreground">{move.fromSite}</p>
            </div>
            <Plane className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 text-center">
              <p className={fieldClass}>Travelling to</p>
              <p className="mt-1 text-base font-semibold">{placeName(move.toSite, hubs)}</p>
              <p className="text-xs text-muted-foreground">{move.toSite}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <label className="grid min-w-0 gap-1 text-center">
              <span className={fieldClass}>Leaving from</span>
              <AirportSelect
                value={fromCode}
                hubs={hubs}
                includeCamps
                placeholder="Any place"
                onChange={seedOrPatchFrom}
              />
            </label>
            <Plane className="mb-2 size-5 shrink-0 text-primary" aria-hidden />
            <label className="grid min-w-0 gap-1 text-center">
              <span className={fieldClass}>Travelling to</span>
              <AirportSelect
                value={toCode}
                hubs={hubs}
                includeCamps
                placeholder="Any place"
                onChange={seedOrPatchTo}
              />
            </label>
          </div>
        )}

        {fromCode && toCode ? (
          <div className="grid gap-2">
            <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isDirect}
                onChange={(event) => {
                  if (event.target.checked) {
                    makeDirect();
                  } else {
                    if (!legs.length) setLegs(legsForRoute([fromCode, toCode], travelDate));
                    setAskStop(true);
                  }
                }}
                className="size-3.5 rounded border-input"
              />
              Direct
            </label>
            {!isDirect ? (
              <div className="grid gap-1.5">
                <span className={fieldClass}>Stop along the way</span>
                {stopPlaces.map((place) => (
                  <div
                    key={`${place.code}-${place.legIndex}`}
                    className="flex h-9 items-center gap-2 rounded-lg border border-input px-2"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {placeName(place.code, hubs) || place.code || "Stop"}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove stop"
                      title="Remove stop"
                      onClick={() => removeStop(place.legIndex)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
                {askStop || stopPlaces.length === 0 ? (
                  <AirportSelect
                    value=""
                    hubs={hubs}
                    includeCamps
                    placeholder="Where do you stop?"
                    onChange={(code) => {
                      if (code) {
                        connectStop(code);
                        setAskStop(false);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    aria-label="Add another stop"
                    onClick={() => setAskStop(true)}
                    className="inline-flex h-8 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="size-3.5" /> Add another stop
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        </section>
      </div>

      {places.length ? (
        <div className="space-y-3">
          <ol className="relative space-y-0">
            {places.map((place, index) => (
              <li key={`${place.code}-${index}`} className="relative flex gap-3 pb-3 last:pb-0">
                {index < places.length - 1 ? (
                  <span
                    className="absolute top-3 left-[7px] h-[calc(100%-6px)] w-px bg-border"
                    aria-hidden
                  />
                ) : null}
                <span className="relative z-[1] mt-1 size-3 shrink-0 rounded-full border border-primary bg-card" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium text-foreground">
                      {placeName(place.code, hubs) || place.code || "Stop"}
                      {place.code ? (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {place.code}
                        </span>
                      ) : null}
                    </p>
                    {place.role === "stop" ? (
                      <label className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium">
                        <input
                          type="checkbox"
                          checked={place.overnight}
                          onChange={(event) =>
                            setStopOvernight(place.legIndex, event.target.checked)
                          }
                          className="size-3.5 rounded border-input"
                        />
                        Overnight
                      </label>
                    ) : null}
                  </div>
                  {/* Multi-leg only: date when leaving this place (stops / departure). */}
                  {legs.length > 1 && place.role !== "arrival" ? (
                    <label className="mt-1.5 grid max-w-[11rem] gap-0.5">
                      <span className={fieldClass}>
                        {place.role === "stop" && place.overnight ? "Leave" : "Date"}
                      </span>
                      <input
                        type="date"
                        value={legs[place.legIndex]?.departDate || ""}
                        onChange={(event) => {
                          const day = event.target.value;
                          patchLeg(place.legIndex, {
                            departDate: day,
                            arriveDate:
                              place.role === "stop" && place.overnight
                                ? legs[place.legIndex]?.arriveDate || day
                                : day,
                          });
                        }}
                        className="h-8 rounded-lg border border-input px-2 text-xs"
                      />
                    </label>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {/* One booking, one travel date — ends are already set above. */}
          {legs.length <= 1 ? (
            <label className="grid max-w-[14rem] gap-1">
              <span className={fieldClass}>Travel date</span>
              <input
                type="date"
                value={legs[0]?.departDate || travelDate || ""}
                onChange={(event) => {
                  const day = event.target.value;
                  if (!legs.length && fromCode && toCode) {
                    setLegs(legsForRoute([fromCode, toCode], day));
                    return;
                  }
                  patchLeg(0, { departDate: day, arriveDate: day });
                }}
                className="h-9 rounded-lg border border-input px-2"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          onChange(summaryFromLegs(legs));
          setSavedFlash(true);
          window.setTimeout(() => setSavedFlash(false), 1600);
        }}
        className={cn(
          "inline-flex h-9 w-fit items-center rounded-lg px-3 text-sm font-semibold",
          savedFlash
            ? "bg-emerald-100 text-emerald-900"
            : "border border-input text-foreground hover:bg-muted",
        )}
      >
        {savedFlash ? "Saved" : "Save"}
      </button>

      <div>
        <p className={headingClass}>Booking</p>
        <section className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-3">
          <label className="grid min-w-0 gap-1">
            <span className={fieldClass}>Booking reference (PNR)</span>
            <input
              value={assumed ? "" : value.pnr}
              onChange={(event) =>
                onChange(
                  assumed
                    ? {
                        pnr: event.target.value.toUpperCase(),
                        confirmed: false,
                        bookedOn: todayInZone(),
                      }
                    : { pnr: event.target.value.toUpperCase() },
                )
              }
              className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
              placeholder="ABC123"
            />
          </label>
          <label className="grid min-w-0 gap-1">
            <span className={fieldClass}>Booked on</span>
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
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className={headingClass}>Hotel</p>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={wantHotel}
              onChange={(event) => {
                const on = event.target.checked;
                setWantHotel(on);
                if (on) {
                  if (value.hotels.length) return;
                  const stop = legs.find(
                    (row, i) =>
                      legs[i + 1] && row.arriveDate && legs[i + 1]!.departDate > row.arriveDate,
                  );
                  onChange({
                    hotels: [
                      emptyHotel(
                        stop?.toAirport || legs[0]?.toAirport || "",
                        stop?.arriveDate || travelDate,
                      ),
                    ],
                  });
                } else {
                  onChange({ hotels: [] });
                }
              }}
              className="size-3.5 rounded border-input"
            />
            Include
          </label>
        </div>
        <div className="mt-2 space-y-3 border-t border-border pt-3">
          {wantHotel
            ? value.hotels.map((hotel, index) => (
                <div key={index} className="grid grid-cols-2 gap-2">
                  <AirportSelect
                    value={hotel.place}
                    hubs={hubs}
                    placeholder="Where"
                    onChange={(code) => patchHotel(index, { place: code })}
                  />
                  <input
                    value={hotel.name}
                    onChange={(event) => patchHotel(index, { name: event.target.value })}
                    placeholder="Hotel name"
                    className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
                  />
                  <label className="grid min-w-0 gap-1">
                    <span className={fieldClass}>Check in</span>
                    <input
                      type="date"
                      value={hotel.checkIn}
                      onChange={(event) => patchHotel(index, { checkIn: event.target.value })}
                      className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
                    />
                  </label>
                  <label className="grid min-w-0 gap-1">
                    <span className={fieldClass}>Check out</span>
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
                    className="col-span-2 h-9 w-full min-w-0 rounded-lg border border-input px-2"
                  />
                </div>
              ))
            : (
              <p className="text-muted-foreground">No hotel on this trip.</p>
            )}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className={headingClass}>Car service</p>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={wantCar}
              onChange={(event) => {
                const on = event.target.checked;
                setWantCar(on);
                if (!on) onChange({ carService: "" });
              }}
              className="size-3.5 rounded border-input"
            />
            Include
          </label>
        </div>
        <div className="mt-2 border-t border-border pt-3">
          {wantCar ? (
            <input
              value={value.carService}
              onChange={(event) => onChange({ carService: event.target.value })}
              placeholder="Pickup details"
              className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
            />
          ) : (
            <p className="text-muted-foreground">No car service.</p>
          )}
        </div>
      </div>

      <div>
        <p className={headingClass}>Notes</p>
        <div className="mt-2 border-t border-border pt-3">
          <textarea
            value={value.notes.startsWith("Assumed booked") ? "" : value.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            rows={2}
            className="w-full rounded-lg border border-input px-2 py-1.5"
          />
        </div>
      </div>
    </div>
  );
}
