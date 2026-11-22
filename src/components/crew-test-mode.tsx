"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, ClipboardList, ExternalLink, FlaskConical, LogOut, Mail, RotateCcw, X } from "lucide-react";
import {
  TEST_EMAIL_EVENT,
  enterTestModeFromUrl,
  installTestStorage,
  isTestMode,
  leaveTestMode,
  resetTest,
  testEmails,
  type TestEmail,
} from "@/lib/crew-test-mode";
import { logPageView, logTest, setTesterName, startTestLog, testerName } from "@/lib/crew-test-log";
import { TEST_GUIDE, sectionForPath } from "@/lib/crew-test-guide";
import { cn } from "@/lib/cn";

// Where testers record Works / Problem and send ideas (Yimika's Workspace → Crew testing).
const RESULTS_URL = process.env.NEXT_PUBLIC_TEST_RESULTS_URL || "";
const TICK = "crew-test-guide:";
const GUIDE_OPEN = "crew-test-guide-open";

/** Amber bar across the top + the Test guide panel. Only ever shows in Test Mode. */
export function CrewTestMode() {
  const pathname = usePathname();
  const [on, setOn] = useState(false);
  const [emails, setEmails] = useState<TestEmail[]>([]);
  const [viewing, setViewing] = useState<TestEmail | null>(null);
  const [toast, setToast] = useState<TestEmail | null>(null);

  useEffect(() => {
    enterTestModeFromUrl();
    if (!isTestMode()) return;
    installTestStorage();
    startTestLog();
    setOn(true);
    setEmails(testEmails());
    function onEmail(e: Event) {
      const email = (e as CustomEvent<TestEmail>).detail;
      setEmails(testEmails());
      setToast(email);
      logTest({ t: "email", path: window.location.pathname, kind: email.kind, subject: email.subject });
      window.setTimeout(() => setToast((t) => (t === email ? null : t)), 9000);
    }
    window.addEventListener(TEST_EMAIL_EVENT, onEmail);
    return () => window.removeEventListener(TEST_EMAIL_EVENT, onEmail);
  }, []);

  useEffect(() => {
    if (on) logPageView();
  }, [on, pathname]);

  if (!on) return null;
  return (
    <>
      <div className="sticky top-0 z-[60] border-b border-amber-300 bg-amber-100 text-amber-950">
        <div className="mx-auto flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm sm:px-8 xl:px-10" style={{ maxWidth: "var(--app-shell-max)" }}>
          <FlaskConical className="size-4 shrink-0" />
          <p className="min-w-0 flex-1">
            <b>Test Mode:</b> nothing you do here is saved. Try anything. It all disappears when you close this tab.
          </p>
          <button
            type="button"
            onClick={() => emails[0] && setViewing(emails[0])}
            disabled={!emails.length}
            title={emails.length ? "See the emails that would have been sent" : "No emails yet. Alerts and briefings show here instead of being sent."}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white/70 px-2.5 py-1 text-xs font-semibold hover:bg-white disabled:opacity-50"
          >
            <Mail className="size-3.5" /> Emails ({emails.length})
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Start again from the real schedule? Your test changes will be cleared.")) resetTest();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white/70 px-2.5 py-1 text-xs font-semibold hover:bg-white"
          >
            <RotateCcw className="size-3.5" /> Reset test
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Leave Test Mode? You'll be back on the real schedule, where changes ARE saved.")) leaveTestMode();
            }}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold hover:bg-amber-200"
          >
            <LogOut className="size-3.5" /> Leave Test Mode
          </button>
        </div>
      </div>
      <TestGuide />
      {toast && !viewing ? (
        <div className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[#1b2433] px-4 py-3 text-sm text-white shadow-2xl">
          <Mail className="size-4" />
          <span>
            An email would have been sent: <b>{toast.subject}</b>
          </span>
          <button type="button" className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-[#1b2433]" onClick={() => setViewing(toast)}>
            View
          </button>
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)}>
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      {viewing ? <EmailPreview emails={emails} current={viewing} onPick={setViewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}

/** Shows an email exactly as it would arrive, without sending it. */
function EmailPreview({ emails, current, onPick, onClose }: { emails: TestEmail[]; current: TestEmail; onPick: (e: TestEmail) => void; onClose: () => void }) {
  const [plain, setPlain] = useState(false);
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 p-3 sm:p-8" onMouseDown={onClose}>
      <div className="flex max-h-full w-full max-w-4xl overflow-hidden rounded-2xl bg-card shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {emails.length > 1 ? (
          <div className="hidden w-56 shrink-0 overflow-y-auto border-r border-border sm:block">
            <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">This test ({emails.length})</p>
            {emails.map((e, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPick(e)}
                className={cn("block w-full px-3 py-2 text-left text-sm hover:bg-muted", e === current && "bg-muted font-semibold")}
              >
                <span className="block truncate">{e.subject}</span>
                <span className="block text-xs text-muted-foreground">
                  {e.kind === "briefing" ? "Daily briefing" : "Instant alert"} · {e.at ? new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-[11px] font-semibold tracking-wide text-amber-700 uppercase">Preview only · not sent (Test Mode)</p>
              <p className="truncate text-base font-semibold">{current.subject}</p>
              <p className="text-muted-foreground">
                To: {current.to || "(no recipient set in Settings)"} · {current.kind === "briefing" ? "Daily briefing" : "Instant alert"}
              </p>
            </div>
            <button type="button" onClick={() => setPlain((p) => !p)} className="rounded-md border border-input px-2.5 py-1 text-xs font-semibold hover:bg-muted">
              {plain ? "Show email" : "Show plain text"}
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>
          {plain ? (
            <pre className="min-h-[60vh] flex-1 overflow-auto bg-muted/40 p-5 text-sm whitespace-pre-wrap">{current.text}</pre>
          ) : (
            <iframe title="Email preview" sandbox="" srcDoc={current.html} className="min-h-[60vh] w-full flex-1 bg-white" />
          )}
        </div>
      </div>
    </div>
  );
}

function TestGuide() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    setName(testerName());
    setOpen(sessionStorage.getItem(GUIDE_OPEN) !== "0");
    const t: Record<string, boolean> = {};
    for (const s of TEST_GUIDE) for (const step of s.steps) if (sessionStorage.getItem(TICK + step.id) === "1") t[step.id] = true;
    setTicks(t);
  }, []);

  if (pathname.startsWith("/sign-in")) return null;
  const section = sectionForPath(pathname);
  const index = TEST_GUIDE.findIndex((s) => s.id === section.id);
  const next = TEST_GUIDE[index + 1];
  const done = section.steps.filter((s) => ticks[s.id]).length;
  const total = TEST_GUIDE.reduce((n, s) => n + s.steps.length, 0);
  const allDone = Object.values(ticks).filter(Boolean).length;

  function toggleOpen(value: boolean) {
    setOpen(value);
    sessionStorage.setItem(GUIDE_OPEN, value ? "1" : "0");
  }
  function tick(id: string) {
    setTicks((t) => {
      const value = !t[id];
      if (value) sessionStorage.setItem(TICK + id, "1");
      else sessionStorage.removeItem(TICK + id);
      return { ...t, [id]: value };
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => toggleOpen(true)}
        className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] inline-flex items-center gap-2 rounded-full bg-[#1b2433] px-4 py-2.5 text-sm font-semibold text-white shadow-lg sm:bottom-5"
      >
        <ClipboardList className="size-4" /> Test guide · {allDone}/{total}
      </button>
    );
  }

  return (
    <aside
      aria-label="Test guide"
      className="fixed right-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex max-h-[70vh] w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:right-5 sm:bottom-5"
    >
      <div className="flex items-start gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Test guide · page {index + 1} of {TEST_GUIDE.length}
          </p>
          <p className="text-base font-semibold leading-snug">{section.title}</p>
          <p className="text-xs text-muted-foreground">{section.about}</p>
        </div>
        <button type="button" onClick={() => toggleOpen(false)} aria-label="Hide guide" className="rounded-md p-1 text-muted-foreground hover:bg-muted">
          <ChevronDown className="size-4" />
        </button>
      </div>

      {!name ? (
        <form
          className="flex items-center gap-2 border-b border-border bg-amber-50 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draftName.trim()) return;
            setTesterName(draftName);
            setName(draftName.trim());
            logTest({ t: "ping" });
          }}
        >
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Your name, so we know who tested"
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-white px-2 text-sm"
          />
          <button type="submit" className="h-8 rounded-md bg-[#1b2433] px-3 text-xs font-semibold text-white">
            Start
          </button>
        </form>
      ) : null}
      <ol className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {section.steps.map((step, i) => (
          <li key={step.id}>
            <button type="button" onClick={() => tick(step.id)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted/70">
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-bold",
                  ticks[step.id] ? "border-emerald-600 bg-emerald-600 text-white" : "border-input text-muted-foreground",
                )}
              >
                {ticks[step.id] ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium leading-snug", ticks[step.id] && "text-muted-foreground line-through")}>{step.do}</span>
                <span className="block text-xs text-muted-foreground">Should happen: {step.expect}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        <span className="text-xs text-muted-foreground">
          {done}/{section.steps.length} on this page · {allDone}/{total} total
        </span>
        <div className="ml-auto flex gap-2">
          {RESULTS_URL ? (
            <a
              href={RESULTS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-input px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              Report <ExternalLink className="size-3" />
            </a>
          ) : null}
          {next ? (
            <button
              type="button"
              onClick={() => router.push(next.path)}
              className="inline-flex items-center gap-1 rounded-lg bg-[#1b2433] px-3 py-1.5 text-xs font-semibold text-white hover:bg-black"
            >
              Next: {next.title} <ChevronRight className="size-3.5" />
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <Check className="size-3.5" /> Last page
            </span>
          )}
        </div>
      </div>
      <button type="button" onClick={() => toggleOpen(false)} className="sr-only">
        <X /> Close
      </button>
    </aside>
  );
}
