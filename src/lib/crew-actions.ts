/** Persistent Katrina action-centre records, stable ids, no duplicates on reload. */

export type ActionPriority = "urgent" | "high" | "normal";
export type ActionStatus = "open" | "assigned" | "postponed" | "done";

export type CrewActionKind =
  | "return_flight"
  | "outbound_flight"
  | "accommodation"
  | "replacement"
  | "rotation_ending"
  | "rotation_overdue"
  | "actual_arrival"
  | "actual_departure"
  | "handover"
  | "changed";

export type CrewActionRecord = {
  id: string;
  kind: CrewActionKind;
  personId: string;
  personName: string;
  title: string;
  detail: string;
  priority: ActionPriority;
  dueOn: string | null;
  status: ActionStatus;
  assignedTo: string | null;
  comment: string;
  createdAt: string;
  updatedAt: string;
  postponedTo: string | null;
  completedAt: string | null;
};

export type CrewActionBook = {
  actions: CrewActionRecord[];
};

const STORAGE_KEY = "tower-arctic-crew-actions";

export function emptyActionBook(): CrewActionBook {
  return { actions: [] };
}

export function actionId(kind: CrewActionKind, personId: string, dueOn?: string | null) {
  return `${kind}:${personId}:${dueOn || "none"}`;
}

function readAction(value: unknown): CrewActionRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<CrewActionRecord>;
  if (typeof row.id !== "string" || typeof row.personId !== "string" || typeof row.title !== "string") return null;
  if (typeof row.kind !== "string") return null;
  return {
    id: row.id,
    kind: row.kind as CrewActionKind,
    personId: row.personId,
    personName: typeof row.personName === "string" ? row.personName : row.personId,
    title: row.title,
    detail: typeof row.detail === "string" ? row.detail : "",
    priority: row.priority === "urgent" || row.priority === "high" || row.priority === "normal" ? row.priority : "normal",
    dueOn: typeof row.dueOn === "string" ? row.dueOn.slice(0, 10) : null,
    status:
      row.status === "open" || row.status === "assigned" || row.status === "postponed" || row.status === "done"
        ? row.status
        : "open",
    assignedTo: typeof row.assignedTo === "string" ? row.assignedTo : null,
    comment: typeof row.comment === "string" ? row.comment : "",
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString(),
    postponedTo: typeof row.postponedTo === "string" ? row.postponedTo.slice(0, 10) : null,
    completedAt: typeof row.completedAt === "string" ? row.completedAt : null,
  };
}

export function readActionBook(value: unknown): CrewActionBook {
  if (!value || typeof value !== "object") return emptyActionBook();
  const raw = value as Partial<CrewActionBook>;
  return {
    actions: Array.isArray(raw.actions)
      ? raw.actions.map(readAction).filter((item): item is CrewActionRecord => Boolean(item))
      : [],
  };
}

export function loadActions(): CrewActionBook {
  if (typeof window === "undefined") return emptyActionBook();
  try {
    return readActionBook(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return emptyActionBook();
  }
}

export function saveActions(book: CrewActionBook) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

export type ActionSeed = Omit<
  CrewActionRecord,
  "status" | "assignedTo" | "comment" | "createdAt" | "updatedAt" | "postponedTo" | "completedAt"
>;

/**
 * Merge generated seeds into the book without duplicating.
 * - New seeds → open
 * - Existing open/assigned/postponed → refresh title/detail/due/priority
 * - Done actions stay done even if seed still present
 * - Seeds that disappear are left as-is if done; otherwise removed when no longer applicable
 */
export function syncActionSeeds(book: CrewActionBook, seeds: ActionSeed[], asOf: string): CrewActionBook {
  const byId = new Map(book.actions.map((row) => [row.id, row]));
  const seedIds = new Set(seeds.map((seed) => seed.id));
  const now = new Date().toISOString();

  for (const seed of seeds) {
    const existing = byId.get(seed.id);
    if (!existing) {
      byId.set(seed.id, {
        ...seed,
        status: "open",
        assignedTo: null,
        comment: "",
        createdAt: now,
        updatedAt: now,
        postponedTo: null,
        completedAt: null,
      });
      continue;
    }
    if (existing.status === "done") continue;
    if (existing.status === "postponed" && existing.postponedTo && existing.postponedTo > asOf) continue;
    byId.set(seed.id, {
      ...existing,
      title: seed.title,
      detail: seed.detail,
      priority: seed.priority,
      dueOn: seed.dueOn,
      personName: seed.personName,
      updatedAt: now,
      status: existing.status === "postponed" && existing.postponedTo && existing.postponedTo <= asOf ? "open" : existing.status,
    });
  }

  for (const [id, row] of [...byId.entries()]) {
    if (seedIds.has(id)) continue;
    if (row.status === "done") continue;
    byId.delete(id);
  }

  return {
    actions: [...byId.values()].sort((a, b) => {
      const rank = (p: ActionPriority) => (p === "urgent" ? 0 : p === "high" ? 1 : 2);
      const statusRank = (s: ActionStatus) => (s === "done" ? 3 : s === "postponed" ? 2 : 0);
      return (
        statusRank(a.status) - statusRank(b.status) ||
        rank(a.priority) - rank(b.priority) ||
        (a.dueOn || "9999").localeCompare(b.dueOn || "9999") ||
        a.personName.localeCompare(b.personName)
      );
    }),
  };
}

export function patchAction(
  book: CrewActionBook,
  id: string,
  patch: Partial<Pick<CrewActionRecord, "status" | "assignedTo" | "comment" | "postponedTo" | "completedAt">>,
): CrewActionBook {
  const now = new Date().toISOString();
  return {
    actions: book.actions.map((row) =>
      row.id === id
        ? {
            ...row,
            ...patch,
            updatedAt: now,
            completedAt: patch.status === "done" ? patch.completedAt || now : patch.status ? null : row.completedAt,
          }
        : row,
    ),
  };
}

export function openActionCount(book: CrewActionBook) {
  return book.actions.filter((row) => row.status === "open" || row.status === "assigned").length;
}
