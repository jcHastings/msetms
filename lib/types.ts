export const LOAD_STATUSES = [
  "available",
  "hold",
  "assigned",
  "dispatched",
  "at_pickup",
  "loading",
  "picked_up",
  "in_transit",
  "at_delivery",
  "unloading",
    "delivered",
  "completed",
  "accounting",
  "cancelled",
] as const;

export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const ACCOUNTING_DESKS = ["operations", "accounting", "archived"] as const;
export type AccountingDesk = (typeof ACCOUNTING_DESKS)[number];

export const ACTIVE_LOAD_STATUSES: LoadStatus[] = [
  "available",
  "hold",
  "assigned",
  "dispatched",
  "at_pickup",
  "loading",
  "picked_up",
  "in_transit",
  "at_delivery",
  "unloading",
];

export const ARCHIVED_LOAD_STATUSES: LoadStatus[] = ["delivered", "completed"];

export const STATUS_REASONS = [
  { value: "", label: "None" },
  { value: "wait", label: "Waiting" },
  { value: "breakdown", label: "Breakdown" },
  { value: "rejected", label: "Rejected" },
  { value: "rolled", label: "Rolled" },
] as const;

export const EQUIPMENT_REQUIRED = [
  { value: "reefer_53", label: "53' Reefer" },
  { value: "dry_van_53", label: "53' Dry Van" },
  { value: "flatbed", label: "Flatbed" },
  { value: "box", label: "Box Truck" },
  { value: "power_only", label: "Power Only" },
  { value: "", label: "Any" },
] as const;

export function isActiveLoadStatus(status: string): boolean {
  return (ACTIVE_LOAD_STATUSES as readonly string[]).includes(status);
}

export function isClosedStatus(status: string): boolean {
  return status === "delivered" || status === "completed" || status === "accounting" || status === "cancelled";
}

export function isBillableStatus(status: string): boolean {
  return status === "delivered" || status === "completed" || status === "accounting";
}

export function isIftaEligibleStatus(status: string): boolean {
  return isRollingStatus(status) || isBillableStatus(status);
}

export function isRollingStatus(status: string): boolean {
  return (
    status === "dispatched" ||
    status === "at_pickup" ||
    status === "loading" ||
    status === "picked_up" ||
    status === "in_transit" ||
    status === "at_delivery" ||
    status === "unloading"
  );
}

export function statusNeedsAssets(status: string): boolean {
  return status === "assigned" || isRollingStatus(status);
}

export const TRUCK_TYPES = [
  { value: "sleeper", label: "Sleeper" },
  { value: "day_cab", label: "Day cab" },
] as const;

export const DEFAULT_CAB_TYPE = "sleeper";
export const DEFAULT_FLEET_TYPE = "reefer";
export const DEFAULT_LOAD_EQUIPMENT = "reefer_53";

export type TruckType = (typeof TRUCK_TYPES)[number]["value"];

export function normalizeCabType(value: unknown): TruckType {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (raw === "day_cab" || raw === "daycab" || raw === "day") return "day_cab";
  return DEFAULT_CAB_TYPE;
}

export const CDL_ENDORSEMENTS = [
  { value: "H", label: "Hazmat (H)" },
  { value: "N", label: "Tanker (N)" },
  { value: "X", label: "Tanker+Hazmat (X)" },
  { value: "T", label: "Doubles/Triples (T)" },
] as const;

export type CdlEndorsement = (typeof CDL_ENDORSEMENTS)[number]["value"];

