"use client";

import { useMemo, useState } from "react";
import { BedDouble, Car, ExternalLink, Plane, Plus, Route, Trash2 } from "lucide-react";
import { AirportSelect, CAMP_AIRPORTS, useTravelHubs } from "@/components/crew-airport-select";
import {
  CANADIAN_NORTH_URL,
  activeBookingFor,
  emptyHotel,
  emptySegment,
  flightIsArranged,
  flightStatusLabel,
  type FlightBooking,
  type FlightBook,
  type FlightDirection,
  type FlightHotel,
  type FlightRecordStatus,
  type FlightSegment,
} from "@/lib/crew-flights";
import { formatMedium } from "@/lib/dates";
import { siteLabel } from "@/lib/crew-schedule";
import { formatJourneyPath, travelHubName } from "@/lib/crew-travel-hubs";
import { lastStartAirport, legsForRoute, loadRoutes, routeAirports } from "@/lib/crew-routes";
import { cn } from "@/lib/cn";

const STATUSES: FlightRecordStatus[] = [
  "pending_booking",
  "booked",
  "confirmed",
  "changed",
  "cancelled",
  "completed",
];

export function CrewFlightPanel({
  personId,
  personName,
  role,
  site,
  plannedIn,
  plannedOut,
  staffName,
  flightBook,
  onSave,
}: {
  personId: string;
  personName: string;
  role: string;
  site: string | null;
  plannedIn: string | null;
  plannedOut: string | null;
  staffName: string;
  flightBook: FlightBook;
  onSave: (booking: FlightBooking) => void;
}) {
  const outbound = activeBookingFor(flightBook, personId, "outbound");
  const inbound = activeBookingFor(flightBook, personId, "return");
  const [formOpen, setFormOpen] = useState<FlightDirection | null>(null);

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[0.8125rem] font-medium tracking-wide text-muted-foreground uppercase">
            <Plane className="size-3.5" /> Canadian North flights
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add flight details.  
          </p>
        </div>
        <a
          href={CANADIAN_NORTH_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Arrange flight
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DirectionCard
          title="Outbound"
          travelDate={plannedIn}
          travelLabel="IN"
          booking={outbound}
          onAdd={() => setFormOpen("outbound")}
        />
        <DirectionCard
          title="Inbound"
          travelDate={plannedOut}
          travelLabel="OUT"
          booking={inbound}
          onAdd={() => setFormOpen("return")}
        />
      </div>

      {formOpen ? (
        <FlightConfirmationForm
          personId={personId}
          personName={personName}
          role={role}
          site={site}
          direction={formOpen}
          rotationDate={formOpen === "outbound" ? plannedIn : plannedOut}
          staffName={staffName}
          flightBook={flightBook}
          existing={formOpen === "outbound" ? outbound : inbound}
          onCancel={() => setFormOpen(null)}
          onSave={(booking) => {
            onSave(booking);
            setFormOpen(null);
          }}
        />
      ) : null}
    </section>
  );
}

