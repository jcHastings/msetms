"use client";

import { useEffect, useRef, useState } from "react";
import { LOAD_SIZES, truckStatusOptions } from "@/lib/load-page-shared";
import { useLoadAssignPersist } from "@/components/use-load-assign-persist";
import { REEFER_MODES } from "@/lib/reefer-shared";
import { LoadStatusBadge } from "@/components/status-badge";
import { computeOwnerOperatorPay } from "@/lib/settlement";
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
  customer_reference: string;
  load_number_hint: string;
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
  ooPercent = null,
  onOoPercentChange,
}: {
  load?: Load;
  defaults?: LoadFormDefaults;
  commodities?: string[];
  extraStatuses?: Array<{ value: string; label: string }>;
  weightUnit?: string;
  equipmentChoices?: Array<{ value: string; label: string }>;
  card?: boolean;
  ooPercent?: number | null;
  onOoPercentChange?: (percent: number | null) => void;
}) {
  const { handleAssign, blurPersist } = useLoadAssignPersist(load?.id);
  const [status, setStatus] = useState<string>(load?.status ?? "available");
  const [truckStatus, setTruckStatus] = useState(load?.truck_status ?? "");
  const [rate, setRate] = useState(
    load?.rate != null ? String(load.rate) : defaults.rate != null ? String(defaults.rate) : "",
  );
  const [ooPay, setOoPay] = useState(load?.oo_pay != null ? String(load.oo_pay) : "");
  const [percent, setPercent] = useState(ooPercent != null ? String(ooPercent) : "");
  const lastOoPercent = useRef(ooPercent);
  const looksReefer = Boolean(
    load?.reefer_mode ||
      defaults.reefer_mode ||
      load?.temperature_f != null ||
      load?.reefer_setpoint_f != null ||
      defaults.reefer_setpoint_f != null ||
      /reefer/i.test(load?.equipment ?? DEFAULT_LOAD_EQUIPMENT),
  );
  useEffect(() => {
    if (ooPercent === lastOoPercent.current) return;
    lastOoPercent.current = ooPercent;
    if (ooPercent == null) {
      setPercent("");
      setOoPay("");
      return;
    }
    setPercent(String(ooPercent));
    const pay = computeOwnerOperatorPay(rate === "" ? null : Number(rate), ooPercent);
    setOoPay(pay != null ? String(pay) : "");
  }, [ooPercent, rate]);
  return (
    <section data-load-tab="basics" className={card ? "card overflow-hidden" : undefined}>
      {card ? (
        <div className="section-head px-6 py-3">
          <h2 className="text-sm font-semibold">Basic load information</h2>
        </div>
      ) : null}
      <div className={card ? "grid gap-4 p-6 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
      <div className="field">
        <label htmlFor="load_status">Load Status</label>
        <div className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="status" value={status} data-load-status="" />
          <select
            id="load_status"
            className="flex-1"
            data-autosave=""
            data-load-status-select=""
            value={status}
            onChange={(event) => {
              const next = event.target.value;
              setStatus(next);
              if (load) handleAssign(status, next, "status", event);
            }}
          >
            {LOAD_STATUSES.map((item) => (
              <option key={item} value={item}>
                {labelForLoadStatus(item)}
              </option>
            ))}
            {extraStatuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          {status ? <LoadStatusBadge status={status} /> : null}
        </div>
      </div>
      <div className="field">
        <label htmlFor="load_truck_status">Truck Status</label>
        <input type="hidden" name="truck_status" value={truckStatus} data-truck-status="" />
        <select
          id="load_truck_status"
          data-autosave=""
          data-truck-status-select=""
          value={truckStatus}
          onChange={(event) => {
            const next = event.target.value;
            setTruckStatus(next);
            if (load) handleAssign(truckStatus, next, "truck_status", event);
          }}
        >
          {truckStatusOptions(load?.truck_status ?? truckStatus).map((item) => (
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
          data-autosave=""
          defaultValue={load?.reference_number ?? defaults.reference_number ?? ""}
          onBlur={blurPersist("reference_number", load?.reference_number ?? defaults.reference_number ?? "")}
        />
      </div>
      <div className="field">
        <label htmlFor="commodity">Commodity</label>
        <input
          id="commodity"
          name="commodity"
          list="commodity-suggestions"
          data-autosave=""
          defaultValue={load?.commodity ?? defaults.commodity ?? ""}
          onBlur={blurPersist("commodity", load?.commodity ?? defaults.commodity ?? "")}
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
        <label htmlFor="rate">Customer rate</label>
        <input
          id="rate"
          name="rate"
          type="number"
          min={0}
          step="0.01"
          data-critical-save=""
          value={rate}
          onChange={(event) => {
            const next = event.target.value;
            setRate(next);
            if (ooPercent != null) {
              const live = Number(percent);
              const pay = computeOwnerOperatorPay(
                next === "" ? null : Number(next),
                Number.isFinite(live) ? live : ooPercent,
              );
              setOoPay(pay != null ? String(pay) : "");
            }
            if (load) handleAssign(load.rate, next, "rate", event);
          }}
        />
      </div>
      {ooPercent != null ? (
        <>
          <div className="field" data-oo-percent="">
            <label htmlFor="oo_percent">OO percent</label>
            <input
              id="oo_percent"
              name="oo_percent"
              type="number"
              min={0}
              max={100}
              step="0.1"
              data-critical-save=""
              value={percent}
              onChange={(event) => {
                const next = event.target.value;
                setPercent(next);
                const live = Number(next);
                const nextPercent = Number.isFinite(live) ? live : null;
                onOoPercentChange?.(nextPercent);
                const pay = computeOwnerOperatorPay(rate === "" ? null : Number(rate), nextPercent);
                setOoPay(pay != null ? String(pay) : "");
                if (load) handleAssign(load.oo_percent, next, "oo_percent", event);
              }}
            />
          </div>
          <div className="field" data-oo-pay="">
            <label htmlFor="oo_pay">OO pay</label>
            <input
              id="oo_pay"
              name="oo_pay"
              type="number"
              min={0}
              step="0.01"
              data-critical-save=""
              value={ooPay}
              onChange={(event) => {
                setOoPay(event.target.value);
                if (load) handleAssign(load.oo_pay, event.target.value, "oo_pay", event);
              }}
            />
          </div>
        </>
      ) : null}
      <div className="field">
        <label htmlFor="weight">Weight ({weightUnit})</label>
        <input
          id="weight"
          name="weight"
          type="number"
          min={0}
          data-autosave=""
          defaultValue={load?.weight ?? defaults.weight ?? ""}
          onBlur={blurPersist("weight", load?.weight ?? defaults.weight ?? "")}
        />
      </div>
      <div className="field">
        <label htmlFor="declared_value">Declared Value</label>
        <input
          id="declared_value"
          name="declared_value"
          type="number"
          min={0}
          step="0.01"
          data-critical-save=""
          defaultValue={load?.declared_value ?? ""}
        />
      </div>
      <div className="field">
        <label htmlFor="load_size">Full/Partial</label>
        <select
          id="load_size"
          name="load_size"
          defaultValue={load?.load_size ?? ""}
          data-autosave=""
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
          data-autosave=""
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
        <input
          id="temperature_f"
          name="temperature_f"
          type="number"
          step="0.1"
          data-autosave=""
          defaultValue={load?.temperature_f ?? ""}
          onBlur={blurPersist("temperature_f", load?.temperature_f)}
        />
      </div>
      <div className="field">
        <label htmlFor="unload_type">Live vs Drop</label>
        <select
          id="unload_type"
          name="unload_type"
          data-autosave=""
          defaultValue={load?.unload_type ?? ""}
          onChange={(event) => {
            if (load) handleAssign(load.unload_type, event.target.value, "unload_type", event);
          }}
        >
          <option value="">—</option>
          <option value="live">Live</option>
          <option value="drop">Drop</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="non_revenue">Empty move</label>
        <select
          id="non_revenue"
          name="non_revenue"
          data-critical-save=""
          defaultValue={load?.non_revenue ? "1" : "0"}
        >
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
          data-autosave=""
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
        <textarea
          id="public_notes"
          name="public_notes"
          rows={2}
          data-autosave=""
          defaultValue={load?.public_notes ?? ""}
          onBlur={blurPersist("public_notes", load?.public_notes ?? "")}
        />
      </div>
      <div className="field md:col-span-2 note-private">
        <label htmlFor="notes">Private notes</label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          data-autosave=""
          defaultValue={load?.notes ?? defaults.notes ?? ""}
          onBlur={blurPersist("notes", load?.notes ?? defaults.notes ?? "")}
        />
      </div>
      <div className="field md:col-span-2">
        <label htmlFor="posting_notes">Posting notes</label>
        <textarea
          id="posting_notes"
          name="posting_notes"
          rows={2}
          data-autosave=""
          defaultValue={load?.posting_notes ?? ""}
          onBlur={blurPersist("posting_notes", load?.posting_notes ?? "")}
        />
      </div>
      </div>
    </section>
  );
}
