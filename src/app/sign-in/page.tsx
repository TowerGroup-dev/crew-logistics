"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const USERNAME = "Office";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState(params.get("error") || "");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: USERNAME, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || "Sign-in failed.");
        return;
      }
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-6 px-1 py-10">
      <h1 className="font-heading text-3xl tracking-tight sm:text-4xl">Sign in</h1>

      <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Username</span>
          <input
            value={USERNAME}
            readOnly
            className="h-10 cursor-default rounded-lg border border-input bg-muted/40 px-3 text-foreground"
            autoComplete="username"
            tabIndex={-1}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 rounded-lg border border-input px-3"
            autoComplete="current-password"
            autoFocus
            required
          />
        </label>
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-xl bg-[#356dbd] text-sm font-semibold text-white hover:bg-[#2f60a8] disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Loading…</p>}>
      <SignInForm />
    </Suspense>
  );
}
