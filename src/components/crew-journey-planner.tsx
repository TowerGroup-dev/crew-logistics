"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { AirportSelect, CAMP_AIRPORTS, useTravelHubs } from "@/components/crew-airport-select";
import {
  buildJourneyPlan,
  normalizeJourneyAirports,
  type JourneyPace,
} from "@/lib/crew-journey-plan";
import type { FlightDirection, FlightSegment } from "@/lib/crew-flights";
import { formatMedium } from "@/lib/dates";
import { cn } from "@/lib/cn";

export type JourneyPlannerApply = {
  direction: FlightDirection;
  segments: FlightSegment[];
  stopoverDays: { iso: string; hub: string }[];
  pathLabel: string;
  startDate: string;
  arriveDate: string;
};

/** From → To travel (optional stops). Puts the path on the Month calendar. */
export function CrewJourneyPlanner({
  personName,
  initialDate,
  initialTo = "IQA",
  initialFrom = "YOW",
  initialDirection = "outbound",
  onApply,
  onClose,
}: {
  personName: string;
  initialDate: string;
  initialTo?: string;
  initialFrom?: string;
  initialDirection?: FlightDirection;
  onApply: (plan: JourneyPlannerApply) => void;
  onClose: () => void;
}) {
  const hubs = useTravelHubs();
  const [direction, setDirection] = useState<FlightDirection>(initialDirection);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [stops, setStops] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(initialDate.slice(0, 10));
  const [pace, setPace] = useState<JourneyPace>("same-day");

  const airports = useMemo(
    () => normalizeJourneyAirports([from, ...stops, to]),
    [from, stops, to],
  );
  const preview = useMemo(
    () => buildJourneyPlan({ airports, startDate, pace }),
    [airports, startDate, pace],
  );
  const hasStops = stops.some((code) => code.trim());

  function setStop(index: number, code: string) {
    setStops((current) => current.map((row, i) => (i === index ? code : row)));
  }

  function removeStop(index: number) {
    setStops((current) => current.filter((_, i) => i !== index));
  }

  function apply() {
    if (!preview) return;
    onApply({
      direction,
      segments: preview.segments,
      stopoverDays: preview.stopoverDays,
      pathLabel: preview.pathLabel,
      startDate: preview.startDate,
      arriveDate: preview.arriveDate,
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-stone-900/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="journey-planner-title"
        className="max-h-[min(92vh,36rem)] w-full max-w-md overflow-auto rounded-2xl border border-border bg-card p-4 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p id="journey-planner-title" className="text-base font-semibold">
              From → To
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {personName} · put travel on the calendar
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

        <div className="mt-4 grid gap-3">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            {(
              [
                ["outbound", "To site"],
                ["return", "Home"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  if (value === direction) return;
                  // Flip From/To when switching To site ↔ Home.
                  setFrom(to);
                  setTo(from);
                  setDirection(value);
                }}
                className={cn(
                  "h-8 flex-1 rounded-md px-3 text-xs font-semibold",
                  direction === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">From</span>
            <AirportSelect value={from} onChange={setFrom} hubs={hubs} placeholder="e.g. Ottawa (YOW)" />
          </label>

          {stops.length > 0 ? (
            <div className="grid gap-2">
              <span className="text-sm font-medium text-muted-foreground">Stops (optional)</span>
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
          ) : null}

          <button
            type="button"
            onClick={() => setStops((current) => [...current, ""])}
            className="inline-flex h-8 w-fit items-center gap-1 rounded-md border border-dashed border-input px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-3.5" />
            {stops.length ? "Add another stop" : "Add a stop (optional)"}
          </button>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">To</span>
            <AirportSelect
              value={to}
              onChange={setTo}
              hubs={[...CAMP_AIRPORTS, ...hubs]}
              placeholder="e.g. Iqaluit (IQA)"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">Leave date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-9 rounded-lg border border-input bg-card px-2"
            />
          </label>

          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Same day or 2 days?</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  [
                    "same-day",
                    "Same day",
                    hasStops ? "All hops that day" : "Leave and arrive that day",
                  ],
                  [
                    "overnight",
                    "2 days",
                    hasStops
                      ? "Overnight at each stop"
                      : "Leave one day, arrive the next",
                  ],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPace(value)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left",
                    pace === value
                      ? "border-sky-500 bg-sky-50 ring-1 ring-sky-400"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-[11px] text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2.5 text-sm">
            {preview ? (
              <>
                <p className="font-semibold tracking-tight">{preview.pathLabel}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Leaves {formatMedium(preview.startDate)}
                  {preview.arriveDate !== preview.startDate
                    ? ` · arrives ${formatMedium(preview.arriveDate)}`
                    : " · arrives same day"}
                  {preview.stopoverDays.length
                    ? ` · overnight ${preview.stopoverDays.map((row) => row.hub).join(", ")}`
                    : ""}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Pick From and To.</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
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
            Put on calendar
          </button>
        </div>
      </div>
    </div>
  );
}
