"use client";

import { useState } from "react";
import { ExternalLink, Plane, Plus, Trash2 } from "lucide-react";
import {
  CANADIAN_NORTH_URL,
  activeBookingFor,
  emptySegment,
  flightIsArranged,
  flightStatusLabel,
  type FlightBooking,
  type FlightBook,
  type FlightDirection,
  type FlightRecordStatus,
  type FlightSegment,
} from "@/lib/crew-flights";
import { formatMedium } from "@/lib/dates";
import { siteLabel } from "@/lib/crew-schedule";
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
          <p className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
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
            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
            arranged ? "bg-emerald-100 text-emerald-950" : "bg-amber-100 text-amber-950",
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
          {booking.segments[0] ? (
            <p>
              {booking.segments[0].fromAirport || "-"} → {booking.segments[0].toAirport || "-"}
              {booking.segments[0].departDate ? ` · ${formatMedium(booking.segments[0].departDate)}` : ""}
              {booking.segments[0].flightNumber ? ` · ${booking.segments[0].flightNumber}` : ""}
            </p>
          ) : null}
          {booking.segments.length > 1 ? (
            <p className="text-xs text-muted-foreground">{booking.segments.length} segments</p>
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
  const [error, setError] = useState("");

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

      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Flight segments</p>
          <button
            type="button"
            onClick={() => setSegments((current) => [...current, emptySegment()])}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2 text-xs font-medium hover:bg-muted"
          >
            <Plus className="size-3.5" /> Segment
          </button>
        </div>
        {segments.map((segment, index) => (
          <div key={index} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">From</span>
              <input
                value={segment.fromAirport}
                onChange={(event) => patchSegment(index, { fromAirport: event.target.value })}
                className="h-9 rounded-lg border border-input px-2"
                placeholder="YEG"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">To</span>
              <input
                value={segment.toAirport}
                onChange={(event) => patchSegment(index, { toAirport: event.target.value })}
                className="h-9 rounded-lg border border-input px-2"
                placeholder="YFB"
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
