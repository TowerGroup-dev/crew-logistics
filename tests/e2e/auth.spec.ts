import { expect, test } from "@playwright/test";
import { PASSWORD, USERNAME, signIn } from "./helpers";

test("CL-01 office user signs in", async ({ page }) => {
  await page.goto("/sign-in");
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[type="password"]').press("Enter");
  await expect(page).not.toHaveURL(/sign-in/);
});

test("CL-02 wrong username and wrong password give the same 401", async ({ request }) => {
  const badUser = await request.post("/api/auth/local", { data: { username: "nobody", password: PASSWORD } });
  const badPass = await request.post("/api/auth/local", { data: { username: USERNAME, password: "wrong" } });
  expect(badUser.status()).toBe(401);
  expect(badPass.status()).toBe(401);
  expect((await badUser.json()).error).toBe((await badPass.json()).error);
});

for (const path of ["/", "/employees", "/travel", "/accommodation", "/reports", "/projects"]) {
  test(`CL-04 signed-out ${path} redirects to sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  });
}

test("CL-01b session cookie is HttpOnly", async ({ page, context }) => {
  await signIn(page.request);
  const cookies = await context.cookies();
  expect(cookies.length).toBeGreaterThan(0);
  for (const c of cookies) expect(c.httpOnly).toBe(true);
});
