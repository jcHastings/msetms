import type { ReactNode } from "react";
import Link from "next/link";
import {
  ACCOUNTING_HUB_TABS,
  hrefForAccountingHubTab,
  hubTabClass,
  parseAccountingHubTab,
} from "@/lib/accounting-desk-shared";
import {
  archiveAccountingLoadFormAction,
  closeDriverPayPeriodAction,
  createBillAction,
  payAllOpenBillsFormAction,
  payBillAction,
  returnLoadToOperationsFormAction,
  sendBillToQuickbooksFormAction,
  unarchiveAccountingLoadFormAction,
} from "@/lib/dispatcher-actions";
import { InvoicesAcctTable, type InvoiceAcctRow } from "@/components/invoices-acct-table";
import {
  addDaysIso,
  invoiceAnchorIso,
  paymentTermsDays,
  qboInvoiceExportStatus,
} from "@/lib/accounting-aging";
import {
  defaultPayPeriod,
  groupDriverPay,
  listBills,
  listDriverPay,
  listReceivables,
} from "@/lib/accounting";
import { listLoadsOnAccountingDesk } from "@/lib/accounting-desk";
import { listAttachments } from "@/lib/files";
import { formatDateTime, formatMdYDisplay, formatMdYFull, formatMoney } from "@/lib/format";
import { invoiceMailExtraDocs, resolveLoadCustomerEmail } from "@/lib/load-mail";
import { lastSentMail } from "@/lib/mail-store";
import { hasQuickbooksSession } from "@/lib/integrations/quickbooks";
import { customerInvoicePayItems, driverPayItems } from "@/lib/pay-items";
import { getCustomer } from "@/lib/queries";
import { getCompanySettings, getInvoiceEmailBody, taxOnAmount } from "@/lib/settings";
import { listStops } from "@/lib/stops";
import { LoadStatusBadge } from "@/components/status-badge";
import { labelForLoadStatus, type LoadView } from "@/lib/types";

function matchesQuery(load: LoadView, q: string): boolean {
  if (!q.trim()) return true;
  const hay = [
    load.customer_name,
    load.load_number,
    load.tms_invoice_number,
    load.qbo_invoice_number,
    load.customer_reference,
    load.po_number,
    load.reference_number,
    load.origin,
    load.destination,
    load.status,
    load.branch,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.trim().toLowerCase());
}

function matchesBranch(load: { branch?: string }, branch: string): boolean {
  if (!branch.trim()) return true;
  return (load.branch || "").trim() === branch.trim();
}

