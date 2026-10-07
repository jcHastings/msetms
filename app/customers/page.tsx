import Link from "next/link";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Customers");
import { CustomersTable } from "@/components/customers-table";
import { PageHeader } from "@/components/page-header";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { searchCustomersDirectory } from "@/lib/queries";
import { canEditLoads } from "@/lib/settings-shared";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const page = Number.parseInt(String(params.page ?? "1"), 10);
  const dispatcher = await getSignedInDispatcher();
  const canManage = canEditLoads(dispatcher?.role ?? "");
  const directory = searchCustomersDirectory({ q, page });

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
      <CustomersTable
        customers={directory.customers}
        canManage={canManage}
        q={q}
        page={directory.page}
        pageCount={directory.pageCount}
        pageSize={directory.pageSize}
        total={directory.total}
      />
    </>
  );
}
