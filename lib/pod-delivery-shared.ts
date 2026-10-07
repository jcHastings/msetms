export const POD_DELIVERY_REASONS = [
  { value: "receiver_kept", label: "Receiver kept the POD", clearsAlert: true },
  { value: "sent_to_customer", label: "Sent to the customer", clearsAlert: true },
  { value: "upload_later", label: "I'll upload it later", clearsAlert: false },
  { value: "other", label: "Other", clearsAlert: false },
] as const;

export type PodDeliveryReason = (typeof POD_DELIVERY_REASONS)[number]["value"];

export type PodDeliveryOutcome = "photo" | "reason";

export type MissingPodAlert = {
  show: boolean;
  severity: "HIGH" | "LOW";
  title: string;
  detail: string;
};

const NOTE_MAX = 160;

export function isPodDeliveryReason(value: string): value is PodDeliveryReason {
  return POD_DELIVERY_REASONS.some((item) => item.value === value);
}

export function labelForPodDeliveryReason(value: string): string {
  return POD_DELIVERY_REASONS.find((item) => item.value === value)?.label ?? "Reason on file";
}

export function podReasonClearsAlert(value: string): boolean {
  return POD_DELIVERY_REASONS.find((item) => item.value === value)?.clearsAlert === true;
}

export function parsePodDeliveryNote(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
}

export function readPodDeliveryFields(source: {
  get(name: string): unknown;
}): { outcome: PodDeliveryOutcome; reason: PodDeliveryReason | ""; note: string } | null {
  const outcome = String(source.get("pod_outcome") ?? "").trim();
  if (!outcome) return null;
  if (outcome !== "photo" && outcome !== "reason") {
    throw new Error("Pick a POD photo or a reason.");
  }
  if (outcome === "photo") return { outcome, reason: "", note: "" };
  const reason = String(source.get("pod_reason") ?? "").trim();
  if (!isPodDeliveryReason(reason)) throw new Error("Pick why the POD photo is not here.");
  const note = parsePodDeliveryNote(source.get("pod_note"));
  if (reason === "other" && !note) throw new Error("Add a short note for Other.");
  return { outcome, reason, note };
}

/**
 * missing_pod applies to every delivered load.
 * A POD file hides it. Receiver-kept and sent-to-customer clear it.
 * "I'll upload it later" and Other stay as a low reminder.
 */
export function missingPodAlert(
  load: {
    customer_name?: string;
    pod_outcome?: string | null;
    pod_reason?: string | null;
    pod_reason_note?: string | null;
  },
  hasPod: boolean,
): MissingPodAlert {
  const hidden: MissingPodAlert = { show: false, severity: "HIGH", title: "", detail: "" };
  if (hasPod) return hidden;
  const customer = load.customer_name?.trim() || "Customer";
  if (load.pod_outcome === "reason" && load.pod_reason) {
    const label = labelForPodDeliveryReason(load.pod_reason);
    const note = String(load.pod_reason_note ?? "").trim();
    const detail = [label, note].filter(Boolean).join(" — ");
    if (podReasonClearsAlert(load.pod_reason)) return hidden;
    return {
      show: true,
      severity: "LOW",
      title: "POD later",
      detail: `${customer} — ${detail}`,
    };
  }
  return {
    show: true,
    severity: "HIGH",
    title: "Missing POD",
    detail: `${customer} — delivered, no proof of delivery on file.`,
  };
}

export function podDeliveryAuditText(input: {
  outcome: PodDeliveryOutcome;
  reason: PodDeliveryReason | "";
  note: string;
}): string {
  if (input.outcome === "photo") return "Photo uploaded";
  const label = labelForPodDeliveryReason(input.reason);
  return input.note ? `${label} — ${input.note}` : label;
}
