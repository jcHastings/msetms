"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useDismissable } from "@/components/use-dismissable";
import { sendToQuickbooksAction } from "@/lib/actions";
import {
  returnLoadToOperationsAction,
  sendToAccountingAction,
} from "@/lib/dispatcher-actions";
import { loadIsOnAccountingDesk } from "@/lib/accounting-desk-shared";
import { isBillableStatus } from "@/lib/types";

export const ACCOUNTING_MANAGEMENT_HREF = "/accounting/invoices";

function goToAccountingManagement(router: { push: (href: string) => void }, href = ACCOUNTING_MANAGEMENT_HREF): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get("embed") === "1" && window.parent !== window) {
    window.parent.postMessage({ type: "ms-go", href }, window.location.origin);
    return;
  }
  router.push(href);
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sentHere, setSentHere] = useState(false);
  const onDesk = sentHere || loadIsOnAccountingDesk({ accounting_desk: desk, status });
  const archived = desk === "archived";
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
    setSentHere(true);
    router.refresh();
  }

  async function sendQuickbooks() {
    setPending(true);
    setError("");
    const form = new FormData();
    form.set("load_id", String(loadId));
    let result = await sendToQuickbooksAction(null, form);
    if (!result.ok && /already|again/i.test(result.error)) {
      if (!window.confirm("This load already has a QuickBooks invoice. Send again?")) {
        setPending(false);
        return;
      }
      form.set("confirm_resend", "1");
      result = await sendToQuickbooksAction(null, form);
    }
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
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
    if (variant === "menu") {
      return (
        <>
          <button
            type="button"
            className="menu-item w-full text-left"
            data-qbo-menu-send=""
            disabled={pending}
            onClick={() => void sendQuickbooks()}
          >
            {pending ? "Sending…" : "Send to QuickBooks"}
          </button>
          {canReturn ? (
            <button
              type="button"
              className="menu-item w-full text-left"
              disabled={pending}
              onClick={() => void sendBack()}
            >
              {pending ? "Sending…" : "Send back to Load Management"}
            </button>
          ) : null}
          {error ? <p className="px-3 py-1 text-sm text-rose-700">{error}</p> : null}
        </>
      );
    }
    return (
      <div className="space-y-2" data-accounting-sent="">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950">
          Load has been Sent to Accounting Management
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-secondary"
            type="button"
            data-accounting-manage-invoices=""
            onClick={() => goToAccountingManagement(router, ACCOUNTING_MANAGEMENT_HREF)}
          >
            Manage Invoices
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            data-accounting-manage-bills=""
            onClick={() => goToAccountingManagement(router, `${ACCOUNTING_MANAGEMENT_HREF}?tab=bills`)}
          >
            Manage Bills
          </button>
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

  if (!canSend) return null;
  if (variant !== "menu" && !isBillableStatus(status)) return null;

  const confirm = (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-slate-900/40 p-4 sm:flex sm:items-center sm:justify-center"
      data-accounting-send-overlay=""
    >
      <div ref={panelRef} className="card mx-auto my-3 w-full max-w-md p-5 shadow-xl sm:my-0">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Are you sure?</h2>
          <button className="btn btn-secondary" type="button" data-accounting-send-close="" onClick={() => setOpen(false)} disabled={pending}>
            Close
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Send Load #{loadNumber} from Load Management to Accounting Management. It is ready for
          invoicing and billing, leaves Active loads, and shows in Accounting Management. To undo
          later, use Send back to Load Management from Admin / Financials.
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
        <button type="button" className="menu-item w-full text-left" data-accounting-menu-send="" onClick={() => setOpen(true)}>
          Send to Accounting Manager
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
