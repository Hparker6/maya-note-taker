"use client";

import { GraduationCap, Plus, UploadCloud } from "lucide-react";
import { useHydrated } from "@/lib/useStorage";
import { useShell } from "../shell/ShellContext";
import { Button } from "../ui/Button";

function greetingFor(now: Date) {
  const h = now.getHours();
  return {
    hello: h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening",
    date: now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
  };
}

export function Greeting() {
  const { openUpload } = useShell();
  // Time of day depends on the viewer's clock, so only compute it in the browser.
  const hydrated = useHydrated();
  const text = hydrated ? greetingFor(new Date()) : { hello: "Welcome back", date: "" };

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="h-5 text-sm text-ink-3">{text.date}</p>
        <h1 className="mt-1 font-serif text-[34px] leading-tight font-semibold tracking-tight">{text.hello}</h1>
      </div>
      <Button variant="primary" size="lg" onClick={() => openUpload()}>
        <UploadCloud /> Upload PDFs
      </Button>
    </div>
  );
}

export function WelcomeActions() {
  const { openClassDialog, openUpload } = useShell();
  return (
    <div className="mt-10 flex flex-wrap gap-3">
      <Button variant="primary" size="lg" onClick={() => openClassDialog()}>
        <GraduationCap /> Create your first class
      </Button>
      <Button variant="secondary" size="lg" onClick={() => openUpload()}>
        <UploadCloud /> Or start by uploading PDFs
      </Button>
    </div>
  );
}

export function NewClassCard() {
  const { openClassDialog } = useShell();
  return (
    <button
      onClick={() => openClassDialog()}
      className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong text-ink-3 transition-colors hover:border-accent hover:bg-accent-soft/40 hover:text-accent"
    >
      <Plus className="size-5" />
      <span className="text-sm font-medium">New class</span>
    </button>
  );
}
