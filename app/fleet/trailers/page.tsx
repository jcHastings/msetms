import Link from "next/link";
import { ComplianceBadge } from "@/components/compliance-badge";
import { PageHeader } from "@/components/page-header";
import { TruckStatusBadge } from "@/components/status-badge";
import { trailerComplianceAlerts } from "@/lib/compliance";
import { latestReeferForTrailer } from "@/lib/integrations/orbcomm";
import { listTrailers } from "@/lib/queries";
import { complianceWindows } from "@/lib/settings";
import { labelForTrailerType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function TrailersPage() {
  const windows = complianceWindows();
  const trailers = listTrailers();

  return (
    <>
      <PageHeader
        title="Trailers"
        subtitle="Reefers and dry vans. ORBCOMM asset ID is optional for the last known reading."
        actions={
          <Link href="/fleet/trailers/new" className="btn btn-primary">
            Add trailer
          </Link>
        }
      />
      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Trailer</th>
              <th>Type</th>
              <th>Truck</th>
              <th>Registration</th>
              <th>DOT inspection</th>
              <th>Reefer / ORBCOMM</th>
              <th>Compliance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {trailers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-sm text-slate-500">
                  No trailers yet.
                </td>
              </tr>
            ) : (
              trailers.map((trailer) => {
                const reefer = latestReeferForTrailer(trailer);
                return (
                  <tr key={trailer.id} className={trailer.active === 0 ? "opacity-60" : undefined}>
                    <td>
                      <Link href={`/fleet/trailers/${trailer.id}`} className="font-mono font-semibold hover:underline">
                        {trailer.unit_number}
                      </Link>
                      {trailer.active === 0 ? <div className="text-xs text-slate-500">Inactive</div> : null}
                    </td>
                    <td>{labelForTrailerType(trailer.type)}</td>
                    <td>{trailer.truck_unit ? `Unit ${trailer.truck_unit}` : "—"}</td>
                    <td className="whitespace-nowrap">{trailer.registration_expires || "—"}</td>
                    <td className="whitespace-nowrap">{trailer.dot_expires || "—"}</td>
                    <td className="text-xs text-slate-600">
                      {reefer
                        ? `${reefer.temperature_f != null ? `${reefer.temperature_f}°F` : "Reading"} · ${reefer.source}`
                        : trailer.orbcomm_asset_id
                          ? "Mapped"
                          : "—"}
                      {trailer.reefer_setpoint_f != null ? (
                        <div>Setpoint {trailer.reefer_setpoint_f}°F</div>
                      ) : null}
                    </td>
                    <td>
                      <ComplianceBadge alerts={trailerComplianceAlerts(trailer, windows)} />
                    </td>
                    <td>
                      <TruckStatusBadge status={trailer.status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
