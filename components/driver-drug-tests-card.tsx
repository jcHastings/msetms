import Link from "next/link";
import { DrugTestStatusPill } from "@/components/drug-test-status-pill";
import {
  formatDriverListName,
  formatDrugTestDate,
  labelForDrugTestResult,
  labelForDrugTestType,
  type DrugTest,
} from "@/lib/drug-tests";

export function DriverDrugTestsCard({
  driverId,
  tests,
}: {
  driverId: number;
  tests: DrugTest[];
}) {
  return (
    <section className="card mb-4 p-5" data-driver-drug-tests="">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-sm font-semibold">Drug tests</h2>
        <Link
          href={`/compliance/tests/new?driver=${driverId}&return_to=${encodeURIComponent(`/fleet/drivers/${driverId}`)}`}
          className="btn btn-primary"
        >
          Add test
        </Link>
      </div>
      {tests.length === 0 ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-slate-900">No drug or alcohol tests yet</p>
          <p className="mt-1 text-sm text-slate-500">Pre-employment and random tests show here.</p>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="table-grid">
            <thead>
              <tr>
                <th>Type</th>
                <th>Vendor</th>
                <th>Ordered</th>
                <th>Result</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => (
                <tr key={test.id}>
                  <td>{labelForDrugTestType(test.test_type)}</td>
                  <td>{test.vendor || "—"}</td>
                  <td>{formatDrugTestDate(test.ordered_on)}</td>
                  <td>{labelForDrugTestResult(test.result)}</td>
                  <td>
                    <DrugTestStatusPill status={test.status} />
                  </td>
                  <td className="text-right">
                    <Link href={`/compliance/tests/${test.id}`} className="desk-link text-sm">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tests.length > 0 ? (
        <p className="mt-3 text-xs text-slate-500">Last {tests.length} for {formatDriverListName(tests[0].driver_name)}.</p>
      ) : null}
    </section>
  );
}