function uniqueBranches(loads: Array<{ branch?: string }>): string[] {
  return [...new Set(loads.map((load) => (load.branch || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function AccountingHub({
  tab,
  q = "",
  from,
  to,
  branch = "",
  driver = "",
}: {
  tab: string;
  q?: string;
  from?: string;
  to?: string;
  branch?: string;
  driver?: string;
}) {
  const current = parseAccountingHubTab(tab);
  const period = defaultPayPeriod();
  const payFrom = from || period.from;
  const payTo = to || period.to;
  const branches = uniqueBranches([
    ...listLoadsOnAccountingDesk("accounting"),
    ...listLoadsOnAccountingDesk("archived"),
  ]);
  return (
    <div className="acct-page">
      <nav className="acct-hub-tabs">
        {ACCOUNTING_HUB_TABS.map((item) => (
          <Link
            key={item.value}
            href={hrefForAccountingHubTab(item.value)}
            className={hubTabClass(current === item.value)}
          >
            <span className="hub-tab-label">{item.label}</span>
          </Link>
        ))}
      </nav>
      {current === "invoices" ? <InvoicesTab q={q} branch={branch} branches={branches} /> : null}
      {current === "bills" ? <BillsTab q={q} branch={branch} branches={branches} /> : null}
      {current === "reconcile" ? <ReconcileTab q={q} branch={branch} branches={branches} /> : null}
      {current === "archived" ? <ArchivedTab q={q} branch={branch} branches={branches} /> : null}
      {current === "pay" ? <PayTab from={payFrom} to={payTo} driver={driver} /> : null}
      {current === "approve" ? <ApproveTab /> : null}
    </div>
  );
}

function HubTableCard({
  toolbar,
  children,
}: {
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      {toolbar ? <div className="hub-table-toolbar">{toolbar}</div> : null}
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function HubActions({ children }: { children: ReactNode }) {
  return (
    <td className="sticky right-0 z-10 min-w-[7rem] bg-white shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.18)]">
      <div className="flex min-w-[7rem] flex-col items-start gap-0.5">{children}</div>
    </td>
  );
}

function SearchBox({
  q,
  tab,
  branch = "",
  branches = [],
}: {
  q: string;
  tab: string;
  branch?: string;
  branches?: string[];
}) {
  return (
    <form className="mb-3 flex flex-wrap gap-2" method="get">
      <input type="hidden" name="tab" value={tab} />
      <select name="branch" defaultValue={branch} className="rounded border border-slate-300 px-2 py-1 text-[12.5px]">
        <option value="">All branches</option>
        {branches.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <input
        name="q"
        defaultValue={q}
        placeholder="Customer, invoice #, pick/drop"
        className="min-w-[220px] flex-1 rounded border border-slate-300 px-2 py-1 text-[12.5px]"
      />
      <button className="acct-link" type="submit">
        Search
      </button>
    </form>
  );
}

function stopLabel(stop: { name: string; street: string; city: string; state: string; zip: string } | undefined, fallback: string): string {
  if (!stop) return fallback;
  return [stop.name, stop.street, [stop.city, stop.state, stop.zip].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || fallback;
}

function toInvoiceAcctRow(
  row: ReturnType<typeof listReceivables>[number],
  qboConnected: boolean,
): InvoiceAcctRow {
  const settings = getCompanySettings();
  const tax = taxOnAmount(row.rate);
  const total = (row.rate ?? 0) + (settings.tax_enabled ? tax.tax : 0);
  const invoiceIso = invoiceAnchorIso(row);
  const terms = getCustomer(row.customer_id)?.payment_terms ?? "";
  const dueIso = invoiceIso ? addDaysIso(invoiceIso, paymentTermsDays(terms)) : "";
  const qbo = qboInvoiceExportStatus(row);
  const attachments = listAttachments(row.id);
  const stops = listStops(row.id);
  const pick = stops.find((stop) => stop.kind === "pickup");
  const drop = [...stops].reverse().find((stop) => stop.kind === "delivery");
  const billed = Boolean(row.tms_invoice_number || row.qbo_invoice_id);
  return {
    id: row.id,
    customerName: row.customer_name,
    loadNumber: row.load_number,
    statusLabel: labelForLoadStatus(row.status),
    invoiceNumber: row.tms_invoice_number || row.invoiceLabel,
    unbilled: !billed,
    reference: row.customer_reference || row.po_number || row.reference_number || "—",
    deliveryDate: formatMdYDisplay(row.delivery_end || row.delivery_start),
    sentStatus: qbo.sent ? "Sent" : "Unsent",
    invoiceDate: billed && invoiceIso ? formatMdYFull(invoiceIso) : "Unsent",
    dueDate: dueIso ? formatMdYFull(dueIso) : "Not Available",
    totalLabel: formatMoney(total, settings.currency),
    balanceLabel: formatMoney(row.paid ? 0 : total, settings.currency),
    qboInvoiceLine: qbo.invoiceLine,
    qboPaymentsLine: qbo.paymentsLine,
    alreadySent: qbo.sent,
    sendLabel: qbo.sent ? "Send again to QuickBooks" : qboConnected ? "Send to QuickBooks" : "Record demo invoice",
    paid: row.paid,
    email: resolveLoadCustomerEmail(row),
    lastInvoiceSent: (() => {
      const sent = lastSentMail(row.id, "customer_invoice");
      return sent ? `Last emailed ${formatDateTime(sent.created_at)} to ${sent.to_email}` : "";
    })(),
    extras: invoiceMailExtraDocs(row.id),
    invoiceEmailBody: getInvoiceEmailBody(),
    pick: stopLabel(pick, row.origin),
    drop: stopLabel(drop, row.destination),
    paperwork: [
      { label: "Client Rate Confirmation (Signed)", found: attachments.some((file) => file.kind === "rate_con") },
      { label: "BOL (Bill Of Lading)", found: attachments.some((file) => file.kind === "bol") },
      { label: "POD (Proof Of Delivery)", found: attachments.some((file) => file.kind === "pod") },
    ],
  };
}

function InvoicesTab({ q, branch, branches }: { q: string; branch: string; branches: string[] }) {
  const qboConnected = hasQuickbooksSession();
  const rows = listReceivables()
    .filter((row) => matchesQuery(row, q) && matchesBranch(row, branch))
    .map((row) => toInvoiceAcctRow(row, qboConnected));
  return (
    <HubTableCard toolbar={<SearchBox q={q} tab="invoices" branch={branch} branches={branches} />}>
      <InvoicesAcctTable rows={rows} />
    </HubTableCard>
  );
}

function BillsTab({ q, branch, branches }: { q: string; branch: string; branches: string[] }) {
  const bills = listBills();
  const accountingLoads = listLoadsOnAccountingDesk("accounting");
  const loadById = new Map(accountingLoads.map((load) => [load.id, load]));
  const filtered = bills.filter((bill) => {
    const load = bill.load_id ? loadById.get(bill.load_id) : null;
    if (bill.load_id && !load) return false;
    if (load && !matchesBranch(load, branch)) return false;
    if (!q.trim()) return true;
    const hay = [bill.vendor, bill.memo, load?.load_number, load?.customer_name].join(" ").toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchBox q={q} tab="bills" branch={branch} branches={branches} />
        <form action={payAllOpenBillsFormAction}>
          <button className="btn btn-primary" type="submit">
            Pay All Received Bills
          </button>
        </form>
      </div>
      <form action={createBillAction} className="card grid gap-3 p-5 md:grid-cols-4">
        <div className="field">
          <label htmlFor="vendor">Remit To</label>
          <input id="vendor" name="vendor" required />
        </div>
        <div className="field">
          <label htmlFor="amount">Amount</label>
          <input id="amount" name="amount" type="number" min={0} step="0.01" required />
        </div>
        <div className="field">
          <label htmlFor="load_id">Load</label>
          <select id="load_id" name="load_id" defaultValue="">
            <option value="">None</option>
            {accountingLoads.map((load) => (
              <option key={load.id} value={load.id}>
                {load.load_number} · {load.customer_name}
              </option>
            ))}
          </select>
        </div>
        <div className="field md:col-span-4">
          <label htmlFor="memo">Memo</label>
          <input id="memo" name="memo" />
        </div>
        <button className="btn btn-primary" type="submit">
          Record received bill
        </button>
      </form>
      <HubTableCard>
        <table className="table-grid table-grid-acct min-w-max">
          <thead>
            <tr>
              <th>Company Name</th>
              <th>Load #</th>
              <th>Reference #</th>
              <th>Delivery Date</th>
              <th>Bill Status</th>
              <th>Bill Date</th>
              <th>Due Date</th>
              <th>Bill Ref #</th>
              <th>Load Expenses</th>
              <th>Amount Billed</th>
              <th>Balance to Pay</th>
              <th>Remit To</th>
              <th>QBO Export</th>
              <th className="sticky right-0 z-10 min-w-[12rem] bg-slate-50">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-4 py-6 text-sm text-slate-500">
                  No bills for Accounting loads.
                </td>
              </tr>
            ) : (
              filtered.map((bill) => {
                const load = bill.load_id ? loadById.get(bill.load_id) : null;
                const expenses = load ? driverPayItems(load.id).reduce((sum, item) => sum + (item.total ?? 0), 0) : 0;
                return (
                  <tr key={bill.id}>
                    <td>{load?.customer_name || "—"}</td>
                    <td>
                      {load ? (
                        <Link href={`/loads/${load.id}`} className="font-mono underline">
                          {load.load_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{load?.customer_reference || load?.po_number || "—"}</td>
                    <td>{load ? formatMdYDisplay(load.delivery_end || load.delivery_start) : "—"}</td>
                    <td>{bill.status}</td>
                    <td>{formatMdYDisplay(bill.created_at)}</td>
                    <td>—</td>
                    <td>{bill.id}</td>
                    <td>{formatMoney(expenses)}</td>
                    <td>{formatMoney(bill.amount)}</td>
                    <td>{bill.status === "paid" ? formatMoney(0) : formatMoney(bill.amount)}</td>
                    <td>{bill.vendor}</td>
                    <td>
                      {bill.qbo_bill_id ? (
                        <span className="qbo-export-status">Bill Exported: {bill.qbo_bill_id}</span>
                      ) : (
                        <span className="qbo-export-status">Unsent</span>
                      )}
                    </td>
                    <HubActions>
                      {bill.qbo_bill_id ? null : (
                        <form action={sendBillToQuickbooksFormAction}>
                          <input type="hidden" name="bill_id" value={bill.id} />
                          <button className="acct-link" type="submit">
                            Send to QuickBooks
                          </button>
                        </form>
                      )}
                      {bill.status === "open" ? (
                        <form action={payBillAction}>
                          <input type="hidden" name="bill_id" value={bill.id} />
                          <button className="acct-link" type="submit">
                            Record payment
                          </button>
                        </form>
                      ) : null}
                    </HubActions>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </HubTableCard>
    </div>
  );
}

function ReconcileTab({ q, branch, branches }: { q: string; branch: string; branches: string[] }) {
  const loads = listLoadsOnAccountingDesk("accounting").filter(
    (load) => matchesQuery(load, q) && matchesBranch(load, branch),
  );
  return (
    <HubTableCard
      toolbar={
        <>
          <div className="mb-3 text-sm font-semibold">List of All Loads Sent to Accounting</div>
          <SearchBox q={q} tab="reconcile" branch={branch} branches={branches} />
        </>
      }
    >
      <table className="table-grid table-grid-acct min-w-max">
        <thead>
          <tr>
            <th>Load #</th>
            <th>Company Name(s)</th>
            <th>Paid Status</th>
            <th>Invoice(s) Total</th>
            <th>Bill(s) Total</th>
            <th>Gross P/L</th>
            <th className="sticky right-0 z-10 min-w-[12rem] bg-slate-50">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loads.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-sm text-slate-500">
                No loads in Accounting.
              </td>
            </tr>
          ) : (
            loads.map((load) => {
              const invoiceTotal = customerInvoicePayItems(load.id).reduce((sum, item) => sum + (item.total ?? 0), 0) || load.rate || 0;
              const billTotal = listBills()
                .filter((bill) => bill.load_id === load.id)
                .reduce((sum, bill) => sum + bill.amount, 0);
              const expense = driverPayItems(load.id).reduce((sum, item) => sum + (item.total ?? 0), 0);
              return (
                <tr key={load.id}>
                  <td>
                    <Link href={`/loads/${load.id}`} className="font-mono font-semibold underline">
                      {load.load_number}
                    </Link>
                  </td>
                  <td>{load.customer_name}</td>
                  <td>{load.invoice_paid ? "Paid" : "Open"}</td>
                  <td>{formatMoney(invoiceTotal)}</td>
                  <td>{formatMoney(billTotal + expense)}</td>
                  <td>{formatMoney(invoiceTotal - billTotal - expense)}</td>
                  <HubActions>
                    <form action={archiveAccountingLoadFormAction}>
                      <input type="hidden" name="load_id" value={load.id} />
                      <button className="btn btn-secondary" type="submit">
                        Archive
                      </button>
                    </form>
                    <form action={returnLoadToOperationsFormAction}>
                      <input type="hidden" name="load_id" value={load.id} />
                      <button
                        className="btn btn-secondary"
                        type="submit"
                        title="Send back to Load Management"
                      >
                        Send back
                      </button>
                    </form>
                  </HubActions>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </HubTableCard>
  );
}

function ArchivedTab({ q, branch, branches }: { q: string; branch: string; branches: string[] }) {
  const loads = listLoadsOnAccountingDesk("archived").filter(
    (load) => matchesQuery(load, q) && matchesBranch(load, branch),
  );
  return (
    <HubTableCard toolbar={<SearchBox q={q} tab="archived" branch={branch} branches={branches} />}>
      <table className="table-grid table-grid-acct min-w-max">
        <thead>
          <tr>
            <th>Load #</th>
            <th>Company Name</th>
            <th className="sticky right-0 z-10 min-w-[12rem] bg-slate-50">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loads.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-sm text-slate-500">
                No archived loads.
              </td>
            </tr>
          ) : (
            loads.map((load) => (
              <tr key={load.id}>
                <td>
                  <Link href={`/loads/${load.id}`} className="font-mono font-semibold underline">
                    {load.load_number}
                  </Link>
                </td>
                <td>{load.customer_name}</td>
                <HubActions>
                  <form action={unarchiveAccountingLoadFormAction}>
                    <input type="hidden" name="load_id" value={load.id} />
                    <button className="btn btn-secondary" type="submit">
                      Unarchive
                    </button>
                  </form>
                </HubActions>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </HubTableCard>
  );
}

function PayTab({ from, to, driver }: { from: string; to: string; driver: string }) {
  const lines = listDriverPay(from, to);
  const groups = groupDriverPay(lines).filter((group) => !driver.trim() || group.driverName === driver);
  const driverNames = [...new Set(lines.map((line) => line.driverName))].sort((a, b) => a.localeCompare(b));
  const exportHref = `/api/accounting/pay/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  return (
    <div>
      <div className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3">
        <form className="flex flex-wrap items-end gap-3" method="get" action="/accounting/pay">
          <div className="field">
            <label htmlFor="from">Period start</label>
            <input id="from" name="from" type="date" defaultValue={from} />
          </div>
          <div className="field">
            <label htmlFor="to">Period end</label>
            <input id="to" name="to" type="date" defaultValue={to} />
          </div>
          <div className="field">
            <label htmlFor="driver">Driver</label>
            <select id="driver" name="driver" defaultValue={driver}>
              <option value="">All drivers</option>
              {driverNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-secondary" type="submit">
            Apply period
          </button>
        </form>
        <a className="btn btn-secondary" href={exportHref}>
          Download Excel
        </a>
        <form action={closeDriverPayPeriodAction}>
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <button className="btn btn-primary" type="submit">
            Close period
          </button>
        </form>
      </div>
      {groups.length === 0 ? (
        <div className="card p-6 text-sm text-slate-600">No Accounting driver pay in this period.</div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.driverName} className="card overflow-hidden">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-5 py-3">
                <h2 className="text-sm font-semibold">{group.driverName}</h2>
                <p className="text-sm text-slate-600">
                  Open {formatMoney(group.openTotal)} · Paid {formatMoney(group.paidTotal)}
                </p>
              </header>
              <table className="table-grid table-grid-acct">
                <thead>
                  <tr>
                    <th>Load</th>
                    <th>Item</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {group.lines.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <Link href={`/loads/${row.load.id}`} className="font-mono font-semibold underline">
                          {row.load.load_number}
                        </Link>
                      </td>
                      <td>{row.description}</td>
                      <td>{formatMoney(row.amount)}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ApproveTab() {
  const loads = listLoadsOnAccountingDesk("accounting").filter((load) =>
    driverPayItems(load.id).some((item) => !item.paid_at),
  );
  return (
    <HubTableCard>
      <table className="table-grid table-grid-acct min-w-max">
        <thead>
          <tr>
            <th>Load ID</th>
            <th>Status</th>
            <th>Driver</th>
            <th>Pending amount</th>
            <th>Total driver pay</th>
            <th>Route / dates</th>
          </tr>
        </thead>
        <tbody>
          {loads.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-sm text-slate-500">
                No driver pay waiting on approval.
              </td>
            </tr>
          ) : (
            loads.map((load) => {
              const items = driverPayItems(load.id);
              const pending = items.filter((item) => !item.paid_at).reduce((sum, item) => sum + (item.total ?? 0), 0);
              const total = items.reduce((sum, item) => sum + (item.total ?? 0), 0);
              return (
                <tr key={load.id}>
                  <td>
                    <Link href={`/loads/${load.id}?tab=financials`} className="font-mono font-semibold underline">
                      {load.load_number}
                    </Link>
                  </td>
                  <td>
                    <LoadStatusBadge status={load.status} />
                  </td>
                  <td>{load.driver_name || "—"}</td>
                  <td>{formatMoney(pending)}</td>
                  <td>{formatMoney(total)}</td>
                  <td>
                    {load.origin} → {load.destination}
                    <div className="text-xs text-slate-500">
                      {formatMdYDisplay(load.pickup_start)} – {formatMdYDisplay(load.delivery_end || load.delivery_start)}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </HubTableCard>
  );
}

