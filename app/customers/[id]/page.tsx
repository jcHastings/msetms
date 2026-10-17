import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerContractsPanel } from "@/components/customer-contracts-panel";
import { deskMetadata } from "@/lib/desk-metadata";
import { CustomerForm } from "@/components/customer-form";
import { DeleteCustomerForm } from "@/components/delete-customer-form";
import { PageHeader } from "@/components/page-header";
import { updateCustomerAction } from "@/lib/actions";
import {
  listCustomerContracts,
  listCustomerRequirements,
  readCustomerDetentionTerms,
} from "@/lib/customer-contracts";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { countLoadsForCustomer, CUSTOMER_HAS_LOADS_DELETE, getCustomer } from "@/lib/queries";
import { canEditLoads } from "@/lib/settings-shared";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const customer = getCustomer(Number.parseInt((await params).id, 10));
  return deskMetadata(customer?.name || "Customer");
}

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const customer = getCustomer(Number.parseInt((await params).id, 10));
  if (!customer) notFound();
  const tab = (await searchParams).tab === "contracts" ? "contracts" : "profile";
  const boundAction = updateCustomerAction.bind(null, customer.id);
  const dispatcher = await getSignedInDispatcher();
  const canManage = canEditLoads(dispatcher?.role ?? "");
  const hasLoads = countLoadsForCustomer(customer.id) > 0;

  return (
    <>
      <PageHeader
        title={customer.name}
        actions={
          <Link href="/customers" className="btn btn-secondary">
            Back to customers
          </Link>
        }
      />
      <nav className="mb-6 flex gap-6 text-base">
        <Link
          href={`/customers/${customer.id}`}
          className={tab === "profile" ? "font-semibold text-slate-900" : "text-slate-500"}
        >
          Profile
        </Link>
        <Link
          href={`/customers/${customer.id}?tab=contracts`}
          className={tab === "contracts" ? "font-semibold text-slate-900" : "text-slate-500"}
          data-customer-contracts-tab=""
        >
          Contracts
        </Link>
      </nav>
      {tab === "contracts" ? (
        <CustomerContractsPanel
          customerId={customer.id}
          contracts={listCustomerContracts(customer.id)}
          terms={readCustomerDetentionTerms(customer.id)}
          requirements={listCustomerRequirements(customer.id)}
          canEdit={canManage}
        />
      ) : (
      <CustomerForm customer={customer} action={boundAction} submitLabel="Save customer" />
      )}
      {canManage && tab === "profile" ? (
        <section className="card mt-4 p-6">
          <h2 className="text-sm font-semibold">Delete customer</h2>
          <p className="mt-1 text-sm text-slate-600">Removes this customer and their contacts.</p>
          <div className="mt-3">
            <DeleteCustomerForm
              customerId={customer.id}
              customerName={customer.name}
              disabled={hasLoads}
              disabledReason={hasLoads ? CUSTOMER_HAS_LOADS_DELETE : undefined}
            />
          </div>
        </section>
      ) : null}
    </>
  );
}
