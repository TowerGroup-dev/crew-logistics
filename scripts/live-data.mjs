#!/usr/bin/env node
/**
 * Keep your local app's data and the live app's data the same.
 *
 *   npm run data:pull     Copy the live schedule down to your computer.
 *   npm run data:sync     Force-pull live → local (overwrites unpushed local edits).
 *   npm run data:push     Send your local changes up (merged with anything
 *                         others changed live since your last pull).
 *   npm run data:status   Show what you changed locally and haven't pushed.
 *
 * `npm run dev` soft-pulls first (try-pull) so local .data stays close to live
 * when the network can reach CREW_LIVE_URL; it never blocks startup.
 *
 * Needs in .env.local (never committed):
 *   CREW_LIVE_URL=https://<your-app>.azurewebsites.net
 *   CREW_LIVE_PASSWORD=<the Office password>   (optional: falls back to CREW_PASSWORD)
 *
 * Local data lives in .data/ (what `npm run dev` reads and writes).
 * .data/.live-base/ remembers what live looked like at your last pull or push,
 * so a push only sends what YOU changed and never undoes someone else's work.
 */
import { promises as fs } from "fs";
import path from "path";
import readline from "readline";

const ROOT = process.cwd();
const DATA = process.env.CREW_DATA_DIR || path.join(ROOT, ".data");
const BASE = path.join(DATA, ".live-base");

async function readEnvFile() {
  const env = {};
  for (const name of [".env.local", ".env"]) {
    try {
      const text = await fs.readFile(path.join(ROOT, name), "utf8");
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match && !(match[1] in env)) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      // file missing is fine
    }
  }
  return env;
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value));
  await fs.rename(tmp, file);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const short = (key) => key.replace(/^tower-arctic-crew-/, "").replace(/-v\d+$/, "");

function fetchHint(error) {
  const cause = error && typeof error === "object" && "cause" in error ? error.cause : null;
  const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "DNS lookup failed — check CREW_LIVE_URL and your network/VPN.";
  }
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENETUNREACH") {
    return "Could not reach the live host — check VPN/firewall and that the app is up.";
  }
  return "Check CREW_LIVE_URL, network/VPN, and that the live app is running.";
}

async function connect() {
  const env = { ...(await readEnvFile()), ...process.env };
  const url = (env.CREW_LIVE_URL || "").replace(/\/+$/, "");
  // Same Office password as the app itself unless live uses a different one.
  const password = env.CREW_LIVE_PASSWORD || env.CREW_PASSWORD || "";
  if (!url || !password) {
    console.error(
      "Add these two lines to .env.local first (this file is never committed):\n" +
        "  CREW_LIVE_URL=https://<your-app>.azurewebsites.net\n" +
        "  CREW_LIVE_PASSWORD=<the Office password>   (or set CREW_PASSWORD)",
    );
    process.exit(1);
  }
  let login;
  try {
    login = await fetch(`${url}/api/auth/local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Office", password }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach ${url} (${detail}). ${fetchHint(error)}`);
  }
  if (!login.ok) {
    console.error(`Could not sign in to ${url} (${login.status}). Check CREW_LIVE_URL and CREW_LIVE_PASSWORD.`);
    process.exit(1);
  }
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  return {
    url,
    async get() {
      const response = await fetch(`${url}/api/state`, { headers: { cookie } });
      if (!response.ok) throw new Error(`Reading live data failed (${response.status})`);
      return (await response.json()).docs;
    },
    async put(body) {
      const response = await fetch(`${url}/api/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Saving ${short(body.key)} failed (${response.status})`);
      return response.json();
    },
  };
}

/** Local data files, and what live looked like when we last synced. */
async function localState() {
  let names = [];
  try {
    names = (await fs.readdir(DATA)).filter((name) => name.startsWith("tower-arctic-") && name.endsWith(".json"));
  } catch {
    // no local data yet
  }
  const keys = new Set(names.map((name) => name.slice(0, -5)));
  try {
    for (const name of await fs.readdir(BASE)) if (name.endsWith(".json")) keys.add(name.slice(0, -5));
  } catch {
    // never pulled
  }
  const rows = [];
  for (const key of [...keys].sort()) {
    const local = await readJson(path.join(DATA, `${key}.json`));
    const base = await readJson(path.join(BASE, `${key}.json`));
    rows.push({ key, local, base, changed: base ? !same(local?.value, base.value) : false, neverPulled: !base });
  }
  return rows;
}

/** Write a live copy into local data; resetAt tells open local browsers to take it as is. */
async function adoptLive(key, doc, previousLocal) {
  const now = new Date().toISOString();
  await writeJson(path.join(DATA, `${key}.json`), {
    value: doc.value,
    rev: Math.max(previousLocal?.rev ?? 0, doc.rev) + 1,
    by: "live copy",
    at: now,
    resetAt: now,
  });
  await writeJson(path.join(BASE, `${key}.json`), { rev: doc.rev, value: doc.value, at: now });
}

