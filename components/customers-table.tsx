import Link from "next/link";
import { CustomerRowActions } from "@/components/customer-row-actions";
import { CUSTOMER_HAS_LOADS_DELETE } from "@/lib/queries";
import type { Contact, Customer } from "@/lib/types";

function customersHref(q: string, page: number) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/customers?${query}` : "/customers";
}

export function CustomersTable({
  customers,
  canManage,
  q,
  page,
  pageCount,
  pageSize,
  total,
}: {
  customers: Array<
    Customer & {
      contactCount: number;
      primary: Contact | null;
      loadCount: number;
    }
  >;
  canManage: boolean;
  q: string;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}) {
  const emptyDirectory = total === 0 && !q;
  const emptySearch = total === 0 && Boolean(q);

  return (
    <div
      className="card"
      data-customers-list=""
      data-customers-page={page}
      data-customers-page-size={pageSize}
      data-customers-total={total}
      data-customers-mounted={customers.length}
    >
      <form className="load-list-search px-4 pt-3" method="get" action="/customers" data-customers-search="">
        <div className="field min-w-56 flex-1">
          <label htmlFor="customers-q">Search customers</label>
          <input
            id="customers-q"
            name="q"
            defaultValue={q}
            placeholder="Name, contact, phone, email, or terms"
          />
        </div>
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
        {q ? (
          <Link href="/customers" className="btn btn-ghost">
            Clear
          </Link>
        ) : null}
      </form>
      <p className="px-4 pb-2 text-xs text-slate-500" data-customers-summary="">
        {emptyDirectory
          ? "No customers yet."
          : emptySearch
            ? `No customers match “${q}”.`
            : `Showing ${customers.length} of ${total} customer${total === 1 ? "" : "s"}${
                q ? ` matching “${q}”` : ""
              }${pageCount > 1 ? ` · page ${page} of ${pageCount}` : ""}.`}
      </p>
      {emptyDirectory ? (
        <p className="p-6 pt-0 text-sm text-slate-600">
          {canManage ? (
            <Link href="/customers/new" className="font-semibold underline">
              Add a customer
            </Link>
          ) : (
            "Ask someone who can edit loads to add one."
          )}
        </p>
      ) : emptySearch ? (
        <p className="p-6 pt-0 text-sm text-slate-600">Try a different name, contact, or clear the search.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-200">
            {customers.map((customer) => {
              const hasLoads = customer.loadCount > 0;
              return (
                <li
                  key={customer.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  data-customer-row=""
                >
                  <div className="min-w-0">
                    <Link href={`/customers/${customer.id}`} className="text-sm font-semibold underline">
                      {customer.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {customer.contactCount} contact{customer.contactCount === 1 ? "" : "s"}
                      {customer.payment_terms ? ` · ${customer.payment_terms}` : ""}
                      {customer.credit_hold ? " · credit hold" : ""}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {customer.primary ? (
                        <>
                          {customer.primary.name}
                          {customer.primary.phone ? ` · ${customer.primary.phone}` : ""}
                        </>
                      ) : (
                        "No primary contact"
                      )}
                    </div>
                  </div>
                  <CustomerRowActions
                    customerId={customer.id}
                    customerName={customer.name}
                    canManage={canManage}
                    hasLoads={hasLoads}
                    disabledReason={hasLoads ? CUSTOMER_HAS_LOADS_DELETE : undefined}
                  />
                </li>
              );
            })}
          </ul>
          {pageCount > 1 ? (
            <nav
              className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3"
              data-customers-pagination=""
              aria-label="Customer pages"
            >
              {page > 1 ? (
                <Link href={customersHref(q, page - 1)} className="btn btn-secondary">
                  Previous
                </Link>
              ) : (
                <span className="btn btn-secondary pointer-events-none opacity-45">Previous</span>
              )}
              <span className="text-xs text-slate-500">
                Page {page} of {pageCount}
              </span>
              {page < pageCount ? (
                <Link href={customersHref(q, page + 1)} className="btn btn-secondary">
                  Next
                </Link>
              ) : (
                <span className="btn btn-secondary pointer-events-none opacity-45">Next</span>
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
