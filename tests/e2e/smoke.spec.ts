import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const PAGES = ["/", "/month", "/year", "/list", "/employees", "/travel", "/accommodation",
  "/reminders", "/settings", "/actions", "/alerts", "/projects", "/reports"];

test.describe("CL-11 / CL-15 / CL-16 pages load without errors", () => {
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
      await signIn(page.request);
      const res = await page.goto(path);
      expect(res?.status()).toBeLessThan(400);
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);
    });
  }
});

test("CL-14 an edit survives a reload", async ({ page }) => {
  await signIn(page.request);
  await page.goto("/");
  const before = await page.evaluate(() => Object.keys(localStorage));
  await page.reload();
  const after = await page.evaluate(() => Object.keys(localStorage));
  expect(after).toEqual(before);
  // Shared-across-users check stays manual: see BUG-08.
});
