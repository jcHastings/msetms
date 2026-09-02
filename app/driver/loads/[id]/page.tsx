import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DriverLoadActions } from "@/components/driver-load-actions";
import { LoadChatPanel } from "@/components/load-chat-panel";
import { getSignedInDriver } from "@/lib/driver-session";
import { listAttachments } from "@/lib/files";
import { driverLaneEnds, driverStopWhen } from "@/lib/driver-load-display";
import { formatDateTime, formatMoney, formatWeight } from "@/lib/format";
import { driverFacingPay } from "@/lib/settlement";
import { getLatestReeferForLoad, getReeferSnapshots } from "@/lib/integrations/orbcomm";
import { formatDurationMs, formatDutyStatus, getHosForDriver } from "@/lib/integrations/samsara";
import { DriverSchedulingBlock } from "@/components/location-scheduling";
import { listLoadChatMessages } from "@/lib/load-chat";
import { getLoad, locationsForLoad } from "@/lib/queries";
import { ensureDefaultStops } from "@/lib/stops";
import { driverAssignedToLoad, relayForDriver } from "@/lib/relay-store";
import { formatRelayLane } from "@/lib/relays";
import { LoadStatusBadge } from "@/components/status-badge";
import { formatReeferSetpoint, labelForReeferMode, resolveReeferSpec } from "@/lib/reefer-shared";
import { DriverDocClassify } from "@/components/driver-doc-classify";
import { driverFacingStopPo } from "@/lib/load-confirmation";
import { isCustomerRateDocument } from "@/lib/load-documents-shared";
import { isClosedStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverLoadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const load = getLoad(Number.parseInt((await params).id, 10));
  if (!load || !driverAssignedToLoad(load.id, driver.id, load.driver_id)) notFound();
  const yourLeg = relayForDriver(load.id, driver.id);
  const reefer = await getLatestReeferForLoad(load.id);
  const reeferSnap = (await getReeferSnapshots()).readings.find((row) => row.loadId === load.id);
  const hos = await getHosForDriver(driver.id);
  const attachments = listAttachments(load.id).filter((file) => !isCustomerRateDocument(file));
  const stopLocations = locationsForLoad(load);
  const reeferSpec = resolveReeferSpec(load);
  const stops = ensureDefaultStops(load.id);
  const pickupStop = stops.find((stop) => stop.kind === "pickup") ?? null;
  const deliveryStop = stops.find((stop) => stop.kind === "delivery") ?? null;
  const lane = driverLaneEnds(load.origin, load.destination, pickupStop, deliveryStop);
  const pickupWhen = driverStopWhen(load.pickup_start, load.pickup_end, pickupStop);
  const deliveryWhen = driverStopWhen(load.delivery_start, load.delivery_end, deliveryStop);
  const requiredTemp =
    load.temp_low_f != null && load.temp_high_f != null
      ? `${load.temp_low_f}–${load.temp_high_f}°F`
      : load.temperature_f != null
        ? `${load.temperature_f}°F`
        : "—";
  const probe = reefer?.return_air_f ?? reefer?.temperature_f;
  const trailerStatus = reeferSnap?.powerOn === true ? "On" : reeferSnap?.powerOn === false ? "Off" : "—";
  const fuelPercent = null;

  return (
    <div className="mx-auto max-w-lg px-4 pb-20 pt-5">
      <Link href="/driver" className="text-sm font-medium text-slate-300">
        ← My dispatch
      </Link>
      <div className="mt-3 flex items-center justify-between gap-2">
        <h1 className="font-mono text-2xl font-semibold text-white">{load.load_number}</h1>
        <LoadStatusBadge status={load.status} />
      </div>
      {lane ? <p className="mt-1 text-lg font-medium text-white">{lane}</p> : null}
      {yourLeg ? (
        <p className="driver-sheet mt-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium">
          Your leg: {formatRelayLane(yourLeg.pickup, yourLeg.delivery)}
        </p>
      ) : null}
      <p className="text-slate-400">{load.customer_name}</p>
      {load.docs_requested ? (
        <section className="driver-sheet mt-4 rounded-2xl bg-amber-50 p-4">
          <div className="driver-sheet-label text-xs font-semibold uppercase tracking-wide">Documents requested</div>
          <p className="driver-sheet-value mt-1 text-base">
            Dispatch asked for BOL/POD/photos on this load. Upload them below.
          </p>
        </section>
      ) : null}

      <div id="confirmation" className="mt-4 flex flex-wrap gap-2">
        <a className="btn btn-primary" href={`/api/loads/${load.id}/confirmation?packet=internal`}>
          Download load confirmation
        </a>
        {attachments
          .filter((file) => file.kind === "bol")
          .map((file) => (
            <a key={file.id} id="bol" className="btn btn-secondary" href={`/api/attachments/${file.id}`}>
              Print / view BOL
            </a>
          ))}
        {attachments.every((file) => file.kind !== "bol") ? <span id="bol" className="sr-only">BOL</span> : null}
      </div>

      <section className="driver-sheet mt-5 rounded-2xl bg-white p-4 shadow-sm">
        <Row label="Pickup" value={pickupWhen} />
        <Row label="Delivery" value={deliveryWhen} />
        <Row label="Commodity" value={load.commodity || "—"} />
        <Row label="Weight" value={formatWeight(load.weight)} />
        {driverFacingPay(load) != null ? (
          <Row label="Your pay" value={formatMoney(driverFacingPay(load))} />
        ) : null}
        <Row
          label="Ref / PO"
          value={stops.map((stop) => driverFacingStopPo(stop, load)).filter(Boolean).join(" · ") || "—"}
        />
        <Row label="Trailer" value={load.trailer_number || load.trailer_unit || "—"} />
        {reeferSpec.isReefer ? (
          <>
            <Row label="Setpoint" value={formatReeferSetpoint(reeferSpec.setpointF) || "—"} />
            <Row label="Required" value={requiredTemp} />
            <Row label="Reefer mode" value={labelForReeferMode(reeferSpec.mode) || "Continuous"} />
          </>
        ) : null}
      </section>

      {hos ? (
        <section className="driver-sheet mt-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="driver-sheet-label text-xs font-semibold uppercase tracking-wide">Hours of service</div>
          <div className="driver-sheet-value mt-1 text-2xl font-semibold tabular-nums">
            {formatDurationMs(hos.driveRemainingMs)} drive left
          </div>
          <div className="driver-sheet-value text-sm">
            {formatDutyStatus(hos.dutyStatus)}
            {hos.source === "demo" ? " · demo" : " · Samsara"}
          </div>
        </section>
      ) : null}

      {(reeferSpec.isReefer || reefer) && (
        <section className="driver-sheet mt-3 rounded-2xl bg-sky-50 p-4 shadow-sm">
          <div className="driver-sheet-label text-xs font-semibold uppercase tracking-wide">Reefer</div>
          <div className="driver-sheet-value mt-1 text-2xl font-semibold tabular-nums">
            {formatReeferSetpoint(reeferSpec.setpointF ?? reefer?.setpoint_f) || "—"}
          </div>
          <div className="driver-sheet-value mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>Setpoint · {formatReeferSetpoint(reeferSpec.setpointF ?? reefer?.setpoint_f) || "—"}</div>
            <div>Probe · {probe != null ? `${probe}°F` : "—"}</div>
            <div>Required · {requiredTemp}</div>
            <div>Trailer · {trailerStatus}</div>
            <div>Fuel · {fuelPercent != null ? `${fuelPercent}%` : "—"}</div>
          </div>
          <div className="driver-sheet-value text-base font-medium">
            Mode: {labelForReeferMode(reeferSpec.mode) || "Continuous"}
          </div>
          {reefer ? (
            <div className="driver-sheet-value mt-1 text-sm">
              Live {reefer.temperature_f ?? "—"}°F
              {reefer.source === "demo" ? " · demo reading" : reefer.source === "orbcomm" ? " · Orbcomm" : ""}
              {reefer.recorded_at ? ` · ${formatDateTime(reefer.recorded_at)}` : ""}
            </div>
          ) : null}
          {reefer?.door_open === 1 ? <div className="mt-1 text-sm text-rose-700">Door open</div> : null}
          {reefer?.alarm ? <div className="text-sm text-rose-700">{reefer.alarm}</div> : null}
        </section>
      )}

      <DriverSchedulingBlock title="Pickup scheduling" location={stopLocations.shipper} />
      <DriverSchedulingBlock title="Delivery scheduling" location={stopLocations.consignee} />

      {load.appointment_notes ? (
        <section className="driver-sheet mt-3 rounded-2xl bg-amber-50 p-4">
          <div className="driver-sheet-label text-xs font-semibold uppercase tracking-wide">Appointment</div>
          <p className="driver-sheet-value mt-1 whitespace-pre-wrap text-base">{load.appointment_notes}</p>
        </section>
      ) : null}

      {load.special_instructions ? (
        <section className="driver-sheet mt-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="driver-sheet-label text-xs font-semibold uppercase tracking-wide">
            Special instructions
          </div>
          <p className="driver-sheet-value mt-1 whitespace-pre-wrap text-base">{load.special_instructions}</p>
        </section>
      ) : null}

      {load.public_notes ? (
        <section className="driver-sheet mt-3 rounded-2xl bg-white p-4 text-sm shadow-sm">
          <div className="driver-sheet-label text-xs font-semibold uppercase tracking-wide">Notes</div>
          <p className="driver-sheet-value mt-1 whitespace-pre-wrap">{load.public_notes}</p>
        </section>
      ) : null}

      <LoadChatPanel loadId={load.id} messages={listLoadChatMessages(load.id)} role="driver" />

      <div id="upload">
        <span id="fuel" className="sr-only">
          Fuel
        </span>
        <DriverLoadActions
          loadId={load.id}
          loadNumber={load.load_number}
          current={load.driver_progress}
          closed={isClosedStatus(load.status)}
          stops={stops}
        />
      </div>

      <DriverDocClassify files={attachments} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-100 py-2 last:border-0">
      <div className="driver-sheet-label text-xs uppercase tracking-wide">{label}</div>
      <div className="driver-sheet-value text-base">{value}</div>
    </div>
  );
}
