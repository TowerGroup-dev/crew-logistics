import { afterEach, describe, expect, it, vi } from "vitest";

type Bag = Map<string, string>;

/**
 * Node has no Storage. Provide a Storage constructor whose prototype methods
 * back onto a WeakMap, so installTestStorage can wrap Storage.prototype and
 * still hit the same bags (same as the browser).
 */
function installBrowserShims(href = "http://localhost/?test=1") {
  const bags = new WeakMap<object, Bag>();

  class Storage {
    constructor() {
      bags.set(this, new Map());
    }
    get length() {
      return bags.get(this)?.size ?? 0;
    }
    clear() {
      bags.get(this)?.clear();
    }
    getItem(key: string) {
      const bag = bags.get(this);
      return bag?.has(key) ? bag.get(key)! : null;
    }
    key(index: number) {
      const bag = bags.get(this);
      return bag ? [...bag.keys()][index] ?? null : null;
    }
    removeItem(key: string) {
      bags.get(this)?.delete(key);
    }
    setItem(key: string, value: string) {
      bags.get(this)?.set(key, String(value));
    }
  }

  vi.stubGlobal("Storage", Storage);

  const sessionStorage = new Storage();
  const localStorage = new Storage();

  const realFetchCalls: Array<{ url: string; method: string }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || "GET").toUpperCase();
    realFetchCalls.push({ url, method });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  const location = {
    href,
    pathname: new URL(href).pathname,
    search: new URL(href).search,
    hash: new URL(href).hash,
  };

  vi.stubGlobal("window", {
    sessionStorage,
    localStorage,
    location,
    history: {
      state: null,
      replaceState(_state: unknown, _title: string, url: string) {
        const next = new URL(url, "http://localhost");
        location.href = next.href;
        location.pathname = next.pathname;
        location.search = next.search;
        location.hash = next.hash;
      },
    },
    fetch: fetchMock,
    dispatchEvent() {
      return true;
    },
  });
  vi.stubGlobal("sessionStorage", sessionStorage);
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("fetch", fetchMock);

  return {
    sessionStorage,
    localStorage,
    realFetchCalls,
    rawLocal: () => bags.get(localStorage)!,
    rawSession: () => bags.get(sessionStorage)!,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("crew-test-mode", () => {
  it("enterTestModeFromUrl sets the flag and strips ?test=1 from the address", async () => {
    installBrowserShims("http://localhost/board?test=1#x");
    const mod = await import("@/lib/crew-test-mode");
    expect(mod.isTestMode()).toBe(false);
    mod.enterTestModeFromUrl();
    expect(mod.isTestMode()).toBe(true);
    expect(sessionStorage.getItem("crew-test-mode")).toBe("1");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#x");
  });

  it("writes stay in the session overlay, not the live localStorage map", async () => {
    const { localStorage, sessionStorage, rawLocal } = installBrowserShims();
    rawLocal().set("crew-roster", JSON.stringify({ live: true }));

    const mod = await import("@/lib/crew-test-mode");
    mod.enterTestModeFromUrl();
    mod.installTestStorage();

    localStorage.setItem("crew-roster", JSON.stringify({ test: true }));

    expect(sessionStorage.getItem("crew-test:crew-roster")).toBe(JSON.stringify({ test: true }));
    expect(rawLocal().get("crew-roster")).toBe(JSON.stringify({ live: true }));
    expect(JSON.parse(localStorage.getItem("crew-roster")!)).toEqual({ test: true });
  });

  it("blocks POST /api/state so Test Mode never writes live shared state", async () => {
    const { realFetchCalls } = installBrowserShims();
    const mod = await import("@/lib/crew-test-mode");
    mod.enterTestModeFromUrl();
    mod.installTestStorage();

    const blocked = await window.fetch("/api/state", {
      method: "POST",
      body: JSON.stringify({ docs: {} }),
    });
    expect(blocked.status).toBe(200);
    expect(await blocked.json()).toEqual({ ok: true, testMode: true });
    expect(realFetchCalls.some((call) => call.url.includes("/api/state"))).toBe(false);

    await window.fetch("/api/state", { method: "GET" });
    expect(realFetchCalls.some((call) => call.url.includes("/api/state") && call.method === "GET")).toBe(
      true,
    );
  });
});
