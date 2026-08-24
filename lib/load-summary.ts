import { formatDateTime, formatMoney } from "./format";
import { formatReeferSetpoint, labelForReeferMode, resolveReeferSpec } from "./reefer-shared";

export type LoadSummaryInput = {
  load_number: string;
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  commodity: string;
  reefer_setpoint_f: number | null;
  reefer_mode?: string | null;
  special_instructions: string;
  appointment_notes: string;
  notes?: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_type: string | null;
  rate: number | null;
  oo_pay: number | null;
  truck_unit?: string | null;
  trailer_unit?: string | null;
  trailer_number?: string | null;
  equipment?: string | null;
  truck_type?: string | null;
  trailer_type?: string | null;
  your_leg?: string | null;
};

export { SMS_MISSING_KEYS } from "./sms-shared";

export function formatLoadSummary(load: LoadSummaryInput): string {
  const trailer = load.trailer_unit || load.trailer_number || "";
  const lines = [
    `Load ${load.load_number}`,
    `Shipper ${load.origin}`,
    `Pickup ${formatDateTime(load.pickup_start)} – ${formatDateTime(load.pickup_end)}`,
    `Receiver ${load.destination}`,
    `Delivery ${formatDateTime(load.delivery_start)} – ${formatDateTime(load.delivery_end)}`,
  ];
  if (load.truck_unit) lines.push(`Truck ${load.truck_unit}`);
  if (trailer) lines.push(`Trailer ${trailer}`);
  if (load.commodity) lines.push(`Commodity ${load.commodity}`);
  const reefer = resolveReeferSpec(load);
  if (reefer.setpointF != null) {
    const mode = labelForReeferMode(reefer.mode) || "Continuous";
    lines.push(`Reefer ${formatReeferSetpoint(reefer.setpointF)} · ${mode}`);
  }
  if (load.your_leg?.trim()) lines.push(`Your leg: ${load.your_leg.trim()}`);
  if (load.appointment_notes) lines.push(`Appointment: ${load.appointment_notes}`);
  if (load.special_instructions) lines.push(`Special instructions: ${load.special_instructions}`);
  if (load.notes?.trim()) lines.push(`Notes: ${load.notes.trim()}`);
  if (load.driver_type === "owner_operator" && (load.oo_pay != null || load.rate != null)) {
    lines.push(`Agreed amount ${formatMoney(load.oo_pay ?? load.rate)}`);
  }
  // Company driver pay stays off this text. Relay cities stay internal except "your leg".
  lines.push("Driver app: http://localhost:3000/driver (on the shop LAN, use this PC's IP in place of localhost)");
  return lines.join("\n");
}
