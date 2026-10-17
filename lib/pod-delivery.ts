import { recordLoadAudit } from "./audit";
import { getDb } from "./db";
import {
  isPodDeliveryReason,
  parsePodDeliveryNote,
  podDeliveryAuditText,
  type PodDeliveryOutcome,
  type PodDeliveryReason,
} from "./pod-delivery-shared";

export {
  POD_DELIVERY_REASONS,
  isPodDeliveryReason,
  labelForPodDeliveryReason,
  missingPodAlert,
  parsePodDeliveryNote,
  podDeliveryAuditText,
  podReasonClearsAlert,
  readPodDeliveryFields,
} from "./pod-delivery-shared";
export type { MissingPodAlert, PodDeliveryOutcome, PodDeliveryReason } from "./pod-delivery-shared";

type PodRow = {
  pod_outcome: string;
  pod_reason: string;
  pod_reason_note: string;
};

export function recordPodDelivery(
  loadId: number,
  input: { outcome: PodDeliveryOutcome; reason: PodDeliveryReason | ""; note: string },
): void {
  const row = getDb()
    .prepare("SELECT pod_outcome, pod_reason, pod_reason_note FROM loads WHERE id = ?")
    .get(loadId) as PodRow | undefined;
  if (!row) throw new Error("Load not found.");
  const note = input.outcome === "photo" ? "" : parsePodDeliveryNote(input.note);
  const reason = input.outcome === "photo" ? "" : input.reason;
  if (row.pod_outcome === input.outcome && row.pod_reason === reason && row.pod_reason_note === note) return;
  const recordedAt = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE loads
       SET pod_outcome = ?, pod_reason = ?, pod_reason_note = ?, pod_recorded_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(input.outcome, reason, note, recordedAt, recordedAt, loadId);
  recordLoadAudit({
    loadId,
    action: "pod_delivery",
    field: "pod",
    oldValue: row.pod_outcome
      ? podDeliveryAuditText({
          outcome: row.pod_outcome === "reason" ? "reason" : "photo",
          reason: isPodDeliveryReason(row.pod_reason) ? row.pod_reason : "",
          note: row.pod_reason_note,
        })
      : "",
    newValue: podDeliveryAuditText({ outcome: input.outcome, reason, note }),
  });
}

/** Remember the rate printed on the rate con. Later pay edits must not erase it. */
export function captureRateConAmount(loadId: number, rate: number | null): void {
  if (rate == null || Number.isNaN(rate)) return;
  const row = getDb().prepare("SELECT rate_con_amount FROM loads WHERE id = ?").get(loadId) as
    | { rate_con_amount: number | null }
    | undefined;
  if (!row) throw new Error("Load not found.");
  const next = Math.round(rate * 100) / 100;
  if (row.rate_con_amount != null && Math.round(row.rate_con_amount * 100) === Math.round(next * 100)) return;
  getDb()
    .prepare("UPDATE loads SET rate_con_amount = ?, updated_at = ? WHERE id = ?")
    .run(next, new Date().toISOString(), loadId);
  recordLoadAudit({
    loadId,
    action: "rate_con",
    field: "rate_con_amount",
    oldValue: row.rate_con_amount,
    newValue: next,
  });
}
