/**
 * Browser storage keys that everyone shares (saved on the server, synced to every
 * computer). Anything not listed stays personal to one browser (e.g. view settings).
 */
export const SHARED_KEYS = [
  "tower-arctic-crew-roster",
  "tower-arctic-crew-rotations-v1",
  "tower-arctic-crew-ops",
  "tower-arctic-crew-flights",
  "tower-arctic-crew-stopovers-v1",
  "tower-arctic-crew-sites-v1",
  "tower-arctic-crew-travel-hubs-v1",
  "tower-arctic-crew-routes-v2",
  "tower-arctic-crew-roles-v1",
  "tower-arctic-crew-years",
  "tower-arctic-crew-actions",
  "tower-arctic-crew-reminders",
  "tower-arctic-crew-checklist-done-v1",
  "tower-arctic-crew-activity-log-v1",
  "tower-arctic-crew-notify",
] as const;

export type SharedKey = (typeof SHARED_KEYS)[number];

export function isSharedKey(key: string): key is SharedKey {
  return (SHARED_KEYS as readonly string[]).includes(key);
}

/** One shared document as the server keeps it. */
export type SharedDoc = {
  value: unknown;
  /** Goes up by one on every save. */
  rev: number;
  /** Who saved last, and when (ISO). */
  by: string;
  at: string;
  /** Set when a fresh copy of live data was pulled down (npm run data:pull): browsers take it as is. */
  resetAt?: string;
};
