import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { canViewReports, getPageAccess, listDispatchers } from "@/lib/dispatcher-session";
import { listCustomers, listDrivers, listTrucks } from "@/lib/queries";
import { REPORT_CATEGORIES, REPORT_DATE_BASES, REPORT_EXPORT_COLUMNS } from "@/lib/reports-shared";

export const dynamic = "force-dynamic";

export default async function ManageReportsPage() {
  const dispatcher = await getPageAccess(canViewReports);
  if (!dispatcher) return <AccessDenied message="Reports are for Administrator." />;
  const customers = listCustomers();
  const drivers = listDrivers();
  const trucks = listTrucks();
  const dispatchers = listDispatchers();

  return (
    <>
      <PageHeader
        title="Manage reports"
        subtitle="Choose a category, date basis, range, and columns. Download CSV or Excel. Driver rows split relay revenue by that driver's miles."
      />
      <form className="card space-y-4 p-5" action="/api/reports/export" method="get">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="field">
            <label htmlFor="report-category">Category</label>
            <select id="report-category" name="category" defaultValue="customer">
              {REPORT_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-customer">Customer</label>
            <select id="report-customer" name="customerId" defaultValue="">
              <option value="">All customers</option>
              {customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-driver">Driver</label>
            <select id="report-driver" name="driverId" defaultValue="">
              <option value="">All drivers</option>
              {drivers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-truck">Truck</label>
            <select id="report-truck" name="truckId" defaultValue="">
              <option key="all" value="">
                All trucks
              </option>
              {trucks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.unit_number}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-dispatcher">Dispatcher</label>
            <select id="report-dispatcher" name="dispatcherId" defaultValue="">
              <option value="">All dispatchers</option>
              {dispatchers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-basis">Filter by</label>
            <select id="report-basis" name="dateBasis" defaultValue="pickup">
              {REPORT_DATE_BASES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-format">Format</label>
            <select id="report-format" name="format" defaultValue="csv">
              <option value="csv">CSV</option>
              <option value="xlsx">Excel</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="report-from">From</label>
            <input id="report-from" name="from" type="date" />
          </div>
          <div className="field">
            <label htmlFor="report-to">To</label>
            <input id="report-to" name="to" type="date" />
          </div>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Columns</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {REPORT_EXPORT_COLUMNS.map((column) => (
              <label key={column.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="columns" value={column.key} defaultChecked />
                {column.label}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="btn btn-primary" type="submit">
          Download
        </button>
      </form>
    </>
  );
}
