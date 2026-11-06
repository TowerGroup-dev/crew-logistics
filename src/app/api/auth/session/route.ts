import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/crew-auth";

export async function GET() {
  const jar = await cookies();
  const session = readSession(jar.get(SESSION_COOKIE)?.value);
  return NextResponse.json({
    signedIn: Boolean(session),
    session,
  });
}
