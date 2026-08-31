"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendCustomerInvoiceMailAction } from "@/lib/dispatcher-actions";
import type { InvoiceMailExtraDoc } from "@/lib/load-mail";

export function EmailInvoiceButton({
  loadId,
  email,
  lastSent,
  extras = [],
  defaultBody = "",
  variant = "button",
}: {
  loadId: number;
  email: string;
  lastSent?: string;
  extras?: InvoiceMailExtraDoc[];
  defaultBody?: string;
  variant?: "button" | "link";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(defaultBody);
  const [selected, setSelected] = useState<number[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const to = email.trim();

  function start() {
    if (!to) {
      setNotice({ ok: false, text: "This load has no customer email." });
      return;
    }
    setBody(defaultBody);
    setNotice(null);
    setOpen(true);
  }

  function toggle(id: number) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function send(ids: number[]) {
    if (!to) {
      setNotice({ ok: false, text: "This load has no customer email." });
      return;
    }
    const extraNote = ids.length ? ` and ${ids.length} document${ids.length === 1 ? "" : "s"}` : "";
    if (!window.confirm(`Email this invoice${extraNote} to ${to} from ar@msloads.com?`)) return;
    setPending(true);
    setNotice(null);
    const form = new FormData();
    form.set("load_id", String(loadId));
    form.set("body", body);
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
    <div className={variant === "link" ? "space-y-1" : "space-y-1"}>
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
          {extras.length > 0 ? (
            <>
              <div className="font-medium text-slate-800">Attach load documents</div>
              <p className="text-xs text-slate-500">Invoice PDF is always attached.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="acct-link"
                  type="button"
                  disabled={pending}
                  onClick={() => setSelected(extras.map((file) => file.id))}
                >
                  Attach all
                </button>
                <button className="acct-link" type="button" disabled={pending} onClick={() => setSelected([])}>
                  Clear
                </button>
              </div>
              <ul className="max-h-48 space-y-1 overflow-auto">
                {extras.map((file) => (
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
