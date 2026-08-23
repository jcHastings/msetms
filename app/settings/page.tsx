import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";
import { getReeferSnapshots, isSamsaraConfigured } from "@/lib/integrations/samsara";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const configured = isSamsaraConfigured();
  const snapshots = await getReeferSnapshots();

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="v1 talks to Samsara only when SAMSARA_API_TOKEN is set. Otherwise you see labeled demo reefer data."
      />
      <section className="card p-6">
        <h2 className="text-sm font-semibold">Samsara</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-slate-500">Token</dt>
            <dd className="font-semibold">{configured ? "Present in environment" : "Not set"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Mode</dt>
            <dd className="font-semibold">{snapshots.mode === "demo" ? "Demo readings" : "Live API"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-slate-600">
          Set <code>SAMSARA_API_TOKEN</code> in the environment and restart. The app calls{" "}
          <code>GET https://api.samsara.com/fleet/vehicles/stats</code> for reefer ambient, setpoint,
          door, and alarm. No token is stored in the repo. If the live call fails, the error is
          shown — we do not pretend it succeeded.
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
            Reefer snapshots {snapshots.mode === "demo" ? "(demo data)" : ""}
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
                  No readings.
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
