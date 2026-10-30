import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Morning cron hook (Montreal 8:00).
 * Ops data currently lives in the browser. This endpoint confirms schedule window and
 * reminds operators that the daily briefing is sent from the Crew Logistics app
 * (or a future server-synced store) after 8:00 America/Montreal.
 */
export async function GET(request: Request) {
  const secret = process.env.CREW_CRON_SECRET?.trim();
  if (secret) {
    const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const url = new URL(request.url);
    if (header !== secret && url.searchParams.get("secret") !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const montreal = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montreal",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => montreal.find((part) => part.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const inWindow = hour === 8 && minute < 30;

  return NextResponse.json({
    ok: true,
    montreal: `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`,
    inMorningWindow: inWindow,
    note:
      "Open Crew Logistics after 8:00 AM Montreal to auto-send Katrina’s daily briefing from live roster data. Wire GRAPH_* env vars for delivery.",
  });
}
