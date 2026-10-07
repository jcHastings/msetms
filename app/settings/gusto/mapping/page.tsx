import Link from "next/link";
import { forbidden } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SettingsBack } from "@/components/settings-nav";
import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { linkGustoDriverAction, unlinkGustoDriverAction } from "@/lib/gusto-actions";
import { getGustoPublicStatus, listGustoLinks, listGustoPeople } from "@/lib/integrations/gusto";
import { driverMatchKind } from "@/lib/integrations/gusto-read";
import { listDrivers } from "@/lib/queries";
import { canConnectGusto, canViewGusto } from "@/lib/settings-shared";
import { labelForDriverKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function GustoMappingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher || !canViewGusto(dispatcher.role)) forbidden();
  const canEdit = canConnectGusto(dispatcher.role);
  const params = await searchParams;
  const gusto = getGustoPublicStatus();
  const drivers = listDrivers();
  const people = listGustoPeople();
  const links = listGustoLinks();
  const linkByDriver = new Map(links.map((link) => [link.driver_id, link]));
  const linkedUuids = new Set(links.map((link) => link.gusto_uuid));
  const unmatchedPeople = people.filter((person) => !linkedUuids.has(person.uuid));
  const unmatchedDrivers = drivers.filter((driver) => !linkByDriver.has(driver.id));

  return (
    <>
      <SettingsBack />
      <PageHeader title="Gusto mapping" />
      <p className="mb-4 text-sm text-slate-600">
        Company drivers match employees. Owner-operators match contractors. Email first, then name.
      </p>
      <p className="mb-4 text-sm">
        <Link href="/settings/gusto" className="font-semibold underline">
          ← Gusto connection
        </Link>
      </p>
      {params.saved ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          Mapping saved.
        </p>
      ) : null}
      {params.error ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">
          {params.error}
        </p>
      ) : null}
      {!gusto.connected ? (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
          Gusto is not connected. Connect on the Gusto card, then Sync now to load the roster.
        </p>
      ) : null}

      <section className="card mb-6 p-6" aria-labelledby="unmatched-heading">
        <h2 id="unmatched-heading" className="text-sm font-semibold">
          Unmatched
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gusto</h3>
            {unmatchedPeople.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No unmatched Gusto people.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {unmatchedPeople.map((person) => (
                  <li key={person.uuid} className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm" data-unmatched-gusto="">
                    <span className="font-semibold">{person.name || "Unnamed"}</span>
                    <span className="mt-1 block text-slate-600">
                      {person.kind === "contractor" ? "Contractor" : "Employee"}
                      {person.email ? ` · ${person.email}` : ""}
                      {person.active ? "" : " · Inactive"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Drivers</h3>
            {unmatchedDrivers.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No unmatched drivers.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {unmatchedDrivers.map((driver) => (
                  <li key={driver.id} className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm" data-unmatched-driver="">
                    <span className="font-semibold">{driver.name}</span>
                    <span className="mt-1 block text-slate-600">
                      {labelForDriverKind(driver.driver_type)}
                      {driver.email ? ` · ${driver.email}` : ""}
                      {driver.company_name ? ` · ${driver.company_name}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="card p-6" aria-labelledby="mapping-table-heading">
        <h2 id="mapping-table-heading" className="text-sm font-semibold">
          Drivers
        </h2>
        <div className="mt-4 space-y-4">
          {drivers.map((driver) => {
            const link = linkByDriver.get(driver.id);
            const kind = driverMatchKind(driver.driver_type);
            const options = people.filter(
              (person) => person.kind === kind && (!linkedUuids.has(person.uuid) || person.uuid === link?.gusto_uuid),
            );
            return (
              <form key={driver.id} action={linkGustoDriverAction} className="rounded border border-slate-200 p-3">
                <input type="hidden" name="driver_id" value={driver.id} />
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-48 flex-1">
                    <p className="text-sm font-semibold">{driver.name}</p>
                    <p className="text-xs text-slate-500">
                      {labelForDriverKind(driver.driver_type)}
                      {driver.company_name ? ` · ${driver.company_name}` : ""}
                      {link ? ` · ${link.match_source}` : " · unmatched"}
                    </p>
                  </div>
                  <label className="field min-w-56 flex-1">
                    <span>{kind === "contractor" ? "Gusto contractor" : "Gusto employee"}</span>
                    <select
                      name="gusto_uuid"
                      defaultValue={link?.gusto_uuid ?? ""}
                      disabled={!canEdit}
                      data-view-only={canEdit ? undefined : ""}
                      aria-label={`Gusto match for ${driver.name}`}
                      className="min-h-11"
                    >
                      <option value="">Not linked</option>
                      {options.map((person) => (
                        <option key={person.uuid} value={person.uuid}>
                          {person.name || person.uuid}
                          {person.email ? ` (${person.email})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn btn-primary min-h-11" type="submit" disabled={!canEdit} data-view-only={canEdit ? undefined : ""}>
                    Save
                  </button>
                </div>
              </form>
            );
          })}
        </div>
        {links.length > 0 ? (
          <div className="mt-4 space-y-2">
            {links.map((link) => (
              <form key={link.driver_id} action={unlinkGustoDriverAction}>
                <input type="hidden" name="driver_id" value={link.driver_id} />
                <button className="btn btn-secondary min-h-11" type="submit" disabled={!canEdit} data-view-only={canEdit ? undefined : ""}>
                  Unlink {link.name || "this match"}
                </button>
              </form>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}
