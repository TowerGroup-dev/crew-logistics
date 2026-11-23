"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, Clock, Gauge, Mail, MessageSquare, RefreshCw, Snail, Users } from "lucide-react";
import type { TestLogLine } from "@/lib/crew-test-log";
import { cn } from "@/lib/cn";

/** Short times read better in ms: "120 ms", longer ones in seconds: "2.4 s". */
function secs(ms: number) {
  if (!Number.isFinite(ms)) return "–";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const PAGE_NAMES: Record<string, string> = {
  "/": "Overview",
  "/month": "Month",
  "/year": "Year",
  "/list": "List",
  "/employees": "Employees",
  "/travel": "Travel",
  "/accommodation": "Accommodation",
  "/reports": "Reports",
  "/settings": "Settings",
  "/actions": "Projects / actions",
  "/alerts": "Alerts",
};
const pageName = (p: string) => PAGE_NAMES[p] ?? p;
const FEEDBACK_LABEL: Record<string, string> = { works: "Works well", problem: "Problem", suggestion: "Suggestion", overall: "Overall" };
const FEEDBACK_TONE: Record<string, string> = {
  works: "bg-slate-100 text-slate-800",
  problem: "bg-rose-50 text-rose-800",
  suggestion: "bg-sky-50 text-sky-800",
  overall: "bg-muted text-foreground",
};

function minutes(ms: number) {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function grade(ms: number) {
  return ms <= 1000 ? "text-emerald-700" : ms <= 3000 ? "text-amber-700" : "text-rose-700 font-semibold";
}

/** What testers ran into: speed per page, freezes, errors, slow requests, emails, who tested and for how long. */
export function CrewTestLogReport() {
  const [lines, setLines] = useState<TestLogLine[] | null>(null);
  const [days, setDays] = useState(14);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    fetch(`/api/test-log?days=${days}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 401 ? "Sign in first." : `Could not load (${r.status})`))))
      .then((b: { lines: TestLogLine[] }) => setLines(b.lines))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load"));
  }
  useEffect(load, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = useMemo(() => {
    const all = lines ?? [];
    const sessions = new Map<string, { tester: string; first: string; last: string; pages: number; errors: number; freezes: number; device: string }>();
    for (const l of all) {
      const s = sessions.get(l.session) ?? { tester: l.tester, first: l.at, last: l.at, pages: 0, errors: 0, freezes: 0, device: "" };
      if (l.tester && l.tester !== "Unnamed tester") s.tester = l.tester;
      if (l.at < s.first) s.first = l.at;
      if (l.at > s.last) s.last = l.at;
      if (l.t === "page") s.pages++;
      if (l.t === "error") s.errors++;
      if (l.t === "freeze") s.freezes++;
      if (l.t === "start") s.device = `${/iPhone|Android/i.test(l.ua) ? "Phone" : /iPad/i.test(l.ua) ? "Tablet" : "Computer"} · ${/Edg\//.test(l.ua) ? "Edge" : /Chrome\//.test(l.ua) ? "Chrome" : /Safari\//.test(l.ua) ? "Safari" : /Firefox\//.test(l.ua) ? "Firefox" : "Other"} · ${l.screen}`;
      sessions.set(l.session, s);
    }
    const pages = new Map<string, { loads: number[]; freezes: number[]; nodes: number[]; heap: number[]; errors: number }>();
    const bucket = (p: string) => {
      const b = pages.get(p) ?? { loads: [], freezes: [], nodes: [], heap: [], errors: 0 };
      pages.set(p, b);
      return b;
    };
    for (const l of all) {
      if (l.t === "page") {
        const b = bucket(l.path);
        if (l.ms != null) b.loads.push(l.ms);
        b.nodes.push(l.nodes);
        if (l.heapMb != null) b.heap.push(l.heapMb);
      } else if (l.t === "freeze") bucket(l.path).freezes.push(l.ms);
      else if (l.t === "error") bucket(l.path).errors++;
    }
    const pageRows = [...pages.entries()]
      .map(([path, b]) => ({
        path,
        views: b.nodes.length,
        median: median(b.loads),
        worst: b.loads.length ? Math.max(...b.loads) : 0,
        freezes: b.freezes.length,
        worstFreeze: b.freezes.length ? Math.max(...b.freezes) : 0,
        nodes: b.nodes.length ? Math.max(...b.nodes) : 0,
        heap: b.heap.length ? Math.max(...b.heap) : null,
        errors: b.errors,
      }))
      .sort((a, b) => b.worst - a.worst);
    const errors = all.filter((l) => l.t === "error") as Extract<TestLogLine, { t: "error" }>[];
    const requests = all.filter((l) => l.t === "request") as Extract<TestLogLine, { t: "request" }>[];
    const emails = all.filter((l) => l.t === "email") as Extract<TestLogLine, { t: "email" }>[];
    const feedback = all.filter((l) => l.t === "feedback") as Extract<TestLogLine, { t: "feedback" }>[];
    const loads = all.filter((l) => l.t === "page" && l.ms != null).map((l) => (l as Extract<TestLogLine, { t: "page" }>).ms as number);
    const time = [...sessions.values()].reduce((n, s) => n + (Date.parse(s.last) - Date.parse(s.first)), 0);
    return { sessions: [...sessions.entries()].sort((a, b) => b[1].last.localeCompare(a[1].last)), pageRows, errors, requests, emails, feedback, loads, time };
  }, [lines]);

  const freezes = r.pageRows.reduce((n, p) => n + p.freezes, 0);

  return (
    <div className="flex flex-col gap-5 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">Test log</h1>
          <p className="text-sm text-muted-foreground">What testers said and ran into in Test Mode: feedback, suggestions, speed and errors. Nothing here touches the real schedule.</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-lg border border-input bg-card px-2 text-sm">
          {[1, 7, 14, 30, 90].map((d) => (
            <option key={d} value={d}>
              Last {d} day{d === 1 ? "" : "s"}
            </option>
          ))}
        </select>
        <button type="button" onClick={load} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-medium hover:bg-muted">
          <RefreshCw className="size-4" /> Refresh
        </button>
        <Link href="/?test=1" className="inline-flex h-9 items-center rounded-lg bg-[#1b2433] px-3 text-sm font-semibold text-white">
          Open Test Mode
        </Link>
      </div>

      {error ? <p className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      {lines === null && !error ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {lines && lines.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Nothing logged yet. Testers open the app with <b>?test=1</b> on the end of the link (e.g. crew.towerarctic.ca/?test=1) and the log fills in as they go.
        </p>
      ) : null}

      {lines && lines.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Kpi icon={<Users className="size-4" />} label="Testers" value={String(new Set(r.sessions.map(([, s]) => s.tester)).size)} />
            <Kpi icon={<Clock className="size-4" />} label="Time testing" value={minutes(r.time)} />
            <Kpi icon={<Gauge className="size-4" />} label="Typical page" value={`${secs(median(r.loads))}`} />
            <Kpi icon={<Snail className="size-4" />} label="Freezes" value={String(freezes)} />
            <Kpi icon={<AlertTriangle className="size-4" />} label="Errors" value={String(r.errors.length)} />
          </div>

          <Section title={`Feedback and suggestions (${r.feedback.length})`} icon={<MessageSquare className="size-4" />}>
            {r.feedback.length === 0 ? <p className="text-sm text-muted-foreground">No feedback written yet.</p> : null}
            <ul className="flex flex-col gap-2 text-sm">
              {r.feedback.slice().reverse().map((f, i) => (
                <li key={i} className="rounded-lg border border-border px-3 py-2">
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className={cn("rounded-full px-2 py-0.5 font-semibold", FEEDBACK_TONE[f.kind] ?? "bg-muted text-foreground")}>{FEEDBACK_LABEL[f.kind] ?? f.kind}</span>
                    {f.tester} · {f.kind === "overall" ? "when leaving" : pageName(f.path)} ·{" "}
                    {new Date(f.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="mt-1 block whitespace-pre-wrap">{f.text}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Speed by page" icon={<Gauge className="size-4" />}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Page</th>
                  <th className="py-2 pr-3 font-medium">Views</th>
                  <th className="py-2 pr-3 font-medium">Typical</th>
                  <th className="py-2 pr-3 font-medium">Slowest</th>
                  <th className="py-2 pr-3 font-medium">Freezes</th>
                  <th className="py-2 pr-3 font-medium">Size (elements)</th>
                  <th className="py-2 pr-3 font-medium">Memory</th>
                  <th className="py-2 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {r.pageRows.map((p) => (
                  <tr key={p.path} className="border-t border-border">
                    <td className="py-2 pr-3 font-medium">{pageName(p.path)}</td>
                    <td className="py-2 pr-3">{p.views}</td>
                    <td className={cn("py-2 pr-3", grade(p.median))}>{secs(p.median)}</td>
                    <td className={cn("py-2 pr-3", grade(p.worst))}>{secs(p.worst)}</td>
                    <td className={cn("py-2 pr-3", p.freezes ? "text-amber-700" : "")}>
                      {p.freezes}
                      {p.worstFreeze ? ` (up to ${secs(p.worstFreeze)})` : ""}
                    </td>
                    <td className={cn("py-2 pr-3", p.nodes > 15000 ? "text-amber-700" : "")}>{p.nodes.toLocaleString()}</td>
                    <td className="py-2 pr-3">{p.heap != null ? `${p.heap} MB` : "–"}</td>
                    <td className={cn("py-2", p.errors ? "font-semibold text-rose-700" : "")}>{p.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              Green under 1 s, amber 1–3 s, red over 3 s. A freeze is when the page stops responding for 0.2 s or more. Size is how many elements the page draws: above about 15,000 pages start to feel heavy.
            </p>
          </Section>

          <Section title={`Errors (${r.errors.length})`} icon={<AlertTriangle className="size-4" />}>
            {r.errors.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : null}
            <ul className="flex flex-col gap-1.5 text-sm">
              {r.errors.slice(-50).reverse().map((e, i) => (
                <li key={i} className="rounded-lg bg-rose-50 px-3 py-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {e.tester} · {pageName(e.path)}
                  </span>
                  <span className="block font-mono text-xs text-rose-900">{e.message}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={`Slow or failed requests (${r.requests.length})`} icon={<Activity className="size-4" />}>
            {r.requests.length === 0 ? <p className="text-sm text-muted-foreground">None: every request was quick and worked.</p> : null}
            <ul className="flex flex-col gap-1 text-sm">
              {r.requests.slice(-40).reverse().map((q, i) => (
                <li key={i} className="flex gap-3">
                  <span className={cn("w-14 shrink-0 font-mono text-xs", q.status && q.status < 400 ? "text-amber-700" : "text-rose-700")}>{q.status || "failed"}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {q.method} {q.url}
                  </span>
                  <span className={cn("text-xs", grade(q.ms))}>{secs(q.ms)}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">{q.tester}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={`Emails that would have been sent (${r.emails.length})`} icon={<Mail className="size-4" />}>
            {r.emails.length === 0 ? <p className="text-sm text-muted-foreground">None triggered during testing.</p> : null}
            <ul className="flex flex-col gap-1 text-sm">
              {r.emails.slice(-30).reverse().map((m, i) => (
                <li key={i}>
                  <span className="text-xs text-muted-foreground">{m.kind === "briefing" ? "Daily briefing" : "Instant alert"} · {m.tester} · </span>
                  {m.subject}
                </li>
              ))}
            </ul>
          </Section>

          <Section title={`Testers (${r.sessions.length} sessions)`} icon={<Users className="size-4" />}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Who</th>
                  <th className="py-2 pr-3 font-medium">Started</th>
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Pages</th>
                  <th className="py-2 pr-3 font-medium">Freezes</th>
                  <th className="py-2 pr-3 font-medium">Errors</th>
                  <th className="py-2 font-medium">Device</th>
                </tr>
              </thead>
              <tbody>
                {r.sessions.map(([id, s]) => (
                  <tr key={id} className="border-t border-border">
                    <td className="py-2 pr-3 font-medium">{s.tester}</td>
                    <td className="py-2 pr-3">{new Date(s.first).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    <td className="py-2 pr-3">{minutes(Date.parse(s.last) - Date.parse(s.first))}</td>
                    <td className="py-2 pr-3">{s.pages}</td>
                    <td className="py-2 pr-3">{s.freezes}</td>
                    <td className={cn("py-2 pr-3", s.errors ? "font-semibold text-rose-700" : "")}>{s.errors}</td>
                    <td className="py-2 text-xs text-muted-foreground">{s.device}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      ) : null}
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}
