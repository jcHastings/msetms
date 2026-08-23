"use client";

import { useLoadEdit } from "@/components/load-edit-context";
import { createClaimAction, saveTemplateAction, watchLoadAction } from "@/lib/dispatcher-actions";
import { STATUS_REASONS, type LoadView } from "@/lib/types";

type EquipmentChoice = { value: string; label: string };
type ClaimRow = { id: number; claim_number: string; kind: string; status: string };

export function LoadExtraDetails({
  load,
  equipmentChoices,
  claims,
}: {
  load: LoadView;
  equipmentChoices: EquipmentChoice[];
  claims: ClaimRow[];
}) {
  const edit = useLoadEdit();
  const formId = edit?.formId;
  const tab = edit?.tab ?? "all";
  const showAssets = tab === "all" || tab === "assets";
  const showFinancials = tab === "all" || tab === "financials";

  return (
    <>
      <input type="hidden" form={formId} name="save_load_details" value="1" />
      <section className={showAssets ? "card mt-4 p-5" : "hidden"}>
        <h2 className="text-sm font-semibold">Equipment and details</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="field">
            <label htmlFor="status_reason">Status reason</label>
            <select id="status_reason" form={formId} name="status_reason" defaultValue={load.status_reason ?? ""}>
              {STATUS_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="equipment">Equipment required</label>
            <select id="equipment" form={formId} name="equipment" defaultValue={load.equipment ?? ""}>
              {equipmentChoices.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cover_by">Cover by</label>
            <input id="cover_by" form={formId} name="cover_by" type="date" defaultValue={load.cover_by ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="seal_numbers">Seals</label>
            <input id="seal_numbers" form={formId} name="seal_numbers" defaultValue={load.seal_numbers ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="commodity_class">Commodity class</label>
            <input
              id="commodity_class"
              form={formId}
              name="commodity_class"
              defaultValue={load.commodity_class ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="unload_type">Unload</label>
            <input
              id="unload_type"
              form={formId}
              name="unload_type"
              defaultValue={load.unload_type ?? ""}
              placeholder="Live / drop / driver assist"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" form={formId} name="hazmat" value="1" defaultChecked={Boolean(load.hazmat)} />
            Hazmat
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" form={formId} name="team" value="1" defaultChecked={Boolean(load.team)} />
            Team
          </label>
        </div>
      </section>

      <section className={showFinancials ? "card mt-4 p-5" : "hidden"}>
        <h2 className="text-sm font-semibold">Accessorials</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="field">
            <label htmlFor="pallet_count">Pallets</label>
            <input
              id="pallet_count"
              form={formId}
              name="pallet_count"
              type="number"
              defaultValue={load.pallet_count ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="case_count">Cases</label>
            <input
              id="case_count"
              form={formId}
              name="case_count"
              type="number"
              defaultValue={load.case_count ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="appointment_confirmation">Appt confirmation</label>
            <input
              id="appointment_confirmation"
              form={formId}
              name="appointment_confirmation"
              defaultValue={load.appointment_confirmation ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="lumper_expected">Lumper expected</label>
            <input
              id="lumper_expected"
              form={formId}
              name="lumper_expected"
              type="number"
              step="0.01"
              defaultValue={load.lumper_expected ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="lumper_actual">Lumper actual</label>
            <input
              id="lumper_actual"
              form={formId}
              name="lumper_actual"
              type="number"
              step="0.01"
              defaultValue={load.lumper_actual ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="detention_started_at">Detention start</label>
            <input
              id="detention_started_at"
              form={formId}
              name="detention_started_at"
              type="datetime-local"
              defaultValue={load.detention_started_at ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="detention_ended_at">Detention end</label>
            <input
              id="detention_ended_at"
              form={formId}
              name="detention_ended_at"
              type="datetime-local"
              defaultValue={load.detention_ended_at ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="cancel_reason">Cancel reason</label>
            <input
              id="cancel_reason"
              form={formId}
              name="cancel_reason"
              defaultValue={load.cancel_reason ?? ""}
            />
          </div>
        </div>
      </section>

      {showFinancials ? (
        <section className="card mt-4 p-5">
          <h2 className="text-sm font-semibold">Claim / OS&D</h2>
          {claims.length ? (
            <ul className="mt-2 text-sm">
              {claims.map((claim) => (
                <li key={claim.id}>
                  {claim.claim_number} · {claim.kind} · {claim.status}
                </li>
              ))}
            </ul>
          ) : null}
          <form action={createClaimAction} className="mt-3 grid gap-3 md:grid-cols-3">
            <input type="hidden" name="load_id" value={load.id} />
            <div className="field">
              <label htmlFor="claim_number">Claim #</label>
              <input id="claim_number" name="claim_number" required />
            </div>
            <div className="field">
              <label htmlFor="claim_kind">Kind</label>
              <select id="claim_kind" name="kind" defaultValue="osd">
                <option value="osd">OS&D</option>
                <option value="temp">Temperature</option>
                <option value="cargo">Cargo</option>
              </select>
            </div>
            <div className="field md:col-span-3">
              <label htmlFor="claim_notes">Notes</label>
              <input id="claim_notes" name="notes" />
            </div>
            <button className="btn btn-secondary" type="submit">
              Open claim
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}

export function LoadWatchRow({ load }: { load: LoadView }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <form action={saveTemplateAction} className="flex gap-2">
        <input type="hidden" name="load_id" value={load.id} />
        <input
          name="name"
          placeholder="Template name"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button className="btn btn-secondary" type="submit">
          Save template
        </button>
      </form>
      <form action={watchLoadAction}>
        <input type="hidden" name="load_id" value={load.id} />
        <input type="hidden" name="watched" value={load.watched ? "0" : "1"} />
        <button className="btn btn-secondary" type="submit">
          {load.watched ? "Unwatch" : "Watch"}
        </button>
      </form>
    </div>
  );
}
