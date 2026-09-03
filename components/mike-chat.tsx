"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { askMikeAction, confirmMikeProposalAction } from "@/lib/mike-actions";
import {
  imageFileFromDataTransfer,
  MIKE_MISSING_KEY_MESSAGE,
  namedTieSheetImage,
  type MikeMessage,
  type MikeProposal,
} from "@/lib/mike-shared";

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
  const [fileName, setFileName] = useState("");
  const [discarded, setDiscarded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messages = state?.messages ?? initialMessages;
  const proposals = discarded ? [] : state?.proposals ?? [];
  const ready = state?.configured ?? liveConfigured ?? configured;

  const receiveImage = useCallback((file: File) => {
    const input = fileInputRef.current;
    if (!input) return;
    const named = namedTieSheetImage(file);
    const transfer = new DataTransfer();
    transfer.items.add(named);
    input.files = transfer.files;
    setFileName(named.name);
  }, []);

  const takeImageFromTransfer = useCallback(
    (data: DataTransfer | null | undefined) => {
      const image = imageFileFromDataTransfer(data);
      if (!image) return false;
      receiveImage(image);
      return true;
    },
    [receiveImage],
  );

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

  useEffect(() => {
    setDiscarded(false);
  }, [state]);

  useEffect(() => {
    const onWindowPaste = (event: ClipboardEvent) => {
      if (!takeImageFromTransfer(event.clipboardData)) return;
      event.preventDefault();
    };
    document.addEventListener("paste", onWindowPaste, true);
    return () => document.removeEventListener("paste", onWindowPaste, true);
  }, [takeImageFromTransfer]);

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
            Ask who is empty, draft a detention email, start a load from a rate-con, or paste or upload a Tie Sheet
            truck picture. Confirm before anything saves.
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
                onDiscard={() => {
                  setDiscarded(true);
                  setConfirmNotice("Draft discarded. The load was not saved.");
                }}
              />
            ))}
          </div>
        ) : null}
        {confirmNotice ? <p className="text-sm text-emerald-800">{confirmNotice}</p> : null}
        {state && !state.ok && state.error ? (
          <p className="text-sm text-rose-700">{state.error}</p>
        ) : null}
      </div>
      <form
        action={formAction}
        className="border-t border-slate-200 p-3"
        data-mike-composer=""
        onPaste={(event) => {
          if (takeImageFromTransfer(event.clipboardData)) event.preventDefault();
        }}
        onDragOver={(event) => {
          if (imageFileFromDataTransfer(event.dataTransfer)) event.preventDefault();
        }}
        onDrop={(event) => {
          if (takeImageFromTransfer(event.dataTransfer)) event.preventDefault();
        }}
      >
        <label htmlFor="mike-question" className="sr-only">
          Ask Mike
        </label>
        <textarea
          id="mike-question"
          name="question"
          rows={2}
          placeholder="Ask Mike, or paste a Tie Sheet picture"
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <label className="mt-2 block text-xs font-medium text-slate-600" htmlFor="mike-tie-sheet-image">
          Tie Sheet picture
        </label>
        <input
          ref={fileInputRef}
          id="mike-tie-sheet-image"
          name="tie_sheet_image"
          type="file"
          accept="image/*"
          data-tie-sheet-image=""
          className="mt-1 block w-full text-xs"
          onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name ?? "")}
        />
        {fileName ? <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{fileName}</p> : null}
        <button className="btn btn-primary mt-2 w-full" type="submit" disabled={pending}>
          {pending ? "Working…" : fileName ? "Read picture" : "Ask Mike"}
        </button>
      </form>
    </aside>
  );
}

function ProposalCard({
  proposal,
  onDone,
  onDiscard,
}: {
  proposal: MikeProposal;
  onDone: (text: string) => void;
  onDiscard: () => void;
}) {
  const [pending, setPending] = useState(false);
  const isTieSheet = proposal.kind === "build_tie_sheet";
  return (
    <form
      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
      data-tie-sheet-draft={isTieSheet ? "" : undefined}
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
        if (result.ok && isTieSheet && result.id) {
          window.location.href = `/loads/${result.id}`;
        }
      }}
    >
      <input type="hidden" name="kind" value={proposal.kind} />
      {Object.entries(proposal.payload).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{proposal.title}</div>
      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{proposal.preview}</p>
      {isTieSheet ? (
        <p className="mt-2 text-xs text-amber-900">
          Review the draft. Confirm saves the load. Discard does not.
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Working…" : "Confirm"}
        </button>
        {isTieSheet ? (
          <button
            className="btn btn-secondary"
            type="button"
            data-tie-sheet-discard=""
            disabled={pending}
            onClick={onDiscard}
          >
            Discard
          </button>
        ) : null}
      </div>
    </form>
  );
}
