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

function Pill({
  className,
  children,
  title,
}: {
  className: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span className={`status-pill ring-1 ring-inset ring-black/5 ${className}`} title={title}>
      {children}
    </span>
  );
}

export function LoadStatusBadge({ status }: { status: string }) {
  const label = labelForLoadStatus(status);
  return (
    <Pill className={loadStatusBadgeClass(status)} title={label}>
      {label}
    </Pill>
  );
}

export function OnTimeResultBadge({ onTime }: { onTime: boolean }) {
  const label = onTime ? "On time" : "Late";
  return (
    <Pill className={onTime ? "status-tone-success" : "status-tone-warning"} title={label}>
      {label}
    </Pill>
  );
}

export function CriticalTag({ reason }: { reason?: string }) {
  const text = reason?.trim() ?? "";
  return (
    <span className="exception-badge-stack" title={text || "Critical"}>
      <Pill className="status-tone-danger shrink-0">Critical</Pill>
      {text ? (
        <span className="exception-reason" data-critical-reason="">
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function TruckStatusBadge({ status }: { status: TruckStatus }) {
  const label = labelForTruckStatus(status);
  return (
    <Pill className={TRUCK_STYLES[status]} title={label}>
      {label}
    </Pill>
  );
}

export function DriverStatusBadge({ status }: { status: DriverStatus }) {
  const label = labelForDriverStatus(status);
  return (
    <Pill className={DRIVER_STYLES[status]} title={label}>
      {label}
    </Pill>
  );
}

export function DriverKindBadge({ type }: { type: DriverKind | string }) {
  const ownerOperator = isOwnerOperator(type);
  const label = labelForDriverKind(type);
  return (
    <Pill className={ownerOperator ? "status-tone-navy" : "status-tone-slate"} title={label}>
      {label}
    </Pill>
  );
}
