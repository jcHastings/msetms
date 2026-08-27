import Link from "next/link";
import { ACCOUNTING_HUB_TABS, parseAccountingHubTab } from "@/lib/accounting-desk-shared";
import {
  archiveAccountingLoadFormAction,
  closeDriverPayPeriodAction,
  createBillAction,
  markReceivablePaidAction,
  payAllOpenBillsFormAction,
  payBillAction,
  returnLoadToOperationsFormAction,
  sendBillToQuickbooksFormAction,
  unarchiveAccountingLoadFormAction,
} from "@/lib/dispatcher-actions";
import { sendToQuickbooksFormAction } from "@/lib/actions";
import {
  defaultPayPeriod,
  groupDriverPay,
  listBills,
  listDriverPay,
  listReceivables,
} from "@/lib/accounting";
import { listLoadsOnAccountingDesk } from "@/lib/accounting-desk";
import { formatMdYDisplay, formatMoney } from "@/lib/format";
import { listAttachments } from "@/lib/files";
import { customerInvoicePayItems, driverPayItems } from "@/lib/pay-items";
import { getCompanySettings, taxOnAmount } from "@/lib/settings";
import { LoadStatusBadge } from "@/components/status-badge";
import type { LoadView } from "@/lib/types";

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
    <div>
      <nav className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {ACCOUNTING_HUB_TABS.map((item) => (
          <Link
            key={item.value}
            href={`/accounting/invoices?tab=${item.value}`}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
              current === item.value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {item.label}
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
      <select name="branch" defaultValue={branch} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
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
        className="min-w-[220px] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      <button className="btn btn-secondary" type="submit">
        Search
      </button>
    </form>
  );
}

function InvoicesTab({ q, branch, branches }: { q: string; branch: string; branches: string[] }) {
  const settings = getCompanySettings();
  const rows = listReceivables().filter((row) => matchesQuery(row, q) && matchesBranch(row, branch));
  return (
    <section className="card overflow-hidden">
      <SearchBox q={q} tab="invoices" branch={branch} branches={branches} />
      <table className="table-grid">
        <thead>
          <tr>
            <th>Company Name</th>
            <th>Invoice #</th>
            <th>Reference #</th>
            <th>Delivery Date</th>
            <th>Sent Status</th>
            <th>Invoice Date</th>
            <th>Due Date</th>
            <th>Invoice Total</th>
            <th>Balance</th>
            <th>QB Export</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-4 py-6 text-sm text-slate-500">
                No loads in Accounting yet. Send a delivered load from Financials.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const tax = taxOnAmount(row.rate);
              const total = (row.rate ?? 0) + (settings.tax_enabled ? tax.tax : 0);
              const invoice = listAttachments(row.id).find((file) => file.kind === "invoice");
              const email = row.contact_email.trim();
              return (
                <tr key={row.id}>
                  <td>
                    <Link href={`/loads/${row.id}?tab=financials`} className="font-semibold underline">
                      {row.customer_name}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{row.load_number}</div>
                    <LoadStatusBadge status={row.status} />
                  </td>
                  <td>{row.tms_invoice_number || row.invoiceLabel}</td>
                  <td>{row.customer_reference || row.po_number || row.reference_number || "—"}</td>
                  <td>{formatMdYDisplay(row.delivery_end || row.delivery_start)}</td>
                  <td>{row.qbo_invoice_id ? "Sent" : "Not sent"}</td>
                  <td>{row.tms_invoice_at ? formatMdYDisplay(row.tms_invoice_at) : "—"}</td>
                  <td>—</td>
                  <td>{formatMoney(total, settings.currency)}</td>
                  <td>{row.paid ? formatMoney(0, settings.currency) : formatMoney(total, settings.currency)}</td>
                  <td>
                    <form action={sendToQuickbooksFormAction}>
                      <input type="hidden" name="load_id" value={row.id} />
                      {row.qbo_invoice_id ? <input type="hidden" name="confirm_resend" value="1" /> : null}
                      <button className="btn btn-secondary" type="submit">
                        {row.qbo_invoice_id ? "Resend QBO" : "Export to QBO"}
                      </button>
                    </form>
                  </td>
                  <td className="space-y-1 text-right">
                    {invoice ? (
                      <a className="btn btn-secondary" href={`/api/attachments/${invoice.id}`}>
                        Invoice PDF
                      </a>
                    ) : null}
                    {email ? (
                      <a
                        className="btn btn-secondary"
                        href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Invoice ${row.load_number}`)}`}
                      >
                        Email invoice
                      </a>
                    ) : null}
                    {row.paid ? null : (
                      <form action={markReceivablePaidAction}>
                        <input type="hidden" name="load_id" value={row.id} />
                        <button className="btn btn-secondary" type="submit">
                          Record payment
                        </button>
                      </form>
                    )}
                    <form action={returnLoadToOperationsFormAction}>
                      <input type="hidden" name="load_id" value={row.id} />
                      <button className="btn btn-secondary" type="submit">
                        Send back to Load Management
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
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
      <section className="card overflow-hidden">
        <table className="table-grid">
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
              <th></th>
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
                      <form action={sendBillToQuickbooksFormAction}>
                        <input type="hidden" name="bill_id" value={bill.id} />
                        <button className="btn btn-secondary" type="submit" disabled={Boolean(bill.qbo_bill_id)}>
                          {bill.qbo_bill_id ? "Sent to QBO" : "Export bill to QBO"}
                        </button>
                      </form>
                    </td>
                    <td>
                      {bill.status === "open" ? (
                        <form action={payBillAction}>
                          <input type="hidden" name="bill_id" value={bill.id} />
                          <button className="btn btn-secondary" type="submit">
                            Record bill payment
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ReconcileTab({ q, branch, branches }: { q: string; branch: string; branches: string[] }) {
  const loads = listLoadsOnAccountingDesk("accounting").filter(
    (load) => matchesQuery(load, q) && matchesBranch(load, branch),
  );
  return (
    <section className="card overflow-hidden">
      <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">
        List of All Loads Sent to Accounting
      </header>
      <div className="px-5 pt-3">
        <SearchBox q={q} tab="reconcile" branch={branch} branches={branches} />
      </div>
      <table className="table-grid">
        <thead>
          <tr>
            <th>Load #</th>
            <th>Company Name(s)</th>
            <th>Paid Status</th>
            <th>Invoice(s) Total</th>
            <th>Bill(s) Total</th>
            <th>Gross P/L</th>
            <th></th>
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
                  <td className="space-y-1 text-right">
                    <form action={archiveAccountingLoadFormAction}>
                      <input type="hidden" name="load_id" value={load.id} />
                      <button className="btn btn-secondary" type="submit">
                        Archive
                      </button>
                    </form>
                    <form action={returnLoadToOperationsFormAction}>
                      <input type="hidden" name="load_id" value={load.id} />
                      <button className="btn btn-secondary" type="submit">
                        Send back to Load Management
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}

function ArchivedTab({ q, branch, branches }: { q: string; branch: string; branches: string[] }) {
  const loads = listLoadsOnAccountingDesk("archived").filter(
    (load) => matchesQuery(load, q) && matchesBranch(load, branch),
  );
  return (
    <section className="card overflow-hidden">
      <div className="px-5 pt-3">
        <SearchBox q={q} tab="archived" branch={branch} branches={branches} />
      </div>
      <table className="table-grid">
        <thead>
          <tr>
            <th>Load #</th>
            <th>Company Name</th>
            <th></th>
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
                <td className="text-right">
                  <form action={unarchiveAccountingLoadFormAction}>
                    <input type="hidden" name="load_id" value={load.id} />
                    <button className="btn btn-secondary" type="submit">
                      Unarchive
                    </button>
                  </form>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
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
        <form className="flex flex-wrap items-end gap-3" method="get">
          <input type="hidden" name="tab" value="pay" />
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
              <table className="table-grid">
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
    <section className="card overflow-hidden">
      <table className="table-grid">
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
    </section>
  );
}

