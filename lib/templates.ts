import { getDb } from "./db";
import { createLoad, getLoad } from "./queries";

export type LoadTemplate = {
  id: number;
  name: string;
  customer_id: number | null;
  origin: string;
  destination: string;
  commodity: string;
  weight: number | null;
  rate: number | null;
  notes: string;
  special_instructions: string;
  appointment_notes: string;
  equipment: string;
  reefer_setpoint_f: number | null;
  created_at: string;
};

export function listTemplates(): LoadTemplate[] {
  return getDb().prepare("SELECT * FROM load_templates ORDER BY name COLLATE NOCASE").all() as LoadTemplate[];
}

export function saveTemplateFromLoad(loadId: number, name: string): number {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const label = name.trim() || `${load.customer_name} ${load.origin} → ${load.destination}`;
  const result = getDb()
    .prepare(
      `INSERT INTO load_templates (
        name, customer_id, origin, destination, commodity, weight, rate, notes,
        special_instructions, appointment_notes, equipment, reefer_setpoint_f, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      label,
      load.customer_id,
      load.origin,
      load.destination,
      load.commodity,
      load.weight,
      load.rate,
      load.notes,
      load.special_instructions,
      load.appointment_notes,
      load.equipment ?? "",
      load.reefer_setpoint_f,
      new Date().toISOString(),
    );
  return Number(result.lastInsertRowid);
}

export function createLoadFromTemplate(templateId: number): number {
  const template = getDb().prepare("SELECT * FROM load_templates WHERE id = ?").get(templateId) as
    | LoadTemplate
    | undefined;
  if (!template || !template.customer_id) throw new Error("Template is missing a customer.");
  const pickup = new Date();
  pickup.setDate(pickup.getDate() + 1);
  pickup.setHours(8, 0, 0, 0);
  const pickupEnd = new Date(pickup);
  pickupEnd.setHours(14, 0, 0, 0);
  const delivery = new Date(pickup);
  delivery.setDate(delivery.getDate() + 1);
  const deliveryEnd = new Date(delivery);
  deliveryEnd.setHours(16, 0, 0, 0);
  return createLoad({
    customer_id: template.customer_id,
    origin: template.origin,
    destination: template.destination,
    pickup_start: pickup.toISOString(),
    pickup_end: pickupEnd.toISOString(),
    delivery_start: delivery.toISOString(),
    delivery_end: deliveryEnd.toISOString(),
    weight: template.weight,
    commodity: template.commodity,
    rate: template.rate,
    notes: template.notes,
    special_instructions: template.special_instructions,
    appointment_notes: template.appointment_notes,
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: template.reefer_setpoint_f,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
  });
}
