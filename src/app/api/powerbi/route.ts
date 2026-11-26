import { NextResponse } from "next/server";
import {
  authorizePowerBiRequest,
  loadPowerBiExportTables,
  powerBiKeyConfigured,
  resolvePowerBiYear,
} from "@/lib/crew-powerbi-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/powerbi?year=2026&key=…
 * JSON catalog of live Power BI tables (URLs + row counts).
 */
export async function GET(request: Request) {
  if (!powerBiKeyConfigured()) {
    return NextResponse.json(
      {
        error:
          "Power BI live API is not configured. Set CREW_POWERBI_KEY on the server and restart.",
      },
      { status: 503 },
    );
  }
  if (!authorizePowerBiRequest(request)) {
    return NextResponse.json({ error: "Unauthorized. Pass ?key= or Authorization: Bearer." }, { status: 401 });
  }

  const year = resolvePowerBiYear(request);
  const tables = await loadPowerBiExportTables(year);
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "YOUR_KEY";
  const origin = `${url.protocol}//${url.host}`;

  return NextResponse.json(
    {
      year,
      exportedAt: new Date().toISOString(),
      tables: tables.map((table) => ({
        slug: table.slug,
        title: table.title,
        description: table.description,
        file: table.file,
        rows: table.rows,
        csvUrl: `${origin}/api/powerbi/${table.slug}.csv?year=${year}&key=${encodeURIComponent(key)}`,
      })),
      model: {
        personKey: "PersonId",
        dateColumn: "crew_daily_onsite / daily.csv → Date",
        notes: [
          "Relate people[PersonId] one-to-many to PersonId on every other table.",
          "Add a date table and link it to daily[Date].",
          "Person-days = COUNTROWS(daily); Headcount = DISTINCTCOUNT(daily[PersonId]) on a date axis.",
        ],
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
