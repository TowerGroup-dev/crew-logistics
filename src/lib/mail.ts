type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailResult = { sent: true; status: number } | { sent: false; status: number; error: string };

function senderMailbox() {
  return process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || "campmanager@towerarctic.ca";
}

function graphSettings() {
  const tenant = process.env.GRAPH_TENANT_ID?.trim();
  const clientId = process.env.GRAPH_CLIENT_ID?.trim();
  const secret = process.env.GRAPH_CLIENT_SECRET?.trim();
  if (!tenant || !clientId || !secret) return null;
  return { tenant, clientId, secret };
}

let cachedToken: { value: string; expires: number } | null = null;

async function graphToken(settings: NonNullable<ReturnType<typeof graphSettings>>) {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(settings.tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.clientId,
      client_secret: settings.secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(`${data.error || response.status} ${data.error_description || "token failed"}`.trim());
  }
  cachedToken = { value: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

async function sendWithGraph(input: MailInput, settings: NonNullable<ReturnType<typeof graphSettings>>): Promise<MailResult> {
  const from = senderMailbox();
  try {
    const token = await graphToken(settings);
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: input.html ? { contentType: "HTML", content: input.html } : { contentType: "Text", content: input.text },
          from: { emailAddress: { address: from, name: "Tower Arctic Crew Logistics" } },
          toRecipients: [{ emailAddress: { address: input.to } }],
        },
        saveToSentItems: true,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      return { sent: false, status: response.status, error: body.slice(0, 300) || "Graph send failed" };
    }
    return { sent: true, status: 202 };
  } catch (error) {
    return { sent: false, status: 500, error: error instanceof Error ? error.message : "Graph send failed" };
  }
}

/** Sends via Microsoft Graph when configured; otherwise returns a clear setup error (preview still works client-side). */
export async function sendMail(input: MailInput): Promise<MailResult> {
  const to = input.to.trim();
  if (!to || !to.includes("@")) return { sent: false, status: 400, error: "Add Katrina's email in Notifications." };
  const graph = graphSettings();
  if (graph) return sendWithGraph(input, graph);
  if (process.env.CREW_NOTIFY_DRY_RUN === "1") {
    console.info("[crew-notify dry-run]", input.subject, "→", to);
    return { sent: true, status: 200 };
  }
  return {
    sent: false,
    status: 503,
    error:
      "Email is not configured. Set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, and MAIL_FROM (same as Camp Bookings), or CREW_NOTIFY_DRY_RUN=1 for local tests.",
  };
}
