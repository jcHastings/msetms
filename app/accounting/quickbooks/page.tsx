import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { QBO_MAP_TABS, hubTabClass, parseQboMapTab } from "@/lib/accounting-desk-shared";
import { listQboItemMaps, listQboVendorMaps } from "@/lib/accounting-desk";
import {
  saveQboCustomerMapFormAction,
  saveQboItemMapFormAction,
  saveQboVendorMapFormAction,
} from "@/lib/dispatcher-actions";
import { canConnectQuickbooks, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getQuickbooksStatus, listQboCustomers, listQboItems, listQboVendors } from "@/lib/integrations/quickbooks";
import { PAY_ITEM_CATEGORIES } from "@/lib/load-page-shared";
import { listCustomers, listCustomersNeedingQbo, listDrivers } from "@/lib/queries";
import { listBills } from "@/lib/accounting";
import { isOwnerOperator } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function QuickbooksAccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = parseQboMapTab(params.tab);
  const dispatcher = await getSignedInDispatcher();
  const canConnect = dispatcher ? canConnectQuickbooks(dispatcher.role) : false;
  const qbo = await getQuickbooksStatus();
  const qboCustomers = await listQboCustomers();
  const qboItems = await listQboItems();
  const qboVendors = await listQboVendors();
  const customers = listCustomers();
  const needsCustomer = listCustomersNeedingQbo();
  const itemMaps = listQboItemMaps();
  const vendorMaps = listQboVendorMaps();
  const vendorNames = [
    ...listDrivers()
      .filter((driver) => isOwnerOperator(driver.driver_type))
      .map((driver) => driver.name),
    ...listBills().map((bill) => bill.vendor),
  ].filter((name, index, all) => name.trim() && all.indexOf(name) === index);

  return (
    <>
      <PageHeader title="QuickBooks" />
      <nav className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {QBO_MAP_TABS.map((item) => (
          <Link
            key={item.value}
            href={`/accounting/quickbooks?tab=${item.value}`}
            className={hubTabClass(tab === item.value)}
          >
            <span className="hub-tab-label">{item.label}</span>
          </Link>
        ))}
      </nav>

      {tab === "connection" ? (
        <section className="card p-5">
          <div className="text-sm font-semibold">Connection</div>
          <p className="mt-1 text-sm text-slate-600">
            {qbo.configured || qbo.refreshTokenSet ? "Connected" : "Not connected"}
            {qbo.companyName ? ` · ${qbo.companyName}` : ""}
          </p>
          {qbo.error ? (
            <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {qbo.error}
            </p>
          ) : null}
          {canConnect ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/settings/quickbooks" className="btn btn-secondary">
                Settings → QuickBooks
              </Link>
              {qbo.oauthReady && !qbo.configured ? (
                <a className="btn btn-primary" href="/api/integrations/quickbooks/connect">
                  Connect QuickBooks
                </a>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">Ask an Administrator to connect QuickBooks.</p>
          )}
          <p className="mt-4 text-sm text-slate-600">
            Export invoices and bills from Invoices / Bills. This page is connection and mapping only.
          </p>
        </section>
      ) : null}

      {tab === "items" ? (
        <section className="card overflow-hidden">
          <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">Map Pay Items</header>
          <table className="table-grid">
            <thead>
              <tr>
                <th>TMS item</th>
                <th>QuickBooks item</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {PAY_ITEM_CATEGORIES.map((item) => {
                const mapped = itemMaps.find((row) => row.category === item.value);
                return (
                  <tr key={item.value}>
                    <td>{item.label}</td>
                    <td>
                      <form action={saveQboItemMapFormAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="category" value={item.value} />
                        <select name="qbo_item_id" defaultValue={mapped?.qbo_item_id ?? ""} className="min-w-[200px]">
                          <option value="">{qboItems.length ? "Pick an item" : "Connect QuickBooks to load items"}</option>
                          {qboItems.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.name}
                            </option>
                          ))}
                        </select>
                        <input type="hidden" name="qbo_item_name" value={mapped?.qbo_item_name ?? ""} />
                        <button className="btn btn-secondary" type="submit">
                          Save
                        </button>
                      </form>
                    </td>
                    <td className="text-slate-500">{mapped?.qbo_item_name || mapped?.qbo_item_id || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {tab === "customers" ? (
        <div className="space-y-4">
          {needsCustomer.length > 0 ? (
            <section className="card overflow-hidden">
              <header className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-950">
                Needs QBO customer ({needsCustomer.length})
              </header>
              <ul className="divide-y divide-slate-100">
                {needsCustomer.map((customer) => (
                  <li key={customer.id} className="px-5 py-3 text-sm">
                    {customer.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="card overflow-hidden">
            <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">Map Customers</header>
            <table className="table-grid">
              <thead>
                <tr>
                  <th>TMS customer</th>
                  <th>QuickBooks customer</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <Link href={`/customers/${customer.id}`} className="font-semibold underline">
                        {customer.name}
                      </Link>
                    </td>
                    <td>
                      <form action={saveQboCustomerMapFormAction} className="flex flex-wrap gap-2">
                        <input type="hidden" name="customer_id" value={customer.id} />
                        <select name="qbo_customer_id" defaultValue={customer.qbo_customer_id} className="min-w-[200px]">
                          <option value="">
                            {qboCustomers.length ? "Pick a customer" : "Connect QuickBooks to load customers"}
                          </option>
                          {qboCustomers.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.name}
                            </option>
                          ))}
                        </select>
                        <button className="btn btn-secondary" type="submit">
                          Save
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}

      {tab === "vendors" ? (
        <section className="card overflow-hidden">
          <header className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">Map Vendors</header>
          <table className="table-grid">
            <thead>
              <tr>
                <th>TMS vendor / OO</th>
                <th>QuickBooks vendor</th>
              </tr>
            </thead>
            <tbody>
              {vendorNames.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-sm text-slate-500">
                    No vendors or owner-operators to map yet.
                  </td>
                </tr>
              ) : (
                vendorNames.map((name) => {
                  const mapped = vendorMaps.find((row) => row.payee === name);
                  return (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>
                        <form action={saveQboVendorMapFormAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="payee" value={name} />
                          <select name="qbo_vendor_id" defaultValue={mapped?.qbo_vendor_id ?? ""} className="min-w-[200px]">
                            <option value="">
                              {qboVendors.length ? "Pick a vendor" : "Connect QuickBooks to load vendors"}
                            </option>
                            {qboVendors.map((row) => (
                              <option key={row.id} value={row.id}>
                                {row.name}
                              </option>
                            ))}
                          </select>
                          <input type="hidden" name="qbo_vendor_name" value={mapped?.qbo_vendor_name ?? ""} />
                          <button className="btn btn-secondary" type="submit">
                            Save
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
      ) : null}
    </>
  );
}
