"use client";

import { useEffect, useState } from "react";

export function CrewAuthBar() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((response) => response.json())
      .then((body: { signedIn?: boolean; session?: { name?: string } | null }) => {
        if (body.signedIn && body.session?.name) setName(body.session.name);
      })
      .catch(() => setName(null));
  }, []);

  if (!name) return null;

  return (
    <div className="ml-auto flex items-center gap-3 text-sm">
      <span className="hidden text-muted-foreground sm:inline">{name}</span>
      <a href="/api/auth/logout" className="text-primary hover:underline">
        Sign out
      </a>
    </div>
  );
}
