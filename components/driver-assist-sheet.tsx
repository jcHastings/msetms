"use client";

import { useState } from "react";

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

export function DriverAssistSheet({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ChatRow[]>([]);

  async function send() {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/driver/v1/assist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const body = (await response.json()) as
        | AssistReply
        | { ok?: false; error?: string };
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
        className={`btn btn-secondary min-h-11 ${className}`.trim()}
        onClick={() => setOpen(true)}
      >
        Assist
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/80 p-3 sm:p-6">
          <div className="mx-auto flex h-full max-w-lg flex-col rounded-2xl bg-slate-900 ring-1 ring-white/10">
            <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-white">Driver Assist</h2>
                <p className="text-xs text-slate-400">
                  Uses only your assigned load and assigned truck or trailer docs.
                </p>
              </div>
              <button type="button" className="btn btn-secondary min-h-10" onClick={() => setOpen(false)}>
                Close
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {rows.length === 0 ? (
                <div className="rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-300">
                  Ask about appointments, hours, addresses, notes, or assigned equipment documents.
                </div>
              ) : null}
              {rows.map((row, index) => (
                <article key={`${index}-${row.question}`} className="space-y-2 rounded-xl bg-slate-800 p-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">You</div>
                    <p className="whitespace-pre-wrap text-sm text-white">{row.question}</p>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Assist</div>
                    <p className="whitespace-pre-wrap text-sm text-slate-200">{row.reply.answer}</p>
                    {row.reply.documents.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-xs text-slate-300">
                        {row.reply.documents.map((doc) => (
                          <li key={doc.id}>
                            <a className="underline" href={doc.href}>
                              {doc.original_name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="border-t border-white/10 px-4 py-3">
              {error ? <p className="mb-2 text-sm text-rose-300">{error}</p> : null}
              <label htmlFor="driver-assist-question" className="sr-only">
                Ask driver assist
              </label>
              <textarea
                id="driver-assist-question"
                className="w-full resize-none rounded-xl bg-slate-950 px-3 py-2 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-sky-500"
                rows={3}
                value={question}
                maxLength={500}
                placeholder="Ask from your assigned load..."
                onChange={(event) => setQuestion(event.target.value)}
              />
              <div className="mt-2 flex justify-end">
                <button className="btn btn-primary min-h-11" type="button" disabled={pending} onClick={() => void send()}>
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
