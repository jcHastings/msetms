import { formatDateTime } from "@/lib/format";
import type { QboStatus } from "@/lib/integrations/quickbooks";

export function QuickbooksSettingsCard({ qbo }: { qbo: QboStatus }) {
  return (
    <section className="card p-6">
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
        <code>QUICKBOOKS_REFRESH_TOKEN</code>, and <code>QUICKBOOKS_REALM_ID</code> in gitignored{" "}
        <code>.env.local</code>. Optional <code>QUICKBOOKS_ENVIRONMENT=sandbox</code> or{" "}
        <code>production</code>. Restart after changing values. Delivered loads invoice the{" "}
        <strong>customer rate</strong>, not owner-operator pay. Credentials are never shown here.
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
      {!qbo.configured ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          No credentials — delivered loads show a labeled demo invoice you can record locally.
        </p>
      ) : null}
    </section>
  );
}
