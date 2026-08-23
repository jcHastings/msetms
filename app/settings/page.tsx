import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";
import { getReeferSnapshots, isSamsaraConfigured } from "@/lib/integrations/samsara";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const tokenSet = isSamsaraConfigured();
  const snapshots = await getReeferSnapshots();
  const status = !tokenSet
    ? "Demo"
    : snapshots.error && snapshots.mode === "demo"
      ? "API error — showing demo"
      : snapshots.error
        ? "Connected (partial)"
        : "Connected";

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Samsara is live only when SAMSARA_API_TOKEN is set in a local .env. The token is never shown here."
      />
      <section className="card p-6">
        <h2 className="text-sm font-semibold">Samsara</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Token</dt>
            <dd className="font-semibold">{tokenSet ? "Set (hidden)" : "Not set"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-semibold">{status}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Mode</dt>
            <dd className="font-semibold">
              {snapshots.mode === "samsara" ? "Live last-known readings" : "Demo readings"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Last check</dt>
            <dd className="font-semibold">{formatDateTime(snapshots.fetchedAt)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-slate-600">
          Copy <code>.env.example</code> to <code>.env</code> or <code>.env.local</code>, paste the token after{" "}
          <code>SAMSARA_API_TOKEN=</code>, and restart. The app calls{" "}
          <code>GET https://api.samsara.com/fleet/vehicles/stats</code> and{" "}
          <code>GET https://api.samsara.com/fleet/trailers/stats</code> for last-known reefer ambient, setpoint, and
          door. Map the Samsara vehicle ID and trailer/asset ID on each truck in Fleet. The token is never stored in
          the database or displayed.
        </p>
        {snapshots.error ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {snapshots.error}
          </p>
        ) : null}
      </section>

      <section className="card mt-6 overflow-hidden">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold">
            Reefer snapshots {snapshots.mode === "demo" ? "(demo data)" : "(live / last-known)"}
          </h2>
        </header>
        <table className="table-grid">
          <thead>
            <tr>
              <th>Load / tractor</th>
              <th>Trailer</th>
              <th>Temp</th>
              <th>Setpoint</th>
              <th>Door</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.readings.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-slate-500">
                  {snapshots.mode === "samsara"
                    ? "Connected, but no mapped tractor/trailer has a last-known reefer reading yet."
                    : "No readings."}
                </td>
              </tr>
            ) : (
              snapshots.readings.map((reading, index) => (
                <tr key={`${reading.loadId}-${reading.recordedAt}-${index}`}>
                  <td>{reading.loadId ? `Load ${reading.loadId}` : reading.tractorId || "—"}</td>
                  <td>{reading.trailerId || "—"}</td>
                  <td>{reading.temperatureF != null ? `${reading.temperatureF}°F` : "—"}</td>
                  <td>{reading.setpointF != null ? `${reading.setpointF}°F` : "—"}</td>
                  <td>{reading.doorOpen == null ? "—" : reading.doorOpen ? "Open" : "Closed"}</td>
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
