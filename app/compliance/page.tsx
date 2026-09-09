import Link from "next/link";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Compliance");
import { AccessDenied } from "@/components/access-denied";
import { ComplianceHubTabs, parseComplianceTab } from "@/components/compliance-hub-tabs";
import { ComplianceList } from "@/components/compliance-badge";
import { DrugTestStatusPill } from "@/components/drug-test-status-pill";
import { PageHeader } from "@/components/page-header";
import { canEditFleet, getPageAccess } from "@/lib/dispatcher-session";
import {
  DRUG_TEST_STATUSES,
  DRUG_TEST_TYPES,
  formatDriverListName,
  formatDrugTestDate,
  failedDrugTestIssue,
  isPendingDrugTest,
  labelForDrugTestResult,
  labelForDrugTestType,
} from "@/lib/drug-tests";
import { listDrugTests, listFailedDrugTestAlerts, listUpcomingCompliance } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; type?: string; driver?: string }>;
}) {
  const dispatcher = await getPageAccess(canEditFleet);
  if (!dispatcher) {
    return <AccessDenied message="Compliance is for Administrator and Standard." />;
  }
  const params = await searchParams;
  const tab = parseComplianceTab(params.tab);
  const alerts = listUpcomingCompliance();
  const expired = alerts.filter((alert) => alert.severity === "expired");
  const expiring = alerts.filter((alert) => alert.severity === "expiring");
  const tests = listDrugTests({
    status: params.status,
    type: params.type,
    driver: params.driver,
  });
  const allTests = listDrugTests();
  const failed = listFailedDrugTestAlerts();
  const pending = allTests.filter(isPendingDrugTest);
  const attention = allTests.filter((test) => test.status === "failed" || isPendingDrugTest(test));

  return (
    <>
      <PageHeader
        title={tab === "drug" ? "Drug & alcohol" : tab === "docs" ? "Docs — reuse" : "Compliance"}
        subtitle={
          tab === "drug"
            ? "Drug and alcohol tests. Document expiry stays on Overview and Workbench."
            : tab === "docs"
              ? "Same expiry list as Workbench desk. Not a second board."
              : "Document alerts plus drug and alcohol tests."
        }
      />
      <ComplianceHubTabs tab={tab} />

      {tab === "overview" ? (
        <>
          <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Expired docs" value={expired.length} tone="danger" />
            <Kpi label="Expiring (window)" value={expiring.length} tone="warning" />
            <Kpi label="Failed tests" value={failed.length} tone="danger" />
            <Kpi label="Tests pending" value={pending.length} tone="warning" />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="card p-5" data-compliance-docs="">
              <h2 className="text-sm font-semibold">Upcoming / expired documents</h2>
              <p className="mt-1 text-sm text-slate-500">Same list as Workbench desk.</p>
              <div className="mt-3">
                {alerts.length === 0 ? (
                  <p className="text-sm text-slate-500">Nothing expiring in those windows.</p>
                ) : (
                  <ComplianceList alerts={alerts} />
                )}
              </div>
              <Link href="/desk" className="desk-link mt-4 inline-block text-sm font-medium">
                Open on Workbench →
              </Link>
            </section>
            <section className="card p-5" data-compliance-tests-attention="">
              <h2 className="text-sm font-semibold">Drug & alcohol attention</h2>
              {allTests.length === 0 ? (
                <EmptyDrugTests />
              ) : attention.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No failed or pending tests.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="table-grid">
                    <thead>
                      <tr>
                        <th>Driver</th>
                        <th>Issue</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {attention.map((test) => (
                        <tr key={test.id}>
                          <td>
                            <Link href={`/fleet/drivers/${test.driver_id}`} className="desk-link font-medium">
                              {formatDriverListName(test.driver_name)}
                            </Link>
                          </td>
                          <td>
                            <span className="mr-2">
                              <DrugTestStatusPill status={test.status} />
                            </span>
                            {failedDrugTestIssue(test)}
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
            </section>
          </div>
        </>
      ) : null}

      {tab === "docs" ? (
        <section className="card p-5" data-compliance-docs="">
          <h2 className="text-sm font-semibold">Upcoming / expired documents</h2>
          <p className="mt-1 text-sm text-slate-500">
            Reuses <span className="font-mono text-xs">listUpcomingCompliance()</span>. License/med 30d ·
            registration 60d · DOT inspection 30d.
          </p>
          <div className="mt-3">
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing expiring in those windows.</p>
            ) : (
              <ComplianceList alerts={alerts} />
            )}
          </div>
          <Link href="/desk" className="desk-link mt-4 inline-block text-sm font-medium">
            Open on Workbench →
          </Link>
        </section>
      ) : null}

      {tab === "drug" ? (
        <>
          <form className="card mb-4 flex flex-wrap items-end gap-3 p-4" method="get" data-drug-test-filters="">
            <input type="hidden" name="tab" value="drug" />
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={params.status || "all"}>
                <option value="all">All</option>
                {DRUG_TEST_STATUSES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="type">Type</label>
              <select id="type" name="type" defaultValue={params.type || "all"}>
                <option value="all">All types</option>
                {DRUG_TEST_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="driver">Driver</label>
              <input
                id="driver"
                name="driver"
                defaultValue={params.driver ?? ""}
                placeholder="Search driver"
              />
            </div>
            <button type="submit" className="btn btn-secondary">
              Filter
            </button>
            <Link href="/compliance/tests/new" className="btn btn-primary ml-auto">
              Add test
            </Link>
          </form>
          <section className="card overflow-hidden" data-drug-test-list="">
            {allTests.length === 0 ? (
              <div className="p-6">
                <EmptyDrugTests />
              </div>
            ) : tests.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No tests match these filters.</p>
            ) : (
              <table className="table-grid">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Type</th>
                    <th>Vendor</th>
                    <th>Ordered</th>
                    <th>Collected</th>
                    <th>Result</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((test) => (
                    <tr key={test.id}>
                      <td>
                        <Link href={`/fleet/drivers/${test.driver_id}`} className="desk-link font-medium">
                          {formatDriverListName(test.driver_name)}
                        </Link>
                      </td>
                      <td>{labelForDrugTestType(test.test_type)}</td>
                      <td>{test.vendor || "—"}</td>
                      <td>{formatDrugTestDate(test.ordered_on)}</td>
                      <td>{formatDrugTestDate(test.collected_on)}</td>
                      <td>{labelForDrugTestResult(test.result)}</td>
                      <td>
                        <DrugTestStatusPill status={test.status} />
                      </td>
                      <td className="text-right">
                        <Link href={`/compliance/tests/${test.id}`} className="desk-link text-sm">
                          Open
                        </Link>
                      </td>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: "danger" | "warning" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone === "danger" ? "text-rose-700" : "text-amber-700"}`}>
        {value}
      </div>
    </div>
  );
}

function EmptyDrugTests() {
  return (
    <div data-drug-test-empty="">
      <p className="text-sm font-semibold text-slate-900">No drug or alcohol tests yet</p>
      <p className="mt-1 text-sm text-slate-500">Pre-employment and random tests show here.</p>
      <Link href="/compliance/tests/new" className="btn btn-primary mt-4">
        Add test
      </Link>
    </div>
  );
}
