import { NextResponse } from "next/server";
import {
  OFFICE_USERNAME,
  SESSION_COOKIE,
  cookieOptions,
  officePassword,
  passwordsMatch,
  signSession,
} from "@/lib/crew-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: unknown;
    password?: unknown;
  } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json({ error: "Enter username and password." }, { status: 400 });
  }
  if (username.toLowerCase() !== OFFICE_USERNAME.toLowerCase()) {
    return NextResponse.json({ error: "That username or password does not match." }, { status: 401 });
  }
  const expected = officePassword();
  if (!expected) {
    return NextResponse.json(
      { error: "Password is not configured yet. Set CREW_PASSWORD in .env.local." },
      { status: 503 },
    );
  }
  if (!passwordsMatch(password, expected)) {
    return NextResponse.json({ error: "That username or password does not match." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, signSession(OFFICE_USERNAME), cookieOptions());
  return response;
}
