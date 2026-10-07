import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SettingsBack } from "@/components/settings-nav";
import { disconnectGustoAction, syncGustoAction } from "@/lib/gusto-actions";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getGustoPublicStatus } from "@/lib/integrations/gusto";
import { canConnectGusto, canViewGusto } from "@/lib/settings-shared";
import { forbidden } from "next/navigation";

export const dynamic = "force-dynamic";

function formatWhen(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "Not yet";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(time));
}

export default async function GustoSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; synced?: string; disconnected?: string }>;
}) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher || !canViewGusto(dispatcher.role)) forbidden();
  const canEdit = canConnectGusto(dispatcher.role);
  const params = await searchParams;
  const gusto = getGustoPublicStatus();

  return (
    <>
      <SettingsBack />
      <PageHeader title="Gusto" />

      {params.connected ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          Gusto is connected.
        </p>
      ) : null}
      {params.synced ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          Sync finished.
        </p>
      ) : null}
      {params.disconnected ? (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800" role="status">
          Gusto is disconnected. Saved pay lines stay until the next sync replaces them.
        </p>
      ) : null}
      {params.error ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
          {params.error}
        </p>
      ) : null}

      <section className="card mb-6 p-6" aria-labelledby="gusto-connection-heading">
        <h2 id="gusto-connection-heading" className="text-sm font-semibold">
          Connection
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Read-only. Sync pulls processed payrolls. Nothing here creates or changes a payroll.
        </p>
        <p className="mt-4 text-sm font-semibold" data-gusto-connection="">
          {gusto.connected ? "Connected" : "Not connected"}
        </p>
        <dl className="mt-3 space-y-2 text-sm text-slate-700">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Environment</dt>
            <dd>{gusto.env === "production" ? "Production" : "Demo"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Connected company</dt>
            <dd>{gusto.companyName || (gusto.connected ? "Company name not returned yet" : "—")}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last sync</dt>
            <dd>{formatWhen(gusto.lastSyncAt)}</dd>
          </div>
          {gusto.lastSyncSummary ? (
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last result</dt>
              <dd>{gusto.lastSyncSummary}</dd>
            </div>
          ) : null}
        </dl>
        {gusto.lastSyncError ? (
          <p className="mt-3 text-sm text-rose-800" role="alert">
            {gusto.lastSyncError}
          </p>
        ) : null}
        {!gusto.scopeReadOnly ? (
          <p className="mt-3 text-sm text-rose-800" role="alert">
            The granted Gusto scope includes more than read access. This app still only calls read endpoints.
          </p>
        ) : null}
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Paystub PDFs require a Gusto Embedded partnership. Weekly gross and net from processed payrolls sync on an
          App Integration. Download uses the Embedded paystub endpoint and stays empty until that access is approved.
        </p>
        {!gusto.configured ? (
          <p className="mt-3 text-sm text-slate-600">
            Add GUSTO_CLIENT_ID and GUSTO_CLIENT_SECRET in the office environment before Connect.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {canEdit && gusto.configured ? (
            <a className="btn btn-primary min-h-11" href="/api/integrations/gusto/connect">
              {gusto.connected ? "Reconnect Gusto" : "Connect Gusto"}
            </a>
          ) : (
            <button className="btn btn-primary min-h-11" type="button" disabled data-view-only="">
              {gusto.connected ? "Reconnect Gusto" : "Connect Gusto"}
            </button>
          )}
          <form action={syncGustoAction}>
            <button className="btn btn-secondary min-h-11" type="submit" disabled={!canEdit || !gusto.connected} data-view-only={canEdit ? undefined : ""}>
              Sync now
            </button>
          </form>
          <form action={disconnectGustoAction}>
            <button className="btn btn-secondary min-h-11" type="submit" disabled={!canEdit || !gusto.connected} data-view-only={canEdit ? undefined : ""}>
              Disconnect
            </button>
          </form>
          <Link href="/settings/gusto/mapping" className="btn btn-secondary min-h-11">
            Employee mapping
          </Link>
        </div>
      </section>
    </>
  );
}
