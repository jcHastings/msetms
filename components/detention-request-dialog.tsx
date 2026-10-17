"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  addDetentionLineAction,
  loadDetentionDraftAction,
  sendDetentionRequestAction,
  setDetentionEndPickAction,
  setDetentionStatusAction,
} from "@/lib/detention-actions";
import { formatDateTime } from "@/lib/format";
import {
  computeDetentionAmount,
  DETENTION_RATE_MISSING,
  formatDetentionMinutes,
  type DetentionDraftView,
} from "@/lib/detention-request";

/**
 * Dispatcher review for one stop. Matches the existing TMS fields and buttons.
 * Mail leaves only when Send is clicked.
 */

function DetentionEndPanel({
  draft,
  pending,
  onPick,
}: {
  draft: DetentionDraftView;
  pending: boolean;
  onPick: (source: string) => void;
}) {
  const end = draft.end;
  const pickName = useId();
  if (!end.endAt) return null;
  return (
    <section className="detention-end" data-detention-end="" data-hos-flag={end.hosFlag ? "" : undefined} aria-label="Detention end">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Detention ends</p>
      <p className="text-sm">
        <span className="detention-end-time">{formatDateTime(end.endAt)} ET</span>
        <span className="detention-end-source" data-detention-end-source={end.source}>
          {end.deskPicked ? `${end.label}, desk pick` : end.label}
        </span>
      </p>
      {end.hosFlag ? (
        <>
          <p className="text-sm font-medium text-amber-900" role="status" data-detention-hos-flag="">
            {end.flagText}
          </p>
          <fieldset className="grid gap-1" disabled={pending}>
            <legend className="sr-only">Pick the end time</legend>
            {end.candidates.map((item) => (
              <label key={item.source} className="detention-end-choice">
                <input
                  type="radio"
                  name={pickName}
                  value={item.source}
                  checked={end.deskPicked && end.source === item.source}
                  onChange={() => onPick(item.source)}
                />
                <span className="w-36 text-slate-900">{formatDateTime(item.at)} ET</span>
                <span className="text-slate-600">{item.label}</span>
              </label>
            ))}
          </fieldset>
          {end.needsDeskPick ? (
            <p className="text-xs text-amber-900">Pick one before sending. The earliest time is shown until you do.</p>
          ) : null}
        </>
      ) : null}
      {draft.notice ? (
        <p className="text-xs text-slate-600" data-detention-notice-log="">
          Broker told {formatDateTime(draft.notice.sentAt)} ET that detention started {formatDateTime(draft.notice.startAt)} ET
          {draft.notice.leadMinutes ? ` (${draft.notice.leadMinutes} min notice)` : ""}.
        </p>
      ) : null}
    </section>
  );
}