export function parseCdlEndorsements(value: unknown): CdlEndorsement[] {
  const raw = String(value ?? "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
  return CDL_ENDORSEMENTS.map((item) => item.value).filter((code) => raw.includes(code));
}

export function formatCdlEndorsements(value: unknown): string {
  const codes = parseCdlEndorsements(value);
  if (codes.length === 0) return "—";
  return codes
    .map((code) => CDL_ENDORSEMENTS.find((item) => item.value === code)?.label ?? code)
    .join(", ");
}

export const TRUCK_STATUSES = [
  { value: "available", label: "Available" },
  { value: "in_use", label: "In Use" },
  { value: "maintenance", label: "Maintenance" },
  { value: "out_of_service", label: "Out of Service" },
] as const;

export type TruckStatus = (typeof TRUCK_STATUSES)[number]["value"];

export const DRIVER_STATUSES = [
  { value: "available", label: "Available" },
  { value: "on_duty", label: "On Duty" },
  { value: "off_duty", label: "Off Duty" },
] as const;

export type DriverStatus = (typeof DRIVER_STATUSES)[number]["value"];

export const LOCATION_ROLES = [
  { value: "shipper", label: "Shipper" },
  { value: "receiver", label: "Receiver" },
  { value: "both", label: "Shipper and receiver" },
] as const;

export type LocationRole = (typeof LOCATION_ROLES)[number]["value"];

export const SCHEDULING_TYPES = [
  { value: "appointment", label: "Appointment required" },
  { value: "fcfs", label: "FCFS" },
] as const;

export type SchedulingType = (typeof SCHEDULING_TYPES)[number]["value"];

export type Location = {
  id: number;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  notes: string;
  role: LocationRole;
  scheduling_type: SchedulingType;
  hours: string;
  scheduling_notes: string;
  call_before: number;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: number;
  name: string;
  billing_notes: string;
  credit_hold: number;
  payment_terms: string;
  qbo_customer_id: string;
  qbo_status: string;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: number;
  customer_id: number;
  name: string;
  role: string;
  phone: string;
  email: string;
};

export type CustomerWithContacts = Customer & { contacts: Contact[] };

export const DRIVER_PROGRESS = [
  { value: "en_route_pickup", label: "En route to pickup" },
  { value: "loaded", label: "Loaded" },
  { value: "en_route_delivery", label: "En route to delivery" },
  { value: "delivered", label: "Delivered" },
] as const;

export type DriverProgress = (typeof DRIVER_PROGRESS)[number]["value"];

export const ATTACHMENT_KINDS = [
  { value: "rate_con", label: "Rate confirmation" },
  { value: "invoice", label: "Invoice (customer)" },
  { value: "carrier_invoice", label: "Bill / carrier invoice" },
  { value: "bol", label: "BOL" },
  { value: "pod", label: "POD" },
  { value: "lumper", label: "Lumper" },
  { value: "photo_trailer", label: "Trailer photo" },
  { value: "photo_product", label: "Product photo" },
  { value: "photo_seals", label: "Seal photo" },
  { value: "ifta", label: "IFTA report" },
  { value: "temp_log", label: "Temp log" },
  { value: "scale_ticket", label: "Scale ticket" },
  { value: "fuel_receipt", label: "Fuel receipt" },
  { value: "claim", label: "Claim evidence" },
  { value: "unclassified", label: "Needs type" },
  { value: "other", label: "Other" },
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]["value"];

export const LOAD_DOCUMENT_KINDS: AttachmentKind[] = [
  "rate_con",
  "invoice",
  "carrier_invoice",
  "bol",
  "pod",
  "other",
];

export const FLEET_DOC_KINDS = [
  { value: "cdl", label: "Driver license" },
  { value: "med_card", label: "Medical card" },
  { value: "registration", label: "Registration" },
  { value: "dot_inspection", label: "DOT inspection" },
  { value: "insurance", label: "Insurance" },
  { value: "other", label: "Other" },
] as const;

export type FleetDocKind = (typeof FLEET_DOC_KINDS)[number]["value"];

export const TRAILER_TYPES = [
  { value: "reefer", label: "53' reefer" },
  { value: "dry_van", label: "Dry Van" },
  { value: "flatbed", label: "Flatbed" },
  { value: "other", label: "Other" },
] as const;

export type TrailerType = (typeof TRAILER_TYPES)[number]["value"];

export const DRIVER_TYPES = [
  { value: "company_driver", label: "Company driver" },
  { value: "owner_operator", label: "Owner-operator" },
] as const;

/** Older roster rows used "single"; treat those as company drivers. */
export type DriverKind = (typeof DRIVER_TYPES)[number]["value"] | "single";

export function isOwnerOperator(type: string | null | undefined): boolean {
  return type === "owner_operator";
}

export function normalizeDriverKind(type: string | null | undefined): Exclude<DriverKind, "single"> {
  return isOwnerOperator(type) ? "owner_operator" : "company_driver";
}

/** Orbcomm reefer snapshot shown on the board, load, and driver screens. */
export type ReeferStatus = {
  trailerId: string;
  temperatureF: number | null;
  setpointF: number | null;
  returnAirF: number | null;
  supplyAirF: number | null;
  alarm: string;
  recordedAt: string;
  source: "demo" | "orbcomm";
};

export function labelForTrailerType(type: string): string {
  return TRAILER_TYPES.find((item) => item.value === type)?.label ?? type;
}

export function labelForDriverKind(type: string): string {
  return isOwnerOperator(type) ? "Owner-operator" : "Company driver";
}

export function labelForFleetDocKind(value: string): string {
  return FLEET_DOC_KINDS.find((item) => item.value === value)?.label ?? value;
}

export type Truck = {
  id: number;
  unit_number: string;
  type: TruckType;
  capacity_lbs: number;
  status: TruckStatus;
  samsara_vehicle_id: string;
  samsara_trailer_id: string;
  orbcomm_asset_id: string;
  trailer_number: string;
  registration_issued: string;
  registration_expires: string;
  dot_inspected_on: string;
  dot_expires: string;
  vin: string;
  plate: string;
  plate_state: string;
  year: string;
  make: string;
  model: string;
  notes: string;
  active: number;
  gps_latitude: number | null;
  gps_longitude: number | null;
  gps_address: string;
  gps_recorded_at: string;
  gps_source: string;
  created_at: string;
  updated_at: string;
};

export type TruckWithDriver = Truck & {
  assigned_driver_id: number | null;
  driver_name: string | null;
};

export type Trailer = {
  id: number;
  unit_number: string;
  type: TrailerType;
  orbcomm_asset_id: string;
  registration_issued: string;
  registration_expires: string;
  dot_inspected_on: string;
  dot_expires: string;
  status: TruckStatus;
  vin: string;
  plate: string;
  truck_id: number | null;
  notes: string;
  reefer_setpoint_f: number | null;
  active: number;
  gps_latitude: number | null;
  gps_longitude: number | null;
  gps_address: string;
  gps_recorded_at: string;
  gps_source: string;
  created_at: string;
  updated_at: string;
};

export type TrailerWithTruck = Trailer & {
  truck_unit: string | null;
};

export type Driver = {
  id: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  active: number;
  license: string;
  license_number: string;
  license_state: string;
  license_expires: string;
  cdl_endorsements: string;
  medical_issued: string;
  medical_expires: string;
  driver_type: DriverKind;
  pay_percent: number | null;
  pin: string;
  samsara_driver_id: string;
  truck_id: number | null;
  status: DriverStatus;
  alt_phone: string;
  cell_phone: string;
  pager: string;
  address: string;
  country: string;
  city: string;
  state: string;
  postal_zip: string;
  date_of_birth: string;
  date_of_hire: string;
  drug_test_last: string;
  drug_test_next: string;
  termination_date: string;
  last_trailer_id: number | null;
  created_at: string;
  updated_at: string;
};

export type DriverWithTruck = Driver & {
  truck_unit: string | null;
  truck_type: TruckType | null;
};

export type Load = {
  id: number;
  load_number: string;
  customer_id: number;
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  weight: number | null;
  commodity: string;
  rate: number | null;
  notes: string;
  special_instructions: string;
  appointment_notes: string;
  reference_number: string;
  po_number: string;
  reefer_setpoint_f: number | null;
  reefer_mode: string;
  trailer_number: string;
  trailer_id: number | null;
  shipper_location_id: number | null;
  consignee_location_id: number | null;
  oo_percent: number | null;
  oo_pay: number | null;
  driver_progress: DriverProgress | "";
  status: LoadStatus;
  truck_id: number | null;
  driver_id: number | null;
  qbo_invoice_id: string;
  qbo_invoice_number: string;
  qbo_sent_at: string;
  qbo_source: "demo" | "quickbooks" | "";
  status_reason: string;
  cancel_reason: string;
  cover_by: string;
  equipment: string;
  hazmat: number;
  commodity_class: string;
  seal_numbers: string;
  pallet_count: number | null;
  case_count: number | null;
  team: number;
  lumper_expected: number | null;
  lumper_actual: number | null;
  detention_started_at: string;
  detention_ended_at: string;
  appointment_confirmation: string;
  unload_type: string;
  watched: number;
  cloned_from_id: number | null;
  invoice_paid: number;
  dispatcher_id: number | null;
  docs_requested: number;
  docs_requested_at: string;
  ready_to_invoice: number;
  accounting_desk: AccountingDesk;
  accounting_return_status: string;
  accounting_sent_at: string;
  truck_status: string;
  branch: string;
  declared_value: number | null;
  load_size: string;
  condition_new_used: string;
  equipment_length: string;
  temperature_f: number | null;
  temp_low_f: number | null;
  temp_high_f: number | null;
  temp_time_tolerance: string;
  container_number: string;
  last_free_day: string;
  public_notes: string;
  posting_notes: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_ext: string;
  customer_reference: string;
  route_miles: number | null;
  route_leg_miles: string;
  route_state_miles: string;
  route_calculated_at: string;
  route_source: string;
  route_polyline: string;
  empty_miles: number | null;
  empty_state_miles: string;
  empty_from: string;
  empty_to: string;
  empty_calculated_at: string;
  empty_source: string;
  tms_invoice_number: string;
  tms_invoice_at: string;
  non_revenue: number;
  created_at: string;
  updated_at: string;
};

export type LoadView = Load & {
  customer_name: string;
  truck_unit: string | null;
  truck_type: TruckType | null;
  truck_samsara_id: string | null;
  truck_samsara_trailer_id: string | null;
  truck_orbcomm_asset_id: string | null;
  trailer_unit: string | null;
  trailer_type: string | null;
  trailer_orbcomm_asset_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_type: DriverKind | null;
  dispatcher_name: string | null;
};

export type CompanyProfile = {
  company_name: string;
  dispatcher_name: string;
  dispatcher_phone: string;
  dispatcher_fax: string;
  dispatcher_email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type FleetDocument = {
  id: number;
  owner_type: "driver" | "truck" | "trailer";
  owner_id: number;
  kind: FleetDocKind;
  original_name: string;
  stored_name: string;
  mime_type: string;
  created_at: string;
};

export type Attachment = {
  id: number;
  load_id: number;
  kind: AttachmentKind;
  original_name: string;
  stored_name: string;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
};

export type ReeferReading = {
  id: number;
  load_id: number | null;
  truck_id: number | null;
  trailer_id: string;
  setpoint_f: number | null;
  temperature_f: number | null;
  return_air_f: number | null;
  supply_air_f: number | null;
  door_open: number | null;
  alarm: string;
  latitude: number | null;
  longitude: number | null;
  address: string;
  source: "demo" | "orbcomm";
  recorded_at: string;
};

export type IftaJurisdictionRow = {
  jurisdiction: string;
  name: string;
  miles: number;
};

export type IftaReport = {
  id: number;
  load_id: number;
  source: "demo" | "samsara";
  vehicle_id: string;
  generated_at: string;
  window_start: string;
  window_end: string;
  total_miles: number;
  note: string;
  error: string;
  attachment_id: number | null;
  rows: IftaJurisdictionRow[];
};

export type DashboardStats = {
  openLoads: number;
  inTransit: number;
  availableTrucks: number;
  unassignedLoads: number;
};

export type ActionResult =
  | { ok: true; id?: number; message?: string; needsTotp?: boolean; recoveryCodes?: string[] }
  | { ok: false; error: string; duplicate?: boolean; existingId?: number };

export function labelForLoadStatus(status: string): string {
  switch (status) {
    case "available":
      return "Available";
    case "hold":
      return "Hold";
    case "assigned":
      return "Assigned";
    case "dispatched":
      return "Dispatched";
    case "at_pickup":
      return "At PU";
    case "loading":
      return "Loading";
    case "picked_up":
      return "Picked up";
    case "in_transit":
      return "In Transit";
    case "at_delivery":
      return "At DEL";
    case "unloading":
      return "Unloading";
    case "delivered":
      return "Delivered";
    case "completed":
      return "Completed";
    case "accounting":
      return "Accounting";
    case "cancelled":
      return "Cancelled";
    default:
      return status
        .replaceAll("_", " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}

export function labelForTruckType(type: string): string {
  return TRUCK_TYPES.find((item) => item.value === type)?.label ?? type;
}

export function labelForTruckStatus(status: string): string {
  return TRUCK_STATUSES.find((item) => item.value === status)?.label ?? status;
}

export function labelForDriverStatus(status: string): string {
  return DRIVER_STATUSES.find((item) => item.value === status)?.label ?? status;
}

export function isLoadStatus(value: string): value is LoadStatus {
  return (LOAD_STATUSES as readonly string[]).includes(value);
}

export function isDriverProgress(value: string): value is DriverProgress {
  return DRIVER_PROGRESS.some((item) => item.value === value);
}

export function labelForDriverProgress(value: string): string {
  return DRIVER_PROGRESS.find((item) => item.value === value)?.label ?? value;
}

export function labelForAttachmentKind(value: string): string {
  return ATTACHMENT_KINDS.find((item) => item.value === value)?.label ?? value;
}

export function labelForUploader(value: string): string {
  if (value === "dispatcher") return "Dispatcher";
  if (value === "driver") return "Driver";
  if (value === "system") return "System";
  return value || "Dispatcher";
}

export function isLocationRole(value: string): value is LocationRole {
  return LOCATION_ROLES.some((item) => item.value === value);
}

export function isSchedulingType(value: string): value is SchedulingType {
  return SCHEDULING_TYPES.some((item) => item.value === value);
}

export function labelForLocationRole(value: string): string {
  return LOCATION_ROLES.find((item) => item.value === value)?.label ?? value;
}

export function labelForSchedulingType(value: string): string {
  return SCHEDULING_TYPES.find((item) => item.value === value)?.label ?? value;
}
