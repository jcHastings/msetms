export const LOAD_STATUSES = [
  "available",
  "assigned",
  "in_transit",
  "delivered",
  "cancelled",
] as const;

export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const ACTIVE_LOAD_STATUSES: LoadStatus[] = [
  "available",
  "assigned",
  "in_transit",
];

export const TRUCK_TYPES = [
  { value: "dry_van", label: "Dry Van" },
  { value: "reefer", label: "Reefer" },
  { value: "flatbed", label: "Flatbed" },
  { value: "box", label: "Box Truck" },
  { value: "power_only", label: "Power Only" },
] as const;

export type TruckType = (typeof TRUCK_TYPES)[number]["value"];

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

export type Customer = {
  id: number;
  name: string;
  billing_notes: string;
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
  { value: "bol", label: "BOL" },
  { value: "pod", label: "POD" },
  { value: "lumper", label: "Lumper" },
  { value: "photo_trailer", label: "Trailer photo" },
  { value: "photo_product", label: "Product photo" },
  { value: "photo_seals", label: "Seal photo" },
  { value: "other", label: "Other" },
] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]["value"];

export type Truck = {
  id: number;
  unit_number: string;
  type: TruckType;
  capacity_lbs: number;
  status: TruckStatus;
  samsara_vehicle_id: string;
  trailer_number: string;
  created_at: string;
  updated_at: string;
};

export type Driver = {
  id: number;
  name: string;
  phone: string;
  license: string;
  pin: string;
  truck_id: number | null;
  status: DriverStatus;
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
  trailer_number: string;
  driver_progress: DriverProgress | "";
  status: LoadStatus;
  truck_id: number | null;
  driver_id: number | null;
  created_at: string;
  updated_at: string;
};

export type LoadView = Load & {
  customer_name: string;
  truck_unit: string | null;
  truck_type: TruckType | null;
  truck_samsara_id: string | null;
  driver_name: string | null;
};

export type Attachment = {
  id: number;
  load_id: number;
  kind: AttachmentKind;
  original_name: string;
  stored_name: string;
  mime_type: string;
  uploaded_by: "dispatcher" | "driver";
  created_at: string;
};

export type ReeferReading = {
  id: number;
  load_id: number | null;
  truck_id: number | null;
  trailer_id: string;
  setpoint_f: number | null;
  temperature_f: number | null;
  door_open: number | null;
  alarm: string;
  source: "demo" | "samsara";
  recorded_at: string;
};

export type DashboardStats = {
  openLoads: number;
  inTransit: number;
  availableTrucks: number;
  unassignedLoads: number;
};

export type ActionResult = { ok: true; id?: number } | { ok: false; error: string };

export function labelForLoadStatus(status: LoadStatus): string {
  switch (status) {
    case "available":
      return "Available";
    case "assigned":
      return "Assigned";
    case "in_transit":
      return "In Transit";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
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
