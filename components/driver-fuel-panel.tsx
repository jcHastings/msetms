"use client";

import { useActionState, useState } from "react";
import { FormBanner } from "@/components/form-banner";
import { driverMatchFuelReceiptAction, driverUploadFuelReceiptAction } from "@/lib/driver-actions";
import type { ActionResult } from "@/lib/types";

export type DriverFuelTxRow = {
  id: number;
  occurred_at: string;
  location: string;
  gallons: number | null;
  amount: number | null;
  card_last4: string;
  receipt_id: number | null;
};

export type DriverFuelReceiptRow = {
  id: number;
  original_name: string;
  occurred_at: string;
  amount: number | null;
  gallons: number | null;
  merchant: string;
  status: string;
};

function money(value: number | null): string {
  return value == null ? "—" : `$${value.toFixed(2)}`;
}

export function DriverFuelPanel({
  transactions,
  pending,
}: {
  transactions: DriverFuelTxRow[];
  pending: DriverFuelReceiptRow[];
}) {
  const [uploadState, uploadAction, uploadPending] = useActionState(
    driverUploadFuelReceiptAction,
    null as ActionResult | null,
  );
  const [matchState, matchAction, matchPending] = useActionState(
    driverMatchFuelReceiptAction,
    null as ActionResult | null,
  );
  const [selectedReceipt, setSelectedReceipt] = useState(pending[0]?.id ?? 0);
  const unmatched = transactions.filter((row) => row.receipt_id == null);

  return (
    <div className="space-y-6" data-driver-fuel="">
      <section className="rounded-2xl bg-slate-900 p-4 ring-1 ring-white/10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Upload a receipt</h2>
        <p className="mt-1 text-sm text-slate-400">
          Take a photo now. Dispatch will match it to the card row when the fuel spreadsheet lands.
        </p>
        <form action={uploadAction} className="mt-3 space-y-3">
          <FormBanner result={uploadState} />
          <input className="block w-full text-sm text-slate-200" name="file" type="file" accept="image/*,.pdf" required />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-400">
              Amount
              <input className="mt-1 min-h-11 w-full rounded-lg bg-slate-800 px-2 text-white" name="amount" inputMode="decimal" />
            </label>
            <label className="text-xs text-slate-400">
              Gallons
              <input className="mt-1 min-h-11 w-full rounded-lg bg-slate-800 px-2 text-white" name="gallons" inputMode="decimal" />
            </label>
            <label className="col-span-2 text-xs text-slate-400">
              Station
              <input className="mt-1 min-h-11 w-full rounded-lg bg-slate-800 px-2 text-white" name="merchant" />
            </label>
            <label className="text-xs text-slate-400">
              Card last 4
              <input className="mt-1 min-h-11 w-full rounded-lg bg-slate-800 px-2 text-white" name="card_last4" inputMode="numeric" maxLength={4} />
            </label>
            <label className="text-xs text-slate-400">
              When
              <input className="mt-1 min-h-11 w-full rounded-lg bg-slate-800 px-2 text-white" name="occurred_at" type="datetime-local" />
            </label>
          </div>
          <button className="btn btn-primary min-h-12 w-full" type="submit" disabled={uploadPending}>
            {uploadPending ? "Uploading…" : "Save pending receipt"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl bg-slate-900 p-4 ring-1 ring-white/10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Pending receipts</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No unmatched photos.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pending.map((row) => (
              <li key={row.id} className="rounded-xl bg-slate-800 px-3 py-2 text-sm">
                <div className="font-medium text-white">{row.original_name || "Receipt"}</div>
                <div className="text-slate-400">
                  {money(row.amount)}
                  {row.gallons != null ? ` · ${row.gallons} gal` : ""}
                  {row.merchant ? ` · ${row.merchant}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
        {pending.length > 0 && unmatched.length > 0 ? (
          <form action={matchAction} className="mt-3 space-y-2">
            <FormBanner result={matchState} />
            <label className="block text-xs text-slate-400">
              Receipt
              <select
                className="mt-1 min-h-11 w-full rounded-lg bg-slate-800 px-2 text-white"
                name="receipt_id"
                value={selectedReceipt || pending[0]?.id}
                onChange={(event) => setSelectedReceipt(Number(event.target.value))}
              >
                {pending.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.original_name || `Receipt ${row.id}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              Card row
              <select className="mt-1 min-h-11 w-full rounded-lg bg-slate-800 px-2 text-white" name="fuel_transaction_id" required>
                {unmatched.map((row) => (
                  <option key={row.id} value={row.id}>
                    {money(row.amount)} · {row.location || "Fuel stop"}
                    {row.card_last4 ? ` · ${row.card_last4}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-secondary min-h-11 w-full" type="submit" disabled={matchPending}>
              {matchPending ? "Matching…" : "Match to card row"}
            </button>
          </form>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Card transactions</h2>
        {transactions.length === 0 ? (
          <div className="rounded-2xl bg-slate-900 p-6 text-sm text-slate-400 ring-1 ring-white/10">
            No fuel card rows yet. Upload a receipt if you filled up.
          </div>
        ) : (
          <ul className="space-y-2">
            {transactions.map((row) => (
              <li key={row.id} className="rounded-2xl bg-slate-900 p-4 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-white">{money(row.amount)}</div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {row.receipt_id ? "Receipt on file" : "Needs receipt"}
                  </div>
                </div>
                <div className="mt-1 text-sm text-slate-300">{row.location || "Fuel stop"}</div>
                <div className="mt-1 text-sm text-slate-400">
                  {row.gallons != null ? `${row.gallons} gal` : "Gallons —"}
                  {row.card_last4 ? ` · •••• ${row.card_last4}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
