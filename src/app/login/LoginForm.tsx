"use client";

import { BookMarked, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { Button, inputClass } from "@/components/ui/Button";
import { APP_NAME } from "@/lib/brand";

export function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = next;
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? "Couldn't sign in.");
    setBusy(false);
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm animate-pop rounded-3xl border border-line bg-card p-8 shadow-float">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-ink">
            <BookMarked className="size-6" />
          </div>
          <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-ink-3">Enter your password to open your notebook.</p>
        </div>
        <label className="relative block">
          <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            className={`${inputClass} pl-9`}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <Button variant="primary" size="lg" type="submit" className="mt-4 w-full" disabled={!password || busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
