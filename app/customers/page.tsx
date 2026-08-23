import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getCustomer, listCustomers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function CustomersPage() {
  const customers = listCustomers().map((customer) => {
    const detail = getCustomer(customer.id);
    return {
      ...customer,
      contactCount: detail?.contacts.length ?? 0,
      primary: detail?.contacts[0] ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Shippers and bill-to accounts. Pick one when you book a load."
        actions={
          <Link href="/customers/new" className="btn btn-primary">
            New customer
          </Link>
        }
      />
      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Primary contact</th>
              <th>Billing notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <div className="font-semibold">{customer.name}</div>
                  <div className="text-xs text-slate-500">
                    {customer.contactCount} contact{customer.contactCount === 1 ? "" : "s"}
                  </div>
                </td>
                <td>
                  {customer.primary ? (
                    <>
                      <div>{customer.primary.name}</div>
                      <div className="text-xs text-slate-500">
                        {customer.primary.phone || customer.primary.email || customer.primary.role}
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="max-w-md text-slate-600">
                  {customer.billing_notes || <span className="text-slate-400">—</span>}
                </td>
                <td className="text-right">
                  <Link href={`/customers/${customer.id}`} className="btn btn-ghost">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
