import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customer-form";
import { DeleteCustomerForm } from "@/components/delete-customer-form";
import { PageHeader } from "@/components/page-header";
import { updateCustomerAction } from "@/lib/actions";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { countLoadsForCustomer, CUSTOMER_HAS_LOADS_DELETE, getCustomer } from "@/lib/queries";
import { canEditLoads } from "@/lib/settings-shared";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const customer = getCustomer(Number.parseInt((await params).id, 10));
  if (!customer) notFound();
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
      <CustomerForm customer={customer} action={boundAction} submitLabel="Save customer" />
      {canManage ? (
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
