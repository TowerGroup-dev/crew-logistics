/** Extra roles Katrina adds beyond the built-in trade list. */

import { CREW_ROLE_ORDER, CREW_ROLES } from "@/lib/crew-schedule";

const STORAGE_KEY = "tower-arctic-crew-roles-v1";

export type CrewRolesBook = {
  version: 1;
  /** Additional role names (not in CREW_ROLE_ORDER). */
  extras: string[];
};

export function emptyRolesBook(): CrewRolesBook {
  return { version: 1, extras: [] };
}

export function readRolesBook(raw: unknown): CrewRolesBook {
  if (!raw || typeof raw !== "object") return emptyRolesBook();
  const data = raw as Record<string, unknown>;
  const extras = Array.isArray(data.extras)
    ? data.extras
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
  return { version: 1, extras: [...new Set(extras)] };
}

export function loadRolesBook(): CrewRolesBook {
  if (typeof window === "undefined") return emptyRolesBook();
  try {
    return readRolesBook(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return emptyRolesBook();
  }
}

export function saveRolesBook(book: CrewRolesBook) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

export function allRoleOptions(book?: CrewRolesBook) {
  const extras = book?.extras || (typeof window !== "undefined" ? loadRolesBook().extras : []);
  return [...new Set([...CREW_ROLES, ...CREW_ROLE_ORDER, ...extras])].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function addRole(book: CrewRolesBook, role: string): CrewRolesBook {
  const name = role.trim();
  if (!name) return book;
  if ((CREW_ROLE_ORDER as readonly string[]).includes(name) || book.extras.includes(name)) return book;
  return { ...book, extras: [...book.extras, name].sort((a, b) => a.localeCompare(b)) };
}

export function removeRole(book: CrewRolesBook, role: string): CrewRolesBook {
  return { ...book, extras: book.extras.filter((item) => item !== role) };
}
