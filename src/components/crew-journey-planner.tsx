"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { AirportSelect, CAMP_AIRPORTS, useTravelHubs } from "@/components/crew-airport-select";
import { CrewConfirmDialog } from "@/components/crew-confirm-dialog";
import {
  buildJourneyPlan,
  journeyTypeToDirection,
  normalizeJourneyAirports,
  type JourneyType,
} from "@/lib/crew-journey-plan";
import type { FlightBook, FlightDirection, FlightSegment } from "@/lib/crew-flights";
import { suggestRoutesFor } from "@/lib/crew-route-suggestions";
import { formatMedium } from "@/lib/dates";
import { siteOnDay } from "@/lib/crew-site-days";
import type { CrewPerson } from "@/lib/crew-schedule";

export type JourneyPlannerApply = {
  direction: FlightDirection;
  journeyType: JourneyType;
  segments: FlightSegment[];
  stopoverDays: { iso: string; hub: string }[];
  pathLabel: string;
  startDate: string;
  arriveDate: string;
  bookingId?: string;
  notes?: string;
};

const ROUTE_TYPES: { value: JourneyType; label: string }[] = [
  { value: "coming", label: "Home → Site" },
  { value: "home", label: "Site → Home" },
  { value: "transfer", label: "Site → Site" },
];

function guessType(from: string, to: string): JourneyType {
  const camps = new Set(CAMP_AIRPORTS.map((row) => row.code));
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (camps.has(f) && camps.has(t)) return "transfer";
  if (camps.has(f) && !camps.has(t)) return "home";
  return "coming";
}

function typeNote(journeyType: JourneyType) {
  if (journeyType === "transfer") return "site to site";
  if (journeyType === "home") return "site to home";
  return "home to site";
}

