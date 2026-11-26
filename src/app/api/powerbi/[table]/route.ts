import { NextResponse } from "next/server";
import { normalizePowerBiTableParam } from "@/lib/crew-powerbi-export";
import {
  authorizePowerBiRequest,
  loadPowerBiCsv,
  powerBiKeyConfigured,
  resolvePowerBiYear,
} from "@/lib/crew-powerbi-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/powerbi/{people|daily|stays|rotations|flights|activity}.csv?year=2026&key=…
 * Returns UTF-8 CSV (with BOM) for Power BI Get data → Web.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ table: string }> },
) {
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

  const { table: raw } = await context.params;
  const slug = normalizePowerBiTableParam(raw);
  if (!slug) {
    return NextResponse.json(
      {
        error: `Unknown table "${raw}". Use people, daily, stays, rotations, flights, or activity.`,
      },
      { status: 404 },
    );
  }

  const year = resolvePowerBiYear(request);
  const hit = await loadPowerBiCsv(year, slug);
  if (!hit) {
    return NextResponse.json({ error: "Table not found." }, { status: 404 });
  }

  // BOM so Excel / Power BI open accents correctly.
  const body = `\uFEFF${hit.csv}`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `inline; filename="${hit.file}"`,
      "Cache-Control": "no-store",
      "X-Row-Count": String(hit.rows),
    },
  });
}
