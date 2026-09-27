"use client";

import { useId, useState } from "react";
import {
  DRIVER_ASSIST_CHIPS,
  assistCabDocKindLabel,
  assistCabDocOwnerLabel,
} from "@/lib/driver-assist-shared";

type AssistDocument = {
  id: number;
  kind: string;
  owner_type: "driver" | "truck" | "trailer";
  owner_id: number;
  original_name: string;
  href: string;
};

type AssistReply = {
  answer: string;
  unknown: boolean;
  documents: AssistDocument[];
};

type ChatRow = {
  question: string;
  reply: AssistReply;
};

function isCabDocsTurn(row: ChatRow): boolean {
  return row.reply.documents.length > 0 || /file on file/i.test(row.reply.answer);
}

export function DriverAssistSheet({
  className = "",
  label = "Assist",
}: {
  className?: string;
  label?: string;
}) {
  const titleId = useId();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ChatRow[]>([]);

  async function send(raw?: string) {
    const trimmed = (raw ?? question).trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/driver/v1/assist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const body = (await response.json()) as AssistReply | { ok?: false; error?: string };
      if (!response.ok || !("answer" in body)) {
        const message = typeof body === "object" && body && "error" in body ? body.error : "";
        setError(message || "Could not answer right now.");
        return;
      }
      setRows((prev) => [...prev, { question: trimmed, reply: body }]);
      setQuestion("");
    } catch {
      setError("Could not answer right now.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`btn btn-secondary min-h-12 ${className}`.trim()}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/80 p-3 sm:p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="mx-auto flex h-full max-w-lg flex-col rounded-2xl bg-slate-900 ring-1 ring-white/10"
          >
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <h2 id={titleId} className="text-base font-semibold text-white">
                  Assist
                </h2>
                <p className="text-sm text-slate-300">
                  This load, and cab docs for the truck and trailer on it.
                </p>
              </div>
              <button type="button" className="btn btn-secondary min-h-12" onClick={() => setOpen(false)}>
                Close
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {rows.length === 0 ? (
                <p className="rounded-xl bg-slate-800 px-3 py-3 text-sm leading-relaxed text-slate-200">
                  Tap a question. Answers come from this load and the cab docs on the assigned truck and trailer.
                </p>
              ) : null}
              {rows.map((row, index) => (
                <article key={`${index}-${row.question}`} className="space-y-2 rounded-xl bg-slate-800 p-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-400">You</div>
                    <p className="whitespace-pre-wrap text-base text-white">{row.question}</p>
                  </div>
                  {isCabDocsTurn(row) ? (
                    <CabDocs answer={row.reply.answer} documents={row.reply.documents} />
                  ) : (
                    <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-100">{row.reply.answer}</p>
                  )}
                </article>
              ))}
            </div>

            <div className="border-t border-white/10 px-4 py-3">
              {error ? <p className="mb-2 text-sm text-rose-200">{error}</p> : null}
              <div className="grid grid-cols-1 gap-2" data-assist-chips="">
                {DRIVER_ASSIST_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    className="btn btn-secondary min-h-12 w-full whitespace-nowrap text-base active:scale-[0.98]"
                    data-assist-chip={chip.label}
                    disabled={pending}
                    onClick={() => void send(chip.question)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <label htmlFor={fieldId} className="mt-3 block text-sm font-medium text-slate-200">
                Or type a question
              </label>
              <textarea
                id={fieldId}
                className="mt-1 w-full resize-none rounded-xl bg-slate-950 px-3 py-2 text-base text-white ring-1 ring-white/15 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                rows={2}
                value={question}
                maxLength={500}
                placeholder="Ask about this load"
                onChange={(event) => setQuestion(event.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <button
                  className="btn min-h-12 !bg-[#0b4f91] px-5 text-base !text-white active:scale-[0.98] disabled:opacity-60"
                  type="button"
                  disabled={pending}
                  onClick={() => void send()}
                >
                  {pending ? "Checking..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CabDocs({ answer, documents }: { answer: string; documents: AssistDocument[] }) {
  if (!documents.length) {
    return <p className="text-base leading-relaxed text-slate-100">{answer}</p>;
  }
  return (
    <section aria-label="Cab docs">
      <h3 className="text-base font-semibold text-white">Cab docs</h3>
      <ul className="mt-2 space-y-2">
        {documents.map((doc) => {
          const kind = assistCabDocKindLabel(doc.kind);
          const owner = assistCabDocOwnerLabel(doc.owner_type);
          return (
            <li key={doc.id}>
              <a
                href={doc.href}
                target="_blank"
                rel="noopener"
                className="flex min-h-16 items-center gap-3 rounded-xl bg-slate-950 px-3 py-3 ring-1 ring-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold text-white">{kind}</span>
                  <span className="block text-sm text-slate-200">{owner}</span>
                  <span className="block break-words text-sm text-slate-300">{doc.original_name}</span>
                </span>
                <span className="btn min-h-12 shrink-0 !bg-[#0b4f91] px-4 text-base !text-white">Open</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
