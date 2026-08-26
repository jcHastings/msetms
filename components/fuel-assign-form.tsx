import { assignFuelDriverAction } from "@/lib/actions";

type Option = { id: number; label: string };

export function FuelAssignForm({
  fuelId,
  drivers,
  loads,
}: {
  fuelId: number;
  drivers: Option[];
  loads: Option[];
}) {
  return (
    <form action={assignFuelDriverAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="fuel_id" value={fuelId} />
      <select name="driver_id" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
        <option value="">Driver…</option>
        {drivers.map((driver) => (
          <option key={driver.id} value={driver.id}>
            {driver.label}
          </option>
        ))}
      </select>
      <select name="load_id" className="rounded-md border border-slate-300 px-2 py-1 text-sm">
        <option value="">Load…</option>
        {loads.map((load) => (
          <option key={load.id} value={load.id}>
            {load.label}
          </option>
        ))}
      </select>
      <button className="btn btn-secondary" type="submit">
        Assign
      </button>
    </form>
  );
}
