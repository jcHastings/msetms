import Link from "next/link";
import { AccessDenied } from "@/components/access-denied";
import { ComplianceList } from "@/components/compliance-badge";
import { PageHeader } from "@/components/page-header";
import { canEditFleet, getPageAccess } from "@/lib/dispatcher-session";
import { listDrivers, listTrailers, listTrucks, listUpcomingCompliance } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const dispatcher = await getPageAccess(canEditFleet);
  if (!dispatcher) {
    return <AccessDenied message="Compliance is for Administrator and Standard." />;
  }
  const alerts = listUpcomingCompliance();
  const expired = alerts.filter((alert) => alert.severity === "expired");
  return (
    <>
      <PageHeader
        title="Compliance"
        subtitle="Driver license / medical card (30 days), truck and trailer registration (60 days), DOT inspection (30 days). Same windows as assign-time alerts."
        actions={
          <Link href="/fleet" className="btn btn-secondary">
            Open fleet
          </Link>
        }
      />
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Drivers</div>
          <div className="mt-1 text-2xl font-semibold">{listDrivers().length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Trucks</div>
          <div className="mt-1 text-2xl font-semibold">{listTrucks().length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Expired</div>
          <div className="mt-1 text-2xl font-semibold">{expired.length}</div>
        </div>
      </div>
      <section className="card p-5">
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing in the expiration windows.</p>
        ) : (
          <ComplianceList alerts={alerts} />
        )}
      </section>
    </>
  );
}
