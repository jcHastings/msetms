import Link from "next/link";
import { CustomerForm } from "@/components/customer-form";
import { PageHeader } from "@/components/page-header";
import { createCustomerAction } from "@/lib/actions";

export default function NewCustomerPage() {
  return (
    <>
      <PageHeader
        title="New customer"
        actions={
          <Link href="/customers" className="btn btn-secondary">
            Back to customers
          </Link>
        }
      />
      <CustomerForm action={createCustomerAction} submitLabel="Create customer" />
    </>
  );
}
