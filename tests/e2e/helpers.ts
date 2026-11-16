import type { APIRequestContext } from "@playwright/test";

export const USERNAME = process.env.TEST_CREW_USERNAME ?? "Office";
export const PASSWORD = process.env.TEST_CREW_PASSWORD ?? "";

export async function signIn(request: APIRequestContext) {
  const res = await request.post("/api/auth/local", { data: { username: USERNAME, password: PASSWORD } });
  if (!res.ok()) throw new Error(`Crew sign-in failed (${res.status()}). Set TEST_CREW_USERNAME and TEST_CREW_PASSWORD.`);
}
