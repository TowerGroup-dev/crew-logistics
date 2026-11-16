import { expect, test } from "@playwright/test";

test("CL-05 notify API needs sign-in", async ({ request }) => {
  const res = await request.post("/api/notify", {
    data: { to: "sqa@example.test", subject: "SQA", text: "should not send" },
  });
  expect(res.status()).toBe(401);
});

test("CL-06 cron endpoint needs the secret (BUG-09 if CREW_CRON_SECRET is unset)", async ({ request }) => {
  const res = await request.get("/api/briefing/cron");
  expect(res.status()).toBe(401);
});
