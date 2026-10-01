import Link from "next/link";
import { LoadCardFastActions } from "@/components/load-card-fast-actions";
import { LoadMapCanvas } from "@/components/load-map-canvas";
import { ExceptionIssueLine } from "@/components/exception-issue-line";
import { WorkbenchStatusControl } from "@/components/workbench-status-control";
import { findCityCenter } from "@/lib/city-coords-shared";
import {
  LOAD_MAP_MARKER_COLOR,
  pathThroughStops,
  workbenchCardMapFraming,
  type LoadMapPoint,
} from "@/lib/load-map-shared";
import { buildStopsMapModel, mapsBrowserKey } from "@/lib/load-map";
import type { InboxExceptionGroup } from "@/lib/exceptions";
import { formatDateTime } from "@/lib/format";
import { nextLoadStatuses } from "@/lib/load-status-transition";
import { getLoad } from "@/lib/queries";
import { listStopAppointmentTargets } from "@/lib/stops";
import { labelForLoadStatus } from "@/lib/types";
import { WORKBENCH_TELEMATICS_EMPTY, workbenchTelematics } from "@/lib/workbench-telematics";

function workbenchWhen(iso: string): string {
  const shown = formatDateTime(iso);
  if (!String(iso ?? "").trim() || shown === "\u2014") return "Not set";
  return shown;
}

function lanePointsForCard(group: InboxExceptionGroup, modelPoints: LoadMapPoint[]): LoadMapPoint[] {
  const lane = modelPoints.filter(
    (point) =>
      point.kind === "pickup" || point.kind === "delivery" || point.kind === "relay" || point.kind === "truck",
  );
  const hasPickup = lane.some((point) => point.kind === "pickup");
  const hasDelivery = lane.some((point) => point.kind === "delivery");
  if (hasPickup && hasDelivery) return lane;
  const extra: LoadMapPoint[] = [];
  if (!hasPickup) {
    const origin = findCityCenter(group.origin);
    if (origin) {
      extra.push({
        id: "lane-origin",
        kind: "pickup",
        label: group.origin,
        lat: origin.lat,
        lng: origin.lng,
      });
    }
  }
  if (!hasDelivery) {
    const dest = findCityCenter(group.destination);
    if (dest) {
      extra.push({
        id: "lane-dest",
        kind: "delivery",
        label: group.destination,
        lat: dest.lat,
        lng: dest.lng,
      });
    }
  }
  return [...lane, ...extra];
}

function diamondPoints(cx: number, cy: number, radius = 3.5): string {
  return `${cx},${(cy - radius).toFixed(1)} ${(cx + radius).toFixed(1)},${cy} ${cx},${(cy + radius).toFixed(1)} ${(cx - radius).toFixed(1)},${cy}`;
}

