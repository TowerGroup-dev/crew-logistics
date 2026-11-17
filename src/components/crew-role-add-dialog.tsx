"use client";

import { useMemo, useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";
import { CREW_ROLE_ORDER } from "@/lib/crew-schedule";
import { cn } from "@/lib/cn";

export type RoleAddCandidate = {
  id: string;
  name: string;
  role: string;
};

export function CrewRoleAddDialog({
  sectionRole,
  people,
  onPickExisting,
  onCreateNew,
  onClose,
}: {
  sectionRole: string;
  people: RoleAddCandidate[];
  onPickExisting: (personId: string) => void;
  onCreateNew: (input: { name: string; role: string }) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState(sectionRole);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = [...people].sort((a, b) => a.name.localeCompare(b.name));
    if (!needle) return list;
    return list.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) || row.role.toLowerCase().includes(needle),
    );
  }, [people, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="role-add-title"
        className="flex max-h-[min(90dvh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 id="role-add-title" className="text-base font-semibold tracking-tight">
              Add under {sectionRole}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Pick someone or create a new person. Their previous section row is hidden.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex gap-2 border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={() => setMode("pick")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold",
              mode === "pick" ? "bg-primary text-primary-foreground" : "border border-input hover:bg-muted",
            )}
          >
            <Plus className="size-3.5" aria-hidden />
            Existing
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold",
              mode === "new" ? "bg-primary text-primary-foreground" : "border border-input hover:bg-muted",
            )}
          >
            <UserPlus className="size-3.5" aria-hidden />
            New person
          </button>
        </div>

        {mode === "pick" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border px-4 py-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or role"
                className="h-9 w-full rounded-lg border border-input bg-card px-2 text-sm"
                autoFocus
              />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-border">
              {filtered.length === 0 ? (
                <li className="px-4 py-6 text-sm text-muted-foreground">No matches.</li>
              ) : (
                filtered.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => onPickExisting(row.id)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{row.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{row.role}</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-primary">Add</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : (
          <div className="grid gap-3 px-4 py-4">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Name</span>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Full name"
                className="h-9 rounded-lg border border-input px-2 text-sm"
                autoFocus
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Role</span>
              <input
                value={newRole}
                onChange={(event) => setNewRole(event.target.value)}
                list="crew-role-add-roles"
                className="h-9 rounded-lg border border-input px-2 text-sm"
              />
              <datalist id="crew-role-add-roles">
                {(CREW_ROLE_ORDER as readonly string[]).map((role) => (
                  <option key={role} value={role} />
                ))}
              </datalist>
            </label>
            <button
              type="button"
              disabled={!newName.trim()}
              onClick={() =>
                onCreateNew({
                  name: newName.trim(),
                  role: newRole.trim() || sectionRole,
                })
              }
              className="h-9 rounded-lg bg-stone-900 px-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Create under {sectionRole}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
