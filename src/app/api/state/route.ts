import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/crew-auth";
import { readAll, saveDoc } from "@/lib/crew-store-server";
import { SHARED_KEYS, isSharedKey, type SharedKey } from "@/lib/crew-sync-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function who() {
  const jar = await cookies();
  return readSession(jar.get(SESSION_COOKIE)?.value);
}

/**
 * GET /api/state            → every shared document
 * GET /api/state?revs=k:3,… → only documents saved since those revisions
 */
export async function GET(request: Request) {
  if (!(await who())) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const revs = new Map<string, number>();
  for (const part of (new URL(request.url).searchParams.get("revs") || "").split(",")) {
    const at = part.lastIndexOf(":");
    if (at > 0) revs.set(part.slice(0, at), Number(part.slice(at + 1)) || 0);
  }
  const docs = await readAll(SHARED_KEYS);
  const out: Record<string, unknown> = {};
  for (const [key, doc] of Object.entries(docs)) {
    if (!revs.has(key) || doc!.rev > revs.get(key)!) out[key] = doc;
  }
  return NextResponse.json({ docs: out, serverTime: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

/** PUT /api/state  { key, value, base, baseRev } → { doc, merged } */
export async function PUT(request: Request) {
  const session = await who();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let body: { key?: string; value?: unknown; base?: unknown; baseRev?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.key || !isSharedKey(body.key)) return NextResponse.json({ error: "Unknown key." }, { status: 400 });
  if (body.value === undefined) return NextResponse.json({ error: "Missing value." }, { status: 400 });
  try {
    const result = await saveDoc({
      key: body.key as SharedKey,
      value: body.value,
      base: body.base ?? null,
      baseRev: typeof body.baseRev === "number" ? body.baseRev : 0,
      by: session.name,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save." },
      { status: 500 },
    );
  }
}