async function ask(question) {
  if (process.argv.includes("--yes")) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return /^y(es)?$/i.test(String(answer).trim());
}

async function status() {
  const rows = await localState();
  if (!rows.length || rows.every((row) => row.neverPulled)) {
    console.log("No live copy yet. Run: npm run data:pull");
    return [];
  }
  const changed = rows.filter((row) => row.changed);
  if (!changed.length) console.log("Local data matches your last pull/push. Nothing to push.");
  else {
    console.log("Changed locally, not pushed yet:");
    for (const row of changed) console.log(`  - ${short(row.key)}`);
  }
  return changed;
}

async function summarizeRoster() {
  const roster = await readJson(path.join(DATA, "tower-arctic-crew-roster.json"));
  const value = roster?.value;
  if (!value || typeof value !== "object") {
    console.log("Roster: (none on file yet)");
    return;
  }
  const employees = Array.isArray(value.employees) ? value.employees : [];
  const removed = value.removedPersonIds && typeof value.removedPersonIds === "object"
    ? Object.keys(value.removedPersonIds).length
    : 0;
  console.log(
    `Roster: ${employees.length} added employee(s)` +
      (removed ? `, ${removed} removed` : "") +
      ". Open Employees after refresh — browser sync picks this up within 15s.",
  );
}

async function pullFromLive({ force = false, soft = false } = {}) {
  const rows = await localState();
  const unpushed = rows.filter((row) => row.changed);
  if (unpushed.length && !force) {
    console.log("You have local changes that are not on live yet:");
    for (const row of unpushed) console.log(`  - ${short(row.key)}`);
    if (soft) {
      console.log("Skipping pull so those edits stay. Run npm run data:push, or npm run data:sync to overwrite.");
      return false;
    }
    console.log("Run `npm run data:push` first to keep them, or `npm run data:sync` to throw them away.");
    process.exit(1);
  }
  const live = await connect();
  const docs = await live.get();
  const keys = Object.keys(docs);
  for (const key of keys) {
    const previous = rows.find((row) => row.key === key)?.local;
    await adoptLive(key, docs[key], previous);
  }
  // Local-only test data that live doesn't have: clear it so local matches live.
  for (const row of rows) {
    if (!docs[row.key] && row.local) {
      const now = new Date().toISOString();
      await writeJson(path.join(DATA, `${row.key}.json`), {
        value: null,
        rev: (row.local.rev ?? 0) + 1,
        by: "live copy",
        at: now,
        resetAt: now,
      });
      await fs.rm(path.join(BASE, `${row.key}.json`), { force: true });
    }
  }
  console.log(`Copied ${keys.length} kinds of data from ${live.url}.`);
  await summarizeRoster();
  console.log("Local .data now matches live. Open/refresh the app; tabs update within 15 seconds.");
  return true;
}

async function pull() {
  await pullFromLive({ force: process.argv.includes("--force") });
}

/** Soft pull for `npm run dev`: never blocks startup if live is unreachable. */
async function tryPull() {
  try {
    await pullFromLive({ force: false, soft: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`Live pull skipped (${detail})`);
    console.warn("Dev will use the last local .data. Fix network/VPN, then: npm run data:sync");
  }
}

async function push() {
  const changed = (await localState()).filter((row) => row.changed);
  if (!changed.length) {
    console.log("Nothing to push: local matches your last pull/push.");
    return;
  }
  console.log("These local changes will be sent to the LIVE app and merged with everyone's latest:");
  for (const row of changed) console.log(`  - ${short(row.key)}`);
  if (!(await ask("Push them to live now? (y/N) "))) {
    console.log("Nothing pushed.");
    return;
  }
  const live = await connect();
  for (const row of changed) {
    const { doc, merged } = await live.put({
      key: row.key,
      value: row.local?.value ?? null,
      base: row.base.value,
      baseRev: row.base.rev,
    });
    await adoptLive(row.key, doc, row.local);
    console.log(`  ✓ ${short(row.key)}${merged ? " (merged with changes made live since your pull)" : ""}`);
  }
  console.log("Done. Live has your changes, and your local copy now matches live.");
}

const command = process.argv[2];
try {
  if (command === "pull") await pull();
  else if (command === "sync") await pullFromLive({ force: true });
  else if (command === "try-pull") await tryPull();
  else if (command === "push") await push();
  else if (command === "status") await status();
  else {
    console.log("Use: npm run data:pull | npm run data:sync | npm run data:push | npm run data:status");
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
