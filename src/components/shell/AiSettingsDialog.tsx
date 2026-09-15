"use client";

import clsx from "clsx";
import { CheckCircle2, ExternalLink, ShieldAlert, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { AiProvider, AiStatus } from "@/lib/types";
import { Button, inputClass, Spinner } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useFeedback } from "../ui/feedback";

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex gap-2.5">
    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{n}</span>
    <span>{children}</span>
  </li>
);

export function AiSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [gemini, setGemini] = useState("");
  const [claude, setClaude] = useState("");
  const [busy, setBusy] = useState<null | AiProvider | "provider">(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<AiStatus>("/api/ai")
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && toast("Couldn't load AI settings", "error"));
    return () => {
      cancelled = true;
    };
  }, [open, toast]);

  const update = async (body: Record<string, unknown>, which: typeof busy) => {
    setBusy(which);
    try {
      const next = await api<AiStatus & { notice?: string }>("/api/ai", { method: "PUT", json: body });
      setStatus(next);
      router.refresh();
      return next;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save", "error");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const saveKey = async (provider: AiProvider) => {
    const value = provider === "gemini" ? gemini : claude;
    const next = await update({ [`${provider}_key`]: value, provider }, provider);
    if (!next) return;
    if (provider === "gemini") setGemini("");
    else setClaude("");
    toast(next.notice ?? `${provider === "gemini" ? "Gemini" : "Claude"} is connected`, next.notice ? "info" : "success");
  };

  const removeKey = async (provider: AiProvider) => {
    const ok = await confirm({
      title: `Remove the ${provider === "gemini" ? "Gemini" : "Claude"} key?`,
      message: "AI features will use the other key if there is one. Your notes, sheets and flashcards stay.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok && (await update({ [`${provider}_key`]: null }, provider))) toast("Key removed");
  };

  const both = Boolean(status?.geminiKeyHint && status?.claudeKeyHint);

  const providerCard = (provider: AiProvider) => {
    const isGemini = provider === "gemini";
    const hint = isGemini ? status?.geminiKeyHint : status?.claudeKeyHint;
    const fromEnv = isGemini ? status?.geminiFromEnv : status?.claudeFromEnv;
    const active = status?.provider === provider;
    const value = isGemini ? gemini : claude;
    const setValue = isGemini ? setGemini : setClaude;

    return (
      <section
        className={clsx(
          "rounded-xl border px-4 py-4 transition-colors",
          active ? "border-accent/50 bg-accent-soft/40" : "border-line",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{isGemini ? "Google Gemini" : "Anthropic Claude"}</h3>
          <span
            className={clsx(
              "rounded-full px-2 py-px text-[11px] font-semibold",
              isGemini ? "bg-[color-mix(in_oklab,var(--tc-green)_15%,transparent)] text-[var(--tc-green)]" : "bg-sunken text-ink-3",
            )}
          >
            {isGemini ? "Free" : "Pay as you go"}
          </span>
          {hint && (
            <span className="ml-auto flex items-center gap-1 text-xs text-accent">
              <CheckCircle2 className="size-3.5" /> {active ? "In use" : "Connected"} · {hint}
            </span>
          )}
        </div>

        {isGemini ? (
          <ol className="mt-3 space-y-1.5 text-[13.5px] text-ink-2">
            <Step n={1}>
              Open{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
                Google AI Studio <ExternalLink className="size-3" />
              </a>{" "}
              and sign in with any Google account.
            </Step>
            <Step n={2}>
              Click <strong>Create API key</strong>, then copy it. No credit card needed.
            </Step>
            <Step n={3}>Paste it below.</Step>
          </ol>
        ) : (
          <p className="mt-2 text-[13.5px] text-ink-2">
            Needs a key from{" "}
            <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
              platform.claude.com <ExternalLink className="size-3" />
            </a>{" "}
            with API credits. A Claude Pro subscription doesn&apos;t include API access.
          </p>
        )}

        {fromEnv ? (
          <p className="mt-3 text-xs text-ink-3">This key is set on the server ({isGemini ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY"}), so it can&apos;t be changed here.</p>
        ) : (
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) void saveKey(provider);
            }}
          >
            <input
              className={inputClass}
              type="password"
              autoComplete="off"
              spellCheck={false}
              aria-label={`${isGemini ? "Gemini" : "Claude"} API key`}
              placeholder={hint ? `Replace saved key ${hint}` : isGemini ? "Paste your Gemini API key" : "sk-ant-…"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button type="submit" variant={isGemini ? "primary" : "secondary"} disabled={!value.trim() || Boolean(busy)}>
              {busy === provider && <Spinner className="size-3.5" />} {hint ? "Replace" : "Save"}
            </Button>
            {hint && (
              <Button variant="ghost" size="icon" aria-label="Remove key" title="Remove key" onClick={() => removeKey(provider)} disabled={Boolean(busy)}>
                <Trash2 />
              </Button>
            )}
          </form>
        )}

        {isGemini && (
          <p className="mt-3 flex gap-1.5 text-xs text-ink-3">
            <ShieldAlert className="mt-px size-3.5 shrink-0" />
            On the free tier Google may use what you send (notes and PDFs) to improve its products, and there are daily limits. Don&apos;t send anything private.
          </p>
        )}
      </section>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="AI settings"
      description="AI writes study sheets, makes flashcards and quizzes from your notes, and reads scanned PDFs. Everything else works without it."
    >
      {!status ? (
        <div className="grid h-40 place-items-center">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          {providerCard("gemini")}
          {providerCard("claude")}

          {both && (
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line px-4 py-3 text-sm">
              <legend className="sr-only">Provider to use</legend>
              <span className="font-medium">Use for AI features</span>
              {(["gemini", "claude"] as const).map((p) => (
                <label key={p} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="ai-provider"
                    className="accent-[var(--accent)]"
                    checked={status.provider === p}
                    disabled={Boolean(busy)}
                    onChange={() => update({ provider: p }, "provider")}
                  />
                  {p === "gemini" ? "Gemini (free)" : "Claude"}
                </label>
              ))}
            </fieldset>
          )}

          <p className="text-xs text-ink-3">Keys are stored only in this app&apos;s database on your computer and are never shown again.</p>
        </div>
      )}
    </Dialog>
  );
}
