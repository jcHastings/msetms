"use client";

import { useActionState } from "react";
import { FormBanner } from "@/components/form-banner";
import {
  createInvoiceFromLoadAction,
  setCommissionPaidAction,
  setDriverPayPaidAction,
  updateInvoiceStatusAction,
} from "@/lib/actions";
import { formatMoneyCents } from "@/lib/format";
import type { ActionResult, InvoiceStatus, LoadView } from "@/lib/types";

export function CreateInvoiceForm({ loads }: { loads: LoadView[] }) {
  const [state, formAction, pending] = useActionState(
    createInvoiceFromLoadAction as (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>,
    null,
  );

  if (loads.length === 0) {
    return <p className="text-sm text-slate-600">Every delivered load with a customer rate already has an invoice.</p>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <FormBanner result={state} />
      <div className="field min-w-[16rem] flex-1">
        <label htmlFor="load_id">Delivered load</label>
        <select id="load_id" name="load_id" required defaultValue={loads[0]?.id}>
          {loads.map((load) => (
            <option key={load.id} value={load.id}>
              {load.load_number} · {load.customer_name} · {formatMoneyCents(load.rate)}
            </option>
          ))}
        </select>
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create invoice"}
      </button>
    </form>
  );
}

export function InvoiceStatusButtons({
  invoiceId,
  status,
}: {
  invoiceId: number;
  status: InvoiceStatus;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {status === "draft" ? (
        <StatusButton invoiceId={invoiceId} status="sent" label="Mark sent" />
      ) : null}
      {status !== "paid" ? (
        <StatusButton invoiceId={invoiceId} status="paid" label="Mark paid" />
      ) : (
        <StatusButton invoiceId={invoiceId} status="sent" label="Reopen" />
      )}
    </div>
  );
}

function StatusButton({
  invoiceId,
  status,
  label,
}: {
  invoiceId: number;
  status: InvoiceStatus;
  label: string;
}) {
  return (
    <form action={updateInvoiceStatusAction}>
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="status" value={status} />
      <button className="btn btn-secondary" type="submit">
        {label}
      </button>
    </form>
  );
}

export function PaidToggle({
  loadId,
  paid,
  kind,
}: {
  loadId: number;
  paid: boolean;
  kind: "driver" | "commission";
}) {
  const action = kind === "driver" ? setDriverPayPaidAction : setCommissionPaidAction;
  return (
    <form action={action}>
      <input type="hidden" name="load_id" value={loadId} />
      <input type="hidden" name="paid" value={paid ? "0" : "1"} />
      <button className="btn btn-ghost" type="submit">
        {paid ? "Mark unpaid" : "Mark paid"}
      </button>
    </form>
  );
}
