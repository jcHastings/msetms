import { recordsFromFirstSheet } from "./xlsx-first-sheet";
import {
  buildLoadImportPreview,
  loadValuesFromRecords,
  matchAssetUnit,
  recordsFromLoadSheetText,
  type ImportedStop,
  type LoadImportPreviewRow,
  type LoadImportValues,
} from "./load-import-shared";
import {
  createCustomer,
  createLoad,
  findLoadIdByNumber,
  getLoad,
  listCustomers,
  listLoads,
  listTrailers,
  listTrucks,
  updateLoad,
  type LoadInput,
} from "./queries";
import { replaceStops, type StopInput } from "./stops";
import type { LoadView } from "./types";

export function previewLoadsFromText(text: string): LoadImportPreviewRow[] {
  return buildLoadImportPreview(loadValuesFromRecords(recordsFromLoadSheetText(text)), listLoads({ status: "all" }));
}

export function previewLoadsFromXlsx(buffer: Uint8Array): LoadImportPreviewRow[] {
  return buildLoadImportPreview(loadValuesFromRecords(recordsFromFirstSheet(buffer)), listLoads({ status: "all" }));
}

export function applyLoadImport(rows: LoadImportPreviewRow[]): {
  created: number;
  updated: number;
  skipped: number;
} {
  const trucks = listTrucks();
  const trailers = listTrailers();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.load_number.trim()) {
      skipped += 1;
      continue;
    }
    const existingId = findLoadIdByNumber(row.load_number);
    const customerId = ensureCustomer(row.customer_name);
    const truckId = matchAssetUnit(trucks, row.truck_unit);
    const trailerId = matchAssetUnit(trailers, row.trailer_unit);
    const trailer = trailers.find((item) => item.id === trailerId);
    const [pickupStart, pickupEnd] = windowForDate(row.ship_date, 8, 17);
    const [deliveryStart, deliveryEnd] = windowForDate(row.del_date || row.ship_date, 8, 17);
    const origin = laneFromStops(row.pickups) || "TBD";
    const destination = laneFromStops(row.deliveries) || "TBD";
    const trailerNumber = trailer?.unit_number || row.trailer_unit;
    if (existingId) {
      const current = getLoad(existingId);
      if (!current) {
        skipped += 1;
        continue;
      }
      writeImportedLoad(
        (input) => updateLoad(existingId, input),
        {
          ...loadInputFromView(current),
          customer_id: customerId,
          origin,
          destination,
          pickup_start: pickupStart,
          pickup_end: pickupEnd,
          delivery_start: deliveryStart,
          delivery_end: deliveryEnd,
          notes: row.notes || current.notes,
          reference_number: row.wsf_po || current.reference_number,
          po_number: row.wsf_po || current.po_number,
          customer_reference: row.wsf_po || current.customer_reference,
          trailer_number: trailerNumber || current.trailer_number,
          trailer_id: trailerId,
          status: row.status,
          truck_id: truckId,
          equipment: row.equipment || current.equipment,
        },
      );
      replaceStops(existingId, stopsFromImport(row, pickupStart, pickupEnd, deliveryStart, deliveryEnd));
      updated += 1;
      continue;
    }
    const id = writeImportedLoad(createLoad, {
      load_number: row.load_number,
      customer_id: customerId,
      origin,
      destination,
      pickup_start: pickupStart,
      pickup_end: pickupEnd,
      delivery_start: deliveryStart,
      delivery_end: deliveryEnd,
      weight: null,
      commodity: "",
      rate: null,
      notes: row.notes,
      special_instructions: "",
      appointment_notes: "",
      reference_number: row.wsf_po,
      po_number: row.wsf_po,
      reefer_setpoint_f: null,
      trailer_number: trailerNumber,
      trailer_id: trailerId,
      status: row.status,
      truck_id: truckId,
      driver_id: null,
      equipment: row.equipment,
      customer_reference: row.wsf_po,
    });
    replaceStops(id, stopsFromImport(row, pickupStart, pickupEnd, deliveryStart, deliveryEnd));
    created += 1;
  }
  return { created, updated, skipped };
}

