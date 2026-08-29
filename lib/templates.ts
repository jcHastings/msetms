import { getDb } from "./db";
import { createLoad, getCustomer, getLoad, updateLoadDetails } from "./queries";
import { addStop, listStops, type LoadStopKind } from "./stops";

export type LoadTemplateStop = {
  id: number;
  template_id: number;
  sequence: number;
  kind: LoadStopKind;
  location_id: number | null;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  reference: string;
  notes: string;
};

export type LoadTemplate = {
  id: number;
  name: string;
  customer_id: number | null;
  customer_name: string;
  origin: string;
  destination: string;
  commodity: string;
  weight: number | null;
  rate: number | null;
  notes: string;
  public_notes: string;
  special_instructions: string;
  appointment_notes: string;
  equipment: string;
  reefer_setpoint_f: number | null;
  reefer_mode: string;
  pick_count: number;
  drop_count: number;
  created_at: string;
};

function asKind(value: string): LoadStopKind {
  return value === "delivery" ? "delivery" : "pickup";
}

export function listTemplateStops(templateId: number): LoadTemplateStop[] {
  return (
    getDb()
      .prepare("SELECT * FROM load_template_stops WHERE template_id = ? ORDER BY sequence, id")
      .all(templateId) as LoadTemplateStop[]
  ).map((row) => ({ ...row, kind: asKind(row.kind) }));
}

export function listTemplates(): LoadTemplate[] {
  const rows = getDb()
    .prepare(
      `SELECT t.*, COALESCE(c.name, '') AS customer_name
       FROM load_templates t
       LEFT JOIN customers c ON c.id = t.customer_id
       ORDER BY t.name COLLATE NOCASE`,
    )
    .all() as Array<LoadTemplate & { pick_count?: number; drop_count?: number }>;
  return rows.map((row) => {
    const stops = listTemplateStops(row.id);
    return {
      ...row,
      public_notes: row.public_notes ?? "",
      reefer_mode: row.reefer_mode ?? "",
      customer_name: row.customer_name ?? "",
      pick_count: stops.filter((stop) => stop.kind === "pickup").length,
      drop_count: stops.filter((stop) => stop.kind === "delivery").length,
    };
  });
}

export function saveTemplateFromLoad(loadId: number, name: string): number {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const label = name.trim() || `${load.customer_name} ${load.origin} → ${load.destination}`;
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO load_templates (
        name, customer_id, origin, destination, commodity, weight, rate, notes,
        special_instructions, appointment_notes, equipment, reefer_setpoint_f,
        reefer_mode, public_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      label,
      load.customer_id,
      load.origin,
      load.destination,
      load.commodity,
      load.weight,
      null,
      "",
      load.special_instructions,
      load.appointment_notes,
      load.equipment ?? "",
      load.reefer_setpoint_f,
      load.reefer_mode ?? "",
      load.public_notes ?? "",
      new Date().toISOString(),
    );
  const templateId = Number(result.lastInsertRowid);
  const insertStop = db.prepare(
    `INSERT INTO load_template_stops (
      template_id, sequence, kind, location_id, name, street, city, state, zip, phone, reference, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  listStops(loadId).forEach((stop, index) => {
    insertStop.run(
      templateId,
      index + 1,
      stop.kind,
      stop.location_id,
      stop.name,
      stop.street,
      stop.city,
      stop.state,
      stop.zip,
      stop.phone,
      stop.reference || stop.confirmation,
      stop.notes || stop.instructions,
    );
  });
  return templateId;
}

export function createLoadFromTemplate(templateId: number): number {
  const template = getDb().prepare("SELECT * FROM load_templates WHERE id = ?").get(templateId) as
    | (LoadTemplate & { reefer_mode?: string; public_notes?: string })
    | undefined;
  if (!template || !template.customer_id) throw new Error("Template is missing a customer.");
  if (!getCustomer(template.customer_id)) throw new Error("Template customer was not found.");
  const pickup = new Date();
  pickup.setDate(pickup.getDate() + 1);
  pickup.setHours(8, 0, 0, 0);
  const pickupEnd = new Date(pickup);
  pickupEnd.setHours(14, 0, 0, 0);
  const delivery = new Date(pickup);
  delivery.setDate(delivery.getDate() + 1);
  const deliveryEnd = new Date(delivery);
  deliveryEnd.setHours(16, 0, 0, 0);
  const loadId = createLoad({
    customer_id: template.customer_id,
    origin: template.origin,
    destination: template.destination,
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: template.weight,
    commodity: template.commodity,
    rate: null,
    notes: "",
    public_notes: template.public_notes ?? "",
    special_instructions: template.special_instructions,
    appointment_notes: template.appointment_notes,
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: template.reefer_setpoint_f,
    reefer_mode: template.reefer_mode ?? "",
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
    equipment: template.equipment ?? "",
  });
  if (template.equipment) updateLoadDetails(loadId, { equipment: template.equipment });
  const stops = listTemplateStops(templateId);
  stops.forEach((stop, index) => {
    const isFirst = index === 0;
    const isLast = index === stops.length - 1;
    addStop(loadId, {
      kind: stop.kind,
      name: stop.name,
      street: stop.street,
      city: stop.city || (stop.kind === "pickup" ? template.origin : template.destination),
      state: stop.state,
      zip: stop.zip,
      phone: stop.phone,
      location_id: stop.location_id,
      reference: stop.reference,
      notes: stop.notes,
      window_start: isFirst ? pickup.toISOString() : isLast ? delivery.toISOString() : "",
      window_end: isFirst ? pickupEnd.toISOString() : isLast ? deliveryEnd.toISOString() : "",
    });
  });
  return loadId;
}
