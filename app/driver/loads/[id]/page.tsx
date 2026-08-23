import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DriverLoadActions } from "@/components/driver-load-actions";
import { getSignedInDriver } from "@/lib/driver-session";
import { listAttachments } from "@/lib/files";
import { formatDateTime, formatMoney, formatWeight } from "@/lib/format";
import { getLatestReeferForLoad } from "@/lib/integrations/orbcomm";
import { formatDurationMs, formatDutyStatus, getHosForDriver } from "@/lib/integrations/samsara";
import { LocationScheduling } from "@/components/location-scheduling";
import { getLoad, getLocation } from "@/lib/queries";
import { LoadStatusBadge } from "@/components/status-badge";
import { labelForAttachmentKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DriverLoadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const driver = await getSignedInDriver();
  if (!driver) redirect("/driver/login");
  const load = getLoad(Number.parseInt((await params).id, 10));
  if (!load || load.driver_id !== driver.id) notFound();
  const reefer = await getLatestReeferForLoad(load.id);
  const hos = await getHosForDriver(driver.id);
  const attachments = listAttachments(load.id);
  const shipper = load.shipper_location_id ? getLocation(load.shipper_location_id) : null;
  const consignee = load.consignee_location_id ? getLocation(load.consignee_location_id) : null;

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
      <p className="text-slate-500">{load.customer_name}</p>

      <div className="mt-4">
        <a className="btn btn-primary" href={`/api/loads/${load.id}/confirmation`}>
          Download load confirmation
        </a>
      </div>

      <LocationScheduling
        title="Pickup"
        location={shipper}
        fallbackAddress={load.origin}
        audience="driver"
      />
      <LocationScheduling
        title="Delivery"
        location={consignee}
        fallbackAddress={load.destination}
        audience="driver"
      />

      <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
        <Row label="Pickup window" value={`${formatDateTime(load.pickup_start)} – ${formatDateTime(load.pickup_end)}`} />
        <Row label="Delivery window" value={`${formatDateTime(load.delivery_start)} – ${formatDateTime(load.delivery_end)}`} />
        <Row label="Commodity" value={load.commodity || "—"} />
        <Row label="Weight" value={formatWeight(load.weight)} />
        <Row label="Rate" value={formatMoney(load.rate)} />
        <Row label="Ref / PO" value={[load.reference_number, load.po_number].filter(Boolean).join(" · ") || "—"} />
        <Row label="Trailer" value={load.trailer_number || "—"} />
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

      {(load.reefer_setpoint_f != null || reefer) && (
        <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Reefer</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {reefer?.temperature_f ?? "—"}°F
          </div>
          <div className="text-sm text-slate-600">
            Setpoint {load.reefer_setpoint_f ?? reefer?.setpoint_f ?? "—"}°F
            {reefer?.source === "demo" ? " · demo reading" : reefer?.source === "orbcomm" ? " · ORBCOMM" : ""}
            {reefer?.recorded_at ? ` · ${formatDateTime(reefer.recorded_at)}` : ""}
          </div>
          {reefer?.door_open === 1 ? <div className="mt-1 text-sm text-rose-700">Door open</div> : null}
          {reefer?.alarm ? <div className="text-sm text-rose-700">{reefer.alarm}</div> : null}
        </section>
      )}

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
        closed={load.status === "delivered"}
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
