"use client";

import { useState } from "react";
import { addRelayAction, deleteRelayAction } from "@/lib/dispatcher-actions";
import { formatRelayHandoff, type LoadRelayView } from "@/lib/relays";
import { assignedLoadName } from "@/lib/owner-operator-shared";
import { isOwnerOperator } from "@/lib/types";

type RelayDriverOption = {
  id: number;
  name: string;
  driver_type: string;
  company_name?: string;
};

export function LoadRelaysPanel({
  loadId,
  relays,
  drivers,
  primaryDriverId,
}: {
  loadId: number;
  relays: LoadRelayView[];
  drivers: RelayDriverOption[];
  primaryDriverId?: number | null;
}) {
  const [open, setOpen] = useState(false);
  const last = relays[relays.length - 1];
  const defaultFromId = last?.driver_id ?? primaryDriverId ?? null;

  return (
    <section className="card mb-2 p-3" id="relays">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Relays</h2>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          + Add Relay
        </button>
      </div>
      {relays.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No relays yet. Click + Add Relay.</p>
      ) : (
        <ol className="mt-3 divide-y divide-slate-100">
          {relays.map((relay) => (
            <li key={relay.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <div className="font-medium">
                  {formatRelayHandoff(
                    assignedLoadName({
                      name: relay.from_driver_name,
                      driver_type: relay.from_driver_type,
                      company_name: relay.from_driver_company_name,
                    }),
                    assignedLoadName({
                      name: relay.driver_name,
                      driver_type: relay.driver_type,
                      company_name: relay.driver_company_name,
                    }),
                    relay.delivery || relay.pickup,
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {driverKindLabel(relay.from_driver_type)} → {driverKindLabel(relay.driver_type)}
                </div>
              </div>
              <form
                action={async (formData) => {
                  await deleteRelayAction(formData);
                }}
              >
                <input type="hidden" name="relay_id" value={relay.id} />
                <button className="btn btn-ghost text-rose-700" type="submit">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ol>
      )}
      {open ? (
        <RelayDialog
          loadId={loadId}
          drivers={drivers}
          defaultFromId={defaultFromId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}

function driverKindLabel(type: string | null | undefined): string {
  if (!type) return "Unassigned";
  return isOwnerOperator(type) ? "OO" : "Company";
}

function driverOptionLabel(driver: RelayDriverOption): string {
  const label = assignedLoadName(driver);
  return `${label}${isOwnerOperator(driver.driver_type) ? " · OO" : " · Company"}`;
}

function RelayDialog({
  loadId,
  drivers,
  defaultFromId,
  onClose,
}: {
  loadId: number;
  drivers: RelayDriverOption[];
  defaultFromId: number | null;
  onClose: () => void;
}) {
  const [fromId, setFromId] = useState(defaultFromId ? String(defaultFromId) : "");
  const [toId, setToId] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="pay-item-dialog-backdrop" role="dialog" aria-label="Add relay">
      <form
        action={async (formData) => {
          const result = await addRelayAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onClose();
        }}
        className="pay-item-dialog card space-y-3 p-5"
      >
        <h3 className="text-sm font-semibold">Add Relay</h3>
        <input type="hidden" name="load_id" value={loadId} />
        <div className="field">
          <label htmlFor="relay-driver-a">Driver A</label>
          <select
            id="relay-driver-a"
            name="from_driver_id"
            required
            value={fromId}
            onChange={(event) => setFromId(event.target.value)}
          >
            <option value="">Select driver</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driverOptionLabel(driver)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="relay-driver-b">Driver B</label>
          <select
            id="relay-driver-b"
            name="driver_id"
            required
            value={toId}
            onChange={(event) => setToId(event.target.value)}
          >
            <option value="">Select driver</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id} disabled={String(driver.id) === fromId}>
                {driverOptionLabel(driver)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="relay-handoff">Relay point</label>
          <input id="relay-handoff" name="handoff" required placeholder="Handoff city" />
        </div>
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={Boolean(fromId) && fromId === toId}>
            Save Relay
          </button>
        </div>
      </form>
    </div>
  );
}
