import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customer-form";
import { PageHeader } from "@/components/page-header";
import { updateCustomerAction } from "@/lib/actions";
import { getCustomer } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const customer = getCustomer(Number.parseInt((await params).id, 10));
  if (!customer) notFound();
  const boundAction = updateCustomerAction.bind(null, customer.id);

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
    </>
  );
}
