import { promises as fs } from "fs";
import path from "path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/crew-auth";
import { dataDir } from "@/lib/crew-store-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Test Mode system log: one JSON line per event, one file per day, next to the app's data.
function logDir() {
  return path.join(dataDir(), "test-logs");
}

async function signedIn() {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
}

/** POST { lines: [...] } from a tester's browser (Test Mode only). */
export async function POST(request: Request) {
  if (!(await signedIn())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const text = await request.text();
  if (text.length > 200_000) return NextResponse.json({ error: "Too large." }, { status: 413 });
  let lines: unknown[] = [];
  try {
    lines = (JSON.parse(text) as { lines?: unknown[] }).lines ?? [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const clean = lines.filter((l) => l && typeof l === "object").slice(0, 200);
  if (!clean.length) return NextResponse.json({ ok: true });
  await fs.mkdir(logDir(), { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  await fs.appendFile(path.join(logDir(), `${day}.jsonl`), clean.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
  return NextResponse.json({ ok: true });
}

/** GET ?days=14 → every logged line from the last N days. */
export async function GET(request: Request) {
  if (!(await signedIn())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 14));
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  let files: string[] = [];
  try {
    files = (await fs.readdir(logDir())).filter((f) => f.endsWith(".jsonl") && f.slice(0, 10) >= since).sort();
  } catch {
    return NextResponse.json({ lines: [] });
  }
  const lines: unknown[] = [];
  for (const file of files) {
    const body = await fs.readFile(path.join(logDir(), file), "utf8");
    for (const row of body.split("\n")) {
      if (!row.trim()) continue;
      try {
        lines.push(JSON.parse(row));
      } catch {}
    }
  }
  return NextResponse.json({ lines }, { headers: { "Cache-Control": "no-store" } });
}
