"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sendCustomerInvoiceMailAction } from "@/lib/dispatcher-actions";
import { isInvoiceMailCustomerDoc } from "@/lib/load-documents-shared";
import type { InvoiceMailExtraDoc } from "@/lib/load-mail";

export function EmailInvoiceButton({
  loadId,
  email,
  lastSent,
  extras = [],
  defaultBody = "",
  variant = "button",
  anchorId,
}: {
  loadId: number;
  email: string;
  lastSent?: string;
  extras?: InvoiceMailExtraDoc[];
  defaultBody?: string;
  variant?: "button" | "link";
  anchorId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(defaultBody);
  const [typedTo, setTypedTo] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const storedTo = email.trim();
  const attachable = extras.filter((file) => isInvoiceMailCustomerDoc({ kind: file.kind, original_name: file.name }));

  function start() {
    setBody(defaultBody);
    setTypedTo("");
    setNotice(null);
    setOpen(true);
  }

  useEffect(() => {
    if (!anchorId || typeof window === "undefined") return;
    if (window.location.hash.replace(/^#/, "") !== anchorId) return;
    setBody(defaultBody);
    setTypedTo("");
    setNotice(null);
    setOpen(true);
    window.setTimeout(() => document.getElementById(anchorId)?.scrollIntoView({ block: "start" }), 0);
  }, [anchorId, defaultBody]);

  function toggle(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function send(ids: number[]) {
    const to = storedTo || typedTo.trim();
    if (!to) {
      setNotice({ ok: false, text: "Enter an email to send this invoice." });
      return;
    }
    const extraNote = ids.length ? ` and ${ids.length} document${ids.length === 1 ? "" : "s"}` : "";
    if (!window.confirm(`Email this invoice${extraNote} to ${to} from ar@msloads.com?`)) return;
    setPending(true);
    setNotice(null);
    const form = new FormData();
    form.set("load_id", String(loadId));
    form.set("body", body);
    if (!storedTo) form.set("to", to);
    for (const id of ids) form.append("extra_id", String(id));
    const result = await sendCustomerInvoiceMailAction(form);
    setPending(false);
    if (!result.ok) {
      setNotice({ ok: false, text: result.error });
      return;
    }
    setOpen(false);
    setNotice({ ok: true, text: result.message || `Invoice emailed to ${to}.` });
    router.refresh();
  }

  return (
    <div id={anchorId} className={variant === "link" ? "space-y-1" : "space-y-1"}>
      <button
        className={variant === "link" ? "acct-link" : "btn btn-secondary"}
        type="button"
        data-email-invoice=""
        disabled={pending}
        onClick={() => (open ? void send(selected) : start())}
      >
        {pending ? "Sending…" : open ? "Send invoice email" : "Email invoice"}
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm" data-email-invoice-docs="">
          {storedTo ? (
            <p className="text-xs text-slate-600" data-email-invoice-to="">
              To {storedTo}
            </p>
          ) : (
            <div className="field">
              <label htmlFor={`invoice-email-to-${loadId}`}>Send to</label>
              <input
                id={`invoice-email-to-${loadId}`}
                name="to"
                type="email"
                autoComplete="email"
                value={typedTo}
                disabled={pending}
                placeholder="Customer email"
                data-email-invoice-to-input=""
                onChange={(event) => setTypedTo(event.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor={`invoice-email-body-${loadId}`}>Email body</label>
            <textarea
              id={`invoice-email-body-${loadId}`}
              name="body"
              rows={6}
              value={body}
              disabled={pending}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          {attachable.length > 0 ? (
            <>
              <div className="font-medium text-slate-800">Attach load documents</div>
              <p className="text-xs text-slate-500">Invoice PDF is always attached.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="acct-link"
                  type="button"
                  disabled={pending}
                  onClick={() => setSelected(attachable.map((file) => file.id))}
                >
                  Attach all
                </button>
                <button className="acct-link" type="button" disabled={pending} onClick={() => setSelected([])}>
                  Clear
                </button>
              </div>
              <ul className="max-h-48 space-y-1 overflow-auto">
                {attachable.map((file) => (
                  <li key={file.id}>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        name="extra_id"
                        value={file.id}
                        checked={selected.includes(file.id)}
                        disabled={pending}
                        onChange={() => toggle(file.id)}
                      />
                      <span>
                        <span className="font-medium">{file.kindLabel}</span>
                        <span className="text-slate-500"> · {file.name}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-slate-500">Invoice PDF is always attached.</p>
          )}
          <button className="acct-link" type="button" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      ) : null}
      {lastSent ? <div className="text-xs text-slate-500">{lastSent}</div> : null}
      {notice ? (
        <p
          className={notice.ok ? "text-xs text-emerald-800" : "text-xs text-rose-700"}
          data-email-invoice-notice=""
          role="status"
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
