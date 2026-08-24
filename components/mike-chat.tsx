"use client";

import { useActionState, useEffect, useState } from "react";
import { askMikeAction } from "@/lib/mike-actions";
import { MIKE_MISSING_KEY_MESSAGE, type MikeMessage } from "@/lib/mike-shared";

export function MikeChat({
  configured,
  initialMessages,
}: {
  configured: boolean;
  initialMessages: MikeMessage[];
}) {
  const [state, formAction, pending] = useActionState(askMikeAction, null);
  const [liveConfigured, setLiveConfigured] = useState<boolean | null>(null);
  const messages = state?.messages ?? initialMessages;
  const ready = state?.configured ?? liveConfigured ?? configured;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mike", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { configured?: unknown }) => {
        if (!cancelled && typeof body.configured === "boolean") {
          setLiveConfigured(body.configured);
        }
      })
      .catch(() => {
        // Keep the server-rendered flag. Never log keys.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="card flex h-full min-h-[24rem] w-full flex-col">
      <header className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold">Mike</h2>
        <p className="mt-0.5 text-xs text-slate-500">Dispatcher assistant. TMS data only. gpt-4o-mini.</p>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {!ready ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
            {MIKE_MISSING_KEY_MESSAGE}
          </p>
        ) : null}
        {messages.length === 0 && ready ? (
          <p className="text-slate-500">
            Ask who is empty, who is closest to a city, or what a truck is doing. Mike will not invent GPS.
          </p>
        ) : null}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={message.role === "user" ? "text-navy" : "text-slate-800"}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {message.role === "user" ? "You" : "Mike"}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap">{message.content}</p>
          </div>
        ))}
        {state && !state.ok && state.error ? (
          <p className="text-sm text-rose-700">{state.error}</p>
        ) : null}
      </div>
      <form action={formAction} className="border-t border-slate-200 p-3">
        <label htmlFor="mike-question" className="sr-only">
          Ask Mike
        </label>
        <textarea
          id="mike-question"
          name="question"
          rows={2}
          required
          placeholder="Closest driver to Amarillo TX?"
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button className="btn btn-primary mt-2 w-full" type="submit" disabled={pending}>
          {pending ? "Asking…" : "Ask Mike"}
        </button>
      </form>
    </aside>
  );
}