/** Compact calendar travel editor — Excel-simple, any From/To, optional stops. */
export function CrewJourneyPlanner({
  personName,
  person,
  initialDate,
  initialEndDate,
  initialFrom,
  initialTo,
  initialSite,
  initialDirection = "outbound",
  initialStops = [],
  initialOvernight = false,
  initialOvernightHub = "",
  initialNotes = "",
  bookingId,
  flightBook,
  onApply,
  onDelete,
  onClose,
}: {
  personName: string;
  person?: CrewPerson | null;
  initialDate: string;
  initialEndDate?: string;
  /** Always From → To. Prefer explicit props; site is context only. */
  initialFrom?: string;
  initialTo?: string;
  /** Camp near this day (stay colour) — fills From or To by direction, never both. */
  initialSite?: string;
  initialDirection?: FlightDirection;
  initialStops?: string[];
  /** Kept for callers; overnight is inferred from dates + stops. */
  initialOvernight?: boolean;
  initialOvernightHub?: string;
  initialNotes?: string;
  bookingId?: string;
  /** Past journeys — used only for optional route suggestions. */
  flightBook?: FlightBook;
  onApply: (plan: JourneyPlannerApply) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const hubs = useTravelHubs();
  const campCodes = useMemo(() => new Set(CAMP_AIRPORTS.map((row) => row.code)), []);
  const campNear =
    (initialSite || "").trim().toUpperCase() ||
    (person ? siteOnDay(person, initialDate) : null) ||
    "";
  const homeHub = hubs[0]?.code || "YOW";
  // From → To by direction. Never default both ends to the same camp.
  const defaultFrom =
    (initialFrom || "").trim().toUpperCase() ||
    (initialDirection === "return" ? campNear || "IQA" : homeHub);
  let defaultTo =
    (initialTo || "").trim().toUpperCase() ||
    (initialDirection === "return" ? homeHub : campNear || "IQA");
  // Travel from a camp with no To yet → site transfer; leave To blank.
  if (!(initialTo || "").trim() && campCodes.has(defaultFrom) && defaultTo === defaultFrom) {
    defaultTo = "";
  }
  // If an overnight hub was saved without being in stops, keep it as the first stop.
  const seedStops =
    initialStops.length > 0
      ? initialStops
      : initialOvernightHub && initialOvernight
        ? [initialOvernightHub]
        : [];
  const seedEnd = (initialEndDate || initialDate).slice(0, 10);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [stops, setStops] = useState<string[]>(seedStops);
  const [directFlight, setDirectFlight] = useState(seedStops.length === 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [journeyType, setJourneyType] = useState<JourneyType>(() => {
    if (initialDirection === "return") return "home";
    if (!defaultTo && campCodes.has(defaultFrom)) return "transfer";
    return guessType(defaultFrom, defaultTo || campNear || "IQA");
  });
  const [startDate, setStartDate] = useState(initialDate.slice(0, 10));
  const [endDate, setEndDate] = useState(seedEnd);
  const [notes, setNotes] = useState(initialNotes);

  const activeStops = directFlight ? [] : stops;

  const airports = useMemo(
    () => normalizeJourneyAirports([from, ...activeStops, to]),
    [from, activeStops, to],
  );
  const suggestions = useMemo(
    () => suggestRoutesFor(flightBook, from, to),
    [flightBook, from, to],
  );
  const multiDay = endDate > startDate;
  const preview = useMemo(
    () =>
      buildJourneyPlan({
        airports,
        startDate,
        endDate: multiDay ? endDate : startDate,
        journeyType,
        overnightHub: multiDay && activeStops[0] ? activeStops[0] : "",
      }),
    [airports, startDate, endDate, multiDay, activeStops, journeyType],
  );

  // Home places = hubs; Site places = camps. Match the route type.
  const fromPlaces = journeyType === "coming" ? hubs : CAMP_AIRPORTS;
  const toPlaces = journeyType === "home" ? hubs : CAMP_AIRPORTS;

  function setStop(index: number, code: string) {
    setStops((current) => current.map((row, i) => (i === index ? code : row)));
  }

  function removeStop(index: number) {
    setStops((current) => current.filter((_, i) => i !== index));
  }

  function apply() {
    if (!preview) return;
    onApply({
      direction: journeyTypeToDirection(journeyType),
      journeyType,
      segments: preview.segments,
      stopoverDays: preview.stopoverDays,
      pathLabel: preview.pathLabel,
      startDate: preview.startDate,
      arriveDate: preview.arriveDate,
      bookingId,
      notes: [typeNote(journeyType), notes.trim(), preview.pathLabel].filter(Boolean).join(" · "),
    });
  }

  return (
    <>
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-stone-900/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="travel-editor-title"
        className="flex max-h-[min(70vh,28rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 pt-3.5 pb-3">
          <div>
            <p id="travel-editor-title" className="text-base font-semibold">
              Add travel
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {personName} · {formatMedium(startDate)}
              {endDate !== startDate ? ` – ${formatMedium(endDate)}` : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Route
              <select
                value={journeyType}
                onChange={(event) => setJourneyType(event.target.value as JourneyType)}
                className="h-9 rounded-lg border border-input bg-card px-2 text-sm font-medium text-foreground"
              >
                {ROUTE_TYPES.map((row) => (
                  <option key={row.value} value={row.value}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">
                From
                <AirportSelect
                  value={from}
                  onChange={setFrom}
                  hubs={fromPlaces}
                  placeholder="Choose place"
                />
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                To
                <AirportSelect
                  value={to}
                  onChange={setTo}
                  hubs={toPlaces}
                  placeholder="Choose place"
                />
              </label>
            </div>

            {suggestions.length ? (
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((row) => (
                  <button
                    key={row.pathLabel}
                    type="button"
                    onClick={() => {
                      setFrom(row.airports[0] || from);
                      setTo(row.airports[row.airports.length - 1] || to);
                      const nextStops =
                        row.airports.length > 2 ? row.airports.slice(1, -1) : [];
                      setStops(nextStops);
                      setDirectFlight(nextStops.length === 0);
                    }}
                    className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    {row.pathLabel}
                  </button>
                ))}
              </div>
            ) : null}

            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={directFlight}
                onChange={(event) => {
                  const next = event.target.checked;
                  setDirectFlight(next);
                  if (!next && stops.length === 0) setStops([""]);
                }}
                className="size-4 rounded border-input"
              />
              Direct flight
            </label>

            {!directFlight ? (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-sm font-medium">Connecting stops</p>
                  <button
                    type="button"
                    onClick={() => setStops((current) => [...current, ""])}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-input px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="size-3.5" /> Add stop
                  </button>
                </div>
                <div className="grid gap-2">
                  {stops.map((stop, index) => (
                    <div key={`stop-${index}`} className="flex items-center gap-2">
                      <AirportSelect
                        value={stop}
                        onChange={(code) => setStop(index, code)}
                        hubs={hubs}
                        includeCamps={false}
                        placeholder={`Stop ${index + 1}`}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        aria-label="Remove stop"
                        onClick={() => removeStop(index)}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-rose-50 hover:text-rose-800"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">
                Departure
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
                />
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                Arrival
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
                />
              </label>
            </div>

            <label className="grid gap-1 text-xs text-muted-foreground">
              Notes
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Flight # / notes"
                className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
              />
            </label>

            {preview ? (
              <p className="text-sm font-semibold tracking-tight">{preview.pathLabel}</p>
            ) : (
              <p className="text-sm font-medium text-rose-700">
                <span aria-hidden>*</span> Choose the travel route.
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          {onDelete && bookingId ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-9 rounded-lg px-3 text-sm font-medium text-rose-800 hover:bg-rose-50"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-input px-3 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!preview}
              onClick={apply}
              className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              Save travel
            </button>
          </div>
        </div>
      </div>
    </div>
    {confirmDelete ? (
      <CrewConfirmDialog
        title="Delete this travel?"
        confirmLabel="Delete travel"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete?.();
        }}
      />
    ) : null}
    </>
  );
}
