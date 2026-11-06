"use client";

import { useState } from "react";
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
  const [open, setOpen] = useState(false);
  if (!hidden.length) return null;

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Eye className="size-4 text-muted-foreground" aria-hidden />
        <p className="font-medium">
          {hidden.length} hidden from this calendar
        </p>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="text-primary hover:underline"
        >
          {open ? "Close" : "Manage"}
        </button>
        <button type="button" onClick={onShowAll} className="ml-auto text-sm font-medium text-primary hover:underline">
          Show all
        </button>
      </div>
      {open ? (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto border-t border-border pt-2">
          {hidden
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((person) => (
              <li key={person.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{person.name}</span>
                <button
                  type="button"
                  onClick={() => onShow(person.id)}
                  className="shrink-0 text-sm font-medium text-primary hover:underline"
                >
                  Show
                </button>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
