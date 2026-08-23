import {
  addStopAction,
  deleteStopAction,
  moveStopAction,
} from "@/lib/dispatcher-actions";
import { ensureDefaultStops } from "@/lib/stops";

export function LoadStopsPanel({ loadId }: { loadId: number }) {
  const stops = ensureDefaultStops(loadId);

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold">Stops</h2>
      <p className="mt-1 text-sm text-slate-500">Pickup, extra stops, delivery. Reorder or add a stop-off.</p>
      <ol className="mt-3 space-y-2">
        {stops.map((stop) => (
          <li
            key={stop.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
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
        <input type="hidden" name="load_id" value={loadId} />
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
  );
}
