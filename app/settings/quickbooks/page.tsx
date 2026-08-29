import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { disconnectQuickbooksAction } from "@/lib/actions";
import { getQuickbooksStatus } from "@/lib/integrations/quickbooks";

export const dynamic = "force-dynamic";

export default async function QuickbooksSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const qbo = await getQuickbooksStatus();
  const connected = Boolean(qbo.refreshTokenSet);
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader title="QuickBooks Online" />

      {params.connected ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          QuickBooks is connected.
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
        <p className="mt-4 text-sm font-semibold">{connected ? "Connected" : "Not connected"}</p>
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
    </SettingsAdminGate>
  );
}
