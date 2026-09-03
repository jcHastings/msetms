import { loadStatusBadgeClass } from "@/lib/load-status-style";
import {
  isOwnerOperator,
  labelForDriverKind,
  labelForDriverStatus,
  labelForLoadStatus,
  labelForTruckStatus,
  type DriverKind,
  type DriverStatus,
  type TruckStatus,
} from "@/lib/types";

const TRUCK_STYLES: Record<TruckStatus, string> = {
  available: "status-tone-success",
  in_use: "status-tone-navy",
  maintenance: "status-tone-warning",
  out_of_service: "status-tone-danger",
};

const DRIVER_STYLES: Record<DriverStatus, string> = {
  available: "status-tone-success",
  on_duty: "status-tone-navy",
  off_duty: "status-tone-slate",
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`status-pill ring-1 ring-inset ring-black/5 ${className}`}
    >
      {children}
    </span>
  );
}

export function LoadStatusBadge({ status }: { status: string }) {
  return <Pill className={loadStatusBadgeClass(status)}>{labelForLoadStatus(status)}</Pill>;
}

export function CriticalTag() {
  return <Pill className="status-tone-danger">Critical</Pill>;
}

export function TruckStatusBadge({ status }: { status: TruckStatus }) {
  return <Pill className={TRUCK_STYLES[status]}>{labelForTruckStatus(status)}</Pill>;
}

export function DriverStatusBadge({ status }: { status: DriverStatus }) {
  return <Pill className={DRIVER_STYLES[status]}>{labelForDriverStatus(status)}</Pill>;
}

export function DriverKindBadge({ type }: { type: DriverKind | string }) {
  const ownerOperator = isOwnerOperator(type);
  return (
    <Pill className={ownerOperator ? "status-tone-navy" : "status-tone-slate"}>
      {labelForDriverKind(type)}
    </Pill>
  );
}
