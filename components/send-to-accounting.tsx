"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  returnLoadToOperationsAction,
  sendToAccountingAction,
} from "@/lib/dispatcher-actions";
import { loadIsOnAccountingDesk } from "@/lib/accounting-desk-shared";
import { isBillableStatus } from "@/lib/types";

export function SendToAccountingControls({
  loadId,
  loadNumber,
  status,
  desk,
  canSend,
  canReturn,
  variant = "button",
}: {
  loadId: number;
  loadNumber: string;
  status: string;
  desk?: string;
  canSend: boolean;
  canReturn: boolean;
  variant?: "button" | "menu" | "header";
}) {
  const onDesk = loadIsOnAccountingDesk({ accounting_desk: desk, status });
  const archived = desk === "archived";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setPending(true);
    setError("");
    const form = new FormData();
    form.set("load_id", String(loadId));
    const result = await sendToAccountingAction(form);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function sendBack() {
    setPending(true);
    setError("");
    const form = new FormData();
    form.set("load_id", String(loadId));
    const result = await returnLoadToOperationsAction(form);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (onDesk && !archived) {
    if (variant === "header") return null;
    return (
      <div className="space-y-2" data-accounting-sent="">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Load has been Sent to Accounting Management
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-secondary" href="/accounting/invoices">
            Manage Invoices
          </a>
          <a className="btn btn-secondary" href="/accounting/invoices?tab=bills">
            Manage Bills
          </a>
          {canReturn ? (
            <button className="btn btn-secondary" type="button" onClick={sendBack} disabled={pending}>
              {pending ? "Sending…" : "Send back to Load Management"}
            </button>
          ) : null}
        </div>
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </div>
    );
  }

  if (archived) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
        This load is archived in Accounting.
      </div>
    );
  }

  if (!canSend || !isBillableStatus(status)) return null;

  return (
    <div>
      {variant === "menu" ? (
        <button type="button" className="menu-item w-full text-left" onClick={() => setOpen(true)}>
          Send to Accounting Management
        </button>
      ) : (
        <button className="btn btn-primary bg-slate-900" type="button" onClick={() => setOpen(true)}>
          Send to Accounting Management
        </button>
      )}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-slate-900">Send to Accounting Management</h2>
            <p className="mt-2 text-sm text-slate-600">
              This load is ready for invoicing and billing. It will leave Active loads and appear in
              Accounting Management.
            </p>
            {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </button>
              <button className="btn btn-primary bg-slate-900" type="button" onClick={send} disabled={pending}>
                {pending ? "Sending…" : `Yes, Send Load #${loadNumber} to Accounting`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
