import Link from "next/link";
import { DeleteCustomerForm } from "@/components/delete-customer-form";
import { CUSTOMER_HAS_LOADS_DELETE } from "@/lib/queries";
import type { Contact, Customer } from "@/lib/types";

export function CustomersTable({
  customers,
  canManage,
}: {
  customers: Array<
    Customer & {
      contactCount: number;
      primary: Contact | null;
      loadCount: number;
    }
  >;
  canManage: boolean;
}) {
  return (
    <div className="card" data-customers-list="">
      {customers.length === 0 ? (
        <p className="p-6 text-sm text-slate-600">
          No customers yet.{" "}
          {canManage ? (
            <Link href="/customers/new" className="font-semibold underline">
              Add a customer
            </Link>
          ) : (
            "Ask someone who can edit loads to add one."
          )}
          .
        </p>
      ) : (
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
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/customers/${customer.id}`} className="btn btn-secondary">
                    {canManage ? "Edit" : "View"}
                  </Link>
                  {canManage ? (
                    <DeleteCustomerForm
                      customerId={customer.id}
                      customerName={customer.name}
                      disabled={hasLoads}
                      disabledReason={hasLoads ? CUSTOMER_HAS_LOADS_DELETE : undefined}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