export function WorkbenchLaneSketch({
  points,
  path,
}: {
  points: LoadMapPoint[];
  path: Array<{ lat: number; lng: number }>;
}) {
  const coords = path.length >= 2 ? path : points.filter((point) => point.kind !== "truck");
  const laneLabel = points
    .filter((point) => point.kind === "pickup" || point.kind === "relay" || point.kind === "delivery")
    .map((point) => point.label)
    .filter(Boolean)
    .join(". ");
  if (coords.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-[10px] text-slate-500">
        No map
      </div>
    );
  }
  const lats = coords.map((p) => p.lat);
  const lngs = coords.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const rawLat = maxLat - minLat;
  const rawLng = maxLng - minLng;
  const floor = 0.25;
  const dLat = Math.max(rawLat, floor);
  const dLng = Math.max(rawLng, floor);
  const lat0 = minLat - (dLat - rawLat) / 2;
  const lng0 = minLng - (dLng - rawLng) / 2;
  const pad = 24;
  const inner = 100 - pad * 2;
  const xOf = (lng: number) => ((lng - lng0) / dLng) * inner + pad;
  const yOf = (lat: number) => (1 - (lat - lat0) / dLat) * inner + pad;
  const line = coords.map((p) => `${xOf(p.lng).toFixed(1)},${yOf(p.lat).toFixed(1)}`).join(" ");
  const pickup = points.find((p) => p.kind === "pickup") ?? points[0];
  const drop = [...points].reverse().find((p) => p.kind === "delivery") ?? points[points.length - 1];
  const truck = points.find((p) => p.kind === "truck");
  const relays = points.filter((point) => point.kind === "relay");
  const shortLabel = (point?: LoadMapPoint) => (point?.label ?? "").split(",")[0]?.trim() ?? "";
  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#dce6ef]"
      data-workbench-lane-sketch=""
      role="img"
      aria-label={laneLabel || "Load route"}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="100" height="100" fill="#dce6ef" />
        {Array.from({ length: 6 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 16.6} x2="100" y2={i * 16.6} stroke="#c5d0db" strokeWidth="0.35" />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <line key={`v${i}`} x1={i * 16.6} y1="0" x2={i * 16.6} y2="100" stroke="#c5d0db" strokeWidth="0.35" />
        ))}
        <polyline points={line} fill="none" stroke="#12315c" strokeWidth="2.2" strokeLinejoin="round" />
        {relays.map((relay) => (
          <polygon
            key={relay.id}
            data-relay-pin={relay.markerText || relay.label}
            points={diamondPoints(xOf(relay.lng), yOf(relay.lat))}
            fill={LOAD_MAP_MARKER_COLOR.relay}
            stroke="#ffffff"
            strokeWidth="0.8"
          />
        ))}
        {pickup ? <circle cx={xOf(pickup.lng)} cy={yOf(pickup.lat)} r="3.4" fill={LOAD_MAP_MARKER_COLOR.pickup} /> : null}
        {drop ? <circle cx={xOf(drop.lng)} cy={yOf(drop.lat)} r="3.4" fill={LOAD_MAP_MARKER_COLOR.delivery} /> : null}
        {truck ? <circle cx={xOf(truck.lng)} cy={yOf(truck.lat)} r="3" fill={LOAD_MAP_MARKER_COLOR.truck} /> : null}
        {relays.map((relay) =>
          relay.markerText ? (
            <text
              key={`${relay.id}-label`}
              x={xOf(relay.lng)}
              y={yOf(relay.lat) - 5.2}
              textAnchor="middle"
              fontSize="6.5"
              fontWeight="700"
              fill="#4c1d95"
            >
              {relay.markerText}
            </text>
          ) : null,
        )}
        {pickup && shortLabel(pickup) ? (
          <text x={xOf(pickup.lng)} y={yOf(pickup.lat) - 5} textAnchor="middle" fontSize="7" fill="#0f172a">
            {shortLabel(pickup)}
          </text>
        ) : null}
        {drop && shortLabel(drop) ? (
          <text x={xOf(drop.lng)} y={yOf(drop.lat) - 5} textAnchor="middle" fontSize="7" fill="#0f172a">
            {shortLabel(drop)}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

export async function WorkbenchLoadCard({
  group,
  canChangeStatus = false,
}: {
  group: InboxExceptionGroup;
  canChangeStatus?: boolean;
}) {
  const apiKey = mapsBrowserKey();
  const model = await buildStopsMapModel(group.loadId);
  const points = lanePointsForCard(group, model.points);
  const path = model.path.length >= 2 ? model.path : pathThroughStops(points);
  const stops = listStopAppointmentTargets(group.loadId);
  const framing = workbenchCardMapFraming(points);
  let loadStatus = "";
  let statusOptions: Array<{ value: string; label: string }> = [];
  let telematics = { truckPlace: WORKBENCH_TELEMATICS_EMPTY, reeferTemp: WORKBENCH_TELEMATICS_EMPTY };
  try {
    const load = getLoad(group.loadId);
    if (load) {
      loadStatus = load.status;
      telematics = workbenchTelematics(load);
      if (canChangeStatus) statusOptions = nextLoadStatuses(load.status);
    }
  } catch {
    telematics = { truckPlace: WORKBENCH_TELEMATICS_EMPTY, reeferTemp: WORKBENCH_TELEMATICS_EMPTY };
  }

  return (
    <article
      className="workbench-card"
      data-workbench-card=""
      data-attention-load={group.loadNumber}
    >
      <div className="workbench-map-pane" data-workbench-map-pane="">
        {apiKey ? (
          <LoadMapCanvas
            apiKey={apiKey}
            points={points}
            path={path}
            disableDefaultUi
            fitPadding={framing.padding}
            fitPoints={framing.fitPoints}
            minZoom={framing.minZoom}
            maxZoom={framing.maxZoom}
            className="h-full w-full overflow-hidden bg-slate-100"
            missingKeyMessage="Map is off."
            emptyMessage="No map"
          />
        ) : (
          <WorkbenchLaneSketch points={points} path={path} />
        )}
      </div>
      <div className="workbench-card-content">
        <div className="workbench-card-header px-3 pt-3">
          <Link
            href={`/loads/${group.loadId}`}
            className="workbench-identity desk-link block font-mono text-sm font-semibold tracking-tight"
            data-workbench-load-number=""
          >
            {group.loadNumber}
          </Link>
          <div className="mt-1 flex items-center gap-1.5" data-workbench-fast-actions="">
            <LoadCardFastActions
              loadId={group.loadId}
              loadNumber={group.loadNumber}
              customerName={group.customerName}
              stops={stops}
            />
            <Link href={`/loads/${group.loadId}`} className="desk-link text-xs">
              Open
            </Link>
          </div>
          <div className="workbench-identity mt-0.5 text-xs text-slate-700" data-workbench-customer="">
            {group.customerName}
          </div>
          <div className="workbench-identity mt-0.5 text-[11px] text-slate-500" data-workbench-lane="">
            {group.origin}
            <span className="mx-1 text-slate-400">—</span>
            {group.destination}
          </div>
          {loadStatus ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Status</span>
              {canChangeStatus ? (
                <WorkbenchStatusControl
                  loadId={group.loadId}
                  loadNumber={group.loadNumber}
                  status={loadStatus}
                  options={statusOptions}
                />
              ) : (
                <span className="workbench-identity text-xs font-medium text-slate-800" data-workbench-status-text="">
                  {labelForLoadStatus(loadStatus)}
                </span>
              )}
            </div>
          ) : null}
          <dl className="workbench-card-meta" data-workbench-card-meta="">
            <div>
              <dt>Driver</dt>
              <dd className="font-medium" data-workbench-driver="">
                {group.driverName.trim() || "Unassigned"}
              </dd>
            </div>
            <div>
              <dt>Pickup</dt>
              <dd data-workbench-pickup="">{workbenchWhen(group.pickupAt)}</dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd data-workbench-delivery="">{workbenchWhen(group.deliveryAt)}</dd>
            </div>
            <div>
              <dt>Truck</dt>
              <dd
                className={telematics.truckPlace === WORKBENCH_TELEMATICS_EMPTY ? "text-slate-400" : undefined}
                data-workbench-truck-place=""
              >
                {telematics.truckPlace}
              </dd>
            </div>
            <div>
              <dt>Reefer</dt>
              <dd
                className={telematics.reeferTemp === WORKBENCH_TELEMATICS_EMPTY ? "text-slate-400" : undefined}
                data-workbench-reefer=""
              >
                {telematics.reeferTemp}
              </dd>
            </div>
          </dl>
        </div>
        <ul className="workbench-card-issues mt-2 space-y-1.5 border-t border-slate-100 px-3 pb-2.5 pt-2">
          {group.items.length === 0 ? (
            <li className="text-xs text-slate-500">No open issues</li>
          ) : (
            group.items.map((item) => <ExceptionIssueLine key={item.id} item={item} compact />)
          )}
        </ul>
      </div>
    </article>
  );
}
