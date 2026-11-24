"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { AirportSelect, CAMP_AIRPORTS, useTravelHubs } from "@/components/crew-airport-select";
import {
  buildJourneyPlan,
  journeyTypeToDirection,
  normalizeJourneyAirports,
  type JourneyType,
} from "@/lib/crew-journey-plan";
import type { FlightBook, FlightDirection, FlightSegment } from "@/lib/crew-flights";
import { suggestRoutesFor } from "@/lib/crew-route-suggestions";
import { formatMedium } from "@/lib/dates";
import { cn } from "@/lib/cn";
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

function guessType(from: string, to: string): JourneyType {
  const camps = new Set(CAMP_AIRPORTS.map((row) => row.code));
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (camps.has(f) && camps.has(t)) return "transfer";
  if (camps.has(f) && !camps.has(t)) return "home";
  return "coming";
}

/** Compact calendar travel editor — Excel-simple, any From/To, optional stops. */
export function CrewJourneyPlanner({
  personName,
  person,
  initialDate,
  initialEndDate,
  initialTo,
  initialFrom,
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
  initialTo?: string;
  initialFrom?: string;
  initialDirection?: FlightDirection;
  initialStops?: string[];
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
  const campNear = person ? siteOnDay(person, initialDate) : null;
  const defaultTo = initialTo || campNear || "IQA";
  const defaultFrom = initialFrom || (campNear ? campNear : "YOW");

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [stops, setStops] = useState<string[]>(initialStops);
  const [journeyType, setJourneyType] = useState<JourneyType>(() =>
    initialDirection === "return" ? "home" : guessType(defaultFrom, defaultTo),
  );
  const [overnight, setOvernight] = useState(initialOvernight);
  const [overnightHub, setOvernightHub] = useState(initialOvernightHub);
  const [startDate, setStartDate] = useState(initialDate.slice(0, 10));
  const [endDate, setEndDate] = useState((initialEndDate || initialDate).slice(0, 10));
  const [notes, setNotes] = useState(initialNotes);

  const airports = useMemo(
    () => normalizeJourneyAirports([from, ...stops, to]),
    [from, stops, to],
  );
  const suggestions = useMemo(
    () => suggestRoutesFor(flightBook, from, to),
    [flightBook, from, to],
  );
  const preview = useMemo(
    () =>
      buildJourneyPlan({
        airports,
        startDate,
        endDate: overnight || endDate > startDate ? endDate : startDate,
        journeyType,
        overnightHub: overnight ? overnightHub : "",
      }),
    [airports, startDate, endDate, overnight, overnightHub, journeyType],
  );

  function setStop(index: number, code: string) {
    setStops((current) => current.map((row, i) => (i === index ? code : row)));
  }

  function removeStop(index: number) {
    setStops((current) => current.filter((_, i) => i !== index));
  }

  function apply() {
    if (!preview) return;
    const typeNote =
      journeyType === "transfer"
        ? "transfer"
        : journeyType === "home"
          ? "going home"
          : "coming to camp";
    onApply({
      direction: journeyTypeToDirection(journeyType),
      journeyType,
      segments: preview.segments,
      stopoverDays: preview.stopoverDays,
      pathLabel: preview.pathLabel,
      startDate: preview.startDate,
      arriveDate: preview.arriveDate,
      bookingId,
      notes: [typeNote, notes.trim(), preview.pathLabel].filter(Boolean).join(" · "),
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-stone-900/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="travel-editor-title"
        className="max-h-[min(92vh,34rem)] w-full max-w-md overflow-auto rounded-2xl border border-border bg-card p-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
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

        <div className="mt-3 grid gap-3">
          <div>
            <p className="mb-1.5 text-sm font-medium">Route</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">
                From
                <AirportSelect value={from} onChange={setFrom} hubs={hubs} placeholder="e.g. Ottawa" />
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">
                To
                <AirportSelect
                  value={to}
                  onChange={setTo}
                  hubs={[...CAMP_AIRPORTS, ...hubs]}
                  placeholder="e.g. IQA"
                />
              </label>
            </div>
            {suggestions.length ? (
              <div className="mt-2 rounded-lg border border-dashed border-border bg-muted/20 px-2.5 py-2">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Previous routes
                </p>
                <div className="mt-1.5 flex flex-col gap-1">
                  {suggestions.map((row) => (
                    <button
                      key={row.pathLabel}
                      type="button"
                      onClick={() => {
                        setFrom(row.airports[0] || from);
                        setTo(row.airports[row.airports.length - 1] || to);
                        setStops(row.airports.length > 2 ? row.airports.slice(1, -1) : []);
                        if (row.airports.length > 2) {
                          setOvernight(true);
                          setOvernightHub(row.airports[1] || "");
                        }
                      }}
                      className="rounded-md px-2 py-1.5 text-left text-xs font-medium hover:bg-sky-50"
                    >
                      <span className="font-semibold">{row.pathLabel}</span>
                      <span className="ml-1.5 text-muted-foreground">· used {row.uses}×</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Suggestion only. Not a booked flight.
                </p>
              </div>
            ) : null}
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">Travel type</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["coming", "Coming to camp"],
                  ["home", "Going home"],
                  ["transfer", "Camp transfer"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setJourneyType(value)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-center text-xs font-semibold",
                    journeyType === value
                      ? "border-sky-500 bg-sky-50 text-sky-950"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">Overnight stay?</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  [false, "No overnight"],
                  [true, "Overnight"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => {
                    setOvernight(value);
                    if (value && endDate <= startDate) setEndDate(startDate);
                  }}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-center text-xs font-semibold",
                    overnight === value
                      ? "border-sky-500 bg-sky-50 text-sky-950"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {overnight ? (
              <label className="mt-2 grid gap-1 text-xs text-muted-foreground">
                Overnight city
                <AirportSelect
                  value={overnightHub}
                  onChange={setOvernightHub}
                  hubs={hubs}
                  placeholder="e.g. Edmonton"
                />
              </label>
            ) : null}
          </div>

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
            {stops.length === 0 ? (
              <p className="text-xs text-muted-foreground">No stops. Direct From to To.</p>
            ) : (
              <div className="grid gap-2">
                {stops.map((stop, index) => (
                  <div key={`stop-${index}`} className="flex items-center gap-2">
                    <AirportSelect
                      value={stop}
                      onChange={(code) => setStop(index, code)}
                      hubs={hubs}
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
            )}
          </div>

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
            Notes (optional)
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Flight number or notes"
              className="h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground"
            />
          </label>

          <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2.5 text-sm">
            {preview ? (
              <>
                <p className="font-semibold tracking-tight">{preview.pathLabel}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatMedium(preview.startDate)}
                  {preview.arriveDate !== preview.startDate
                    ? ` to ${formatMedium(preview.arriveDate)}`
                    : ". Same day"}
                  . Shown as travel days on the calendar.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Enter From and To.</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {onDelete && bookingId ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Delete this travel route? Camp days stay.")) onDelete();
              }}
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
  );
}
