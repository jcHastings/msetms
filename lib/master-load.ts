import { getDb } from "./db";
import { childLoadNumber, isChildLoad, nextChildSuffix, type MasterFamilyMember } from "./master-load-shared";
import { addPayItem, listPayItems } from "./pay-items";
import { createLoad, findLoadIdByNumber, getCustomer, getLoad, type LoadInput } from "./queries";
import { addStop, ensureDefaultStops, listStops } from "./stops";
import { recordLoadAudit } from "./audit";
import type { LoadStop } from "./stops-shared";
import type { LoadView } from "./types";

export function listChildLoads(parentId: number): LoadView[] {
  return getDb()
    .prepare(
      `SELECT loads.*, customers.name AS customer_name
       FROM loads
       JOIN customers ON customers.id = loads.customer_id
       WHERE loads.parent_load_id = ?
       ORDER BY loads.master_suffix, loads.id`,
    )
    .all(parentId) as LoadView[];
}

export function masterIdFor(load: { id: number; parent_load_id?: number | null }): number {
  return load.parent_load_id || load.id;
}

export function getMasterLoad(load: LoadView): LoadView {
  if (!load.parent_load_id) return load;
  return getLoad(load.parent_load_id) ?? load;
}

export function listMasterFamily(loadId: number): MasterFamilyMember[] {
  const load = getLoad(loadId);
  if (!load) return [];
  const master = getMasterLoad(load);
  const children = listChildLoads(master.id);
  return [
    {
      id: master.id,
      load_number: master.load_number,
      customer_id: master.customer_id,
      customer_name: master.customer_name,
      parent_load_id: null,
      master_suffix: "",
      rate: master.rate,
    },
    ...children.map((child) => ({
      id: child.id,
      load_number: child.load_number,
      customer_id: child.customer_id,
      customer_name: child.customer_name,
      parent_load_id: child.parent_load_id,
      master_suffix: child.master_suffix,
      rate: child.rate,
    })),
  ];
}

export function setLoadIsMaster(loadId: number, enabled: boolean): void {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (isChildLoad(load)) throw new Error("Change this on the master.");
  if (!enabled && loadHasChildren(loadId)) {
    throw new Error("Remove the customer splits first.");
  }
  getDb()
    .prepare("UPDATE loads SET is_master = ?, updated_at = ? WHERE id = ?")
    .run(enabled ? 1 : 0, new Date().toISOString(), loadId);
  recordLoadAudit({
    loadId,
    action: "update",
    field: "master_load",
    newValue: enabled ? "multiple customers" : "regular load",
  });
}

export function loadHasChildren(loadId: number): boolean {
  const row = getDb()
    .prepare("SELECT 1 AS ok FROM loads WHERE parent_load_id = ? LIMIT 1")
    .get(loadId) as { ok: number } | undefined;
  return Boolean(row);
}

function copyStopToLoad(targetLoadId: number, stop: LoadStop): void {
  addStop(targetLoadId, {
    kind: stop.kind,
    location_id: stop.location_id,
    name: stop.name,
    street: stop.street,
    city: stop.city,
    state: stop.state,
    zip: stop.zip,
    phone: stop.phone,
    window_start: stop.window_start,
    window_end: stop.window_end,
    confirmation: stop.confirmation,
    cargo: stop.cargo,
    reference: stop.reference,
    instructions: stop.instructions,
    notes: stop.notes,
    arrived_at: stop.arrived_at,
    departed_at: stop.departed_at,
    delivered: stop.delivered,
    schedule_type: stop.schedule_type,
  });
}

function replaceChildStops(childId: number, masterStops: LoadStop[], stopIds: number[]): void {
  const chosen = masterStops.filter((stop) => stopIds.includes(stop.id));
  if (!chosen.length) throw new Error("Pick at least one stop for this customer.");
  getDb().prepare("DELETE FROM load_stops WHERE load_id = ?").run(childId);
  for (const stop of chosen) copyStopToLoad(childId, stop);
}

export function createMasterChild(input: {
  parentId: number;
  customerId: number;
  stopIds: number[];
  rate?: number | null;
  copyFinancials?: boolean;
}): LoadView {
  const parent = getLoad(input.parentId);
  if (!parent) throw new Error("Load not found.");
  if (isChildLoad(parent)) {
    throw new Error("Split customers from the master load, not from a child.");
  }
  if (!getCustomer(input.customerId)) throw new Error("Pick a customer.");
  const masterStops = ensureDefaultStops(parent.id);
  const children = listChildLoads(parent.id);
  const suffix = nextChildSuffix(children.map((child) => child.master_suffix));
  const loadNumber = childLoadNumber(parent.load_number, suffix);
  if (findLoadIdByNumber(loadNumber)) {
    throw new Error(`Load ${loadNumber} already exists.`);
  }

  const payload: LoadInput = {
    load_number: loadNumber,
    customer_id: input.customerId,
    origin: parent.origin,
    destination: parent.destination,
    pickup_start: parent.pickup_start,
    pickup_end: parent.pickup_end,
    delivery_start: parent.delivery_start,
    delivery_end: parent.delivery_end,
    weight: parent.weight,
    commodity: parent.commodity,
    rate: input.rate ?? null,
    notes: parent.notes,
    special_instructions: parent.special_instructions,
    appointment_notes: parent.appointment_notes,
    reference_number: parent.reference_number,
    po_number: parent.po_number,
    reefer_setpoint_f: parent.reefer_setpoint_f,
    reefer_mode: parent.reefer_mode,
    trailer_number: parent.trailer_number,
    trailer_id: null,
    shipper_location_id: parent.shipper_location_id,
    consignee_location_id: parent.consignee_location_id,
    status: parent.status === "cancelled" ? "available" : parent.status,
    truck_id: null,
    driver_id: null,
    equipment: parent.equipment,
    temperature_f: parent.temperature_f,
    public_notes: parent.public_notes,
  };
  const childId = createLoad(payload);
  getDb()
    .prepare("UPDATE loads SET parent_load_id = ?, master_suffix = ?, updated_at = ? WHERE id = ?")
    .run(parent.id, suffix, new Date().toISOString(), childId);
  getDb()
    .prepare("UPDATE loads SET is_master = 1, updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), parent.id);
  replaceChildStops(childId, masterStops, input.stopIds);

  if (input.copyFinancials) {
    for (const item of listPayItems(parent.id, "income").filter((row) => row.bill_to === "customer")) {
      addPayItem(childId, {
        side: item.side,
        bill_to: item.bill_to,
        payee: item.payee,
        category: item.category,
        rate: item.rate,
        qty: item.qty,
        total: item.total,
        notes: item.notes,
      });
    }
  }

  const child = getLoad(childId);
  if (!child) throw new Error("The child load did not save.");
  recordLoadAudit({
    loadId: parent.id,
    action: "update",
    field: "master_load",
    newValue: `${loadNumber} · ${child.customer_name}`,
  });
  recordLoadAudit({
    loadId: childId,
    action: "create",
    field: "master_load",
    newValue: parent.load_number,
  });
  return child;
}

export function assignStopsToChild(childId: number, stopIds: number[]): void {
  const child = getLoad(childId);
  if (!child?.parent_load_id) throw new Error("Pick a child load.");
  const masterStops = listStops(child.parent_load_id);
  replaceChildStops(childId, masterStops, stopIds);
}
