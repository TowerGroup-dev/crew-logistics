/**
 * Keeps the shared parts of browser storage in step with the server, so everyone
 * on every computer sees the same bookings, moves, notes and stays.
 *
 * - Every save to a shared key is sent to the server shortly after (debounced).
 * - Other people's saves are pulled every 15 seconds and when the tab comes back.
 * - Simultaneous edits merge record by record (see crew-merge.ts).
 * - Offline: changes stay in the browser and go up when the connection is back.
 */
import { fillMissing, merge3 } from "@/lib/crew-merge";
import { SHARED_KEYS, isSharedKey, type SharedDoc, type SharedKey } from "@/lib/crew-sync-keys";

export const SYNC_CHANGE_EVENT = "crew-sync-change";
const POLL_MS = 15_000;
const PUSH_DELAY_MS = 600;
const META = "crew-sync:";

export type SyncStatus = {
  state: "starting" | "saved" | "saving" | "offline" | "error";
  /** Last time this browser's change reached the server (ISO). */
  savedAt: string | null;
  /** Latest save on the server by anyone. */
  lastBy: string | null;
  lastAt: string | null;
  error: string | null;
};

let status: SyncStatus = { state: "starting", savedAt: null, lastBy: null, lastAt: null, error: null };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const listener of listeners) listener();
}
export function getSyncStatus() {
  return status;
}
export function subscribeSync(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Raw storage access that does not trigger a push.

let rawSet: (key: string, value: string) => void = () => {};
let rawRemove: (key: string) => void = () => {};

function readJson(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    return text == null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

function baseOf(key: SharedKey) {
  return readJson(`${META}base:${key}`);
}
function revOf(key: SharedKey) {
  return Number(localStorage.getItem(`${META}rev:${key}`) || 0);
}
function remember(key: SharedKey, doc: SharedDoc) {
  rawSet(`${META}base:${key}`, JSON.stringify(doc.value));
  rawSet(`${META}rev:${key}`, String(doc.rev));
  if (doc.resetAt) rawSet(`${META}reset:${key}`, doc.resetAt);
  if (!status.lastAt || doc.at > status.lastAt) setStatus({ lastBy: doc.by, lastAt: doc.at });
}
function writeLocal(key: SharedKey, value: unknown) {
  if (value === null || value === undefined) rawRemove(key);
  else rawSet(key, JSON.stringify(value));
}

/** A fresh copy of live data was pulled down since this browser last looked: take it as is. */
function isNewReset(key: SharedKey, doc: SharedDoc) {
  return Boolean(doc.resetAt && doc.resetAt !== localStorage.getItem(`${META}reset:${key}`));
}

function takeAsIs(key: SharedKey, doc: SharedDoc) {
  clearTimeout(timers.get(key));
  dirty.delete(key);
  saveDirty();
  writeLocal(key, doc.value);
  remember(key, doc);
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Tell the open pages that shared data changed underneath them. */
function announce(keys: SharedKey[]) {
  if (!keys.length) return;
  window.dispatchEvent(new CustomEvent(SYNC_CHANGE_EVENT, { detail: { keys } }));
}

// ---------------------------------------------------------------------------
// Pushing this browser's changes.

const dirty = new Set<SharedKey>(readDirty());
const timers = new Map<SharedKey, ReturnType<typeof setTimeout>>();
const inFlight = new Set<SharedKey>();

function readDirty(): SharedKey[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(`${META}dirty`) || "[]") as string[];
    return list.filter(isSharedKey);
  } catch {
    return [];
  }
}
function saveDirty() {
  rawSet(`${META}dirty`, JSON.stringify([...dirty]));
}

function markDirty(key: SharedKey) {
  dirty.add(key);
  saveDirty();
  setStatus({ state: navigator.onLine === false ? "offline" : "saving" });
  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => void push(key), PUSH_DELAY_MS),
  );
}

