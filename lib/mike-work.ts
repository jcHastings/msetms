import { recordLoadAudit } from "./audit";
import { isDriverUploadKind, UNCLASSIFIED_UPLOAD_KIND } from "./driver-docs";
import { listAttachments, updateAttachmentKind } from "./files";
import { formatLoadSummary } from "./load-summary";
import { placeholderLane } from "./load-page-shared";
import { MIKE_MISSING_KEY_MESSAGE, type MikeProposal, type MikeProposalKind } from "./mike-shared";
import { createLoad, getLoad, listCustomers, listLoads, updateLoadStatus } from "./queries";
import { formatRelayLane } from "./relays";
import { relayForDriver } from "./relay-store";
import { isLoadStatus, type AttachmentKind } from "./types";

const STATUS_WORDS: Record<string, string> = {
  available: "available",
  assigned: "assigned",
  dispatched: "dispatched",
  "in transit": "in_transit",
  transit: "in_transit",
  delivered: "delivered",
  hold: "hold",
};

export function proposeMikeWork(question: string): { reply: string; proposals: MikeProposal[] } {
  const q = question.trim();
  if (!q) return { reply: "", proposals: [] };
  const load = findLoadFromText(q);
  const proposals: MikeProposal[] = [];
  const lower = q.toLowerCase();

  if (/detention/.test(lower) && load) {
    const subject = `Detention request — ${load.load_number}`;
    const body = `Please confirm detention on ${load.load_number} for ${load.customer_name}.\n${load.origin} → ${load.destination}\n`;
    proposals.push(
      makeProposal("detention_email", "Draft detention email", body, {
        load_id: String(load.id),
        to: load.contact_email || "",
        subject,
        body,
      }),
    );
  }

  if (/(classif|intake|dropped|document|receipt|bol|pod|scale)/.test(lower) && load) {
    const file =
      listAttachments(load.id).find((item) => item.kind === UNCLASSIFIED_UPLOAD_KIND) ??
      listAttachments(load.id)[0];
    if (file) {
      const kind = guessDocKind(lower);
      proposals.push(
        makeProposal(
          "classify_document",
          `Classify ${file.original_name}`,
          `${labelKind(kind)} on ${load.load_number}`,
          { attachment_id: String(file.id), kind, load_id: String(load.id) },
        ),
      );
    }
  }

  if (/(status|mark|update).*(delivered|transit|dispatched|hold|assigned)|set status/.test(lower) && load) {
    const status = guessStatus(lower) || load.status;
    proposals.push(
      makeProposal("status_update", `Set ${load.load_number} to ${status}`, `Current: ${load.status}`, {
        load_id: String(load.id),
        status,
      }),
    );
  }

  if (/(rate.?con|start a load|new load|book this|create a load)/.test(lower)) {
    proposals.push(
      makeProposal(
        "start_ratecon",
        "Start a load",
        load
          ? `Open ${load.load_number} or drop a rate con on New load.`
          : "Drop the forwarded rate con on New load, then save.",
        {
          load_id: load ? String(load.id) : "",
          customer_name: extractAfter(q, /customer\s+/i),
          origin: extractLane(q)?.origin ?? "",
          destination: extractLane(q)?.destination ?? "",
          href: load ? `/loads/${load.id}` : "/loads/new",
        },
      ),
    );
  }

  if (/(invoice|compliance|flag|missing pod|late|exception)/.test(lower) && load) {
    proposals.push(
      makeProposal(
        "flag_issue",
        `Flag ${load.load_number}`,
        q.slice(0, 240),
        { load_id: String(load.id), note: q.slice(0, 400) },
      ),
    );
  }

  if (/(text|whatsapp|message|tell the driver|notify)/.test(lower) && load) {
    const yours = load.driver_id ? relayForDriver(load.id, load.driver_id) : null;
    const preview =
      extractQuoted(q) ||
      formatLoadSummary({
        ...load,
        your_leg: yours ? formatRelayLane(yours.pickup, yours.delivery) : "",
      });
    proposals.push(
      makeProposal("driver_message", `Draft driver message for ${load.load_number}`, preview, {
        load_id: String(load.id),
        body: preview,
      }),
    );
  }

  const reply = proposals.length
    ? "I drafted work. Confirm before anything sends."
    : "";
  return { reply, proposals };
}