function writeImportedLoad<T>(run: (input: LoadInput) => T, input: LoadInput): T {
  try {
    return run(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/already on /.test(message)) throw error;
    return run({ ...input, truck_id: null, trailer_id: null });
  }
}

function ensureCustomer(name: string): number {
  const wanted = name.trim();
  if (!wanted) {
    const existing = listCustomers()[0];
    if (existing) return existing.id;
    return createCustomer({ name: "Imported customer", billing_notes: "", contacts: [] });
  }
  const match = listCustomers().find((customer) => customer.name.trim().toLowerCase() === wanted.toLowerCase());
  if (match) return match.id;
  return createCustomer({ name: wanted, billing_notes: "", contacts: [] });
}

function windowForDate(day: string, startHour: number, endHour: number): [string, string] {
  const date = day || new Date().toISOString().slice(0, 10);
  return [
    `${date}T${String(startHour).padStart(2, "0")}:00:00`,
    `${date}T${String(endHour).padStart(2, "0")}:00:00`,
  ];
}

function laneFromStops(stops: ImportedStop[]): string {
  const first = stops[0];
  if (!first) return "";
  return [first.city, first.state].filter(Boolean).join(", ") || first.name;
}

function stopsFromImport(
  row: LoadImportValues,
  pickupStart: string,
  pickupEnd: string,
  deliveryStart: string,
  deliveryEnd: string,
): StopInput[] {
  const pickups = row.pickups.length
    ? row.pickups
    : [{ kind: "pickup" as const, name: "Pickup", city: "", state: "" }];
  const deliveries = row.deliveries.length
    ? row.deliveries
    : [{ kind: "delivery" as const, name: "Delivery", city: "", state: "" }];
  return [
    ...pickups.map((stop) => ({
      kind: "pickup" as const,
      name: stop.name || [stop.city, stop.state].filter(Boolean).join(", ") || "Pickup",
      city: stop.city,
      state: stop.state,
      window_start: pickupStart,
      window_end: pickupEnd,
    })),
    ...deliveries.map((stop) => ({
      kind: "delivery" as const,
      name: stop.name || [stop.city, stop.state].filter(Boolean).join(", ") || "Delivery",
      city: stop.city,
      state: stop.state,
      window_start: deliveryStart,
      window_end: deliveryEnd,
    })),
  ];
}

function loadInputFromView(load: LoadView): LoadInput {
  return {
    customer_id: load.customer_id,
    origin: load.origin,
    destination: load.destination,
    pickup_start: load.pickup_start,
    pickup_end: load.pickup_end,
    delivery_start: load.delivery_start,
    delivery_end: load.delivery_end,
    weight: load.weight,
    commodity: load.commodity,
    rate: load.rate,
    notes: load.notes,
    special_instructions: load.special_instructions,
    appointment_notes: load.appointment_notes,
    reference_number: load.reference_number,
    po_number: load.po_number,
    reefer_setpoint_f: load.reefer_setpoint_f,
    reefer_mode: load.reefer_mode,
    trailer_number: load.trailer_number,
    trailer_id: load.trailer_id,
    shipper_location_id: load.shipper_location_id,
    consignee_location_id: load.consignee_location_id,
    oo_percent: load.oo_percent,
    oo_pay: load.oo_pay,
    status: load.status,
    truck_id: load.truck_id,
    driver_id: load.driver_id,
    truck_status: load.truck_status,
    branch: load.branch,
    declared_value: load.declared_value,
    load_size: load.load_size,
    condition_new_used: load.condition_new_used,
    equipment: load.equipment,
    equipment_length: load.equipment_length,
    temperature_f: load.temperature_f,
    temp_low_f: load.temp_low_f,
    temp_high_f: load.temp_high_f,
    temp_time_tolerance: load.temp_time_tolerance,
    container_number: load.container_number,
    last_free_day: load.last_free_day,
    public_notes: load.public_notes,
    posting_notes: load.posting_notes,
    contact_name: load.contact_name,
    contact_email: load.contact_email,
    contact_phone: load.contact_phone,
    contact_ext: load.contact_ext,
    customer_reference: load.customer_reference,
  };
}
