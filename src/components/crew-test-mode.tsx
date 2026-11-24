"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, ClipboardList, ExternalLink, FlaskConical, LogOut, MessageSquare, RotateCcw, X } from "lucide-react";
import {
  TEST_EMAIL_EVENT,
  enterTestModeFromUrl,
  installTestStorage,
  isTestMode,
  leaveTestMode,
  resetTest,
  type TestEmail,
} from "@/lib/crew-test-mode";
import {
  flushTestLog,
  logPageView,
  logTest,
  setTesterName,
  startTestLog,
  testerName,
  type FeedbackKind,
} from "@/lib/crew-test-log";
import { TEST_GUIDE, sectionForPath } from "@/lib/crew-test-guide";
import { CrewConfirmDialog } from "@/components/crew-confirm-dialog";
import { cn } from "@/lib/cn";

// Where testers record Works / Problem and send ideas (Yimika's Workspace → Crew testing).
const RESULTS_URL = process.env.NEXT_PUBLIC_TEST_RESULTS_URL || "";
const TICK = "crew-test-guide:";
const GUIDE_OPEN = "crew-test-guide-open";

/** Amber bar across the top + the Test guide panel (with feedback). Only ever shows in Test Mode. */
export function CrewTestMode() {
  const pathname = usePathname();
  const [on, setOn] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    enterTestModeFromUrl();
    if (!isTestMode()) return;
    installTestStorage();
    startTestLog();
    setOn(true);
    // Emails are never sent in Test Mode. They are only noted in the test log (no pop-ups).
    function onEmail(e: Event) {
      const email = (e as CustomEvent<TestEmail>).detail;
      logTest({ t: "email", path: window.location.pathname, kind: email.kind, subject: email.subject });
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
            <b>Test Mode:</b> nothing you do here is saved.
          </p>
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white/70 px-2.5 py-1 text-xs font-semibold hover:bg-white"
          >
            <RotateCcw className="size-3.5" /> Reset test
          </button>
          <button
            type="button"
            onClick={() => setLeaving(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold hover:bg-amber-200"
          >
            <LogOut className="size-3.5" /> Leave Test Mode
          </button>
        </div>
      </div>
      <TestGuide />
      {leaving ? <LeaveDialog onStay={() => setLeaving(false)} /> : null}
      {confirmReset ? (
        <CrewConfirmDialog
          title="Reset test?"
          message="Start again from the real schedule. Your test changes will be cleared."
          confirmLabel="Reset test"
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            setConfirmReset(false);
            resetTest();
          }}
        />
      ) : null}
    </>
  );
}

