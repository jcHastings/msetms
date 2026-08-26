import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { SettingsAdminGate } from "@/components/settings-admin-gate";
import { SettingsBack } from "@/components/settings-nav";
import { canEditSettings, getSignedInDispatcher } from "@/lib/dispatcher-session";
import { DROPDOWN_KINDS, listDropdownOptions } from "@/lib/settings";
import {
  addDropdownOptionAction,
  deleteDropdownOptionAction,
  toggleDropdownOptionAction,
} from "@/lib/settings-actions";

export const dynamic = "force-dynamic";

export default async function ListsSettingsPage() {
  const dispatcher = await getSignedInDispatcher();
  const canEdit = dispatcher ? canEditSettings(dispatcher.role) : false;
  const options = listDropdownOptions(undefined, true);
  return (
    <SettingsAdminGate>
      <SettingsBack />
      <PageHeader
        title="Dropdown lists"
        subtitle="Commodities, equipment, and load statuses."
      />
      {DROPDOWN_KINDS.map((kind) => {
        const rows = options.filter((item) => item.kind === kind.value);
        return (
          <section key={kind.value} className="card mb-6 p-6">
            <h2 className="text-sm font-semibold">{kind.label}</h2>
            <table className="table-grid mt-3">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Value</th>
                  <th>Active</th>
                  {canEdit ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 4 : 3} className="text-slate-500">
                      None yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.label}</td>
                      <td className="font-mono text-xs">{row.value}</td>
                      <td>{row.active ? "Yes" : "Hidden"}</td>
                      {canEdit ? (
                        <td className="text-right">
                          <form action={toggleDropdownOptionAction} className="inline">
                            <input type="hidden" name="option_id" value={row.id} />
                            <input type="hidden" name="active" value={row.active ? "0" : "1"} />
                            <button className="btn btn-ghost" type="submit">
                              {row.active ? "Hide" : "Show"}
                            </button>
                          </form>
                          <form action={deleteDropdownOptionAction} className="inline">
                            <input type="hidden" name="option_id" value={row.id} />
                            <button className="btn btn-ghost text-rose-700" type="submit">
                              Remove
                            </button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {canEdit ? (
              <div className="mt-4">
                <SettingsForm action={addDropdownOptionAction} submitLabel={`Add ${kind.label.toLowerCase()}`}>
                  <input type="hidden" name="kind" value={kind.value} />
                  <div className="field">
                    <label htmlFor={`${kind.value}-label`}>Label</label>
                    <input id={`${kind.value}-label`} name="label" required placeholder="Frozen bakery" />
                  </div>
                  <div className="field">
                    <label htmlFor={`${kind.value}-value`}>Value (optional)</label>
                    <input id={`${kind.value}-value`} name="value" placeholder="frozen_bakery" />
                  </div>
                </SettingsForm>
              </div>
            ) : null}
          </section>
        );
      })}
    </SettingsAdminGate>
  );
}
