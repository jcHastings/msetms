import {
  addRelayAction,
  deleteRelayAction,
  moveRelayAction,
  updateRelayAction,
} from "@/lib/dispatcher-actions";
import { formatMoney } from "@/lib/format";
import { listRelays } from "@/lib/relay-store";
import { formatRelayLane, nextRelayDefaults } from "@/lib/relays";
import type { DriverWithTruck, Trailer, TruckWithDriver } from "@/lib/types";

export function LoadRelaysPanel({
  loadId,
  origin,
  destination,
  drivers,
  trucks,
  trailers,
}: {
  loadId: number;
  origin: string;
  destination: string;
  drivers: DriverWithTruck[];
  trucks: TruckWithDriver[];
  trailers: Trailer[];
}) {
  const relays = listRelays(loadId);
  const defaults = nextRelayDefaults({ origin, destination }, relays);

  return (
    <section className="card mb-4 p-5" id="relays">
      <h2 className="text-sm font-semibold">Relays</h2>
      <p className="mt-1 text-sm text-slate-500">
        Internal legs only. Handoff cities stay on this load and the driver app — not a billed customer stop,
        not on the invoice or customer confirmation.
      </p>
      {relays.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">No relays yet. First/last can match the load origin and destination.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {relays.map((relay) => (
            <li key={relay.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Leg {relay.sequence}
                  </div>
                  <div className="font-medium">{formatRelayLane(relay.pickup, relay.delivery)}</div>
                  <div className="text-sm text-slate-600">
                    {relay.driver_name || "Unassigned"}
                    {relay.driver_type === "owner_operator" ? " · OO" : ""}
                    {relay.truck_unit ? ` · Unit ${relay.truck_unit}` : ""}
                    {relay.trailer_unit ? ` · Trailer ${relay.trailer_unit}` : ""}
                    {relay.oo_pay != null ? ` · internal ${formatMoney(relay.oo_pay)}` : ""}
                  </div>
                </div>
                <div className="flex gap-1">
                  <form action={moveRelayAction}>
                    <input type="hidden" name="relay_id" value={relay.id} />
                    <input type="hidden" name="direction" value="-1" />
                    <button className="btn btn-ghost" type="submit">
                      Up
                    </button>
                  </form>
                  <form action={moveRelayAction}>
                    <input type="hidden" name="relay_id" value={relay.id} />
                    <input type="hidden" name="direction" value="1" />
                    <button className="btn btn-ghost" type="submit">
                      Down
                    </button>
                  </form>
                  <form action={deleteRelayAction}>
                    <input type="hidden" name="relay_id" value={relay.id} />
                    <button className="btn btn-ghost text-rose-700" type="submit">
                      Remove
                    </button>
                  </form>
                </div>
              </div>
              <form action={updateRelayAction} className="mt-3 grid gap-3 md:grid-cols-6">
                <input type="hidden" name="relay_id" value={relay.id} />
                <RelayFields
                  drivers={drivers}
                  trucks={trucks}
                  trailers={trailers}
                  defaults={{
                    pickup: relay.pickup,
                    delivery: relay.delivery,
                    driverId: relay.driver_id,
                    truckId: relay.truck_id,
                    trailerId: relay.trailer_id,
                    ooPercent: relay.oo_percent,
                    ooPay: relay.oo_pay,
                    notes: relay.notes,
                  }}
                />
                <button className="btn btn-secondary self-end" type="submit">
                  Save leg
                </button>
              </form>
            </li>
          ))}
        </ol>
      )}
      <form action={addRelayAction} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-6">
        <input type="hidden" name="load_id" value={loadId} />
        <RelayFields
          drivers={drivers}
          trucks={trucks}
          trailers={trailers}
          defaults={{
            pickup: defaults.pickup,
            delivery: defaults.delivery,
            driverId: null,
            truckId: null,
            trailerId: null,
            ooPercent: null,
            ooPay: null,
            notes: "",
          }}
        />
        <button className="btn btn-secondary self-end" type="submit">
          Add relay
        </button>
      </form>
    </section>
  );
}

function RelayFields({
  drivers,
  trucks,
  trailers,
  defaults,
}: {
  drivers: DriverWithTruck[];
  trucks: TruckWithDriver[];
  trailers: Trailer[];
  defaults: {
    pickup: string;
    delivery: string;
    driverId: number | null;
    truckId: number | null;
    trailerId: number | null;
    ooPercent: number | null;
    ooPay: number | null;
    notes: string;
  };
}) {
  return (
    <>
      <div className="field md:col-span-2">
        <label>Pickup</label>
        <input name="pickup" required defaultValue={defaults.pickup} placeholder="New York, NY" />
      </div>
      <div className="field md:col-span-2">
        <label>Delivery / handoff</label>
        <input name="delivery" required defaultValue={defaults.delivery} placeholder="Chicago, IL" />
      </div>
      <div className="field">
        <label>Driver</label>
        <select name="driver_id" defaultValue={defaults.driverId ?? ""}>
          <option value="">Unassigned</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
              {driver.driver_type === "owner_operator" ? " · OO" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Truck (optional)</label>
        <select name="truck_id" defaultValue={defaults.truckId ?? ""}>
          <option value="">Same / none</option>
          {trucks.map((truck) => (
            <option key={truck.id} value={truck.id}>
              {truck.unit_number}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Trailer (optional)</label>
        <select name="trailer_id" defaultValue={defaults.trailerId ?? ""}>
          <option value="">Same / none</option>
          {trailers.map((trailer) => (
            <option key={trailer.id} value={trailer.id}>
              {trailer.unit_number}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Internal OO %</label>
        <input name="oo_percent" type="number" min={0} max={100} step="0.1" defaultValue={defaults.ooPercent ?? ""} />
      </div>
      <div className="field">
        <label>Internal pay</label>
        <input name="oo_pay" type="number" min={0} step="0.01" defaultValue={defaults.ooPay ?? ""} />
      </div>
      <div className="field md:col-span-2">
        <label>Internal notes</label>
        <input name="notes" defaultValue={defaults.notes} />
      </div>
    </>
  );
}
