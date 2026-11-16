"use client";

import { Eye } from "lucide-react";

export function CrewScheduleHiddenBar({
  hidden,
  onShow,
  onShowAll,
}: {
  hidden: { id: string; name: string }[];
  onShow: (personId: string) => void;
  onShowAll: () => void;
}) {
  if (!hidden.length) return null;

  const sorted = hidden.slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Eye className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="font-medium">
          {hidden.length} hidden — click a name to show that person
        </p>
        <button
          type="button"
          onClick={onShowAll}
          className="ml-auto shrink-0 text-sm font-medium text-primary hover:underline"
        >
          Show all
        </button>
      </div>
      <ul className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {sorted.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              title={`Show ${person.name}`}
              aria-label={`Show ${person.name}`}
              onClick={() => onShow(person.id)}
              className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-left text-sm font-medium hover:border-primary hover:bg-primary/5"
            >
              <Eye className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{person.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
