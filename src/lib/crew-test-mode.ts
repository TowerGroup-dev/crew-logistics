/**
 * Test Mode: a private sandbox inside the real app.
 *
 * Open any page with ?test=1 (or ?practice=1). That browser tab then:
 *  - starts from a fresh copy of the live data (read only from the server),
 *  - keeps every change in the tab itself (sessionStorage), never in the real browser copy,
 *  - never sends anything to the server: no saves (/api/state) and no emails (/api/notify).
 * Closing the tab, "Reset test" or "Leave Test Mode" throws all of it away.
 *
 * Everything is switched on before the board loads (see crew-workspace.tsx), so no page
 * can read or write real data first.
 */

const FLAG = "crew-test-mode";
const OVERLAY = "crew-test:";
const GONE = "crew-test-gone:";
const LOADED = "crew-test-loaded";

export const TEST_MODE_EVENT = "crew-test-mode-change";
export const TEST_EMAIL_EVENT = "crew-test-email";
const EMAILS = "crew-test-emails";

export type TestEmail = { kind: string; to: string; subject: string; text: string; html: string; at?: string };

/** Emails that would have been sent during this test (newest first). */
export function testEmails(): TestEmail[] {
  try {
    return JSON.parse(sessionStorage.getItem(EMAILS) || "[]") as TestEmail[];
  } catch {
    return [];
  }
}

function recordTestEmail(email: TestEmail) {
  const list = [{ ...email, at: new Date().toISOString() }, ...testEmails()].slice(0, 30);
  sessionStorage.setItem(EMAILS, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(TEST_EMAIL_EVENT, { detail: list[0] }));
}

function hasWindow() {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

/** Turns Test Mode on when the address has ?test=1 / ?practice=1, then tidies the address. */
export function enterTestModeFromUrl() {
  if (!hasWindow()) return;
  const url = new URL(window.location.href);
  // Also catches the flag tucked inside a sign-in redirect (e.g. /sign-in?next=%2F%3Ftest%3D1).
  let href = window.location.href;
  try {
    href = decodeURIComponent(href);
  } catch {}
  const on = /[?&](test|practice)=(1|true|yes)\b/i.test(href);
  if (!on) return;
  sessionStorage.setItem(FLAG, "1");
  url.searchParams.delete("test");
  url.searchParams.delete("practice");
  window.history.replaceState(window.history.state, "", url.pathname + (url.search ? url.search : "") + url.hash);
}

export function isTestMode() {
  return hasWindow() && sessionStorage.getItem(FLAG) === "1";
}

function wipeOverlay() {
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (
      key &&
      (key.startsWith(OVERLAY) ||
        key.startsWith(GONE) ||
        key === LOADED ||
        key === EMAILS ||
        key.startsWith("crew-test-guide"))
    ) {
      keys.push(key);
    }
  }
  for (const key of keys) sessionStorage.removeItem(key);
}

/** Back to a fresh copy of live data, still in Test Mode. */
export function resetTest() {
  if (!hasWindow()) return;
  wipeOverlay();
  window.location.reload();
}

/** Back to the normal app (real data, real saving). */
export function leaveTestMode() {
  if (!hasWindow()) return;
  wipeOverlay();
  sessionStorage.removeItem(FLAG);
  window.location.href = "/";
}

let installed = false;

/**
 * Sends every read and write of this tab's localStorage to a private overlay instead.
 * Reads fall back to the real copy for things the test never touched (view settings etc.);
 * shared schedule data is always loaded fresh from the server first (loadLiveCopy).
 */
export function installTestStorage() {
  if (!hasWindow() || installed || !isTestMode()) return;
  installed = true;
  const proto = Storage.prototype;
  const realGet = proto.getItem;
  const realSet = proto.setItem;
  const realRemove = proto.removeItem;

  proto.getItem = function getItem(this: Storage, key: string) {
    if (this !== localStorage) return realGet.call(this, key);
    if (realGet.call(sessionStorage, GONE + key) === "1") return null;
    const own = realGet.call(sessionStorage, OVERLAY + key);
    return own !== null ? own : realGet.call(localStorage, key);
  };
  proto.setItem = function setItem(this: Storage, key: string, value: string) {
    if (this !== localStorage) return realSet.call(this, key, value);
    realRemove.call(sessionStorage, GONE + key);
    realSet.call(sessionStorage, OVERLAY + key, String(value));
  };
  proto.removeItem = function removeItem(this: Storage, key: string) {
    if (this !== localStorage) return realRemove.call(this, key);
    realRemove.call(sessionStorage, OVERLAY + key);
    realSet.call(sessionStorage, GONE + key, "1");
  };

  // Belt and braces: even if some code tries, nothing that changes data leaves this tab.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (typeof input === "object" && "method" in input ? input.method : "GET") || "GET").toUpperCase();
    const path = url.startsWith("http") ? new URL(url).pathname : url;
    const writes = method !== "GET" && method !== "HEAD";
    if (writes && path.startsWith("/api/notify")) {
      // Show the email instead of sending it.
      try {
        const body = typeof init?.body === "string" ? (JSON.parse(init.body) as TestEmail) : null;
        if (body) recordTestEmail(body);
      } catch {}
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, testMode: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    }
    if (writes && (path.startsWith("/api/state") || path.startsWith("/api/briefing"))) {
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, testMode: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    }
    return realFetch(input, init);
  };
}

/**
 * Loads a fresh copy of the live shared data into this tab's overlay, once per test.
 * Only reads from the server.
 */
export async function loadLiveCopy(keys: readonly string[]) {
  if (!isTestMode()) return;
  if (sessionStorage.getItem(LOADED) === "1") return;
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) return;
    const { docs } = (await response.json()) as { docs: Record<string, { value: unknown } | undefined> };
    for (const key of keys) {
      const doc = docs[key];
      if (doc && doc.value !== undefined && doc.value !== null) localStorage.setItem(key, JSON.stringify(doc.value));
      else localStorage.removeItem(key);
    }
    sessionStorage.setItem(LOADED, "1");
  } catch {
    // Offline: the test starts from this browser's last copy, still never saved anywhere.
  }
}
