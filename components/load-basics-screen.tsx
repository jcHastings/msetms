"use client";

import {
  LOAD_SIZES,
  LOAD_TRUCK_STATUSES,
} from "@/lib/load-page-shared";
import { useLoadAssignPersist } from "@/components/use-load-assign-persist";
import { REEFER_MODES } from "@/lib/reefer-shared";
import { LoadStatusBadge } from "@/components/status-badge";
import { DEFAULT_LOAD_EQUIPMENT, LOAD_STATUSES, labelForLoadStatus, type Load } from "@/lib/types";

export type LoadFormDefaults = Partial<{
  customer_id: number | null;
  customer_name: string;
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  commodity: string;
  weight: number | null;
  rate: number | null;
  notes: string;
  special_instructions: string;
  appointment_notes: string;
  reference_number: string;
  po_number: string;
  reefer_setpoint_f: number | null;
  reefer_mode: string;
  trailer_number: string;
  shipper_location_id: number | null;
  consignee_location_id: number | null;
  shipper: { name: string; street: string; city: string; state: string; zip: string; phone: string };
  consignee: { name: string; street: string; city: string; state: string; zip: string; phone: string };
  extra_stops: Array<{
    kind: "pickup" | "delivery";
    stop: { name: string; street: string; city: string; state: string; zip: string; phone: string };
  }>;
}>;

export function LoadBasicsScreen({
  load,
  defaults = {},
  commodities = [],
  extraStatuses = [],
  weightUnit = "lb",
  equipmentChoices = [],
  card = true,
}: {
  load?: Load;
  defaults?: LoadFormDefaults;
  commodities?: string[];
  extraStatuses?: Array<{ value: string; label: string }>;
  weightUnit?: string;
  equipmentChoices?: Array<{ value: string; label: string }>;
  card?: boolean;
}) {
  const { handleAssign } = useLoadAssignPersist(load?.id);
  const looksReefer = Boolean(
    load?.reefer_mode ||
      defaults.reefer_mode ||
      load?.temperature_f != null ||
      load?.reefer_setpoint_f != null ||
      defaults.reefer_setpoint_f != null ||
      /reefer/i.test(load?.equipment ?? DEFAULT_LOAD_EQUIPMENT),
  );
  return (
    <section data-load-tab="basics" className={card ? "card overflow-hidden" : undefined}>
      {card ? (
        <div className="section-head px-6 py-3">
          <h2 className="text-sm font-semibold">Basic load information</h2>
        </div>
      ) : null}
      <div className={card ? "grid gap-4 p-6 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
      <div className="field">
        <label htmlFor="status">Load Status</label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="status"
            name="status"
            defaultValue={load?.status ?? "available"}
            className="flex-1"
            data-first-assign={load?.status ? undefined : ""}
            onChange={(event) => {
              if (load) handleAssign(load.status, event.target.value, "status", event);
            }}
          >
            {LOAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {labelForLoadStatus(status)}
              </option>
            ))}
            {extraStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
          {load?.status ? <LoadStatusBadge status={load.status} /> : null}
        </div>
      </div>
      <div className="field">
        <label htmlFor="truck_status">Truck Status</label>
        <select
          id="truck_status"
          name="truck_status"
          defaultValue={load?.truck_status ?? ""}
          data-first-assign={load?.truck_status ? undefined : ""}
          onChange={(event) => {
            if (load) handleAssign(load.truck_status, event.target.value, "truck_status", event);
          }}
        >
          {LOAD_TRUCK_STATUSES.map((item) => (
            <option key={item.value || "blank"} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="reference_number">Load Reference ID/Numbers</label>
        <input
          id="reference_number"
          name="reference_number"
          defaultValue={load?.reference_number ?? defaults.reference_number ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="commodity">Commodity</label>
        <input
          id="commodity"
          name="commodity"
          list="commodity-suggestions"
          defaultValue={load?.commodity ?? defaults.commodity ?? ""}
        />
        {commodities.length > 0 ? (
          <datalist id="commodity-suggestions">
            {commodities.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="weight">Weight ({weightUnit})</label>
        <input id="weight" name="weight" type="number" min={0} defaultValue={load?.weight ?? defaults.weight ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="declared_value">Declared Value</label>
        <input id="declared_value" name="declared_value" type="number" min={0} step="0.01" defaultValue={load?.declared_value ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="load_size">Full/Partial</label>
        <select
          id="load_size"
          name="load_size"
          defaultValue={load?.load_size ?? ""}
          data-first-assign={load?.load_size ? undefined : ""}
          onChange={(event) => {
            if (load) handleAssign(load.load_size, event.target.value, "load_size", event);
          }}
        >
          {LOAD_SIZES.map((item) => (
            <option key={item.value || "blank"} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="equipment">Equipment Type</label>
        <select
          id="equipment"
          name="equipment"
          defaultValue={load?.equipment || DEFAULT_LOAD_EQUIPMENT}
          data-first-assign={load?.equipment ? undefined : ""}
          onChange={(event) => {
            if (load) handleAssign(load.equipment, event.target.value, "equipment", event);
          }}
        >
          {(equipmentChoices.length ? equipmentChoices : [{ value: DEFAULT_LOAD_EQUIPMENT, label: "53' Reefer" }]).map((item) => (
            <option key={item.value || "any"} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="temperature_f">Required temp °F</label>
        <input id="temperature_f" name="temperature_f" type="number" step="0.1" defaultValue={load?.temperature_f ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="unload_type">Live vs Drop</label>
        <select id="unload_type" name="unload_type" defaultValue={load?.unload_type ?? ""}>
          <option value="">—</option>
          <option value="live">Live</option>
          <option value="drop">Drop</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="non_revenue">Empty move</label>
        <select id="non_revenue" name="non_revenue" defaultValue={load?.non_revenue ? "1" : "0"}>
          <option value="0">Revenue load</option>
          <option value="1">Non-revenue — pay and miles, no customer invoice</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="reefer_mode">Reefer mode</label>
          <select
          id="reefer_mode"
          name="reefer_mode"
          defaultValue={load?.reefer_mode || defaults.reefer_mode || (looksReefer ? "continuous" : "")}
          data-first-assign={load?.reefer_mode ? undefined : ""}
          onChange={(event) => {
            if (load) handleAssign(load.reefer_mode, event.target.value, "reefer_mode", event);
          }}
        >
          <option value="">Not a reefer</option>
          {REEFER_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field md:col-span-2 note-public">
        <label htmlFor="public_notes">Public notes</label>
        <textarea id="public_notes" name="public_notes" rows={2} defaultValue={load?.public_notes ?? ""} />
      </div>
      <div className="field md:col-span-2 note-private">
        <label htmlFor="notes">Private notes</label>
        <textarea id="notes" name="notes" rows={2} defaultValue={load?.notes ?? defaults.notes ?? ""} />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="posting_notes">Posting notes</label>
        <textarea id="posting_notes" name="posting_notes" rows={2} defaultValue={load?.posting_notes ?? ""} />
      </div>
      </div>
    </section>
  );
}
