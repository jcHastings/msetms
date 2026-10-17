"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { confirmDeliveredInvoiceAction } from "@/lib/actions";
import type { ActionResult } from "@/lib/types";

type PromptState = { loadId: number; email: string; error: string; busy: boolean } | null;

let promptState: PromptState = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getPrompt() {
  return promptState;
}

export function offerInvoicePrompt(result: ActionResult) {
  if (!result.ok || !result.invoicePrompt?.email) return;
  promptState = {
    loadId: result.invoicePrompt.loadId,
    email: result.invoicePrompt.email,
    error: "",
    busy: false,
  };
  emit();
}

export function InvoiceSendPromptHost() {
  const router = useRouter();
  const prompt = useSyncExternalStore(subscribe, getPrompt, () => null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!prompt) return;
    sendRef.current?.focus();
  }, [prompt?.loadId, prompt?.email]);

  useEffect(() => {
    if (!prompt) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (pendingRef.current) return;
        promptState = null;
        emit();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = [...root.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [prompt]);

  if (!prompt) return null;

  async function send() {
    if (!prompt || pendingRef.current) return;
    pendingRef.current = true;
    promptState = { ...prompt, error: "", busy: true };
    emit();
    const formData = new FormData();
    formData.set("load_id", String(prompt.loadId));
    const result = await confirmDeliveredInvoiceAction(formData);
    pendingRef.current = false;
    if (!result.ok) {
      promptState = { ...prompt, error: result.error, busy: false };
      emit();
      return;
    }
    promptState = null;
    emit();
    router.refresh();
  }

  function dismiss() {
    if (pendingRef.current) return;
    promptState = null;
    emit();
  }

  return (
    <div className="invoice-send-backdrop" role="presentation" onClick={dismiss}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-send-title"
        data-invoice-send-prompt=""
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="invoice-send-title" className="text-base font-semibold text-slate-900">
          Send the invoice to {prompt.email} now?
        </h2>
        {prompt.error ? (
          <p className="mt-2 text-sm text-rose-700" role="alert" data-invoice-send-error="">
            {prompt.error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            className="btn btn-secondary"
            type="button"
            data-invoice-send-dismiss=""
            disabled={prompt.busy}
            onClick={dismiss}
          >
            Not now
          </button>
          <button
            ref={sendRef}
            className="btn btn-primary"
            type="button"
            data-invoice-send-accept=""
            disabled={prompt.busy}
            onClick={() => void send()}
          >
            {prompt.busy ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
