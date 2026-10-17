import { getDb } from "./db";
import { formatMoney } from "./format";
import { tmsCustomerInvoiceLines } from "./invoice";
import { listPayItems } from "./pay-items";
import { getLoad } from "./queries";
import { listStops } from "./stops";
import { labelForPodDeliveryReason } from "./pod-delivery";
import type { LoadView } from "./types";

export type InvoiceReadyStatus = "pass" | "warn";

export type InvoiceReadyItem = {
  id: "pod" | "bol" | "lumper" | "detention" | "rate";
  label: string;
  status: InvoiceReadyStatus;
  detail: string;
};

export type InvoiceReadyChecklistModel = {
  items: InvoiceReadyItem[];
};

export type InvoiceReadyInput = {
  hasPod: boolean;
  hasBol: boolean;
  hasLumperReceipt: boolean;
  podOutcome: string;
  podReason: string;
  podNote: string;
  lumperLine: boolean;
  detentionLine: boolean;
  detentionClock: boolean;
  invoiceAmount: number | null;
  rateConAmount: number | null;
};

function money(value: number | null): string {
  return value == null ? "—" : formatMoney(value);
}

function amountsMatch(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}

/** Advisory paperwork check. Nothing here disables Send. No OCR. */
export function buildInvoiceReadyChecklist(input: InvoiceReadyInput): InvoiceReadyChecklistModel {
  const podReason = input.podOutcome === "reason" && input.podReason
    ? labelForPodDeliveryReason(input.podReason)
    : "";
  const podDetail = input.hasPod
    ? "POD photo on the load"
    : podReason
      ? [podReason, input.podNote.trim()].filter(Boolean).join(" — ")
      : "No POD photo and no driver reason";

  const lumper: InvoiceReadyItem = !input.lumperLine
    ? { id: "lumper", label: "Lumper receipt", status: "pass", detail: "No lumper charge on this load" }
    : input.hasLumperReceipt
      ? { id: "lumper", label: "Lumper receipt", status: "pass", detail: "Lumper receipt on the load" }
      : { id: "lumper", label: "Lumper receipt", status: "warn", detail: "Lumper charge has no receipt" };

  const detention: InvoiceReadyItem = !input.detentionLine
    ? { id: "detention", label: "Detention times", status: "pass", detail: "No detention line on this load" }
    : input.detentionClock
      ? { id: "detention", label: "Detention times", status: "pass", detail: "Arrive and depart times are on the clock" }
      : {
          id: "detention",
          label: "Detention times",
          status: "warn",
          detail: "Detention line has no arrive and depart times",
        };

  let rate: InvoiceReadyItem;
  if (input.rateConAmount == null) {
    rate = {
      id: "rate",
      label: "Invoice matches rate con",
      status: "warn",
      detail: "No rate captured from the rate con",
    };
  } else if (input.invoiceAmount == null) {
    rate = {
      id: "rate",
      label: "Invoice matches rate con",
      status: "warn",
      detail: `Rate con ${money(input.rateConAmount)} · no invoice amount yet`,
    };
  } else if (amountsMatch(input.invoiceAmount, input.rateConAmount)) {
    rate = {
      id: "rate",
      label: "Invoice matches rate con",
      status: "pass",
      detail: `${money(input.invoiceAmount)} matches the rate con`,
    };
  } else {
    rate = {
      id: "rate",
      label: "Invoice matches rate con",
      status: "warn",
      detail: `Invoice ${money(input.invoiceAmount)} · rate con ${money(input.rateConAmount)}`,
    };
  }

  return {
    items: [
      {
        id: "pod",
        label: "POD",
        status: input.hasPod || podReason ? "pass" : "warn",
        detail: podDetail,
      },
      {
        id: "bol",
        label: "Signed BOL",
        status: input.hasBol ? "pass" : "warn",
        detail: input.hasBol ? "BOL on the load" : "No BOL on the load",
      },
      lumper,
      detention,
      rate,
    ],
  };
}

function clockBacked(load: LoadView): boolean {
  const started = String(load.detention_started_at ?? "").trim();
  const ended = String(load.detention_ended_at ?? "").trim();
  if (started && ended) return true;
  return listStops(load.id).some((stop) => String(stop.arrived_at ?? "").trim() && String(stop.departed_at ?? "").trim());
}

export function invoiceReadyForLoad(load: LoadView): InvoiceReadyChecklistModel {
  const kinds = new Set(
    (getDb().prepare("SELECT kind FROM attachments WHERE load_id = ?").all(load.id) as Array<{ kind: string }>).map(
      (row) => row.kind,
    ),
  );
  const pay = listPayItems(load.id);
  const lines = tmsCustomerInvoiceLines(load);
  const invoiceAmount = lines.length
    ? Math.round(lines.reduce((sum, line) => sum + (line.amount || 0), 0) * 100) / 100
    : null;
  const captured = load.rate_con_amount != null && !Number.isNaN(load.rate_con_amount)
    ? load.rate_con_amount
    : kinds.has("rate_con") && load.rate != null
      ? load.rate
      : null;
  return buildInvoiceReadyChecklist({
    hasPod: kinds.has("pod"),
    hasBol: kinds.has("bol"),
    hasLumperReceipt: kinds.has("lumper"),
    podOutcome: load.pod_outcome || "",
    podReason: load.pod_reason || "",
    podNote: load.pod_reason_note || "",
    lumperLine: pay.some((item) => item.category === "lumper"),
    detentionLine: pay.some((item) => item.category === "detention"),
    detentionClock: clockBacked(load),
    invoiceAmount,
    rateConAmount: captured,
  });
}

export function invoiceReadyForLoadId(loadId: number): InvoiceReadyChecklistModel | null {
  const load = getLoad(loadId);
  if (!load) return null;
  return invoiceReadyForLoad(load);
}