export function applyMikeProposal(payload: Record<string, string>, kind: MikeProposalKind): {
  message: string;
  href?: string;
  mailto?: string;
} {
  if (kind === "detention_email") {
    const to = payload.to?.trim();
    const subject = payload.subject || "Detention request";
    const body = payload.body || "";
    const mailto = to
      ? `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : "";
    return {
      message: to ? "Draft ready. Confirm opens your mail." : "Add a customer email on the load first.",
      mailto,
    };
  }
  if (kind === "classify_document") {
    const id = Number(payload.attachment_id);
    const nextKind = payload.kind;
    if (!id || !isDriverUploadKind(nextKind)) throw new Error("Pick Receipt, Scale Ticket, BOL, or Proof of Delivery.");
    updateAttachmentKind(id, nextKind as AttachmentKind);
    return { message: "Document typed." };
  }
  if (kind === "status_update") {
    const loadId = Number(payload.load_id);
    const status = payload.status;
    if (!loadId || !isLoadStatus(status)) throw new Error("Pick a status.");
    updateLoadStatus(loadId, status);
    return { message: "Status updated.", href: `/loads/${loadId}` };
  }
  if (kind === "start_ratecon") {
    const customerName = (payload.customer_name || "").trim();
    const customer = listCustomers().find(
      (item) => customerName && item.name.toLowerCase() === customerName.toLowerCase(),
    );
    if (customer) {
      const lane = placeholderLane();
      const id = createLoad({
        customer_id: customer.id,
        origin: payload.origin.trim() || lane.origin,
        destination: payload.destination.trim() || lane.destination,
        pickup_start: lane.pickup_start,
        pickup_end: lane.pickup_end,
        delivery_start: lane.delivery_start,
        delivery_end: lane.delivery_end,
        weight: null,
        commodity: "",
        rate: null,
        notes: "",
        special_instructions: "",
        appointment_notes: "",
        reference_number: "",
        po_number: "",
        reefer_setpoint_f: null,
        trailer_number: "",
        status: "available",
        truck_id: null,
        driver_id: null,
      });
      return { message: "Load started. Review it before dispatch.", href: `/loads/${id}` };
    }
    return { message: "Drop the rate con or load email on New load.", href: payload.href || "/loads/new" };
  }
  if (kind === "flag_issue") {
    const loadId = Number(payload.load_id);
    if (!loadId) throw new Error("Load is missing.");
    recordLoadAudit({
      loadId,
      action: "note",
      field: "mike_flag",
      newValue: payload.note || "Flagged",
    });
    return { message: "Flagged on the load log.", href: `/loads/${loadId}` };
  }
  if (kind === "driver_message") {
    return { message: "Draft ready. Confirm sends the text." };
  }
  throw new Error("Unknown Mike action.");
}

export function mikeWorkReply(configured: boolean, llmReply: string, workReply: string): string {
  const parts = [configured ? llmReply : MIKE_MISSING_KEY_MESSAGE, workReply].filter(Boolean);
  return [...new Set(parts)].join("\n\n");
}

function makeProposal(
  kind: MikeProposalKind,
  title: string,
  preview: string,
  payload: Record<string, string>,
): MikeProposal {
  return {
    id: `${kind}-${payload.load_id || payload.attachment_id || "x"}`,
    kind,
    title,
    preview: preview.slice(0, 800),
    payload,
  };
}

function findLoadFromText(text: string) {
  const loads = listLoads({ status: "all" });
  const byFull = loads.find((load) => load.load_number && text.includes(load.load_number));
  if (byFull) return getLoad(byFull.id);
  const numbers = [...text.matchAll(/\b(\d{4,8})\b/g)].map((item) => item[1]);
  for (const number of numbers) {
    const hit = loads.find((load) => load.load_number === number);
    if (hit) return getLoad(hit.id);
  }
  return null;
}

function guessDocKind(lower: string): string {
  if (/scale/.test(lower)) return "scale_ticket";
  if (/\bbol\b|bill of lading/.test(lower)) return "bol";
  if (/pod|proof of delivery/.test(lower)) return "pod";
  if (/receipt|fuel/.test(lower)) return "fuel_receipt";
  return "pod";
}

function labelKind(kind: string): string {
  if (kind === "scale_ticket") return "Scale Ticket";
  if (kind === "bol") return "BOL";
  if (kind === "pod") return "Proof of Delivery";
  if (kind === "fuel_receipt") return "Receipt";
  return kind;
}

function guessStatus(lower: string): string {
  for (const [word, status] of Object.entries(STATUS_WORDS)) {
    if (lower.includes(word)) return status;
  }
  return "";
}

function extractQuoted(text: string): string {
  const match = text.match(/[“"]([^”"]{3,400})[”"]/);
  return match?.[1]?.trim() ?? "";
}

function extractAfter(text: string, pattern: RegExp): string {
  const match = text.match(new RegExp(`${pattern.source}([A-Za-z0-9 .&'-]{2,40})`, "i"));
  return match?.[1]?.trim() ?? "";
}

function extractLane(text: string): { origin: string; destination: string } | null {
  const match = text.match(/([A-Za-z .'-]+,\s*[A-Z]{2})\s*(?:→|->|to)\s*([A-Za-z .'-]+,\s*[A-Z]{2})/i);
  if (!match) return null;
  return { origin: match[1].trim(), destination: match[2].trim() };
}
