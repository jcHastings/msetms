import Link from "next/link";
import { LoadForm } from "@/components/load-form";
import { PageHeader } from "@/components/page-header";
import { createLoadAction } from "@/lib/actions";
import { listCustomers, listDrivers, listTrucks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function NewLoadPage() {
  const customers = listCustomers();
  const trucks = listTrucks();
  const drivers = listDrivers();

  return (
    <>
      <PageHeader
        title="New load"
        subtitle="Book freight against a customer, then assign it from the board."
        actions={
          <Link href="/customers/new" className="btn btn-secondary">
            New customer
          </Link>
        }
      />
      {customers.length === 0 ? (
        <div className="card p-6 text-sm text-slate-600">
          Add a customer before you can book a load.{" "}
          <Link href="/customers/new" className="font-semibold underline">
            Create one
          </Link>
          .
        </div>
      ) : (
        <LoadForm
          customers={customers}
          trucks={trucks}
          drivers={drivers}
          action={createLoadAction}
          submitLabel="Create load"
        />
      )}
    </>
  );
}
