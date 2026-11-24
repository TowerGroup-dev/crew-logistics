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

/**
 * Searchable place field: pick a suggestion or type any city/airport code.
 * Not limited to a fixed hub list (acceptance: any origin/destination).
 */
export function AirportSelect({
  value,
  onChange,
  hubs,
  placeholder = "City or airport",
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
  suggested?: { code: string; uses?: number; why?: string }[];
}) {
  const listId = id ? `${id}-list` : `airport-list-${placeholder.replace(/\s+/g, "-")}`;
  const places = [...CAMP_AIRPORTS, ...hubs];
  const seen = new Set(places.map((row) => row.code));
  for (const row of suggested) {
    if (!seen.has(row.code)) {
      places.push({ code: row.code, name: row.why || row.code });
      seen.add(row.code);
    }
  }

  return (
    <>
      <input
        id={id}
        list={listId}
        aria-label={ariaLabel || placeholder}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        className={cn(
          "h-9 w-full min-w-0 rounded-lg border border-input bg-card px-2 uppercase tracking-wide",
          !value && "normal-case tracking-normal text-muted-foreground",
          className,
        )}
      />
      <datalist id={listId}>
        {places.map((row) => (
          <option key={row.code} value={row.code}>
            {row.name}
          </option>
        ))}
      </datalist>
    </>
  );
}
