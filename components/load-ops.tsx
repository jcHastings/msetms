import { listAttachments } from "@/lib/files";
import {
  cloneLoadAction,
  createClaimAction,
  addStopAction,
  deleteStopAction,
  moveStopAction,
  saveLoadDetailsAction,
  saveTemplateAction,
  watchLoadAction,
} from "@/lib/dispatcher-actions";
import { requiredDocumentsForLoad, listClaims } from "@/lib/desk";
import { ensureDefaultStops } from "@/lib/stops";
import { EQUIPMENT_REQUIRED, STATUS_REASONS, type LoadView } from "@/lib/types";
import { labelForAttachmentKind } from "@/lib/types";

export function LoadOps({ load }: { load: LoadView }) {
  const stops = ensureDefaultStops(load.id);
  const attachments = listAttachments(load.id);
  const checklist = requiredDocumentsForLoad(load);
  const claims = listClaims(load.id);

  return (
    <div className="mt-6 space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap gap-2">
          <form action={cloneLoadAction}>
            <input type="hidden" name="load_id" value={load.id} />
            <button className="btn btn-secondary" type="submit">
              Duplicate load
            </button>
          </form>
          <form action={saveTemplateAction} className="flex gap-2">
            <input type="hidden" name="load_id" value={load.id} />
            <input name="name" placeholder="Template name" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
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
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Stops</h2>
        <p className="mt-1 text-sm text-slate-500">Pickup, extra stops, delivery. Reorder or add a stop-off.</p>
        <ol className="mt-3 space-y-2">
          {stops.map((stop) => (
            <li key={stop.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <div>
                <span className="font-semibold capitalize">{stop.kind}</span>
                <span className="ml-2">{stop.name || `${stop.city}, ${stop.state}`}</span>
                {stop.confirmation ? <span className="ml-2 text-slate-500">#{stop.confirmation}</span> : null}
              </div>
              <div className="flex gap-1">
                <form action={moveStopAction}>
                  <input type="hidden" name="stop_id" value={stop.id} />
                  <input type="hidden" name="direction" value="-1" />
                  <button className="btn btn-ghost" type="submit">
                    Up
                  </button>
                </form>
                <form action={moveStopAction}>
                  <input type="hidden" name="stop_id" value={stop.id} />
                  <input type="hidden" name="direction" value="1" />
                  <button className="btn btn-ghost" type="submit">
                    Down
                  </button>
                </form>
                <form action={deleteStopAction}>
                  <input type="hidden" name="stop_id" value={stop.id} />
                  <button className="btn btn-ghost text-rose-700" type="submit">
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ol>
        <form action={addStopAction} className="mt-3 grid gap-3 md:grid-cols-5">
          <input type="hidden" name="load_id" value={load.id} />
          <div className="field">
            <label>Type</label>
            <select name="kind" defaultValue="stopoff">
              <option value="pickup">Pickup</option>
              <option value="stopoff">Stop-off</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
          <div className="field md:col-span-2">
            <label>Name</label>
            <input name="name" required placeholder="Warehouse" />
          </div>
          <div className="field">
            <label>City</label>
            <input name="city" />
          </div>
          <div className="field">
            <label>State</label>
            <input name="state" maxLength={2} />
          </div>
          <button className="btn btn-secondary self-end" type="submit">
            Add stop
          </button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Load details</h2>
        <form action={saveLoadDetailsAction} className="mt-3 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="load_id" value={load.id} />
          <div className="field">
            <label>Status reason</label>
            <select name="status_reason" defaultValue={load.status_reason ?? ""}>
              {STATUS_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Equipment required</label>
            <select name="equipment" defaultValue={load.equipment ?? ""}>
              {EQUIPMENT_REQUIRED.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Cover by</label>
            <input name="cover_by" type="date" defaultValue={load.cover_by ?? ""} />
          </div>
          <div className="field">
            <label>Appt confirmation</label>
            <input name="appointment_confirmation" defaultValue={load.appointment_confirmation ?? ""} />
          </div>
          <div className="field">
            <label>Seals</label>
            <input name="seal_numbers" defaultValue={load.seal_numbers ?? ""} />
          </div>
          <div className="field">
            <label>Commodity class</label>
            <input name="commodity_class" defaultValue={load.commodity_class ?? ""} />
          </div>
          <div className="field">
            <label>Pallets</label>
            <input name="pallet_count" type="number" defaultValue={load.pallet_count ?? ""} />
          </div>
          <div className="field">
            <label>Cases</label>
            <input name="case_count" type="number" defaultValue={load.case_count ?? ""} />
          </div>
          <div className="field">
            <label>Unload</label>
            <input name="unload_type" defaultValue={load.unload_type ?? ""} placeholder="Live / drop / driver assist" />
          </div>
          <div className="field">
            <label>Lumper expected</label>
            <input name="lumper_expected" type="number" step="0.01" defaultValue={load.lumper_expected ?? ""} />
          </div>
          <div className="field">
            <label>Lumper actual</label>
            <input name="lumper_actual" type="number" step="0.01" defaultValue={load.lumper_actual ?? ""} />
          </div>
          <div className="field">
            <label>Detention start</label>
            <input name="detention_started_at" type="datetime-local" defaultValue={load.detention_started_at ?? ""} />
          </div>
          <div className="field">
            <label>Detention end</label>
            <input name="detention_ended_at" type="datetime-local" defaultValue={load.detention_ended_at ?? ""} />
          </div>
          <div className="field">
            <label>Cancel reason</label>
            <input name="cancel_reason" defaultValue={load.cancel_reason ?? ""} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="hazmat" value="1" defaultChecked={Boolean(load.hazmat)} />
            Hazmat
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="team" value="1" defaultChecked={Boolean(load.team)} />
            Team
          </label>
          <button className="btn btn-primary self-end" type="submit">
            Save details
          </button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Document checklist</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {checklist.map((doc) => {
            const have = attachments.some((file) => file.kind === doc.kind);
            return (
              <li key={doc.kind} className={have ? "text-emerald-800" : doc.required ? "text-rose-800" : "text-slate-600"}>
                {have ? "Have" : doc.required ? "Missing" : "Optional"} · {labelForAttachmentKind(doc.kind)}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-5">
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
            <label>Claim #</label>
            <input name="claim_number" required />
          </div>
          <div className="field">
            <label>Kind</label>
            <select name="kind" defaultValue="osd">
              <option value="osd">OS&D</option>
              <option value="temp">Temperature</option>
              <option value="cargo">Cargo</option>
            </select>
          </div>
          <div className="field md:col-span-3">
            <label>Notes</label>
            <input name="notes" />
          </div>
          <button className="btn btn-secondary" type="submit">
            Open claim
          </button>
        </form>
      </section>
    </div>
  );
}
