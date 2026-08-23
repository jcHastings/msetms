import {
  labelForDriverStatus,
  labelForLoadStatus,
  labelForTruckStatus,
  type DriverStatus,
  type LoadStatus,
  type TruckStatus,
} from "@/lib/types";

const LOAD_STYLES: Record<LoadStatus, string> = {
  available: "bg-sky-50 text-sky-800 ring-sky-200",
  assigned: "bg-amber-50 text-amber-800 ring-amber-200",
  in_transit: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  delivered: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
};

const TRUCK_STYLES: Record<TruckStatus, string> = {
  available: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  in_use: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  maintenance: "bg-amber-50 text-amber-800 ring-amber-200",
  out_of_service: "bg-rose-50 text-rose-800 ring-rose-200",
};

const DRIVER_STYLES: Record<DriverStatus, string> = {
  available: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  on_duty: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  off_duty: "bg-slate-100 text-slate-600 ring-slate-200",
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}

export function LoadStatusBadge({ status }: { status: LoadStatus }) {
  return <Pill className={LOAD_STYLES[status]}>{labelForLoadStatus(status)}</Pill>;
}

export function TruckStatusBadge({ status }: { status: TruckStatus }) {
  return <Pill className={TRUCK_STYLES[status]}>{labelForTruckStatus(status)}</Pill>;
}

export function DriverStatusBadge({ status }: { status: DriverStatus }) {
  return <Pill className={DRIVER_STYLES[status]}>{labelForDriverStatus(status)}</Pill>;
}
