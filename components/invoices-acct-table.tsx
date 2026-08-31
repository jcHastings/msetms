"use client";

import { useState } from "react";
import Link from "next/link";
import {
  markReceivablePaidAction,
  returnLoadToOperationsFormAction,
} from "@/lib/dispatcher-actions";
import { QboInvoiceSendButton } from "@/components/qbo-invoice-send-button";
import { EmailInvoiceButton } from "@/components/email-invoice-button";
import type { InvoiceMailExtraDoc } from "@/lib/load-mail";

export type InvoiceAcctRow = {
  id: number;
  customerName: string;
  loadNumber: string;
  statusLabel: string;
  invoiceNumber: string;
  unbilled: boolean;
  reference: string;
  deliveryDate: string;
  sentStatus: "Sent" | "Unsent";
  invoiceDate: string;
  dueDate: string;
  totalLabel: string;
  balanceLabel: string;
  qboInvoiceLine: string;
  qboPaymentsLine: string;
  alreadySent: boolean;
  sendLabel: string;
  paid: boolean;
  email: string;
  lastInvoiceSent: string;
  extras: InvoiceMailExtraDoc[];
  pick: string;
  drop: string;
  paperwork: Array<{ label: string; found: boolean }>;
};

export function InvoicesAcctTable({ rows }: { rows: InvoiceAcctRow[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <table className="table-grid table-grid-acct min-w-max">
      <thead>
        <tr>
          <th></th>
          <th>Company Name</th>
          <th>Invoice #</th>
          <th>Reference #</th>
          <th>Delivery Date</th>
          <th>Sent Status</th>
          <th>Invoice Date</th>
          <th>Due Date</th>
          <th>Invoice Total</th>
          <th>Balance</th>
          <th>QBO Export</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={11} className="px-3 py-3 text-[12.5px] text-slate-500">
              No loads in Accounting yet. Send a delivered load from Financials.
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const open = openId === row.id;
            return (
              <InvoiceAcctRowView
                key={row.id}
                row={row}
                open={open}
                onToggle={() => setOpenId(open ? null : row.id)}
              />
            );
          })
        )}
      </tbody>
    </table>
  );
}

function InvoiceAcctRowView({
  row,
  open,
  onToggle,
}: {
  row: InvoiceAcctRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr>
        <td>
          <button
            type="button"
            className="acct-link font-mono"
            aria-expanded={open}
            onClick={onToggle}
          >
            {open ? "−" : "+"}
          </button>
        </td>
        <td>
          <Link href={`/loads/${row.id}?tab=financials`} className="font-semibold underline">
            {row.customerName}
          </Link>
          <div className="font-mono text-[11px] text-slate-500">{row.loadNumber}</div>
          <div className="text-[11px] text-slate-500">{row.statusLabel}</div>
        </td>
        <td className={row.unbilled ? "text-rose-700" : undefined}>{row.invoiceNumber}</td>
        <td>{row.reference}</td>
        <td>{row.deliveryDate}</td>
        <td className={row.sentStatus === "Sent" ? "text-emerald-700" : "text-sky-800"}>{row.sentStatus}</td>
        <td>{row.invoiceDate}</td>
        <td>{row.dueDate}</td>
        <td className="text-right">{row.totalLabel}</td>
        <td className="text-right">{row.balanceLabel}</td>
        <td>
          <div className="qbo-export-status">
            <div className={row.alreadySent ? "qbo-export-status-sent" : "text-slate-600"}>{row.qboInvoiceLine}</div>
            {row.qboPaymentsLine ? <div className="qbo-export-status-pay">{row.qboPaymentsLine}</div> : null}
          </div>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={11} className="!p-0">
            <div className="acct-expand-panel">
              <div className="acct-expand-grid">
                <div className="space-y-0.5">
                  <a className="acct-link" href={`/api/loads/${row.id}/invoice`}>
                    View Invoice as PDF
                  </a>
                  <div>View Payment History: {row.paid ? "Payment recorded" : "No payments recorded"}</div>
                  <EmailInvoiceButton
                    loadId={row.id}
                    email={row.email}
                    lastSent={row.lastInvoiceSent}
                    extras={row.extras}
                    variant="link"
                  />
                  <form action={returnLoadToOperationsFormAction}>
                    <input type="hidden" name="load_id" value={row.id} />
                    <button className="acct-link" type="submit" title="Send back to Load Management">
                      Send Back to Load Management
                    </button>
                  </form>
                  <QboInvoiceSendButton
                    loadId={row.id}
                    alreadySent={row.alreadySent}
                    label={row.sendLabel}
                    variant="link"
                  />
                  {row.paid ? null : (
                    <form action={markReceivablePaidAction}>
                      <input type="hidden" name="load_id" value={row.id} />
                      <button className="acct-link" type="submit">
                        Record payment
                      </button>
                    </form>
                  )}
                </div>
                <div>
                  <div>
                    <span className="text-slate-500">Pick Location: </span>
                    {row.pick}
                  </div>
                  <div>
                    <span className="text-slate-500">Drop Location: </span>
                    {row.drop}
                  </div>
                </div>
                <div>
                  <Link href={`/loads/${row.id}?tab=docs`} className="acct-link">
                    Review/Manage Supporting Docs
                  </Link>
                  <div className={row.paperwork.every((item) => item.found) ? "text-slate-600" : "text-rose-700"}>
                    Paperwork is {row.paperwork.every((item) => item.found) ? "on file." : "pending review."}
                  </div>
                  <ul className="mt-0.5 space-y-0.5">
                    {row.paperwork.map((item) => (
                      <li key={item.label}>
                        {item.label}: {item.found ? "On file" : "No matching docs found"}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
