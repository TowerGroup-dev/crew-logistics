"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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

function dedupePlaces(rows: TravelHub[]) {
  const out: TravelHub[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const code = row.code.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: row.name.trim() || code });
  }
  return out;
}

/**
 * Place droplist: opens on focus/click with the full list (no typing required).
 * Typing filters; still accepts a typed code that is not in the list.
 */
export function AirportSelect({
  value,
  onChange,
  hubs,
  placeholder = "Choose place",
  className,
  id,
  ariaLabel,
  suggested = [],
  includeCamps = false,
}: {
  value: string;
  onChange: (code: string) => void;
  hubs: TravelHub[];
  placeholder?: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
  suggested?: { code: string; uses?: number; why?: string }[];
  /** When true, camps (IQA/POND/…) are in the list once — do not also pass them in hubs. */
  includeCamps?: boolean;
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const listId = `${inputId}-options`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const places = useMemo(() => {
    const base = includeCamps ? [...CAMP_AIRPORTS, ...hubs] : [...hubs];
    const extra = suggested.map((row) => ({
      code: row.code,
      name: row.why || row.code,
    }));
    return dedupePlaces([...base, ...extra]);
  }, [hubs, includeCamps, suggested]);

  const needle = filter.trim().toUpperCase();
  const filtered = needle
    ? places.filter(
        (row) =>
          row.code.includes(needle) || row.name.toUpperCase().includes(needle),
      )
    : places;

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setFilter("");
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setFilter("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(code: string) {
    onChange(code);
    setFilter("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel || placeholder}
          value={open && filter !== "" ? filter : value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onFocus={() => {
            setOpen(true);
            setFilter("");
          }}
          onClick={() => {
            setOpen(true);
          }}
          onChange={(event) => {
            const next = event.target.value.toUpperCase();
            setFilter(next);
            setOpen(true);
            onChange(next.trim());
          }}
          className={cn(
            "h-9 w-full min-w-0 rounded-lg border border-input bg-card py-1.5 pr-8 pl-2 uppercase tracking-wide",
            !value && "normal-case tracking-normal text-muted-foreground",
          )}
        />
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-2.5 py-2 text-xs text-muted-foreground">
              No match — keep typing a code
            </li>
          ) : (
            filtered.map((row) => (
              <li key={row.code} role="option" aria-selected={row.code === value}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(row.code)}
                  className={cn(
                    "flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted",
                    row.code === value && "bg-muted font-medium",
                  )}
                >
                  <span className="font-semibold tracking-wide">{row.code}</span>
                  <span className="truncate text-xs text-muted-foreground">{row.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
