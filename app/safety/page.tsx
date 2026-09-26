import Link from "next/link";
import { deskMetadata } from "@/lib/desk-metadata";

export const metadata = deskMetadata("Safety");
import { AccessDenied } from "@/components/access-denied";
import { PageHeader } from "@/components/page-header";
import { canEditFleet, getPageAccess } from "@/lib/dispatcher-session";
import { SAMSARA_TOKEN_MISSING_MESSAGE } from "@/lib/fleet-import-shared";
import { getSamsaraFleet } from "@/lib/integrations/samsara";
import { listSamsaraDvirFlags } from "@/lib/integrations/samsara-webhook";
import { formatDateTime } from "@/lib/format";
import { listDrivers } from "@/lib/queries";
import { buildSafetyBoard } from "@/lib/safety";
import { formatSafetyDatePair } from "@/lib/safety-shared";
import { complianceWindows, getCompanySettings } from "@/lib/settings";
import { labelForDriverKind } from "@/lib/types";

export const dynamic = "force-dynamic";

function samsaraDvirWhen(iso: string): string {
  const raw = iso.trim();
  if (!raw) return "Time missing";
  const label = formatDateTime(raw);
  if (!label || label === "\u2014" || label === "\u2013") return raw;
  return label;
}

export default async function SafetyPage() {
  const dispatcher = await getPageAccess(canEditFleet);
  if (!dispatcher) {
    return <AccessDenied message="Safety is for Administrator and Standard." />;
  }
  const settings = getCompanySettings();
  const fleet = await getSamsaraFleet();
  const board = buildSafetyBoard({
    drivers: listDrivers(),
    windowDays: complianceWindows().driverDays,
    insurance: {
      provider: settings.insurance_provider,
      policy: settings.insurance_policy,
      expires: settings.insurance_expires,
    },
    tokenSet: fleet.tokenSet,
    hos: fleet.tokenSet ? fleet.hos : [],
  });
  const ranked = [...board.rows, ...(board.insurance ? [board.insurance] : [])];
  const expired = ranked.filter((row) => row.rank === "expired").length;
  const dueSoon = ranked.filter((row) => row.rank === "due_soon").length;
  const hosIssues = board.rows.filter((row) => row.rank === "hos_violation").length;
  const dvirFlags = listSamsaraDvirFlags();

  return (
    <>
      <PageHeader
        title="Safety"
        actions={
          <Link href="/fleet/drivers" className="btn btn-secondary">
            Open drivers
          </Link>
        }
      />
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Expired</div>
          <div className="mt-1 text-2xl font-semibold">{expired}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">Due soon</div>
          <div className="mt-1 text-2xl font-semibold">{dueSoon}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">HOS violations</div>
          <div className="mt-1 text-2xl font-semibold">{hosIssues}</div>
        </div>
      </div>
      {!fleet.tokenSet ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {SAMSARA_TOKEN_MISSING_MESSAGE}
        </p>
      ) : null}
      <section className="card mb-4 p-5" data-samsara-dvir="">
        <h2 className="text-sm font-semibold">Samsara DVIR</h2>
        <p className="mt-1 text-sm text-slate-600">Tractor only. Trailer DVIR stays off this list.</p>
        {dvirFlags.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No tractor DVIR defects.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {dvirFlags.map((flag) => (
              <li key={flag.eventId} className="text-sm text-slate-800" data-samsara-dvir-event={flag.eventId}>
                <div className="font-medium">
                  {flag.unitNumber ? `Truck ${flag.unitNumber}. ` : ""}
                  {flag.title}
                </div>
                <div className="text-slate-600">
                  {samsaraDvirWhen(flag.eventTime)}. Event {flag.eventId}.
                  {flag.loadId && flag.loadNumber ? (
                    <>
                      {" "}
                      <Link href={`/loads/${flag.loadId}`} className="font-medium text-slate-800 underline">
                        Open {flag.loadNumber}
                      </Link>
                    </>
                  ) : (
                    " No load link."
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {board.insurance ? (
        <section className="card mb-4 p-5">
          <h2 className="text-sm font-semibold">Company insurance</h2>
          <p className="mt-1 text-sm text-slate-700">
            {board.insurance.subject}
            {settings.insurance_policy ? ` · ${settings.insurance_policy}` : ""}
            {board.insurance.licenseExpires ? ` · expires ${board.insurance.licenseExpires}` : ""}
            {board.insurance.rank !== "ok" ? ` · ${board.insurance.title}` : ""}
          </p>
        </section>
      ) : null}
      <section className="card p-5">
        {board.rows.length === 0 ? (
          <p className="text-sm text-slate-500">No drivers on file.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-grid">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>CDL expiry</th>
                  <th>Medical last / next</th>
                  <th>Drug test last / next</th>
                  <th>HOS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="font-semibold">{row.subject}</div>
                      <div className="text-xs text-slate-500">
                        {labelForDriverKind(row.driverType)}
                      </div>
                    </td>
                    <td>{row.licenseExpires}</td>
                    <td>{formatSafetyDatePair(row.medicalLast, row.medicalNext)}</td>
                    <td>{formatSafetyDatePair(row.drugLast, row.drugNext)}</td>
                    <td>{row.hos}</td>
                    <td className="font-medium">{row.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