/** Before leaving: overall feedback and suggestions (both optional), then back to the real schedule. */
function LeaveDialog({ onStay }: { onStay: () => void }) {
  const [overall, setOverall] = useState("");
  const [ideas, setIdeas] = useState("");
  const [name, setName] = useState(() => testerName());
  function leave(send: boolean) {
    if (send) {
      if (name.trim() && !testerName()) setTesterName(name);
      const path = window.location.pathname;
      if (overall.trim()) logTest({ t: "feedback", path, kind: "overall", text: overall.trim().slice(0, 2000) });
      if (ideas.trim()) logTest({ t: "feedback", path, kind: "suggestion", text: ideas.trim().slice(0, 2000) });
      flushTestLog(true);
    }
    leaveTestMode();
  }
  const hasText = Boolean(overall.trim() || ideas.trim());
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/30 p-3 sm:items-center" onMouseDown={onStay}>
      <div
        role="dialog"
        aria-label="Before you leave Test Mode"
        className="w-full max-w-lg rounded-2xl bg-card p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="text-lg font-semibold">Leave Test Mode</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Feedback is optional. After you leave, you return to the live schedule where changes are saved.
        </p>
        {!testerName() ? (
          <label className="mt-4 grid gap-1 text-sm">
            <span className="font-medium">Your name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="h-10 rounded-lg border border-input px-3" />
          </label>
        ) : null}
        <label className="mt-4 grid gap-1 text-sm">
          <span className="font-medium">What worked, and what did not?</span>
          <textarea
            autoFocus
            value={overall}
            onChange={(event) => setOverall(event.target.value)}
            rows={3}
            className="rounded-lg border border-input px-3 py-2"
            placeholder="e.g. Flight booking was clear, but hotel entry was hard to find."
          />
        </label>
        <label className="mt-3 grid gap-1 text-sm">
          <span className="font-medium">Suggestions</span>
          <textarea
            value={ideas}
            onChange={(event) => setIdeas(event.target.value)}
            rows={3}
            className="rounded-lg border border-input px-3 py-2"
            placeholder="What should be added, removed, or changed?"
          />
        </label>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onStay} className="h-10 rounded-lg px-3 text-sm font-medium hover:bg-muted">
            Keep testing
          </button>
          <button type="button" onClick={() => leave(false)} className="h-10 rounded-lg border border-input px-3 text-sm font-medium hover:bg-muted">
            Leave without feedback
          </button>
          <button
            type="button"
            onClick={() => leave(true)}
            disabled={!hasText}
            className="h-10 rounded-lg bg-[#1b2433] px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            Send and leave
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Your feedback on this page": works well / problem / suggestion, written on the page itself. */
function PageFeedback({ path }: { path: string }) {
  const [kind, setKind] = useState<Exclude<FeedbackKind, "overall">>("problem");
  const [text, setText] = useState("");
  const [sent, setSent] = useState(0);
  useEffect(() => {
    setText("");
    setSent(0);
  }, [path]);
  const kinds: { key: Exclude<FeedbackKind, "overall">; label: string }[] = [
    { key: "works", label: "Works well" },
    { key: "problem", label: "Problem" },
    { key: "suggestion", label: "Suggestion" },
  ];
  return (
    <form
      className="grid gap-2 border-t border-border bg-muted/30 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        logTest({ t: "feedback", path, kind, text: text.trim().slice(0, 2000) });
        flushTestLog();
        setText("");
        setSent((n) => n + 1);
      }}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <MessageSquare className="size-3.5" /> Feedback on this page
        {sent ? <span className="ml-auto font-medium normal-case text-muted-foreground">Sent{sent > 1 ? ` (${sent})` : ""}</span> : null}
      </p>
      <div className="flex gap-1">
        {kinds.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => setKind(row.key)}
            aria-pressed={kind === row.key}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-semibold",
              kind === row.key ? "border-[#1b2433] bg-[#1b2433] text-white" : "border-input bg-card hover:bg-muted",
            )}
          >
            {row.label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          placeholder={kind === "works" ? "What worked well?" : kind === "problem" ? "What went wrong or was confusing?" : "What would make it better?"}
          className="min-w-0 flex-1 resize-none rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm"
        />
        <button type="submit" disabled={!text.trim()} className="h-9 rounded-lg bg-[#1b2433] px-3 text-xs font-semibold text-white disabled:opacity-40">
          Send
        </button>
      </div>
    </form>
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

  if (pathname.startsWith("/sign-in") || pathname.startsWith("/test-log")) return null;
  const section = sectionForPath(pathname);
  const index = TEST_GUIDE.findIndex((s) => s.id === section.id);
  const next = TEST_GUIDE[index + 1];
  const prev = index > 0 ? TEST_GUIDE[index - 1] : null;
  const done = section.steps.filter((s) => ticks[s.id]).length;
  const total = TEST_GUIDE.reduce((n, s) => n + s.steps.length, 0);
  const allDone = Object.values(ticks).filter(Boolean).length;

  function goGuide(path: string) {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const year = params?.get("year");
    router.push(year ? `${path}?year=${encodeURIComponent(year)}` : path);
  }

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
            placeholder="Your name"
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
                  ticks[step.id] ? "border-[#1b2433] bg-[#1b2433] text-white" : "border-input text-muted-foreground",
                )}
              >
                {ticks[step.id] ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium leading-snug", ticks[step.id] && "text-muted-foreground line-through")}>{step.do}</span>
                <span className="block text-xs text-muted-foreground">Expected: {step.expect}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <PageFeedback path={pathname} />

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
          {prev ? (
            <button
              type="button"
              onClick={() => goGuide(prev.path)}
              className="inline-flex items-center gap-1 rounded-lg border border-input px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              Back
            </button>
          ) : null}
          {next ? (
            <button
              type="button"
              onClick={() => goGuide(next.path)}
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
