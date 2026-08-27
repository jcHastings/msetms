"use client";

import { useActionState, useEffect, useState } from "react";
import { askMikeAction, confirmMikeProposalAction } from "@/lib/mike-actions";
import { MIKE_MISSING_KEY_MESSAGE, type MikeMessage, type MikeProposal } from "@/lib/mike-shared";

export function MikeChat({
  configured,
  initialMessages,
}: {
  configured: boolean;
  initialMessages: MikeMessage[];
}) {
  const [state, formAction, pending] = useActionState(askMikeAction, null);
  const [liveConfigured, setLiveConfigured] = useState<boolean | null>(null);
  const [confirmNotice, setConfirmNotice] = useState<string | null>(null);
  const messages = state?.messages ?? initialMessages;
  const proposals = state?.proposals ?? [];
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
        <p className="mt-0.5 text-xs text-slate-500">Dispatcher assistant.</p>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {!ready ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
            {MIKE_MISSING_KEY_MESSAGE}
          </p>
        ) : null}
        {messages.length === 0 && ready ? (
          <p className="text-slate-500">
            Ask who is empty, draft a detention email, or start a load from a rate-con. Confirm before anything sends.
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
        {proposals.length > 0 ? (
          <div className="space-y-2">
            {proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                onDone={(text) => setConfirmNotice(text)}
              />
            ))}
          </div>
        ) : null}
        {confirmNotice ? <p className="text-sm text-emerald-800">{confirmNotice}</p> : null}
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
          placeholder="Draft detention on 1005921"
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button className="btn btn-primary mt-2 w-full" type="submit" disabled={pending}>
          {pending ? "Asking…" : "Ask Mike"}
        </button>
      </form>
    </aside>
  );
}

function ProposalCard({
  proposal,
  onDone,
}: {
  proposal: MikeProposal;
  onDone: (text: string) => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <form
      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
      action={async (formData) => {
        setPending(true);
        const result = await confirmMikeProposalAction(formData);
        setPending(false);
        if (!result.ok) {
          onDone(result.error);
          return;
        }
        onDone(result.message ?? "Done.");
        if (proposal.kind === "detention_email" && proposal.payload.to) {
          const mailto = `mailto:${encodeURIComponent(proposal.payload.to)}?subject=${encodeURIComponent(proposal.payload.subject || "")}&body=${encodeURIComponent(proposal.payload.body || "")}`;
          window.location.href = mailto;
        }
        if (proposal.payload.href) {
          window.location.href = proposal.payload.href;
        }
      }}
    >
      <input type="hidden" name="kind" value={proposal.kind} />
      {Object.entries(proposal.payload).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{proposal.title}</div>
      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{proposal.preview}</p>
      <button className="btn btn-primary mt-2" type="submit" disabled={pending}>
        {pending ? "Working…" : "Confirm"}
      </button>
    </form>
  );
}
