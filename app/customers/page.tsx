import Link from "next/link";
import { CustomersTable } from "@/components/customers-table";
import { PageHeader } from "@/components/page-header";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getCustomer, listCustomers, loadCountsByCustomer } from "@/lib/queries";
import { canEditLoads } from "@/lib/settings-shared";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const dispatcher = await getSignedInDispatcher();
  const canManage = canEditLoads(dispatcher?.role ?? "");
  const loadCounts = loadCountsByCustomer();
  const customers = listCustomers().map((customer) => {
    const detail = getCustomer(customer.id);
    return {
      ...customer,
      contactCount: detail?.contacts.length ?? 0,
      primary: detail?.contacts[0] ?? null,
      loadCount: loadCounts.get(customer.id) ?? 0,
    };
  });

  return (
    <>
      <PageHeader
        title="Customers"
        actions={
          canManage ? (
            <Link href="/customers/new" className="btn btn-primary">
              New customer
            </Link>
          ) : null
        }
      />
      <CustomersTable customers={customers} canManage={canManage} />
    </>
  );
}