async function push(key: SharedKey) {
  if (inFlight.has(key)) return; // The running push re-checks when it finishes.
  const value = readJson(key);
  if (value === undefined) {
    dirty.delete(key);
    saveDirty();
    return;
  }
  inFlight.add(key);
  try {
    const response = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, base: baseOf(key) ?? null, baseRev: revOf(key) }),
    });
    if (response.status === 401) {
      setStatus({ state: "error", error: "Signed out. Sign in again to save." });
      return;
    }
    if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || `Save failed (${response.status})`);
    const { doc } = (await response.json()) as { doc: SharedDoc; merged: boolean };
    const nowLocal = readJson(key);
    const changedMeanwhile = !same(nowLocal, value);
    remember(key, doc);
    if (!changedMeanwhile) {
      dirty.delete(key);
      saveDirty();
      // Someone else's changes were merged in: show them here too.
      if (!same(doc.value, value)) {
        writeLocal(key, doc.value);
        announce([key]);
      }
    }
    setStatus({ savedAt: new Date().toISOString(), error: null });
    if (changedMeanwhile) markDirty(key);
  } catch (error) {
    setStatus({
      state: navigator.onLine === false ? "offline" : "error",
      error: error instanceof Error ? error.message : "Could not save.",
    });
    // Try again a little later.
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => void push(key), 10_000),
    );
    return;
  } finally {
    inFlight.delete(key);
  }
  if (!dirty.size && !inFlight.size) setStatus({ state: "saved" });
}

// ---------------------------------------------------------------------------
// Pulling everyone else's changes.

async function fetchDocs(all: boolean) {
  const query = all ? "" : `?revs=${SHARED_KEYS.map((key) => `${key}:${revOf(key)}`).join(",")}`;
  const response = await fetch(`/api/state${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Sync failed (${response.status})`);
  return ((await response.json()) as { docs: Partial<Record<SharedKey, SharedDoc>> }).docs;
}

async function pull() {
  if (document.visibilityState === "hidden") return;
  try {
    const docs = await fetchDocs(false);
    const changed: SharedKey[] = [];
    for (const key of SHARED_KEYS) {
      const doc = docs[key];
      if (!doc || doc.rev <= revOf(key)) continue;
      if (isNewReset(key, doc)) {
        takeAsIs(key, doc);
        changed.push(key);
        continue;
      }
      if (dirty.has(key) || inFlight.has(key)) continue; // Our push will merge with it.
      const local = readJson(key);
      const merged = local === undefined ? doc.value : merge3(baseOf(key), local, doc.value);
      remember(key, doc);
      if (!same(merged, local)) {
        writeLocal(key, merged);
        changed.push(key);
      }
      if (!same(merged, doc.value)) markDirty(key);
    }
    announce(changed);
    if (!dirty.size && !inFlight.size) setStatus({ state: "saved", error: null });
  } catch {
    setStatus({ state: navigator.onLine === false ? "offline" : "error" });
  }
}

// ---------------------------------------------------------------------------
// Start-up: bring this browser in line with the server before the pages load.

let started: Promise<void> | null = null;

export function startSync(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (started) return started;

  const proto = Storage.prototype;
  const originalSet = proto.setItem;
  const originalRemove = proto.removeItem;
  rawSet = (key, value) => originalSet.call(localStorage, key, value);
  rawRemove = (key) => originalRemove.call(localStorage, key);
  proto.setItem = function setItem(this: Storage, key: string, value: string) {
    const before = this === localStorage && isSharedKey(key) ? localStorage.getItem(key) : null;
    originalSet.call(this, key, value);
    if (this === localStorage && isSharedKey(key) && before !== value) markDirty(key);
  };
  proto.removeItem = function removeItem(this: Storage, key: string) {
    originalRemove.call(this, key);
  };
  void rawRemove;

  started = (async () => {
    try {
      const docs = await fetchDocs(true);
      for (const key of SHARED_KEYS) {
        const doc = docs[key];
        const local = readJson(key);
        if (!doc) {
          if (local !== undefined) markDirty(key); // First person to share this data.
          continue;
        }
        if (isNewReset(key, doc)) {
          takeAsIs(key, doc);
          continue;
        }
        const base = baseOf(key);
        const merged =
          local === undefined
            ? doc.value
            : base === undefined
              ? fillMissing(doc.value, local) // This browser's first sync: keep shared, add what's missing.
              : merge3(base, local, doc.value);
        remember(key, doc);
        if (!same(merged, local)) writeLocal(key, merged);
        if (!same(merged, doc.value)) markDirty(key);
        else if (dirty.has(key)) {
          dirty.delete(key);
          saveDirty();
        }
      }
      setStatus({ state: dirty.size ? "saving" : "saved", error: null });
      for (const key of dirty) void push(key);
    } catch {
      // Server unreachable: work from this browser's copy and catch up later.
      setStatus({ state: "offline" });
    }

    window.setInterval(() => void pull(), POLL_MS);
    const catchUp = () => {
      if (document.visibilityState === "visible") {
        void pull();
        for (const key of dirty) void push(key);
      }
    };
    document.addEventListener("visibilitychange", catchUp);
    window.addEventListener("focus", catchUp);
    window.addEventListener("online", catchUp);
  })();
  return started;
}
