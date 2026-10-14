"use client";

import {
  assignmentUnitWarnings,
  driverUnitFromFacts,
  type AssignmentUnitFacts,
} from "@/lib/driver-unit";

export function AssignmentUnitNote({
  id,
  facts,
  driver,
  truckId,
  trucks,
  thisLoadId,
  className = "",
}: {
  id: string;
  facts: AssignmentUnitFacts;
  driver: { id: number; name: string; truck_id?: number | null; truck_unit?: string | null } | null;
  truckId: string;
  trucks: Array<{ id: number; unit_number: string }>;
  thisLoadId: number | null;
  className?: string;
}) {
  const usual = driverUnitFromFacts(facts, driver);
  const chosen = trucks.find((item) => String(item.id) === truckId);
  const gps = facts.trucks.find((item) => String(item.truckId) === truckId) ?? null;
  const warnings = assignmentUnitWarnings({
    driverName: driver?.name ?? "",
    usualUnit: usual?.unitNumber ?? null,
    chosenUnit: chosen?.unit_number ?? null,
    truck: gps,
    chosenDriverId: driver?.id ?? null,
    thisLoadId,
    now: new Date(facts.asOf),
    quietHours: facts.quietHours,
  });
  if (warnings.length === 0) return <div id={id} hidden className={className} />;
  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      data-unit-warnings=""
      className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 ${className}`.trim()}
    >
      {warnings.map((text) => (
        <p key={text} data-unit-warning="">
          {text}
        </p>
      ))}
    </div>
  );
}
