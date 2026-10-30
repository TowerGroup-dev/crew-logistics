import { NextResponse } from "next/server";
import { sendMail } from "@/lib/mail";

export const runtime = "nodejs";

type NotifyBody = {
  kind?: "briefing" | "alert";
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
};

export async function POST(request: Request) {
  let body: NotifyBody;
  try {
    body = (await request.json()) as NotifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const to = body.to?.trim() ?? "";
  const subject = body.subject?.trim() ?? "";
  const text = body.text?.trim() ?? "";
  if (!to || !subject || !text) {
    return NextResponse.json({ ok: false, error: "to, subject, and text are required." }, { status: 400 });
  }
  const result = await sendMail({ to, subject, text, html: body.html });
  if (!result.sent) {
    return NextResponse.json({ ok: false, error: result.error, kind: body.kind ?? "alert" }, { status: result.status });
  }
  return NextResponse.json({ ok: true, kind: body.kind ?? "alert" });
}
