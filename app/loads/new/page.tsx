import Link from "next/link";
import { LoadForm } from "@/components/load-form";
import { PageHeader } from "@/components/page-header";
import { createLoadAction } from "@/lib/actions";
import { listCustomers, listDrivers, listLocations, listTrailers, listTrucks } from "@/lib/queries";
import { getCompanySettings, loadFormSettings } from "@/lib/settings";

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
          <div className="flex gap-2">
            <Link href="/loads/import" className="btn btn-secondary">
              From rate con
            </Link>
            <Link href="/locations/new" className="btn btn-secondary">
              New location
            </Link>
            <Link href="/customers/new" className="btn btn-secondary">
              New customer
            </Link>
          </div>
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
          trailers={listTrailers()}
          locations={listLocations()}
          drivers={drivers}
          defaults={{ special_instructions: getCompanySettings().default_routing_notes }}
          {...loadFormSettings()}
          action={createLoadAction}
          submitLabel="Create load"
        />
      )}
    </>
  );
}
