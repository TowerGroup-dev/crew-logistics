/**
 * Test Mode system log: what testers experienced, sent to the server so Yimika can review it
 * at /test-log. Only runs in Test Mode. It never touches schedule data.
 *
 * Records: page views and how long each took to show, freezes (long tasks), errors, slow or
 * failed requests, page size (elements on screen, memory), emails that would have gone out,
 * and who was testing for how long.
 */

export type TestLogEvent =
  | { t: "start"; ua: string; screen: string }
  | { t: "page"; path: string; ms: number | null; nodes: number; heapMb: number | null }
  | { t: "freeze"; path: string; ms: number }
  | { t: "error"; path: string; message: string }
  | { t: "request"; path: string; url: string; method: string; status: number; ms: number }
  | { t: "email"; path: string; kind: string; subject: string }
  /** What the tester wrote: on a page (works / problem / suggestion) or when leaving (overall). */
  | { t: "feedback"; path: string; kind: FeedbackKind; text: string }
  | { t: "ping" }

export type FeedbackKind = "works" | "problem" | "suggestion" | "overall";

export type TestLogLine = TestLogEvent & { at: string; session: string; tester: string };

const SESSION = "crew-test-session";
const NAME = "crew-test-name";

let queue: TestLogLine[] = [];
let started = false;
let lastClick = 0;

export function testerName() {
  return (typeof sessionStorage !== "undefined" && sessionStorage.getItem(NAME)) || "";
}
export function setTesterName(name: string) {
  sessionStorage.setItem(NAME, name.trim());
}

function sessionId() {
  let id = sessionStorage.getItem(SESSION);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(SESSION, id);
  }
  return id;
}

export function logTest(event: TestLogEvent) {
  if (typeof window === "undefined") return;
  queue.push({ ...event, at: new Date().toISOString(), session: sessionId(), tester: testerName() || "Unnamed tester" } as TestLogLine);
  if (queue.length >= 40) flush();
}

/** Send what is queued now (feedback should not wait for the 30-second heartbeat). */
export function flushTestLog(useBeacon = false) {
  flush(useBeacon);
}

function flush(useBeacon = false) {
  if (!queue.length) return;
  const body = JSON.stringify({ lines: queue.slice(0, 200) });
  queue = queue.slice(200);
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/test-log", new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch("/api/test-log", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

function path() {
  return window.location.pathname;
}

/** Call when the page (route) changes; measures time since the click that caused it. */
export function logPageView() {
  const since = lastClick ? performance.now() - lastClick : null;
  lastClick = 0;
  // Let the page draw, then measure how much it had to draw.
  setTimeout(() => {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    logTest({
      t: "page",
      path: path(),
      ms: since !== null && since < 30000 ? Math.round(since + 0) : firstLoadMs(),
      nodes: document.getElementsByTagName("*").length,
      heapMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    });
  }, 0);
}

let firstLoadUsed = false;
function firstLoadMs(): number | null {
  if (firstLoadUsed) return null;
  firstLoadUsed = true;
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav ? Math.round(nav.domContentLoadedEventEnd || nav.responseEnd) : null;
}

/** Starts the recorders. Safe to call more than once. */
export function startTestLog() {
  if (started || typeof window === "undefined") return;
  started = true;
  logTest({ t: "start", ua: navigator.userAgent, screen: `${window.innerWidth}x${window.innerHeight}` });

  document.addEventListener("click", () => (lastClick = performance.now()), true);

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 200) logTest({ t: "freeze", path: path(), ms: Math.round(entry.duration) });
      }
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    // Browser without long-task support (Safari/Firefox): freezes just aren't recorded.
  }

  window.addEventListener("error", (e) => logTest({ t: "error", path: path(), message: String(e.message || e.error || "Error").slice(0, 300) }));
  window.addEventListener("unhandledrejection", (e) =>
    logTest({ t: "error", path: path(), message: String((e.reason && (e.reason.message || e.reason)) || "Promise rejected").slice(0, 300) }),
  );

  // Time every call to the app's own server.
  const innerFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const local = url.startsWith("/") || url.startsWith(window.location.origin);
    if (!local || url.includes("/api/test-log")) return innerFetch(input, init);
    const t0 = performance.now();
    const method = (init?.method || "GET").toUpperCase();
    try {
      const res = await innerFetch(input, init);
      const ms = Math.round(performance.now() - t0);
      if (ms > 800 || !res.ok) logTest({ t: "request", path: path(), url: url.replace(window.location.origin, "").slice(0, 120), method, status: res.status, ms });
      return res;
    } catch (error) {
      logTest({ t: "request", path: path(), url: url.slice(0, 120), method, status: 0, ms: Math.round(performance.now() - t0) });
      throw error;
    }
  };

  // Heartbeat for "how long did they test", and regular sending.
  window.setInterval(() => {
    logTest({ t: "ping" });
    flush();
  }, 30000);
  window.addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush(true));
}
