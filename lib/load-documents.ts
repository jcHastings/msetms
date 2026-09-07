import { buildAscendBolModel, renderAscendBolPdf, type AscendBolVariant } from "./bol-ascend";
import { addAttachment, listAttachments } from "./files";
import {
  applyBlindConfirmation,
  buildConfirmationForLoad,
  renderConfirmationPdf,
} from "./load-confirmation";
import {
  DEFAULTED_DOC_DESCRIPTIONS,
  defaultedFilename,
  thirdPartyBolDescription,
  type DefaultedDocKey,
  type DefaultedDocumentRow,
} from "./load-documents-shared";
import { buildTmsInvoice, paperworkCompanyName, renderTmsInvoicePdf } from "./invoice";
import { getCompanyProfile } from "./company";
import { getLoad } from "./queries";
import { listStops, type LoadStop } from "./stops";
import type { Attachment, AttachmentKind, LoadView } from "./types";

function pickupName(stops: LoadStop[], load: LoadView): string {
  const pickup = stops.find((stop) => stop.kind === "pickup") ?? stops[0];
  return pickup?.name || load.origin;
}

function deliveryStops(stops: LoadStop[], load: LoadView): LoadStop[] {
  const deliveries = stops.filter((stop) => stop.kind === "delivery");
  if (deliveries.length) return deliveries;
  return [
    {
      id: 0,
      load_id: load.id,
      sequence: 2,
      kind: "delivery",
      location_id: load.consignee_location_id,
      name: load.destination,
      street: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      window_start: load.delivery_start,
      window_end: load.delivery_end,
      confirmation: "",
      cargo: load.commodity,
      reference: "",
      instructions: "",
      notes: "",
      arrived_at: "",
      departed_at: "",
      delivered: 0,
      schedule_type: "",
    },
  ];
}

function findNamed(attachments: Attachment[], filename: string): Attachment | undefined {
  return attachments.find((file) => file.original_name === filename);
}

function matchStandardBol(attachments: Attachment[], loadNumber: string): Attachment | undefined {
  return findNamed(attachments, defaultedFilename(loadNumber, "bol"));
}

function matchDraftInvoice(attachments: Attachment[], loadNumber: string): Attachment | undefined {
  return (
    findNamed(attachments, defaultedFilename(loadNumber, "draft_invoice")) ||
    attachments.find((file) => file.kind === "invoice")
  );
}

function storePdf(loadId: number, kind: AttachmentKind, filename: string, buffer: Buffer): Attachment {
  return addAttachment({
    loadId,
    kind,
    originalName: filename,
    buffer,
    mimeType: "application/pdf",
    uploadedBy: "system",
  });
}

function carrierLabel(load: LoadView): string {
  return paperworkCompanyName(getCompanyProfile().company_name);
}

