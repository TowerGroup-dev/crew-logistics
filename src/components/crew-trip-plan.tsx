"use client";

import { AlertTriangle, BedDouble, Car, Plane } from "lucide-react";
import type { FlightHotel, FlightSegment } from "@/lib/crew-flights";
import { tripPlan } from "@/lib/crew-routes";
import { formatMedium } from "@/lib/dates";
import { cn } from "@/lib/cn";

/** The whole journey at a glance: every flight or drive, every stopover night, and what still needs planning. */
export function CrewTripPlan({
  legs,
  hotels,
  compact = false,
  onAddHotel,
}: {
  legs: FlightSegment[];
  hotels: FlightHotel[];
  compact?: boolean;
  /** Adds a hotel for a stopover night that has none. */
  onAddHotel?: (place: string, checkIn: string, checkOut: string) => void;
}) {
  const { steps, warnings } = tripPlan(legs, hotels);
  if (!steps.length) return null;

  if (compact) {
    return (
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 font-medium">
          {steps.map((step, i) =>
            step.kind === "leg" ? (
              <span key={i} className="inline-flex items-center gap-1">
                {i === 0 ? <span>{step.from || "?"}</span> : null}
                {step.mode === "road" ? (
                  <Car className="size-3.5 text-amber-700" aria-label="by road" />
                ) : (
                  <Plane className="size-3.5 text-sky-700" aria-label="by air" />
                )}
                <span>{step.to || "?"}</span>
              </span>
            ) : (
              <span key={i} className="rounded bg-stone-100 px-1 text-[11px] font-semibold text-stone-700">
                {step.nights}n
              </span>
            ),
          )}
        </p>
        {warnings.length ? (
          <p className="flex items-center gap-1 text-xs font-medium text-amber-800">
            <AlertTriangle className="size-3.5 shrink-0" />
            {warnings[0]}
            {warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ""}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="font-semibold">Trip plan</p>
      <ol className="mt-2 space-y-1.5">
        {steps.map((step, i) =>
          step.kind === "leg" ? (
            <li key={i} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                  step.mode === "road" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800",
                )}
              >
                {step.mode === "road" ? <Car className="size-3.5" /> : <Plane className="size-3.5" />}
              </span>
              <span className="min-w-0">
                <span className="font-semibold">
                  {step.from || "?"} → {step.to || "?"}
                </span>
                <span className="text-muted-foreground"> · {step.mode === "road" ? "Road" : "Flight"}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {step.date ? formatMedium(step.date) : "No date yet"}
                  {step.departTime ? ` · leaves ${step.departTime}` : ""}
                  {step.arriveTime ? ` · arrives ${step.arriveTime}` : ""}
                  {step.ref ? ` · ${step.ref}` : ""}
                </span>
              </span>
            </li>
          ) : (
            <li key={i} className="flex items-start gap-2 pl-0.5">
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded",
                  step.hotel ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800",
                )}
              >
                <BedDouble className="size-3.5" />
              </span>
              <span className="text-xs">
                <span className="font-semibold">
                  Stopover in {step.place}, {step.nights} night{step.nights === 1 ? "" : "s"}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  ({formatMedium(step.from)} to {formatMedium(step.to)})
                </span>
                <span className={cn("block", step.hotel ? "text-emerald-800" : "font-medium text-amber-800")}>
                  {step.hotel ? `Hotel: ${step.hotel}` : "No hotel booked yet"}
                  {!step.hotel && onAddHotel ? (
                    <button
                      type="button"
                      onClick={() => onAddHotel(step.place, step.from, step.to)}
                      className="ml-2 rounded-md border border-amber-400 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                    >
                      Add hotel
                    </button>
                  ) : null}
                </span>
              </span>
            </li>
          ),
        )}
      </ol>
      {warnings.length ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {warnings.map((text) => (
            <li key={text} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs font-medium text-emerald-800">Everything on this trip is planned.</p>
      )}
    </section>
  );
}
