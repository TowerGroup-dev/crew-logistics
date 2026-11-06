import { createHash, createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "crew-session";

export type CrewSession = {
  name: string;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const OFFICE_USERNAME = "Office";

export function sessionSecret() {
  return process.env.CREW_SESSION_SECRET || "tower-crew-local-session";
}

export function officePassword() {
  return process.env.CREW_PASSWORD || "";
}

export function passwordsMatch(input: string, expected: string) {
  if (!expected) return false;
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function signSession(name: string) {
  const payload = Buffer.from(
    JSON.stringify({ name, exp: Date.now() + WEEK_MS }),
  ).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readSession(token: string | undefined | null): CrewSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      name?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.name !== "string" || !parsed.name.trim()) return null;
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return { name: parsed.name.trim() };
  } catch {
    return null;
  }
}

export function cookieOptions(maxAge = 60 * 60 * 24 * 7) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
