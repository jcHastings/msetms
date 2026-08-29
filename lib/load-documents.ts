import { BOL_PAPERWORK_NAME, type BolDraft } from "./bol-shared";
import { bolPrefillForLoad, generateBolPdf } from "./bol";
import { addAttachment, listAttachments } from "./files";
import {
  applyBlindConfirmation,
  buildConfirmationForLoad,
  renderConfirmationPdf,
} from "./load-confirmation";
import {
  DEFAULTED_DOC_DESCRIPTIONS,
  cityStateOnly,
  defaultedFilename,
  isVariantBolName,
  thirdPartyBolDescription,
  type DefaultedDocKey,
  type DefaultedDocumentRow,
} from "./load-documents-shared";
import { buildTmsInvoice, paperworkCompanyName, renderTmsInvoicePdf } from "./invoice";
import { getCompanyProfile } from "./company";
import { getLoad } from "./queries";
import { listStops, type LoadStop } from "./stops";
import type { Attachment, AttachmentKind, LoadView } from "./types";

function stopAddress(stop: LoadStop): string {
  const cityState = [stop.city.trim(), stop.state.trim()].filter(Boolean).join(", ");
  return [stop.street.trim(), cityState, stop.zip.trim()].filter(Boolean).join(", ");
}

function pickupStop(stops: LoadStop[], load: LoadView): { name: string; address: string; phone: string } {
  const pickup = stops.find((stop) => stop.kind === "pickup") ?? stops[0];
  if (!pickup) {
    return { name: load.origin, address: load.origin, phone: "" };
  }
  return { name: pickup.name || load.origin, address: stopAddress(pickup) || load.origin, phone: pickup.phone };
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
  return (
    findNamed(attachments, defaultedFilename(loadNumber, "bol")) ||
    attachments.find((file) => file.kind === "bol" && !isVariantBolName(file.original_name))
  );
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
  const pickup = pickupStop(stops, load);
  const attachedTo = `Load ${load.load_number}`;
  const rows: DefaultedDocumentRow[] = [];

  for (const dest of deliveryStops(stops, load)) {
    const filename = defaultedFilename(load.load_number, "bol_third_party", dest.id || null);
    const found = findNamed(attachments, filename);
    rows.push({
      key: "bol_third_party",
      stopId: dest.id || null,
      title: "3rd Party Bill of lading",
      source: `System Generated ${pickup.name} to ${dest.name || load.destination}`,
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

function blindDraft(draft: BolDraft): BolDraft {
  return {
    ...draft,
    originAddress: cityStateOnly(draft.originAddress),
    originPhone: "",
    destAddress: cityStateOnly(draft.destAddress),
    destPhone: "",
  };
}

function thirdPartyDraft(load: LoadView, dest: LoadStop): BolDraft {
  const base = bolPrefillForLoad(load);
  const pickup = pickupStop(listStops(load.id), load);
  return {
    ...base,
    originName: pickup.name,
    originAddress: pickup.address,
    originPhone: pickup.phone,
    destName: dest.name || load.destination,
    destAddress: stopAddress(dest) || load.destination,
    destPhone: dest.phone,
    freightCharges: "3rd Party",
    thirdParty: BOL_PAPERWORK_NAME,
    items: [
      {
        ...base.items[0],
        description: dest.cargo.trim() || base.items[0]?.description || load.commodity,
      },
    ],
  };
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

  if (key === "bol" || key === "bol_blind" || key === "bol_signatures" || key === "bol_third_party") {
    let draft = bolPrefillForLoad(load);
    if (key === "bol_blind") draft = blindDraft(draft);
    if (key === "bol_third_party") {
      const dest =
        deliveryStops(stops, load).find((stop) => stop.id === stopId) ?? deliveryStops(stops, load)[0];
      if (!dest) throw new Error("This load needs a delivery stop for a 3rd party BOL.");
      draft = thirdPartyDraft(load, dest);
    }
    const extraStops =
      key === "bol_signatures"
        ? (stops.length
            ? stops.map((stop) => ({
                name: stop.name,
                kind: stop.kind,
                city: stop.city,
                state: stop.state,
              }))
            : [
                { name: load.origin, kind: "pickup", city: "", state: "" },
                { name: load.destination, kind: "delivery", city: "", state: "" },
              ])
        : [];
    const { buffer } = await generateBolPdf(loadId, draft, {
      persistDraft: false,
      keepAllPages: key === "bol_signatures",
      extraStops,
      filename,
    });
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
