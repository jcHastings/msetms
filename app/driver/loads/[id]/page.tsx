import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DriverLoadActions } from "@/components/driver-load-actions";
import { getSignedInDriver } from "@/lib/driver-session";
import { listAttachments } from "@/lib/files";
import { formatDateTime, formatMoney, formatWeight } from "@/lib/format";
import { getLatestReeferForLoad } from "@/lib/integrations/orbcomm";
import { formatDurationMs, formatDutyStatus, getHosForDriver } from "@/lib/integrations/samsara";
import { DriverSchedulingBlock } from "@/components/location-scheduling";
import { getLoad, locationsForLoad } from "@/lib/queries";
import { driverAssignedToLoad, relayForDriver } from "@/lib/relay-store";
import { formatRelayLane } from "@/lib/relays";
import { LoadStatusBadge } from "@/components/status-badge";
import { formatReeferSetpoint, labelForReeferMode, resolveReeferSpec } from "@/lib/reefer-shared";
import { isClosedStatus, labelForAttachmentKind } from "@/lib/types";

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
  const hos = await getHosForDriver(driver.id);
  const attachments = listAttachments(load.id);
  const stopLocations = locationsForLoad(load);
  const reeferSpec = resolveReeferSpec(load);

  return (
    <div className="mx-auto max-w-lg px-4 pb-20 pt-5">
      <Link href="/driver" className="text-sm font-medium text-slate-600">
        ← My dispatch
      </Link>
      <div className="mt-3 flex items-center justify-between gap-2">
        <h1 className="font-mono text-2xl font-semibold">{load.load_number}</h1>
        <LoadStatusBadge status={load.status} />
      </div>
      <p className="mt-1 text-lg font-medium">
        {load.origin} → {load.destination}
      </p>
      {yourLeg ? (
        <p className="mt-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800">
          Your leg: {formatRelayLane(yourLeg.pickup, yourLeg.delivery)}
        </p>
      ) : null}
      <p className="text-slate-500">{load.customer_name}</p>
      {load.docs_requested ? (
        <section className="mt-4 rounded-2xl bg-amber-50 p-4 text-amber-950">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Documents requested</div>
          <p className="mt-1 text-base">
            Dispatch asked for BOL/POD/photos on this load. Upload them below.
          </p>
        </section>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <a className="btn btn-primary" href={`/api/loads/${load.id}/confirmation`}>
          Download load confirmation
        </a>
        {attachments
          .filter((file) => file.kind === "bol")
          .map((file) => (
            <a key={file.id} className="btn btn-secondary" href={`/api/attachments/${file.id}`}>
              Print / view BOL
            </a>
          ))}
      </div>

      <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
        <Row label="Pickup" value={`${formatDateTime(load.pickup_start)} – ${formatDateTime(load.pickup_end)}`} />
        <Row label="Delivery" value={`${formatDateTime(load.delivery_start)} – ${formatDateTime(load.delivery_end)}`} />
        <Row label="Commodity" value={load.commodity || "—"} />
        <Row label="Weight" value={formatWeight(load.weight)} />
        <Row label="Rate" value={formatMoney(load.rate)} />
        <Row label="Ref / PO" value={[load.reference_number, load.po_number].filter(Boolean).join(" · ") || "—"} />
        <Row label="Trailer" value={load.trailer_number || load.trailer_unit || "—"} />
        {reeferSpec.isReefer ? (
          <>
            <Row label="Reefer setpoint" value={formatReeferSetpoint(reeferSpec.setpointF) || "—"} />
            <Row label="Reefer mode" value={labelForReeferMode(reeferSpec.mode) || "Continuous"} />
          </>
        ) : null}
      </section>

      {hos ? (
        <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hours of service</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {formatDurationMs(hos.driveRemainingMs)} drive left
          </div>
          <div className="text-sm text-slate-600">
            {formatDutyStatus(hos.dutyStatus)}
            {hos.source === "demo" ? " · demo" : " · Samsara"}
          </div>
        </section>
      ) : null}

      {(reeferSpec.isReefer || reefer) && (
        <section className="mt-3 rounded-2xl bg-sky-50 p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">Reefer</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-sky-950">
            {formatReeferSetpoint(reeferSpec.setpointF ?? reefer?.setpoint_f) || "—"}
          </div>
          <div className="text-base font-medium text-sky-950">
            Mode: {labelForReeferMode(reeferSpec.mode) || "Continuous"}
          </div>
          {reefer ? (
            <div className="mt-1 text-sm text-sky-900">
              Live {reefer.temperature_f ?? "—"}°F
              {reefer.source === "demo" ? " · demo reading" : reefer.source === "orbcomm" ? " · ORBCOMM" : ""}
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
        <section className="mt-3 rounded-2xl bg-amber-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Appointment</div>
          <p className="mt-1 whitespace-pre-wrap text-base text-amber-950">{load.appointment_notes}</p>
        </section>
      ) : null}

      {load.special_instructions ? (
        <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Special instructions
          </div>
          <p className="mt-1 whitespace-pre-wrap text-base">{load.special_instructions}</p>
        </section>
      ) : null}

      {load.notes ? (
        <section className="mt-3 rounded-2xl bg-white p-4 text-sm text-slate-600 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</div>
          <p className="mt-1 whitespace-pre-wrap">{load.notes}</p>
        </section>
      ) : null}

      <DriverLoadActions
        loadId={load.id}
        loadNumber={load.load_number}
        current={load.driver_progress}
        closed={isClosedStatus(load.status)}
      />

      <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">Files on this load</h2>
        {attachments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">None yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {attachments.map((file) => (
              <li key={file.id}>
                <a href={`/api/attachments/${file.id}`} className="text-base font-medium underline">
                  {labelForAttachmentKind(file.kind)} · {file.original_name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-100 py-2 last:border-0">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-base">{value}</div>
    </div>
  );
}
