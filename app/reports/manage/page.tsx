import { AccessDenied } from "@/components/access-denied";
import { ManageReportForm } from "@/components/manage-report-form";
import { PageHeader } from "@/components/page-header";
import { canViewReports, getPageAccess, listDispatchers } from "@/lib/dispatcher-session";
import { listCustomers, listDrivers, listTrucks } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ManageReportsPage() {
  const dispatcher = await getPageAccess(canViewReports);
  if (!dispatcher) return <AccessDenied message="Reports are for Administrator." />;

  return (
    <>
      <PageHeader
        title="Manage reports"
      />
      <ManageReportForm
        customers={listCustomers().map((item) => ({ id: item.id, label: item.name }))}
        drivers={listDrivers().map((item) => ({ id: item.id, label: item.name }))}
        trucks={listTrucks().map((item) => ({ id: item.id, label: item.unit_number }))}
        dispatchers={listDispatchers().map((item) => ({ id: item.id, label: item.name }))}
      />
    </>
  );
}
