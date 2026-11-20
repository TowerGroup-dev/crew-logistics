"use client";

import { useEffect, useState } from "react";
import { DEFAULT_TRAVEL_HUBS, loadTravelHubs, type TravelHub } from "@/lib/crew-travel-hubs";
import { cn } from "@/lib/cn";

export const CAMP_AIRPORTS: TravelHub[] = [
  { code: "IQA", name: "Iqaluit" },
  { code: "POND", name: "Pond Inlet" },
  { code: "KUG", name: "Kugluktuk" },
  { code: "ALRT", name: "Alert" },
];

/** Travel places from Settings (falls back to the built-in list on the server). */
export function useTravelHubs() {
  const [hubs, setHubs] = useState<TravelHub[]>(DEFAULT_TRAVEL_HUBS);
  useEffect(() => {
    setHubs(loadTravelHubs().hubs);
  }, []);
  return hubs;
}

/** Pick a camp or an airport / stopover. New places are added under Settings → Travel places. */
export function AirportSelect({
  value,
  onChange,
  hubs,
  placeholder = "Pick a place",
  className,
  id,
  ariaLabel,
  suggested = [],
}: {
  value: string;
  onChange: (code: string) => void;
  hubs: TravelHub[];
  placeholder?: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
  /** Likely places, shown first (e.g. where people usually go next from the last stop). */
  suggested?: { code: string; uses?: number; why?: string }[];
}) {
  const code = value.trim().toUpperCase();
  const known = [...CAMP_AIRPORTS, ...hubs].some((row) => row.code === code);
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={code}
      onChange={(event) => onChange(event.target.value)}
      className={cn("h-9 w-full min-w-0 rounded-lg border border-input bg-card px-2", !code && "text-muted-foreground", className)}
    >
      <option value="">{placeholder}</option>
      {suggested.length ? (
        <optgroup label="Suggested">
          {suggested.map((row) => {
            const name = [...CAMP_AIRPORTS, ...hubs].find((place) => place.code === row.code)?.name;
            const note = row.why || (row.uses ? `used ${row.uses}×` : "");
            return (
              <option key={`s-${row.code}`} value={row.code}>
                {row.code}
                {name ? ` · ${name}` : ""}
                {note ? ` (${note})` : ""}
              </option>
            );
          })}
        </optgroup>
      ) : null}
      <optgroup label="Sites">
        {CAMP_AIRPORTS.map((row) => (
          <option key={row.code} value={row.code}>
            {row.code} · {row.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Airports and stopovers">
        {hubs.map((row) => (
          <option key={row.code} value={row.code}>
            {row.code} · {row.name}
          </option>
        ))}
      </optgroup>
      {code && !known ? (
        <optgroup label="Other">
          <option value={code}>{code}</option>
        </optgroup>
      ) : null}
    </select>
  );
}
