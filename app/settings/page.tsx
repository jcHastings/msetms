import { CompanyProfileForm } from "@/components/company-profile-form";
import { OrbcommImportForm } from "@/components/orbcomm-import-form";
import { PageHeader } from "@/components/page-header";
import { getCompanyProfile } from "@/lib/company";
import { formatDateTime } from "@/lib/format";
import { isOrbcommConfigured, isQuickbooksConfigured } from "@/lib/env";
import { getReeferSnapshots } from "@/lib/integrations/orbcomm";
import { getQuickbooksStatus } from "@/lib/integrations/quickbooks";
import { formatDurationMs, getSamsaraFleet, isSamsaraConfigured } from "@/lib/integrations/samsara";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const samsaraTokenSet = isSamsaraConfigured();
  const orbcommSet = isOrbcommConfigured();
  const qboSet = isQuickbooksConfigured();
  const fleet = await getSamsaraFleet();
  const reefers = await getReeferSnapshots();
  const qbo = await getQuickbooksStatus();

  const samsaraStatus = !samsaraTokenSet
    ? "Demo"
    : fleet.error
      ? "API error — showing demo"
      : "Connected";
  const orbcommStatus = !orbcommSet
    ? "Demo"
    : reefers.error
      ? "API error — showing demo"
      : "Connected";

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Company header for load confirmations, plus Samsara, ORBCOMM, and QuickBooks. Credentials stay in local .env and are never shown."
      />

      <section className="card mb-6 p-6">
        <h2 className="text-sm font-semibold">Company header</h2>
        <p className="mt-1 text-sm text-slate-600">
          Prefills the Rate & Load Confirmation PDF (company name, dispatcher, phone, email).
        </p>
        <div className="mt-4">
          <CompanyProfileForm profile={getCompanyProfile()} />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-sm font-semibold">Samsara — truck tracking & HOS</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Token</dt>
            <dd className="font-semibold">{samsaraTokenSet ? "Set (hidden)" : "Not set"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-semibold">{samsaraStatus}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Mode</dt>
            <dd className="font-semibold">{fleet.mode === "samsara" ? "Live GPS / HOS" : "Demo GPS / HOS"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Last check</dt>
            <dd className="font-semibold">{formatDateTime(fleet.fetchedAt)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-slate-600">
          Set <code>SAMSARA_API_TOKEN</code> in <code>.env</code> and restart. The app calls{" "}
          <code>GET https://api.samsara.com/fleet/vehicles/stats?types=gps</code> and{" "}
          <code>GET https://api.samsara.com/fleet/hos/clocks</code>. Map the Samsara vehicle ID on the truck and the
          Samsara driver ID on the driver. Samsara is not used for reefer temperature.
        </p>
        {fleet.error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {fleet.error}
          </p>
        ) : null}
        {fleet.hos.length > 0 ? (
          <ul className="mt-4 text-sm text-slate-600">
            {fleet.hos.slice(0, 6).map((clock) => (
              <li key={`${clock.driverId}-${clock.driverName}`}>
                {clock.driverName}: {formatDurationMs(clock.driveRemainingMs)} drive remaining
                {clock.source === "demo" ? " (demo)" : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card mt-6 p-6">
        <h2 className="text-sm font-semibold">ORBCOMM — trailer tracking & reefer</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Username</dt>
            <dd className="font-semibold">{orbcommSet ? "Set (hidden)" : "Not set"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Password</dt>
            <dd className="font-semibold">{orbcommSet ? "Set (hidden)" : "Not set"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-semibold">{orbcommStatus}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Mode</dt>
            <dd className="font-semibold">
              {reefers.mode === "orbcomm" ? "Live / imported trailer + reefer" : "Demo trailer + reefer"}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-slate-600">
          Source of record:{" "}
          <a
            className="underline"
            href="https://platform.orbcomm.com/#/portal/remote/ReeferStatusReport"
            target="_blank"
            rel="noreferrer"
          >
            ORBCOMM Reefer Status Report
          </a>
          . Set <code>ORBCOMM_USERNAME</code> and <code>ORBCOMM_PASSWORD</code> (optional{" "}
          <code>ORBCOMM_ACCOUNT_ID</code>) in <code>.env</code>. The app requests a Transportation Platform token at{" "}
          <code>POST /SynB2BGatewayService/api/generateToken</code>. There is no scrape of the logged-in portal. If
          B2B asset snapshot access is not enabled, export the report as CSV/JSON and import it below. Map the ORBCOMM
          asset ID on the trailer. ORBCOMM is not used for driver HOS.
        </p>
        {reefers.error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {reefers.error}
          </p>
        ) : null}
        {reefers.note ? (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {reefers.note}
          </p>
        ) : null}
        <OrbcommImportForm />
      </section>

      <section className="card mt-6 p-6">
        <h2 className="text-sm font-semibold">QuickBooks Online — customer invoices</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Client ID</dt>
            <dd className="font-semibold">{qbo.clientIdSet ? "Set (hidden)" : "Not set"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Client secret</dt>
            <dd className="font-semibold">{qbo.clientSecretSet ? "Set (hidden)" : "Not set"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Refresh token</dt>
            <dd className="font-semibold">{qbo.refreshTokenSet ? "Set (hidden)" : "Not set"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Realm ID</dt>
            <dd className="font-semibold">{qbo.realmIdSet ? "Set (hidden)" : "Not set"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Environment</dt>
            <dd className="font-semibold">{qbo.environment}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-semibold">{qbo.status}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Mode</dt>
            <dd className="font-semibold">
              {qbo.mode === "quickbooks" ? "Live invoices" : "Demo invoice preview"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Last check</dt>
            <dd className="font-semibold">{formatDateTime(qbo.fetchedAt)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-slate-600">
          Complete OAuth outside this app (Intuit OAuth 2.0 Playground), then set{" "}
          <code>QUICKBOOKS_CLIENT_ID</code>, <code>QUICKBOOKS_CLIENT_SECRET</code>,{" "}
          <code>QUICKBOOKS_REFRESH_TOKEN</code>, and <code>QUICKBOOKS_REALM_ID</code> in <code>.env</code>. Optional{" "}
          <code>QUICKBOOKS_ENVIRONMENT=sandbox</code> or <code>production</code>. Restart after changing values.
          Delivered loads invoice the <strong>customer rate</strong>, not owner-operator pay.
        </p>
        {qbo.companyName ? (
          <p className="mt-3 text-sm text-slate-600">
            Connected company: <span className="font-semibold">{qbo.companyName}</span>
          </p>
        ) : null}
        {qbo.error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {qbo.error}
          </p>
        ) : null}
        {!qboSet ? (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            No credentials — delivered loads show a labeled demo invoice you can record locally.
          </p>
        ) : null}
      </section>

      <section className="card mt-6 overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">
            Reefer snapshots {reefers.mode === "demo" ? "(demo data)" : "(ORBCOMM)"}
          </h2>
        </header>
        <table className="table-grid">
          <thead>
            <tr>
              <th>Load / trailer</th>
              <th>Location</th>
              <th>Temp</th>
              <th>Setpoint</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {reefers.readings.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-slate-500">
                  No readings.
                </td>
              </tr>
            ) : (
              reefers.readings.map((reading, index) => (
                <tr key={`${reading.loadId}-${reading.recordedAt}-${index}`}>
                  <td>
                    {reading.loadId ? `Load ${reading.loadId}` : "—"}
                    {reading.trailerId ? ` · ${reading.trailerId}` : ""}
                  </td>
                  <td>
                    {reading.address ||
                      (reading.latitude != null && reading.longitude != null
                        ? `${reading.latitude.toFixed(3)}, ${reading.longitude.toFixed(3)}`
                        : "—")}
                  </td>
                  <td>{reading.temperatureF != null ? `${reading.temperatureF}°F` : "—"}</td>
                  <td>{reading.setpointF != null ? `${reading.setpointF}°F` : "—"}</td>
                  <td>{formatDateTime(reading.recordedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
