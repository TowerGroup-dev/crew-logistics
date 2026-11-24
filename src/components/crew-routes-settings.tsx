"use client";

import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { AirportSelect, CAMP_AIRPORTS } from "@/components/crew-airport-select";
import { emptyRoutesBook, loadRoutes, saveRoutes, setRouteVia, type CrewRoutesBook } from "@/lib/crew-routes";
import { travelHubName, type TravelHub } from "@/lib/crew-travel-hubs";

/** Settings: the usual stopovers to each camp, used to prefill flight legs. */
export function CrewRoutesSettings({ hubs }: { hubs: TravelHub[] }) {
  const [book, setBook] = useState<CrewRoutesBook>(() => emptyRoutesBook());
  const [adding, setAdding] = useState<Record<string, string>>({});

  useEffect(() => {
    setBook(loadRoutes());
  }, []);

  function update(site: string, via: string[]) {
    setBook((current) => {
      const next = setRouteVia(current, site, via);
      saveRoutes(next);
      return next;
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">Usual routes</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The stops between the south and each site. When you book a flight, pick where the person flies from and
          the legs fill in from here (going home they run in reverse).
        </p>
      </div>
      <ul className="divide-y divide-border border border-border">
        {CAMP_AIRPORTS.map((camp) => {
          const via = book.routes.find((row) => row.site === camp.code)?.via ?? [];
          return (
            <li key={camp.code} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="w-28 shrink-0 font-semibold">
                {camp.code} <span className="font-normal text-muted-foreground">{camp.name}</span>
              </span>
              <span className="rounded-md bg-muted px-2 py-1 text-sm text-muted-foreground">From</span>
              {via.map((code, index) => (
                <span key={`${code}-${index}`} className="flex items-center gap-2">
                  <ArrowRight className="size-3.5 text-muted-foreground" />
                  <span className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-stone-100 py-1 pl-2 pr-1 text-sm font-semibold">
                    {code}
                    <span className="font-normal text-muted-foreground">{travelHubName(code, hubs)}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${code}`}
                      onClick={() => update(camp.code, via.filter((_, i) => i !== index))}
                      className="rounded p-0.5 text-muted-foreground hover:bg-stone-200 hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                </span>
              ))}
              <ArrowRight className="size-3.5 text-muted-foreground" />
              <span className="rounded-md bg-primary/10 px-2 py-1 text-sm font-semibold text-primary">{camp.code}</span>
              <span className="ml-auto flex items-center gap-2">
                <AirportSelect
                  value={adding[camp.code] ?? ""}
                  hubs={hubs}
                  placeholder="Add a stop"
                  ariaLabel={`Add a stop on the way to ${camp.name}`}
                  className="h-8 w-44 text-sm"
                  onChange={(code) => {
                    if (!code || code === camp.code) return;
                    update(camp.code, [...via, code]);
                    setAdding((current) => ({ ...current, [camp.code]: "" }));
                  }}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
