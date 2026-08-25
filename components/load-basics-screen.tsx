import {
  LOAD_SIZES,
  LOAD_TRUCK_STATUSES,
} from "@/lib/load-page-shared";
import { REEFER_MODES } from "@/lib/reefer-shared";
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
  const looksReefer = Boolean(
    load?.reefer_mode ||
      defaults.reefer_mode ||
      load?.reefer_setpoint_f != null ||
      defaults.reefer_setpoint_f != null ||
      /reefer/i.test(load?.equipment ?? ""),
  );
  return (
    <section data-load-tab="basics" className={card ? "card grid gap-4 p-6 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
      <div className="field">
        <label htmlFor="status">Load Status</label>
        <select id="status" name="status" defaultValue={load?.status ?? "available"}>
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
      </div>
      <div className="field">
        <label htmlFor="truck_status">Truck Status</label>
        <select id="truck_status" name="truck_status" defaultValue={load?.truck_status ?? ""}>
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
        <select id="load_size" name="load_size" defaultValue={load?.load_size ?? ""}>
          {LOAD_SIZES.map((item) => (
            <option key={item.value || "blank"} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="equipment">Equipment Type</label>
        <select id="equipment" name="equipment" defaultValue={load?.equipment || DEFAULT_LOAD_EQUIPMENT}>
          {(equipmentChoices.length ? equipmentChoices : [{ value: DEFAULT_LOAD_EQUIPMENT, label: "53' Reefer" }]).map((item) => (
            <option key={item.value || "any"} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="equipment_length">Equipment Length</label>
        <input id="equipment_length" name="equipment_length" defaultValue={load?.equipment_length ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="temperature_f">Temperature °F</label>
        <input id="temperature_f" name="temperature_f" type="number" step="0.1" defaultValue={load?.temperature_f ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="reefer_setpoint_f">Reefer setpoint (°F)</label>
        <input
          id="reefer_setpoint_f"
          name="reefer_setpoint_f"
          type="number"
          step="0.1"
          defaultValue={load?.reefer_setpoint_f ?? defaults.reefer_setpoint_f ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="reefer_mode">Reefer mode</label>
        <select
          id="reefer_mode"
          name="reefer_mode"
          defaultValue={load?.reefer_mode || defaults.reefer_mode || (looksReefer ? "continuous" : "")}
        >
          <option value="">Not a reefer</option>
          {REEFER_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">Reefers default to Continuous.</p>
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="public_notes">Public notes</label>
        <textarea id="public_notes" name="public_notes" rows={2} defaultValue={load?.public_notes ?? ""} />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="notes">Private notes</label>
        <textarea id="notes" name="notes" rows={2} defaultValue={load?.notes ?? defaults.notes ?? ""} />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="posting_notes">Posting notes</label>
        <textarea id="posting_notes" name="posting_notes" rows={2} defaultValue={load?.posting_notes ?? ""} />
      </div>
    </section>
  );
}
