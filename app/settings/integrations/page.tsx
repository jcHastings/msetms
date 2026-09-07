import Link from "next/link";
import { OrbcommImportForm } from "@/components/orbcomm-import-form";
import { PageHeader } from "@/components/page-header";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { formatDateTime } from "@/lib/format";
import { isOrbcommConfigured, isQuickbooksConfigured, isTwilioConfigured, isWhatsAppConfigured } from "@/lib/env";
import { SMS_STATUS_CONNECTED, SMS_STATUS_MISSING } from "@/lib/whatsapp-shared";
import { getReeferSnapshots } from "@/lib/integrations/orbcomm";
import { getQuickbooksStatus } from "@/lib/integrations/quickbooks";
import { formatDurationMs, getSamsaraFleet, isSamsaraConfigured } from "@/lib/integrations/samsara";

export const dynamic = "force-dynamic";

export default async function IntegrationsSettingsPage() {
  const samsaraTokenSet = isSamsaraConfigured();
  const orbcommSet = isOrbcommConfigured();
  const qboSet = isQuickbooksConfigured();
  const fleet = await getSamsaraFleet();
  const reefers = await getReeferSnapshots();
  const qbo = await getQuickbooksStatus();

  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader title="Integrations" />

      <section className="card p-6">
        <h2 className="text-sm font-semibold">Texting</h2>
        <p className="mt-4 text-sm font-semibold">{isTwilioConfigured() ? SMS_STATUS_CONNECTED : SMS_STATUS_MISSING}</p>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="text-sm font-semibold">WhatsApp</h2>
        <p className="mt-4 text-sm font-semibold">{isWhatsAppConfigured() ? SMS_STATUS_CONNECTED : SMS_STATUS_MISSING}</p>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="text-sm font-semibold">Samsara</h2>
        <p className="mt-4 text-sm font-semibold">{samsaraTokenSet ? "Connected" : "Not connected"}</p>
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
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="card mt-6 p-6">
        <h2 className="text-sm font-semibold">Orbcomm</h2>
        <p className="mt-4 text-sm font-semibold">{orbcommSet ? "Connected" : "Not connected"}</p>
        {reefers.error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {reefers.error}
          </p>
        ) : null}
        <OrbcommImportForm />
      </section>

      <section className="card mt-6 p-6">
        <h2 className="text-sm font-semibold">QuickBooks</h2>
        <p className="mt-4 text-sm font-semibold">{qboSet ? "Connected" : "Not connected"}</p>
        {qbo.companyName ? (
          <p className="mt-3 text-sm text-slate-600">
            Connected company: <span className="font-semibold">{qbo.companyName}</span>
          </p>
        ) : null}
        <div className="mt-3">
          <Link href="/settings/quickbooks" className="btn btn-secondary">
            Open QuickBooks settings
          </Link>
        </div>
        {qbo.error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {qbo.error}
          </p>
        ) : null}
      </section>

      <section className="card mt-6 overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">Reefer snapshots</h2>
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
                <tr key={`${reading.loadId}-${reading.trailerId}-${reading.recordedAt}-${index}`}>
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
    </SettingsAdminGate>
  );
}