function DirectionCard({
  title,
  travelDate,
  travelLabel,
  booking,
  onAdd,
}: {
  title: string;
  travelDate: string | null;
  travelLabel: string;
  booking: FlightBooking | null;
  onAdd: () => void;
}) {
  const arranged = flightIsArranged(booking);
  return (
    <div className={cn("rounded-xl border p-3", arranged ? "border-border bg-muted/30" : "border-amber-300 bg-amber-50/40")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {travelLabel}: {travelDate ? formatMedium(travelDate) : "-"}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[0.8125rem] font-semibold",
            arranged ? "bg-slate-100 text-slate-800" : "bg-amber-100 text-amber-950",
          )}
        >
          {booking ? flightStatusLabel(booking.status) : "Not arranged"}
        </span>
      </div>
      {booking ? (
        <div className="mt-2 space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">PNR</span> · {booking.pnr || "-"}
          </p>
          {booking.segments.length ? (
            <p className="font-medium">
              {formatJourneyPath(booking.segments.flatMap((row) => [row.fromAirport, row.toAirport]).filter(Boolean))}
            </p>
          ) : null}
          {booking.segments.map((row, index) => (
            <p key={index} className="text-xs text-muted-foreground tabular-nums">
              {row.fromAirport || "-"} → {row.toAirport || "-"}
              {row.departDate ? ` · ${formatMedium(row.departDate)}` : ""}
              {row.departTime ? ` ${row.departTime}` : ""}
              {row.flightNumber ? ` · ${row.flightNumber}` : ""}
            </p>
          ))}
          {booking.hotels?.map((hotel, index) => (
            <p key={`h${index}`} className="flex items-center gap-1.5 text-xs">
              <BedDouble className="size-3.5 shrink-0 text-muted-foreground" />
              {hotel.name || "Hotel"}
              {hotel.place ? ` · ${hotel.place}` : ""}
              {hotel.checkIn ? ` · ${formatMedium(hotel.checkIn)}` : ""}
              {hotel.checkOut ? ` – ${formatMedium(hotel.checkOut)}` : ""}
            </p>
          ))}
          {booking.carService ? (
            <p className="flex items-center gap-1.5 text-xs">
              <Car className="size-3.5 shrink-0 text-muted-foreground" />
              {booking.carService}
            </p>
          ) : null}
          {booking.confirmationName ? (
            <a
              href={booking.confirmationDataUrl || undefined}
              download={booking.confirmationName}
              className="inline-block text-xs font-medium text-primary hover:underline"
            >
              {booking.confirmationName}
            </a>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">No confirmation on file.</p>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 h-8 rounded-lg border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
      >
        {booking ? "Update booking confirmation" : "Add booking confirmation"}
      </button>
    </div>
  );
}

function FlightConfirmationForm({
  personId,
  personName,
  role,
  site,
  direction,
  rotationDate,
  staffName,
  flightBook,
  existing,
  onCancel,
  onSave,
}: {
  personId: string;
  personName: string;
  role: string;
  site: string | null;
  direction: FlightDirection;
  rotationDate: string | null;
  staffName: string;
  flightBook: FlightBook;
  existing: FlightBooking | null;
  onCancel: () => void;
  onSave: (booking: FlightBooking) => void;
}) {
  const [pnr, setPnr] = useState(existing?.pnr ?? "");
  const [ticketNumber, setTicketNumber] = useState(existing?.ticketNumber ?? "");
  const [status, setStatus] = useState<FlightRecordStatus>(existing?.status ?? "booked");
  const [bookedOn, setBookedOn] = useState(existing?.bookedOn ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [segments, setSegments] = useState<FlightSegment[]>(
    existing?.segments?.length ? existing.segments.map((row) => ({ ...row })) : [emptySegment()],
  );
  const [confirmationName, setConfirmationName] = useState(existing?.confirmationName ?? "");
  const [confirmationDataUrl, setConfirmationDataUrl] = useState(existing?.confirmationDataUrl ?? "");
  const [hotels, setHotels] = useState<FlightHotel[]>(existing?.hotels?.map((row) => ({ ...row })) ?? []);
  const [carService, setCarService] = useState(existing?.carService ?? "");
  const [error, setError] = useState("");
  const hubs = useTravelHubs();
  const routes = useMemo(() => loadRoutes(), []);
  const campCodes = CAMP_AIRPORTS.map((row) => row.code);
  const siteCode = (site || "").toUpperCase();
  const [campSite, setCampSite] = useState(campCodes.includes(siteCode) ? siteCode : "");
  // Home end of the trip: outbound starts there, return ends there.
  const [homeAirport, setHomeAirport] = useState(() => {
    const legs = existing?.segments ?? [];
    const fromExisting = direction === "outbound" ? legs[0]?.fromAirport : legs[legs.length - 1]?.toAirport;
    return (fromExisting || lastStartAirport(flightBook, personId) || "").toUpperCase();
  });
  const usualChain = campSite && homeAirport ? routeAirports(routes, campSite, homeAirport, direction) : [];
  const segmentsBlank = segments.every((row) => !row.fromAirport && !row.toAirport && !row.flightNumber);

  function applyUsualRoute(home = homeAirport, camp = campSite) {
    if (!home || !camp) return;
    const legs = legsForRoute(routeAirports(routes, camp, home, direction), rotationDate);
    if (legs.length) setSegments(legs);
  }

  function patchHotel(index: number, patch: Partial<FlightHotel>) {
    setHotels((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function patchSegment(index: number, patch: Partial<FlightSegment>) {
    setSegments((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function onFile(file: File | null) {
    if (!file) return;
    if (file.size > 4_500_000) {
      setError("File is too large (keep under ~4.5 MB for local storage).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setConfirmationName(file.name);
      setConfirmationDataUrl(String(reader.result || ""));
      setError("");
    };
    reader.readAsDataURL(file);
  }

  function submit() {
    const cleanPnr = pnr.trim().toUpperCase();
    if (!cleanPnr) {
      setError("Booking reference (PNR) is required.");
      return;
    }
    if (!segments.some((row) => row.fromAirport.trim() && row.toAirport.trim() && row.departDate)) {
      setError("Add at least one segment with airports and departure date.");
      return;
    }
    const now = new Date().toISOString();
    const history = [
      ...(existing?.history ?? []),
      {
        at: now,
        by: staffName || "Coordinator",
        text: existing ? `Updated ${direction} booking (${cleanPnr})` : `Added ${direction} booking (${cleanPnr})`,
      },
    ];
    onSave({
      id: existing?.id ?? `flight-${personId}-${direction}-${Date.now()}`,
      personId,
      direction,
      rotationDate,
      airline: "Canadian North",
      pnr: cleanPnr,
      ticketNumber: ticketNumber.trim(),
      segments: segments.map((row) => ({
        ...row,
        fromAirport: row.fromAirport.trim().toUpperCase(),
        toAirport: row.toAirport.trim().toUpperCase(),
        flightNumber: row.flightNumber.trim().toUpperCase(),
      })),
      status,
      bookedOn: bookedOn || null,
      enteredBy: staffName || "Coordinator",
      enteredAt: existing?.enteredAt ?? now,
      confirmationName,
      confirmationDataUrl,
      notes: notes.trim(),
      hotels: hotels.filter((row) => row.place || row.name || row.confirmation),
      carService: carService.trim(),
      history,
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Add flight confirmation</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {personName} · {role}
            {site ? ` · ${siteLabel(site)}` : ""}
            {" · "}
            {direction === "outbound" ? "Outbound" : "Return"}
          </p>
        </div>
        <a
          href={CANADIAN_NORTH_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open Canadian North
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Booking reference (PNR)</span>
          <input
            value={pnr}
            onChange={(event) => setPnr(event.target.value)}
            className="h-9 rounded-lg border border-input px-2"
            placeholder="ABC123"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Ticket number (optional)</span>
          <input
            value={ticketNumber}
            onChange={(event) => setTicketNumber(event.target.value)}
            className="h-9 rounded-lg border border-input px-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as FlightRecordStatus)}
            className="h-9 rounded-lg border border-input px-2"
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {flightStatusLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Booking date</span>
          <input
            type="date"
            value={bookedOn}
            onChange={(event) => setBookedOn(event.target.value)}
            className="h-9 rounded-lg border border-input px-2"
          />
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/50 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Route className="size-4 text-sky-700" /> Route
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{direction === "outbound" ? "Flying from" : "Going home to"}</span>
            <AirportSelect
              value={homeAirport}
              hubs={hubs}
              placeholder="Pick the airport"
              onChange={(code) => {
                setHomeAirport(code);
                if (segmentsBlank) applyUsualRoute(code, campSite);
              }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">{direction === "outbound" ? "To site" : "From site"}</span>
            <select
              value={campSite}
              onChange={(event) => {
                setCampSite(event.target.value);
                if (segmentsBlank) applyUsualRoute(homeAirport, event.target.value);
              }}
              className={cn("h-9 rounded-lg border border-input bg-card px-2", !campSite && "text-muted-foreground")}
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
        {usualChain.length > 1 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="text-muted-foreground">Usual route </span>
              <span className="font-semibold">{usualChain.join(" → ")}</span>
              <span className="text-muted-foreground"> · {usualChain.map((code) => CAMP_AIRPORTS.find((row) => row.code === code)?.name || travelHubName(code, hubs)).join(" → ")}</span>
            </p>
            <button
              type="button"
              onClick={() => applyUsualRoute()}
              className="h-8 rounded-lg bg-sky-700 px-3 text-xs font-semibold text-white hover:opacity-90"
            >
              {segmentsBlank ? "Fill itinerary" : "Replace itinerary with usual route"}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Pick both ends to fill the itinerary from the usual route (Settings → Usual routes).
          </p>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Flight segments</p>
            <p className="text-xs text-muted-foreground">
              One row per flight, e.g. YOW → YK, then YK → KUG
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setSegments((current) => {
                const last = current[current.length - 1];
                return [
                  ...current,
                  { ...emptySegment(), fromAirport: last?.toAirport || "", departDate: last?.arriveDate || "" },
                ];
              })
            }
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-input px-2 text-xs font-medium hover:bg-muted"
          >
            <Plus className="size-3.5" /> Segment
          </button>
        </div>
        {(() => {
          const airports = segments.flatMap((row) => [row.fromAirport, row.toAirport]).filter(Boolean);
          const path = formatJourneyPath(airports);
          return path ? (
            <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-900">
              Journey: {path}
            </p>
          ) : null;
        })()}
        {segments.map((segment, index) => (
          <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">From</span>
              <AirportSelect
                value={segment.fromAirport}
                hubs={hubs}
                placeholder="From"
                onChange={(code) => patchSegment(index, { fromAirport: code })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">To</span>
              <AirportSelect
                value={segment.toAirport}
                hubs={hubs}
                placeholder="To"
                onChange={(code) => {
                  patchSegment(index, { toAirport: code });
                  // Next leg leaves from where this one lands.
                  if (code && segments[index + 1] && !segments[index + 1]!.fromAirport) {
                    patchSegment(index + 1, { fromAirport: code });
                  }
                }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Flight #</span>
              <input
                value={segment.flightNumber}
                onChange={(event) => patchSegment(index, { flightNumber: event.target.value })}
                className="h-9 rounded-lg border border-input px-2"
                placeholder="5T123"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Depart date</span>
              <input
                type="date"
                value={segment.departDate}
                onChange={(event) => patchSegment(index, { departDate: event.target.value })}
                className="h-9 rounded-lg border border-input px-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Depart time</span>
              <input
                type="time"
                value={segment.departTime}
                onChange={(event) => patchSegment(index, { departTime: event.target.value })}
                className="h-9 rounded-lg border border-input px-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Arrive date</span>
              <input
                type="date"
                value={segment.arriveDate}
                onChange={(event) => patchSegment(index, { arriveDate: event.target.value })}
                className="h-9 rounded-lg border border-input px-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Arrive time</span>
              <input
                type="time"
                value={segment.arriveTime}
                onChange={(event) => patchSegment(index, { arriveTime: event.target.value })}
                className="h-9 rounded-lg border border-input px-2"
              />
            </label>
            {segments.length > 1 ? (
              <button
                type="button"
                onClick={() => setSegments((current) => current.filter((_, i) => i !== index))}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-input text-xs text-rose-700 hover:bg-rose-50 sm:col-span-2"
              >
                <Trash2 className="size-3.5" /> Remove segment
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <BedDouble className="size-4 text-muted-foreground" /> Hotels
            </p>
            <p className="text-xs text-muted-foreground">Overnight stops on the way (e.g. a night in Ottawa or Yellowknife).</p>
          </div>
          <button
            type="button"
            onClick={() => {
              // Suggest the first overnight stop: a leg that lands a day before the next one leaves.
              const legs = segments.filter((row) => row.toAirport);
              const stop = legs.find((row, i) => legs[i + 1] && row.arriveDate && legs[i + 1]!.departDate > row.arriveDate);
              setHotels((current) => [
                ...current,
                emptyHotel(stop?.toAirport || legs[0]?.toAirport || "", stop?.arriveDate || ""),
              ]);
            }}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-input px-2 text-xs font-medium hover:bg-muted"
          >
            <Plus className="size-3.5" /> Hotel
          </button>
        </div>
        {hotels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            No hotel on this trip.
          </p>
        ) : (
          hotels.map((hotel, index) => (
            <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Where</span>
                <AirportSelect value={hotel.place} hubs={hubs} onChange={(code) => patchHotel(index, { place: code })} />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">Hotel</span>
                <input
                  value={hotel.name}
                  onChange={(event) => patchHotel(index, { name: event.target.value })}
                  className="h-9 rounded-lg border border-input px-2"
                  placeholder="Hotel name"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Check in</span>
                <input
                  type="date"
                  value={hotel.checkIn}
                  onChange={(event) => patchHotel(index, { checkIn: event.target.value })}
                  className="h-9 rounded-lg border border-input px-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Check out</span>
                <input
                  type="date"
                  value={hotel.checkOut}
                  min={hotel.checkIn || undefined}
                  onChange={(event) => patchHotel(index, { checkOut: event.target.value })}
                  className="h-9 rounded-lg border border-input px-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Confirmation #</span>
                <input
                  value={hotel.confirmation}
                  onChange={(event) => patchHotel(index, { confirmation: event.target.value })}
                  className="h-9 rounded-lg border border-input px-2"
                />
              </label>
              <button
                type="button"
                onClick={() => setHotels((current) => current.filter((_, i) => i !== index))}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-input text-xs text-rose-700 hover:bg-rose-50 sm:col-span-3"
              >
                <Trash2 className="size-3.5" /> Remove hotel
              </button>
            </div>
          ))
        )}
        <label className="grid gap-1 text-sm">
          <span className="flex items-center gap-2 font-semibold">
            <Car className="size-4 text-muted-foreground" /> Car service
          </span>
          <input
            value={carService}
            onChange={(event) => setCarService(event.target.value)}
            className="h-9 rounded-lg border border-input px-2"
            placeholder="e.g. Pickup at home 5:30 am to YOW (leave blank if not needed)"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Booking confirmation (PDF or image)</span>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            className="text-sm"
          />
          {confirmationName ? <span className="text-xs text-muted-foreground">{confirmationName}</span> : null}
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className="rounded-lg border border-input px-2 py-1.5 text-sm"
            placeholder="Connecting flight notes, Manage My Trips tip, etc."
          />
        </label>
      </div>

      {error ? <p className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Save confirmation
        </button>
        <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-input px-3 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
