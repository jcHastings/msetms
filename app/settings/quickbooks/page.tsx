import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { disconnectQuickbooksAction } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { getQuickbooksStatus } from "@/lib/integrations/quickbooks";

export const dynamic = "force-dynamic";

export default async function QuickbooksSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const qbo = await getQuickbooksStatus();
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader
        title="QuickBooks Online"
        subtitle="Connect QuickBooks for customer invoices."
      />

      {params.connected ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          QuickBooks is connected. Realm and refresh tokens are stored on the server.
        </p>
      ) : null}
      {params.error ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {params.error}
        </p>
      ) : null}
      {qbo.error ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {qbo.error}
        </p>
      ) : null}

      <section className="card mb-6 p-6">
        <h2 className="text-sm font-semibold">Connection</h2>
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
            <dt className="text-slate-500">Redirect URI</dt>
            <dd className="font-semibold break-all">{qbo.redirectUri}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Environment</dt>
            <dd className="font-semibold">{qbo.environment}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Refresh token</dt>
            <dd className="font-semibold">{qbo.refreshTokenSet ? "Stored on server (hidden)" : "Not connected"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Company / realm</dt>
            <dd className="font-semibold">{qbo.realmIdSet ? "Stored on server (hidden)" : "Not connected"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-semibold">{qbo.status}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Last check</dt>
            <dd className="font-semibold">{formatDateTime(qbo.fetchedAt)}</dd>
          </div>
        </dl>
        {qbo.companyName ? (
          <p className="mt-3 text-sm text-slate-600">
            Connected company: <span className="font-semibold">{qbo.companyName}</span>
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {qbo.oauthReady ? (
            <a className="btn btn-primary" href="/api/integrations/quickbooks/connect">
              {qbo.configured ? "Reconnect QuickBooks" : "Connect QuickBooks"}
            </a>
          ) : null}
          {qbo.refreshTokenSet ? (
            <form action={disconnectQuickbooksAction}>
              <button className="btn btn-secondary" type="submit">
                Disconnect
              </button>
            </form>
          ) : null}
          <Link href="/accounting/quickbooks" className="btn btn-secondary">
            Accounting → QuickBooks
          </Link>
        </div>
      </section>

      {!qbo.oauthReady ? (
        <p className="text-sm text-slate-600">Not connected.</p>
      ) : (
        <p className="text-sm text-slate-600">Customer invoices only.</p>
      )}
    </SettingsAdminGate>
  );
}
