"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { closeLoadOverlay } from "@/components/page-overlay-host";
import { useDismissable } from "@/components/use-dismissable";
import {
  returnLoadToOperationsAction,
  sendToAccountingAction,
} from "@/lib/dispatcher-actions";
import { loadIsOnAccountingDesk } from "@/lib/accounting-desk-shared";
import { safeReturnTo } from "@/lib/load-page-shared";
import { isBillableStatus } from "@/lib/types";

function returnAfterAccounting(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get("embed") === "1" && window.parent !== window) {
    window.parent.postMessage({ type: "ms-close-load" }, window.location.origin);
    return;
  }
  if (params.has("open")) {
    closeLoadOverlay(safeReturnTo(params.get("from"), "/board"));
  }
}

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
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissable(open, () => setOpen(false), panelRef);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    returnAfterAccounting();
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

  const confirm = (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-slate-900/40 p-4 sm:flex sm:items-center sm:justify-center"
      data-accounting-send-overlay=""
    >
      <div ref={panelRef} className="card mx-auto my-3 w-full max-w-md p-5 shadow-xl sm:my-0">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Send to Accounting Management</h2>
          <button className="btn btn-secondary" type="button" data-accounting-send-close="" onClick={() => setOpen(false)} disabled={pending}>
            Close
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          This load is ready for invoicing and billing. It will leave Active loads and appear in
          Accounting Management.
        </p>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </button>
          <button className="btn btn-primary bg-slate-900" type="button" onClick={() => void send()} disabled={pending}>
            {pending ? "Sending…" : `Yes, Send Load #${loadNumber} to Accounting`}
          </button>
        </div>
      </div>
    </div>
  );

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
      {open && mounted ? createPortal(confirm, document.body) : null}
    </div>
  );
}
