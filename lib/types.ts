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

export type Truck = {
  id: number;
  unit_number: string;
  type: TruckType;
  capacity_lbs: number;
  status: TruckStatus;
  created_at: string;
  updated_at: string;
};

export type Driver = {
  id: number;
  name: string;
  phone: string;
  license: string;
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
  driver_name: string | null;
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
