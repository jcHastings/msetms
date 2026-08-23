import Link from "next/link";
import { ClickableRow } from "@/components/clickable-row";
import { ActiveStatusCell, ExpiryCell } from "@/components/expiry-cell";
import { PageHeader } from "@/components/page-header";
import { trailerComplianceAlerts } from "@/lib/compliance";
import { latestReeferForTrailer } from "@/lib/integrations/orbcomm";
import { listTrailers } from "@/lib/queries";
import { complianceWindows } from "@/lib/settings";
import { labelForTrailerType } from "@/lib/types";

export const dynamic = "force-dynamic";

function reeferStub(trailer: {
  orbcomm_asset_id: string;
  reefer_setpoint_f: number | null;
  unit_number: string;
}): string {
  const reading = latestReeferForTrailer(trailer);
  if (reading) {
    const temp = reading.temperature_f != null ? `${reading.temperature_f}°F` : "Reading";
    return `${temp} · ${reading.source}`;
  }
  if (trailer.orbcomm_asset_id) return "Mapped";
  return "—";
}

export default function TrailersPage() {
  const windows = complianceWindows();
  const trailers = listTrailers();

  return (
    <>
      <PageHeader
        title="Trailers"
        subtitle="53' reefers and dry vans. ORBCOMM asset ID is optional for the last known reading."
        actions={
          <>
            <a href="/api/fleet/trailers/export" className="btn btn-secondary">
              Download CSV
            </a>
            <Link href="/fleet/trailers/new" className="btn btn-primary">
              Add trailer
            </Link>
          </>
        }
      />
      <div className="card overflow-hidden">
        <table className="table-grid">
          <thead>
            <tr>
              <th>Trailer</th>
              <th>Type</th>
              <th>Truck</th>
              <th>Registration exp</th>
              <th>DOT inspection</th>
              <th>Reefer / ORBCOMM</th>
              <th>Status</th>
              <th></th>
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
                const alerts = trailerComplianceAlerts(trailer, windows);
                return (
                  <ClickableRow
                    key={trailer.id}
                    href={`/fleet/trailers/${trailer.id}`}
                    className={trailer.active === 0 ? "opacity-60" : undefined}
                  >
                    <td>
                      <span className="font-mono font-semibold hover:underline">{trailer.unit_number}</span>
                    </td>
                    <td>{labelForTrailerType(trailer.type)}</td>
                    <td>{trailer.truck_unit ? `Unit ${trailer.truck_unit}` : "—"}</td>
                    <ExpiryCell
                      value={trailer.registration_expires}
                      alert={alerts.find((item) => item.kind === "registration")}
                    />
                    <ExpiryCell
                      value={trailer.dot_inspected_on || trailer.dot_expires}
                      alert={alerts.find((item) => item.kind === "dot_inspection")}
                    />
                    <td className="text-xs text-slate-600">
                      {reeferStub(trailer)}
                      {trailer.reefer_setpoint_f != null ? <div>Setpoint {trailer.reefer_setpoint_f}°F</div> : null}
                    </td>
                    <ActiveStatusCell active={trailer.active} />
                    <td>
                      <span className="text-sm font-medium text-navy">Edit</span>
                    </td>
                  </ClickableRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
