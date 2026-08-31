"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendCustomerInvoiceMailAction } from "@/lib/dispatcher-actions";

export function EmailInvoiceButton({
  loadId,
  email,
  lastSent,
  variant = "button",
}: {
  loadId: number;
  email: string;
  lastSent?: string;
  variant?: "button" | "link";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const to = email.trim();

  async function send() {
    if (!to) {
      setNotice({ ok: false, text: "This load has no customer email." });
      return;
    }
    if (!window.confirm(`Email this invoice to ${to} from ar@msloads.com?`)) return;
    setPending(true);
    setNotice(null);
    const form = new FormData();
    form.set("load_id", String(loadId));
    const result = await sendCustomerInvoiceMailAction(form);
    setPending(false);
    if (!result.ok) {
      setNotice({ ok: false, text: result.error });
      return;
    }
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
        onClick={() => void send()}
      >
        {pending ? "Sending…" : "Email invoice"}
      </button>
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
