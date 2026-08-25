"use client";

import { useMemo, useState, type ReactNode } from "react";
import { addPayItemAction, deletePayItemAction } from "@/lib/actions";
import { ViewInvoiceButton } from "@/components/view-invoice-button";
import { formatMoney } from "@/lib/format";
import { labelForPayCategory, PAY_ITEM_CATEGORIES, type PayItemSide } from "@/lib/load-page-shared";
import type { LoadPayItem } from "@/lib/pay-items";

function sumItems(items: LoadPayItem[]): number {
  return items.reduce((sum, item) => sum + (item.total ?? 0), 0);
}

export function LoadPayItems({
  loadId,
  items,
  customerName,
  driverName,
  driverType,
  ownerOperators = [],
  status = "",
  invoiceAttachmentId = null,
  rateFallback = null,
}: {
  loadId: number;
  items: LoadPayItem[];
  customerName: string;
  driverName: string | null;
  driverType?: string | null;
  ownerOperators?: string[];
  status?: string;
  invoiceAttachmentId?: number | null;
  rateFallback?: number | null;
}) {
  const income = items.filter((item) => item.side === "income");
  const expenses = items.filter((item) => item.side === "expense");
  const incomeTotal = income.length ? sumItems(income) : rateFallback ?? 0;
  const expenseTotal = sumItems(expenses);
  const profit = Math.round((incomeTotal - expenseTotal) * 100) / 100;
  const ownerOperator = driverType === "owner_operator";
  const ooNames = ownerOperators.filter(Boolean);
  return (
    <section data-load-tab="financials" className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3" data-financials-totals="">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Total income</div>
          <div className="mt-1 text-lg font-semibold text-emerald-950">{formatMoney(incomeTotal)}</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Total expenses</div>
          <div className="mt-1 text-lg font-semibold text-amber-950">{formatMoney(expenseTotal)}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gross profit</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{formatMoney(profit)}</div>
        </div>
      </div>
      <PayItemGroup
        loadId={loadId}
        side="income"
        title="Income / Budget"
        items={income}
        total={incomeTotal}
        defaultPayee={customerName}
        defaultBillTo="customer"
        defaultCategory="flat_rate"
        customerName={customerName}
        ownerOperatorName={ownerOperator ? driverName : null}
        ownerOperators={ooNames}
        actions={
          <>
            <a className="btn btn-secondary" href={`/api/loads/${loadId}/confirmation`} target="_blank" rel="noreferrer">
              View Customer Confirmation
            </a>
            <ViewInvoiceButton loadId={loadId} status={status} attachmentId={invoiceAttachmentId} />
          </>
        }
      />
      <PayItemGroup
        loadId={loadId}
        side="expense"
        title="Expenses"
        items={expenses}
        total={expenseTotal}
        defaultPayee={ownerOperator ? driverName ?? "" : ""}
        defaultBillTo={ownerOperator ? "driver" : "customer"}
        defaultCategory={ownerOperator ? "flat_rate" : "lumper"}
        customerName={customerName}
        ownerOperatorName={ownerOperator ? driverName : null}
        ownerOperators={ooNames}
        actions={
          <a
            className="btn btn-secondary"
            href={`/api/loads/${loadId}/confirmation?packet=internal`}
            target="_blank"
            rel="noreferrer"
          >
            View Carrier Confirmation
          </a>
        }
      />
    </section>
  );
}

function PayItemGroup({
  loadId,
  side,
  title,
  items,
  total,
  defaultPayee,
  defaultBillTo,
  defaultCategory,
  customerName,
  ownerOperatorName,
  ownerOperators,
  actions,
}: {
  loadId: number;
  side: PayItemSide;
  title: string;
  items: LoadPayItem[];
  total: number;
  defaultPayee: string;
  defaultBillTo: "customer" | "driver";
  defaultCategory: string;
  customerName: string;
  ownerOperatorName: string | null;
  ownerOperators: string[];
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tone = side === "income" ? "finance-income" : "finance-expense";
  return (
    <section className={`card overflow-hidden ${tone}`}>
      <div className="finance-head flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
            + Add Line Item
          </button>
        </div>
      </div>
      <div className="p-5">
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No line items. Click + Add Line Item.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-grid text-sm">
            <thead>
              <tr>
                <th>Company</th>
                <th>Description</th>
                <th>Notes</th>
                <th>Rate</th>
                <th>Qty</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.payee || "—"}</td>
                  <td>{labelForPayCategory(item.category)}</td>
                  <td className="text-slate-500">{item.notes || "—"}</td>
                  <td>{formatMoney(item.rate)}</td>
                  <td>{item.qty ?? "—"}</td>
                  <td className="font-semibold">{formatMoney(item.total)}</td>
                  <td>
                    <form action={async (formData) => { await deletePayItemAction(formData); }}>
                      <input type="hidden" name="pay_item_id" value={item.id} />
                      <button className="btn btn-ghost text-rose-700" type="submit">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="text-right font-semibold">
                  {side === "income" ? "Total Income" : "Total Expenses"}
                </td>
                <td className="font-semibold">{formatMoney(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      </div>
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
