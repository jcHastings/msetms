"use client";

import { useMemo, useState } from "react";
import { addPayItemAction, deletePayItemAction } from "@/lib/actions";
import { formatMoney } from "@/lib/format";
import { labelForPayCategory, PAY_ITEM_CATEGORIES, type PayItemSide } from "@/lib/load-page-shared";
import type { LoadPayItem } from "@/lib/pay-items";

export function LoadPayItems({
  loadId,
  items,
  customerName,
  driverName,
  driverType,
  ownerOperators = [],
}: {
  loadId: number;
  items: LoadPayItem[];
  customerName: string;
  driverName: string | null;
  driverType?: string | null;
  ownerOperators?: string[];
}) {
  const income = items.filter((item) => item.side === "income");
  const expenses = items.filter((item) => item.side === "expense");
  const ownerOperator = driverType === "owner_operator";
  const ooNames = ownerOperators.filter(Boolean);
  return (
    <section data-load-tab="financials" className="space-y-4">
      <PayItemGroup
        loadId={loadId}
        side="income"
        title="Income / Budget"
        items={income}
        defaultPayee={customerName}
        defaultBillTo="customer"
        defaultCategory="flat_rate"
        customerName={customerName}
        ownerOperatorName={ownerOperator ? driverName : null}
        ownerOperators={ooNames}
      />
      <PayItemGroup
        loadId={loadId}
        side="expense"
        title="Expenses"
        items={expenses}
        defaultPayee={ownerOperator ? driverName ?? "" : ""}
        defaultBillTo={ownerOperator ? "driver" : "customer"}
        defaultCategory={ownerOperator ? "flat_rate" : "lumper"}
        customerName={customerName}
        ownerOperatorName={ownerOperator ? driverName : null}
        ownerOperators={ooNames}
      />
    </section>
  );
}

function PayItemGroup({
  loadId,
  side,
  title,
  items,
  defaultPayee,
  defaultBillTo,
  defaultCategory,
  customerName,
  ownerOperatorName,
  ownerOperators,
}: {
  loadId: number;
  side: PayItemSide;
  title: string;
  items: LoadPayItem[];
  defaultPayee: string;
  defaultBillTo: "customer" | "driver";
  defaultCategory: string;
  customerName: string;
  ownerOperatorName: string | null;
  ownerOperators: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          + Add Line Item
        </button>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No line items. Click + Add Line Item.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <span className="font-medium">{labelForPayCategory(item.category)}</span>
                {item.payee ? <span className="text-slate-500"> · {item.payee}</span> : null}
                {item.notes ? <div className="text-xs text-slate-500">{item.notes}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                <span>{formatMoney(item.total)}</span>
                <form action={async (formData) => { await deletePayItemAction(formData); }}>
                  <input type="hidden" name="pay_item_id" value={item.id} />
                  <button className="btn btn-ghost text-rose-700" type="submit">
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <PayItemDialog
          loadId={loadId}
          side={side}
          defaultPayee={defaultPayee}
          defaultBillTo={defaultBillTo}
          defaultCategory={defaultCategory}
          customerName={customerName}
          ownerOperatorName={ownerOperatorName}
          ownerOperators={ownerOperators}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}

function PayItemDialog({
  loadId,
  side,
  defaultPayee,
  defaultBillTo,
  defaultCategory,
  customerName,
  ownerOperatorName,
  ownerOperators,
  onClose,
}: {
  loadId: number;
  side: PayItemSide;
  defaultPayee: string;
  defaultBillTo: "customer" | "driver";
  defaultCategory: string;
  customerName: string;
  ownerOperatorName: string | null;
  ownerOperators: string[];
  onClose: () => void;
}) {
  const [rate, setRate] = useState("");
  const [qty, setQty] = useState("1");
  const total = useMemo(() => {
    const parsedRate = Number.parseFloat(rate);
    const parsedQty = Number.parseFloat(qty || "1");
    if (Number.isNaN(parsedRate) || Number.isNaN(parsedQty)) return "";
    return String(Math.round(parsedRate * parsedQty * 100) / 100);
  }, [rate, qty]);

  return (
    <div className="pay-item-dialog-backdrop" role="dialog" aria-label="Save pay item">
      <form
        action={async (formData) => {
          const other = String(formData.get("payee_other") ?? "").trim();
          if (other) formData.set("payee", other);
          await addPayItemAction(formData);
          onClose();
        }}
        className="pay-item-dialog card space-y-3 p-5"
      >
        <h3 className="text-sm font-semibold">Save Pay Item</h3>
        <input type="hidden" name="load_id" value={loadId} />
        <input type="hidden" name="side" value={side} />
        {side === "expense" ? (
          <div className="field">
            <label htmlFor={`${side}-payee`}>Payable to</label>
            <select id={`${side}-payee`} name="payee" defaultValue={defaultPayee}>
              <option value="">Select payee</option>
              <option value="Lumper">Lumper</option>
              {ownerOperators.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <input
              id={`${side}-payee-other`}
              name="payee_other"
              className="mt-2"
              placeholder="Other payee (vendor / similar)"
            />
          </div>
        ) : (
          <div className="field">
            <label htmlFor={`${side}-payee`}>Payee / customer</label>
            <input id={`${side}-payee`} name="payee" defaultValue={defaultPayee} />
          </div>
        )}
        <div className="field">
          <label htmlFor={`${side}-bill-to`}>Bills</label>
          <select id={`${side}-bill-to`} name="bill_to" defaultValue={defaultBillTo}>
            <option value="customer">{customerName || "Customer invoice"}</option>
            <option value="driver">{ownerOperatorName || "Owner-operator / lumper"}</option>
          </select>
          <p className="text-xs text-slate-500">
            QBO invoices customer line items only. Expenses are payable to an owner-operator, lumper, or similar
            — not a company driver.
          </p>
        </div>
        <div className="field">
          <label htmlFor={`${side}-category`}>Category</label>
          <select id={`${side}-category`} name="category" defaultValue={defaultCategory}>
            {PAY_ITEM_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="field">
            <label htmlFor={`${side}-rate`}>Rate</label>
            <input
              id={`${side}-rate`}
              name="rate"
              type="number"
              step="0.01"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${side}-qty`}>Qty</label>
            <input
              id={`${side}-qty`}
              name="qty"
              type="number"
              step="0.01"
              value={qty}
              onChange={(event) => setQty(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${side}-total`}>Total</label>
            <input id={`${side}-total`} name="total" type="number" step="0.01" defaultValue={total} key={total} />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${side}-notes`}>Notes</label>
          <textarea id={`${side}-notes`} name="notes" rows={2} />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit">
            Save Pay Item
          </button>
        </div>
      </form>
    </div>
  );
}
