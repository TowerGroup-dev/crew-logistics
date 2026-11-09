"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export function CrewAuthBar() {
  const [name, setName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((body: { signedIn?: boolean; session?: { name?: string } | null }) => {
        if (body.signedIn && body.session?.name) setName(body.session.name);
      })
      .catch(() => setName(null));
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!name) return null;

  return (
    <div ref={rootRef} className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm text-foreground hover:bg-muted/60"
      >
        <span className="max-w-[8rem] truncate sm:max-w-[12rem]">{name}</span>
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-1.5 min-w-[10rem] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          <a
            href="/api/auth/logout"
            role="menuitem"
            className="block px-3 py-2 text-sm text-foreground hover:bg-muted/70"
          >
            Sign out
          </a>
        </div>
      ) : null}
    </div>
  );
}
