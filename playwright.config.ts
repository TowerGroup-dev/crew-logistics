import { defineConfig } from "@playwright/test";

/** SQA tests for Crew Logistics. Local or staging only.
 *  BASE_URL=http://127.0.0.1:47232 npx playwright test */
const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:47232";
const host = new URL(baseURL).hostname;
const safe =
  ["localhost", "127.0.0.1", "[::1]"].includes(host) ||
  host.endsWith(".localhost") || host.endsWith(".test") ||
  /(^|[.-])(staging|dev|test|qa|sandbox|preview)([.-]|$)/.test(host);
if (!safe) throw new Error(`Refusing to run tests against ${host}. Use a local or staging URL.`);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "tests/report" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
