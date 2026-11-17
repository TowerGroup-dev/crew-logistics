/** Calendar role-section membership keys (Month / Year). */

import { normalizeRole } from "@/lib/crew-schedule";

export function roleRowKey(personId: string, role: string) {
  return `${personId}::${normalizeRole(role)}`;
}

export function parseRoleRowKey(key: string): { personId: string; role: string } | null {
  const idx = key.indexOf("::");
  if (idx <= 0) return null;
  return { personId: key.slice(0, idx), role: key.slice(idx + 2) };
}
