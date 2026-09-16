"use client";

import clsx from "clsx";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, inputClass } from "./Button";
import { Dialog } from "./Dialog";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  description?: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
}

interface Feedback {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const FeedbackContext = createContext<Feedback | null>(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [promptState, setPromptState] = useState<(PromptOptions & { resolve: (v: string | null) => void }) | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" || message.length > 90 ? 9000 : 3200);
    },
    [dismiss],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })),
    [],
  );

  const prompt = useCallback((options: PromptOptions) => {
    setPromptValue(options.initial ?? "");
    return new Promise<string | null>((resolve) => setPromptState({ ...options, resolve }));
  }, []);

  const value = useMemo(() => ({ toast, confirm, prompt }), [toast, confirm, prompt]);

  const closeConfirm = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };
  const closePrompt = (v: string | null) => {
    promptState?.resolve(v);
    setPromptState(null);
  };

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <Dialog
        open={Boolean(confirmState)}
        onClose={() => closeConfirm(false)}
        title={confirmState?.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => closeConfirm(false)}>
              Cancel
            </Button>
            <Button variant={confirmState?.danger ? "danger" : "primary"} onClick={() => closeConfirm(true)} autoFocus>
              {confirmState?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        {confirmState?.message && <div className="text-sm leading-relaxed text-ink-2">{confirmState.message}</div>}
      </Dialog>

      <Dialog
        open={Boolean(promptState)}
        onClose={() => closePrompt(null)}
        title={promptState?.title}
        description={promptState?.description}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => closePrompt(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="prompt-form" disabled={!promptValue.trim()}>
              {promptState?.confirmLabel ?? "Save"}
            </Button>
          </>
        }
      >
        <form
          id="prompt-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (promptValue.trim()) closePrompt(promptValue.trim());
          }}
        >
          {promptState?.label && <label className="mb-1.5 block text-[13px] font-medium text-ink-2">{promptState.label}</label>}
          <input
            autoFocus
            className={inputClass}
            value={promptValue}
            placeholder={promptState?.placeholder}
            maxLength={200}
            onChange={(e) => setPromptValue(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </form>
      </Dialog>

      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            // Click-through: a notice must never sit in front of a button (only its own dismiss works).
            className="pointer-events-none flex animate-pop items-start gap-2.5 rounded-xl border border-line bg-card px-3.5 py-3 text-sm shadow-float"
          >
            {t.kind === "success" && <CheckCircle2 className="mt-px size-4 shrink-0 text-accent" />}
            {t.kind === "error" && <AlertCircle className="mt-px size-4 shrink-0 text-danger" />}
            {t.kind === "info" && <Info className="mt-px size-4 shrink-0 text-ink-3" />}
            <p className={clsx("flex-1 leading-snug", t.kind === "error" ? "text-ink" : "text-ink-2")}>{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="pointer-events-auto text-ink-3 hover:text-ink" aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}