export function DetentionRequestDialog({
  loadId,
  stopId,
  onClose,
}: {
  loadId: number;
  stopId: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<DetentionDraftView | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [step, setStep] = useState<"review" | "approve" | "deny" | "paid">("review");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    panelRef.current?.focus();
    let cancelled = false;
    loadDetentionDraftAction(loadId, stopId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const next = result.draft;
      setDraft(next);
      setTo(next.to);
      setCc(next.cc);
      setSubject(next.subject);
      setBody(next.body);
      setSelected(next.attachments.filter((file) => file.selected).map((file) => file.id));
      setRate(next.rate != null ? String(next.rate) : "");
      setAmount(next.computedAmount != null ? next.computedAmount.toFixed(2) : "");
      setAmountEdited(false);
      setNote(next.request?.note ?? "");
      setStep("review");
      setError("");
    });
    return () => {
      cancelled = true;
    };
  }, [loadId, stopId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function applyDraft(next: DetentionDraftView) {
    setDraft(next);
    setTo(next.to);
    setCc(next.cc);
    setSubject(next.subject);
    setBody(next.body);
    setSelected(next.attachments.filter((file) => file.selected).map((file) => file.id));
    setRate(next.rate != null ? String(next.rate) : "");
    setAmount(next.computedAmount != null ? next.computedAmount.toFixed(2) : "");
    setAmountEdited(false);
    setNote(next.request?.note ?? "");
    setStep("review");
    setError("");
  }

  async function reload() {
    const result = await loadDetentionDraftAction(loadId, stopId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applyDraft(result.draft);
    router.refresh();
  }

  function liveAmount(nextRate: string) {
    const parsed = Number(nextRate);
    if (!draft || !Number.isFinite(parsed)) return;
    const computed = computeDetentionAmount(parsed, draft.billableMinutes, draft.cap);
    if (!amountEdited && computed != null) setAmount(computed.toFixed(2));
  }

  async function pickEnd(source: string) {
    setPending(true);
    setError("");
    const formData = new FormData();
    formData.set("load_id", String(loadId));
    formData.set("stop_id", String(stopId));
    formData.set("source", source);
    const result = await setDetentionEndPickAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await reload();
  }

  async function send() {
    if (!draft) return;
    setPending(true);
    setError("");
    const formData = new FormData();
    formData.set("load_id", String(loadId));
    formData.set("stop_id", String(stopId));
    formData.set("to", to);
    formData.set("cc", cc);
    formData.set("subject", subject);
    formData.set("body", body);
    for (const id of selected) formData.append("attachment_id", String(id));
    const result = await sendDetentionRequestAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice("Sent. Nothing else goes out until you choose a status.");
    await reload();
  }

  async function saveStatus(status: "approved" | "denied" | "paid") {
    if (!draft?.request) return;
    setPending(true);
    setError("");
    const formData = new FormData();
    formData.set("load_id", String(loadId));
    formData.set("request_id", String(draft.request.id));
    formData.set("status", status);
    formData.set("note", note);
    if (status === "approved") {
      formData.set("rate", rate);
      formData.set("amount", amount);
    }
    const result = await setDetentionStatusAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(status === "approved" ? "Approved. The detention line stays off the invoice until you add it." : "Status saved.");
    await reload();
  }

  async function addLine() {
    if (!draft?.request) return;
    setPending(true);
    setError("");
    const formData = new FormData();
    formData.set("load_id", String(loadId));
    formData.set("request_id", String(draft.request.id));
    const result = await addDetentionLineAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(result.warning || "Detention line added for review.");
    await reload();
  }

  const request = draft?.request ?? null;
  const composing = !request || request.status === "denied";

  const dialog = (
    <div className="detention-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        className="detention-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-detention-dialog=""
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            Draft detention request
          </h2>
          <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={onClose}>
            Close
          </button>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-3 text-sm text-slate-700" role="status">
            {notice}
          </p>
        ) : null}
        {!draft && !error ? <p className="mt-4 text-sm text-slate-600">Loading the detention draft.</p> : null}
        {draft ? (
          <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(14rem,0.8fr)]">
            <div className="space-y-3">
              <DetentionEndPanel draft={draft} pending={pending} onPick={(source) => void pickEnd(source)} />
              {composing ? (
                <>
                  <div className="field">
                    <label htmlFor="detention-to">To</label>
                    <input id="detention-to" value={to} onChange={(event) => setTo(event.target.value)} autoComplete="email" />
                    <p className="text-xs text-slate-600">Broker contact on the load, otherwise the customer main email.</p>
                  </div>
                  <div className="field">
                    <label htmlFor="detention-cc">Copy</label>
                    <input id="detention-cc" value={cc} onChange={(event) => setCc(event.target.value)} autoComplete="email" />
                    <p className="text-xs text-slate-600">Optional.</p>
                  </div>
                  <p className="text-xs text-slate-600">
                    Replies go to <span className="font-semibold text-slate-800">{draft.replyTo}</span>
                  </p>
                  <div className="field">
                    <label htmlFor="detention-subject">Subject</label>
                    <input id="detention-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="detention-body">Message</label>
                    <textarea id="detention-body" rows={14} value={body} onChange={(event) => setBody(event.target.value)} />
                    <p className="text-xs text-slate-600">Approval only. Leave the dollar amount out.</p>
                  </div>
                  {draft.attachments.length ? (
                    <fieldset className="space-y-1">
                      <legend className="text-sm font-medium text-slate-800">Attachments</legend>
                      {draft.attachments.map((file) => (
                        <label key={file.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={selected.includes(file.id)}
                            onChange={(event) => {
                              setSelected((current) =>
                                event.target.checked ? [...current, file.id] : current.filter((id) => id !== file.id),
                              );
                            }}
                          />
                          {file.kind.toUpperCase()}: {file.name}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <p className="text-sm text-slate-600">No POD or BOL is on this load.</p>
                  )}
                  <div className="flex justify-end">
                    <button type="button" className="btn btn-primary" data-detention-send="" disabled={pending || draft.end.needsDeskPick} onClick={() => void send()}>
                      {pending ? "Sending" : "Send"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700">
                    Status: <span className="font-semibold capitalize">{request?.status}</span>
                    {request?.sentAt ? ` · sent ${request.sentAt.slice(0, 16).replace("T", " ")}` : ""}
                  </p>
                  {request?.status === "requested" && step === "review" ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn btn-primary" data-detention-approve="" onClick={() => setStep("approve")}>
                        Approve
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setStep("deny")}>
                        Deny
                      </button>
                    </div>
                  ) : null}
                  {step === "approve" && request?.status === "requested" ? (
                    <fieldset className="space-y-3 rounded-md border border-slate-200 p-3" data-detention-approve-step="">
                      <legend className="px-1 text-sm font-semibold text-slate-900">Confirm approval</legend>
                      <p className="text-sm text-slate-700" data-detention-rate="">
                        {draft.rateLabel}
                      </p>
                      <p className="text-sm text-slate-700">Billable time: {formatDetentionMinutes(draft.billableMinutes)}</p>
                      {draft.cap != null ? <p className="text-sm text-slate-700">Rate confirmation cap ${draft.cap.toFixed(2)}</p> : null}
                      <div className="field">
                        <label htmlFor="detention-rate">Rate per hour</label>
                        <input
                          id="detention-rate"
                          inputMode="decimal"
                          value={rate}
                          onChange={(event) => {
                            setRate(event.target.value);
                            liveAmount(event.target.value);
                          }}
                        />
                        {draft.rate == null ? <p className="text-xs text-amber-900">{DETENTION_RATE_MISSING}</p> : null}
                      </div>
                      <div className="field">
                        <label htmlFor="detention-amount">Amount</label>
                        <input
                          id="detention-amount"
                          inputMode="decimal"
                          value={amount}
                          onChange={(event) => {
                            setAmountEdited(true);
                            setAmount(event.target.value);
                          }}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="detention-note">Note</label>
                        <textarea id="detention-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" className="btn btn-secondary" onClick={() => setStep("review")}>
                          Back
                        </button>
                        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void saveStatus("approved")}>
                          {pending ? "Saving" : "Confirm approve"}
                        </button>
                      </div>
                    </fieldset>
                  ) : null}
                  {step === "deny" && request?.status === "requested" ? (
                    <div className="space-y-3">
                      <div className="field">
                        <label htmlFor="detention-deny-note">Note</label>
                        <textarea id="detention-deny-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" className="btn btn-secondary" onClick={() => setStep("review")}>
                          Back
                        </button>
                        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void saveStatus("denied")}>
                          {pending ? "Saving" : "Confirm deny"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {request?.status === "approved" ? (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-800">
                        Approved at ${request.rate?.toFixed(2) ?? "0.00"} per hour. Amount ${request.amount?.toFixed(2) ?? "0.00"}.
                      </p>
                      {draft.invoiceWarning ? (
                        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status" data-detention-invoice-warning="">
                          {draft.invoiceWarning}
                        </p>
                      ) : null}
                      {draft.qboHint ? <p className="text-sm text-slate-700">{draft.qboHint}</p> : null}
                      {request.payItemId ? (
                        <p className="text-sm text-slate-700">Detention line #{request.payItemId} is on the load for review.</p>
                      ) : (
                        <button type="button" className="btn btn-primary" data-detention-add-line="" disabled={pending} onClick={() => void addLine()}>
                          {pending ? "Adding" : "Add detention line"}
                        </button>
                      )}
                      {step === "paid" ? (
                        <div className="space-y-3">
                          <div className="field">
                            <label htmlFor="detention-paid-note">Note</label>
                            <textarea id="detention-paid-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <button type="button" className="btn btn-secondary" onClick={() => setStep("review")}>
                              Back
                            </button>
                            <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void saveStatus("paid")}>
                              {pending ? "Saving" : "Confirm paid"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="btn btn-secondary" onClick={() => setStep("paid")}>
                          Mark paid
                        </button>
                      )}
                    </div>
                  ) : null}
                  {request?.status === "paid" ? (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-800">Marked paid by hand.</p>
                      {draft.qboHint ? <p className="text-sm text-slate-700">{draft.qboHint}</p> : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <aside className="rounded-md border border-slate-200 bg-slate-50 p-3" data-detention-clause="">
              <h3 className="text-sm font-semibold text-slate-900">Detention terms</h3>
              <p className="mt-2 text-sm text-slate-800" data-detention-rate="">
                {draft.rateLabel}
              </p>
              <dl className="mt-3 space-y-2">
                {draft.termsLines.map((line) => (
                  <div key={line.key}>
                    <dt className="text-sm text-slate-600">{line.label}</dt>
                    <dd className="text-sm text-slate-900" data-detention-term={line.key} data-detention-source={line.source}>
                      {line.text}
                      {line.sourceLabel ? ` · ${line.sourceLabel}` : ""}
                    </dd>
                  </div>
                ))}
              </dl>
              {draft.clause ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{draft.clause}</p>
              ) : (
                <p className="mt-3 text-sm text-slate-600">This rate confirmation has no detention clause.</p>
              )}
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
  // Portal to <body>: the stops card is a glass panel, and a fixed overlay inside it is clipped to the card.
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