export function listDefaultedDocuments(loadId: number): DefaultedDocumentRow[] {
  const load = getLoad(loadId);
  if (!load) return [];
  const attachments = listAttachments(loadId);
  const stops = listStops(loadId);
  const pickup = pickupName(stops, load);
  const attachedTo = `Load ${load.load_number}`;
  const rows: DefaultedDocumentRow[] = [];

  for (const dest of deliveryStops(stops, load)) {
    const filename = defaultedFilename(load.load_number, "bol_third_party", dest.id || null);
    const found = findNamed(attachments, filename);
    rows.push({
      key: "bol_third_party",
      stopId: dest.id || null,
      title: "3rd Party Bill of lading",
      source: `System Generated ${pickup} to ${dest.name || load.destination}`,
      description: thirdPartyBolDescription(),
      attachedTo,
      status: found ? "generated" : "ready",
      attachmentId: found?.id ?? null,
      createdAt: found?.created_at ?? null,
      filename,
    });
  }

  const standard: Array<{
    key: Exclude<DefaultedDocKey, "bol_third_party">;
    title: string;
    source: string;
    match: Attachment | undefined;
  }> = [
    {
      key: "bol",
      title: "Bill of lading",
      source: "System Generated",
      match: matchStandardBol(attachments, load.load_number),
    },
    {
      key: "bol_signatures",
      title: "Bill of lading w/signatures per stop",
      source: "System Generated",
      match: findNamed(attachments, defaultedFilename(load.load_number, "bol_signatures")),
    },
    {
      key: "bol_blind",
      title: "Blind bill of lading",
      source: "System Generated",
      match: findNamed(attachments, defaultedFilename(load.load_number, "bol_blind")),
    },
    {
      key: "carrier_confirmation_blind",
      title: "Blind carrier confirmation",
      source: `Generated for ${carrierLabel(load)}`,
      match: findNamed(attachments, defaultedFilename(load.load_number, "carrier_confirmation_blind")),
    },
    {
      key: "carrier_confirmation",
      title: "Carrier confirmation",
      source: `Generated for ${carrierLabel(load)}`,
      match: findNamed(attachments, defaultedFilename(load.load_number, "carrier_confirmation")),
    },
    {
      key: "customer_confirmation",
      title: "Customer confirmation",
      source: `Generated for ${load.customer_name || "customer"}`,
      match: findNamed(attachments, defaultedFilename(load.load_number, "customer_confirmation")),
    },
    {
      key: "draft_invoice",
      title: "Draft Invoice",
      source: `Generated for ${load.customer_name || "customer"}`,
      match: matchDraftInvoice(attachments, load.load_number),
    },
  ];

  for (const item of standard) {
    const filename = item.match?.original_name || defaultedFilename(load.load_number, item.key);
    rows.push({
      key: item.key,
      stopId: null,
      title: item.title,
      source: item.source,
      description: DEFAULTED_DOC_DESCRIPTIONS[item.key],
      attachedTo,
      status: item.match ? "generated" : "ready",
      attachmentId: item.match?.id ?? null,
      createdAt: item.match?.created_at ?? null,
      filename,
    });
  }
  return rows;
}

function bolVariantForKey(key: DefaultedDocKey): AscendBolVariant | null {
  if (key === "bol") return "master";
  if (key === "bol_blind") return "blind";
  if (key === "bol_signatures") return "signatures";
  if (key === "bol_third_party") return "third_party";
  return null;
}

export async function generateDefaultedDocument(
  loadId: number,
  key: DefaultedDocKey,
  stopId?: number | null,
): Promise<Attachment> {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  const existing = listDefaultedDocuments(loadId).find(
    (row) => row.key === key && (key !== "bol_third_party" || row.stopId === (stopId ?? null)),
  );
  if (existing?.attachmentId) {
    const found = listAttachments(loadId).find((file) => file.id === existing.attachmentId);
    if (found) return found;
  }

  const filename = defaultedFilename(load.load_number, key, stopId ?? null);
  const stops = listStops(loadId);

  const variant = bolVariantForKey(key);
  if (variant) {
    if (variant === "third_party") {
      const dest =
        deliveryStops(stops, load).find((stop) => stop.id === stopId) ?? deliveryStops(stops, load)[0];
      if (!dest) throw new Error("This load needs a delivery stop for a 3rd party BOL.");
    }
    const model = buildAscendBolModel(loadId, variant, stopId ?? null);
    const buffer = await renderAscendBolPdf(model);
    return storePdf(loadId, "bol", filename, buffer);
  }

  if (key === "customer_confirmation") {
    const model = buildConfirmationForLoad(loadId, { packet: "customer" });
    const buffer = await renderConfirmationPdf(model);
    return storePdf(loadId, "other", filename, buffer);
  }

  if (key === "carrier_confirmation" || key === "carrier_confirmation_blind") {
    const model = buildConfirmationForLoad(loadId, { packet: "internal" });
    const buffer = await renderConfirmationPdf(
      key === "carrier_confirmation_blind" ? applyBlindConfirmation(model) : model,
    );
    return storePdf(loadId, "other", filename, buffer);
  }

  const model = buildTmsInvoice(load, { allowDraft: true });
  const buffer = await renderTmsInvoicePdf(model);
  return storePdf(loadId, "invoice", filename, buffer);
}

export async function generateMissingDefaultedDocuments(loadId: number): Promise<DefaultedDocumentRow[]> {
  const rows = listDefaultedDocuments(loadId);
  for (const row of rows) {
    if (row.attachmentId) continue;
    await generateDefaultedDocument(loadId, row.key, row.stopId);
  }
  return listDefaultedDocuments(loadId);
}
