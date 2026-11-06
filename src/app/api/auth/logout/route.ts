import { NextResponse } from "next/server";
import { SESSION_COOKIE, cookieOptions } from "@/lib/crew-auth";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL("/sign-in", url.origin));
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(0), maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  return POST(request);
}
