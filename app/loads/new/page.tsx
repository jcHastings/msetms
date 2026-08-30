import Link from "next/link";
import { LoadForm } from "@/components/load-form";
import { LoadWorkspace } from "@/components/load-workspace";
import { PageHeader } from "@/components/page-header";
import { RateConImport } from "@/components/rate-con-import";
import { createLoadAction } from "@/lib/actions";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { listCustomers, listDrivers, listLocations, listTrailers, listTrucks } from "@/lib/queries";
import { equipmentOptions, getCompanySettings, loadFormSettings } from "@/lib/settings";
import { EQUIPMENT_REQUIRED } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewLoadPage() {
  const customers = listCustomers();
  const trucks = listTrucks();
  const drivers = listDrivers();
  const dispatcher = await getSignedInDispatcher();
  const role = dispatcher?.role ?? "dispatcher";
  const equipment = equipmentOptions();
  const equipmentChoices = equipment.length > 0 ? [{ value: "", label: "Any" }, ...equipment] : [...EQUIPMENT_REQUIRED];

  return (
    <>
      <PageHeader
        title="New load"
        actions={
          <div className="flex gap-2">
            <Link href="/loads/import-sheet" className="btn btn-secondary">
              Import
            </Link>
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
        <>
        <RateConImport
          customers={customers}
          trucks={trucks}
          trailers={listTrailers()}
          locations={listLocations()}
          drivers={drivers}
          formSettings={loadFormSettings()}
        >
          <LoadWorkspace
            loadId={null}
            status="available"
            initialTab="basics"
            loadSummary=""
            driverAssigned={false}
            driverPhone=""
            dispatcherId={null}
            dispatchers={[]}
            docsRequested={false}
            smsConfigured={false}
            role={role}
            returnTo="/board"
            create
          >
            <LoadForm
              screen="all"
              customers={customers}
              trucks={trucks}
              trailers={listTrailers()}
              locations={listLocations()}
              drivers={drivers}
              defaults={{ special_instructions: getCompanySettings().default_routing_notes }}
              equipmentChoices={equipmentChoices}
              returnTo="/board"
              {...loadFormSettings()}
              action={createLoadAction}
              submitLabel="Create load"
            />
          </LoadWorkspace>
        </RateConImport>
        </>
      )}
    </>
  );
}
