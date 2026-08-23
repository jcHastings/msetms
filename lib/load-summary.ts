import { formatDateTime, formatMoney } from "./format";
import { formatReeferHeader, resolveReeferSpec } from "./reefer-shared";

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
  driver_name: string | null;
  driver_phone: string | null;
  driver_type: string | null;
  rate: number | null;
  oo_pay: number | null;
};

export { SMS_MISSING_KEYS } from "./sms-shared";

export function formatLoadSummary(load: LoadSummaryInput): string {
  const lines = [
    `Load ${load.load_number}`,
    `${load.origin} → ${load.destination}`,
    `Pickup ${formatDateTime(load.pickup_start)} – ${formatDateTime(load.pickup_end)}`,
    `Delivery ${formatDateTime(load.delivery_start)} – ${formatDateTime(load.delivery_end)}`,
  ];
  if (load.commodity) lines.push(`Commodity ${load.commodity}`);
  const reefer = resolveReeferSpec(load);
  if (reefer.isReefer) lines.push(formatReeferHeader(reefer));
  if (load.appointment_notes) lines.push(`Appointment: ${load.appointment_notes}`);
  if (load.special_instructions) lines.push(`Special instructions: ${load.special_instructions}`);
  if (load.driver_type === "owner_operator" && (load.oo_pay != null || load.rate != null)) {
    lines.push(`Agreed amount ${formatMoney(load.oo_pay ?? load.rate)}`);
  }
  // Relay pay and handoff cities stay off this customer/company packet.
  lines.push("Driver app: http://localhost:3000/driver (on the shop LAN, use this PC's IP in place of localhost)");
  return lines.join("\n");
}
