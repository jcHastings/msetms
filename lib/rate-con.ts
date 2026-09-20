import { extractText } from "unpdf";
import { fromInputDateTime, toInputDateTime } from "./format";
import {
  cityStateFromStop,
  emptyParsedRateCon,
  emptyParsedStop,
  isOwnPaperworkName,
  matchCustomerName,
  parseAddressBlob,
  parseBrokerContactFromText,
  parsedStopHasDetails,
  parseLetterheadLoadNumber,
  pickBrokerCustomerName,
  resolveRateConOrigin,
  type ParsedExtraStop,
  type ParsedRateCon,
  type ParsedStop,
} from "./rate-con-shared";
import { enrichParsedRateConFromText, stripLegalBoilerplate } from "./rate-con-paperwork";
import { parseReeferModeFromText, parseReeferSetpointFromText } from "./reefer-shared";
import type { Customer } from "./types";

export {
  attachParsedLocationMatches,
  emptyParsedRateCon,
  emptyParsedStop,
  parseAddressBlob,
  type ParsedExtraStop,
  type ParsedRateCon,
  type ParsedStop,
} from "./rate-con-shared";

export function looksLikeEmailUpload(filename: string, mimeType = ""): boolean {
  const name = filename.toLowerCase();
  const mime = mimeType.toLowerCase();
  return (
    mime.includes("message") ||
    mime.includes("rfc822") ||
    mime.includes("text/plain") ||
    /\.(eml|msg|txt)$/i.test(name)
  );
}

export function extractEmailBody(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n");
  if (/^(from|to|subject|date|mime-version):/im.test(text)) {
    const split = text.search(/\n\n/);
    if (split > 0) text = text.slice(split + 2);
  }
  text = text.replace(/=\n/g, "");
  text = text.replace(/<[^>]+>/g, " ");
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractDocumentText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const isPdf = mimeType.includes("pdf") || filename.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const result = await extractText(new Uint8Array(buffer), { mergePages: true });
    return String(result.text ?? "").trim();
  }

  if (looksLikeEmailUpload(filename, mimeType)) {
    return extractEmailBody(buffer.toString("utf8"));
  }

  const isImage = mimeType.startsWith("image/") || /\.(png|jpe?g|webp|heic)$/i.test(filename);
  if (isImage) {
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const recognized = await worker.recognize(buffer);
      await worker.terminate();
      return recognized.data.text.trim();
    } catch (error) {
      throw new Error(
        `Could not OCR that image (${error instanceof Error ? error.message : "unknown error"}). Try a text PDF.`,
      );
    }
  }

  throw new Error("Upload a PDF, image, or forwarded load email.");
}

export function textLooksLikeFilenameOnly(text: string, filename = ""): boolean {
  const compact = text.replace(/\s+/g, "").toLowerCase();
  if (!compact) return true;
  if (!filename) return false;
  const stem = filename.replace(/\.[^.]+$/, "").toLowerCase();
  const full = filename.toLowerCase();
  const collapsed = (value: string) => value.replace(/[^a-z0-9]/g, "");
  return compact === collapsed(stem) || compact === collapsed(full) || compact === full || compact === stem;
}

export function sanitizeParsedRateCon(parsed: ParsedRateCon, filename = ""): ParsedRateCon {
  const next = { ...parsed };
  if (textLooksLikeFilenameOnly(next.raw_text, filename)) {
    return { ...emptyParsedRateCon(), raw_text: next.raw_text };
  }
  const filenameDigits = [...filename.matchAll(/(\d{4,8})/g)].map((item) => item[1]);
  const bodyHasLbsWeight =
    next.weight != null &&
    new RegExp(`(?:weight\\b[\\s\\S]{0,40})?${next.weight}\\s*(?:lbs?|pounds)\\b`, "i").test(next.raw_text);
  if (next.weight != null && filenameDigits.includes(String(next.weight)) && !bodyHasLbsWeight) {
    next.weight = null;
  }
  if (
    next.weight != null &&
    next.load_number_hint &&
    String(next.weight) === next.load_number_hint &&
    !bodyHasLbsWeight
  ) {
    next.weight = null;
  }
  return next;
}

export function parseRateConText(rawText: string, customers: Customer[] = [], filename = ""): ParsedRateCon {
  const text = rawText.replace(/\r/g, "");
  if (textLooksLikeFilenameOnly(text, filename)) {
    return { ...emptyParsedRateCon(), raw_text: text };
  }
  const ascend = parseAscendConfirmation(text);
  const printed = parsePrintedConfirmation(text);
  const customerName = pickBrokerCustomerName(text, [
    labeled(text, ["customer", "bill to", "account"]) || "",
    ascend.customer_name,
    printed.customer_name,
  ]);
  const matched = matchCustomerName(customerName, customers, text);

  const special = stripLegalBoilerplate(
    section(text, /special instructions?/i) ||
      section(text, /dispatch notes/i) ||
      ascend.special_instructions ||
      printed.special_instructions ||
      "",
  );
  const appointment =
    labeled(text, ["appointment"]) ||
    printed.appointment_notes ||
    linesMatching(special, /appointment|call \d+ minutes/i).join("\n");
  const pickup = parseWindow(text, "pickup");
  const delivery = parseWindow(text, "delivery");
  const brokerContact = parseBrokerContactFromText(text);

  const shipper = parsedStopHasDetails(ascend.shipper)
    ? ascend.shipper
    : parsedStopHasDetails(printed.shipper)
      ? printed.shipper
      : emptyParsedStop();
  const consignee = parsedStopHasDetails(ascend.consignee)
    ? ascend.consignee
    : parsedStopHasDetails(printed.consignee)
      ? printed.consignee
      : emptyParsedStop();

  const parsed = enrichParsedRateConFromText(
    sanitizeParsedRateCon(
    {
      customer_name: customerName,
      customer_id: matched,
      origin:
        labeled(text, ["origin", "pickup location", "ship from"]) ||
        ascend.origin ||
        printed.origin ||
        cityStateFromStop(shipper) ||
        "",
      destination:
        labeled(text, ["destination", "delivery location", "ship to", "consignee city"]) ||
        ascend.destination ||
        printed.destination ||
        cityStateFromStop(consignee) ||
        "",
      pickup_start: pickup.start || ascend.pickup_start || printed.pickup_start || "",
      pickup_end: pickup.end || ascend.pickup_end || printed.pickup_end || "",
      delivery_start: delivery.start || ascend.delivery_start || printed.delivery_start || "",
      delivery_end: delivery.end || ascend.delivery_end || printed.delivery_end || "",
      rate: parseConfirmationRate(text),
      commodity: labeled(text, ["commodity", "product", "description"]) || ascend.commodity || printed.commodity || "",
      weight: parseWeight(labeled(text, ["weight"]) ?? "") ?? ascend.weight ?? printed.weight,
      reference_number:
        ascend.load_number ||
        printed.load_number ||
        labeled(text, ["ref #", "ref#", "rate con"]) ||
        parseLetterheadLoadNumber(text) ||
        "",
      po_number:
        labeled(text, ["po #", "po#", "po number", "purchase order"]) || printed.po_number || "",
      special_instructions: special,
      appointment_notes: appointment,
      reefer_setpoint_f: parseReeferSetpointFromText(text),
      reefer_mode: parseReeferModeFromText(text) ?? "",
      load_number_hint:
        labeled(text, ["load #", "load#", "load number"]) ||
        parseLetterheadLoadNumber(text) ||
        ascend.load_number ||
        printed.load_number ||
        "",
      raw_text: text,
      shipper,
      consignee,
      extra_stops: dedupeExtraStops([...ascend.extra_stops, ...printed.extra_stops]),
      shipper_location_id: null,
      consignee_location_id: null,
      contact_name: brokerContact.contact_name,
      contact_email: brokerContact.contact_email,
      contact_phone: brokerContact.contact_phone,
      contact_ext: brokerContact.contact_ext,
      equipment: "",
      field_flags: [],
      reader: "hint",
    },
    filename,
    ),
    text,
  );
  return {
    ...parsed,
    origin: resolveRateConOrigin(parsed.origin, parsed.shipper, text),
  };
}

function parseAscendConfirmation(text: string): {
  customer_name: string;
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  rate: number | null;
  commodity: string;
  weight: number | null;
  load_number: string;
  special_instructions: string;
  shipper: ParsedStop;
  consignee: ParsedStop;
  extra_stops: ParsedExtraStop[];
} {
  const empty = {
    customer_name: "",
    origin: "",
    destination: "",
    pickup_start: "",
    pickup_end: "",
    delivery_start: "",
    delivery_end: "",
    rate: null as number | null,
    commodity: "",
    weight: null as number | null,
    load_number: "",
    special_instructions: "",
    shipper: emptyParsedStop(),
    consignee: emptyParsedStop(),
    extra_stops: [] as ParsedExtraStop[],
  };
  const looksAscend =
    /load confirmation/i.test(text) ||
    /ascendtms/i.test(text) ||
    /stops\s*\/\s*actions/i.test(text) ||
    /pay items/i.test(text);
  if (!looksAscend) return empty;

  const loadNumber =
    text.match(/load\s*#\s*[:#]?\s*(\d{3,8})\b/i)?.[1] ??
    text.match(/load\s*#\s*[:#]?\s*\n\s*(\d{3,8})\b/i)?.[1] ??
    "";

  const actions = parseAscendActionStops(text);
  const pickupAction = actions.find((item) => item.kind === "pickup");
  const deliveryAction = actions.find((item) => item.kind === "delivery");
  const pickup = pickupAction
    ? stopParseFromAction(pickupAction)
    : firstStop(
        parseAscendStop(text, "pickup"),
        parseStopLine(text, /pick(?:up)?\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+)/i),
        parseStopBlock(text, /pick(?:\s*up)?(?:\s+date)?/i),
      );
  const delivery = deliveryAction
    ? stopParseFromAction(deliveryAction)
    : firstStop(
        parseAscendStop(text, "delivery"),
        parseStopLine(text, /deliv(?:ery)?\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+)/i),
        parseStopBlock(text, /deliv(?:ery)?(?:\s+date)?/i),
      );

  const equipment = [
    fieldAfterLabel(text, ["equipment"])?.replace(/equipment length/i, "").trim(),
    fieldAfterLabel(text, ["equipment length"]),
  ]
    .filter(Boolean)
    .join(", ");

  return {
    customer_name: parseAscendCustomer(text),
    origin: cityStateFromStop(pickup.stop) || cityStateFromAddress(pickup.address),
    destination: cityStateFromStop(delivery.stop) || cityStateFromAddress(delivery.address),
    pickup_start: pickup.start,
    pickup_end: pickup.end,
    delivery_start: delivery.start,
    delivery_end: delivery.end,
    rate: parseAscendRate(text),
    commodity: (fieldAfterLabel(text, ["commodity"]) || "").replace(/\s+/g, " "),
    weight: parseAscendWeight(text, loadNumber),
    load_number: loadNumber,
    special_instructions: parseAscendInstructions(text, equipment),
    shipper: pickup.stop,
    consignee: delivery.stop,
    extra_stops: actions.length
      ? actions
          .filter((item) => item !== pickupAction && item !== deliveryAction)
          .map((item) => ({ kind: item.kind, stop: item.stop }))
      : parseAscendExtraStops(text, pickup.stop, delivery.stop),
  };
}

function fieldAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const same = text.match(new RegExp(`${escaped}\\s*[:#]?\\s+([^\\n]+)$`, "im"));
    if (same?.[1] && !/^(date|time|length|weight|commodity|equipment)\b/i.test(same[1].trim())) {
      return clean(same[1]);
    }
    const next = text.match(new RegExp(`${escaped}\\s*[:#]?\\s*\\n\\s*([^\\n]+)$`, "im"));
    if (next?.[1] && !/^(date|time|#|action|location|contact)$/i.test(next[1].trim())) {
      return clean(next[1]);
    }
  }
  return null;
}

function parseAscendWeight(text: string, loadNumber: string): number | null {
  const patterns = [
    /weight\s*[:#]?\s*([\d,]+)\s*(?:lbs?|pounds)\b/i,
    /weight\s*[:#]?\s*\n\s*([\d,]+)\s*(?:lbs?|pounds)\b/i,
    /weight\s*[:#]?\s*\n\s*([\d,]+)\s*\n\s*(?:lbs?|pounds)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number.parseInt(match[1].replace(/,/g, ""), 10);
    if (!Number.isFinite(value)) continue;
    if (loadNumber && String(value) === loadNumber) continue;
    if (value < 500 || value > 90000) continue;
    return value;
  }
  return null;
}

function parseAscendCustomer(text: string): string {
  const block = captureBlockRaw(
    text,
    /(?:^|\n)\s*customer(?:\s+information)?\s*(?:\n|:)/i,
    /primary\s+contact|stops\s*\/\s*actions|notes and references|pay items|ship from|ship to|pickup|delivery|carrier\b|bill of lading/i,
  );
  const lines = block
    .split(/\n/)
    .map((line) => clean(line))
    .filter(Boolean)
    .filter((line) => !/^(information|customer information|primary contact|phone|fax|email|tel)$/i.test(line));
  for (const line of lines) {
    if (isOwnPaperworkName(line, text)) continue;
    if (/^\d/.test(line)) continue;
    if (/^(or|and|the|note|not|this|responsibility)\b/i.test(line)) continue;
    if (/^[A-Za-z .'-]+,\s*[A-Z]{2}\b/.test(line)) continue;
    if (line.length < 3 || line.length > 80) continue;
    return line;
  }
  return "";
}

function parseAscendRate(text: string): number | null {
  return parseConfirmationRate(text);
}

/** Freight $ from a rate con — not qty 1, not fuel-per-mile, not a load number. */
function parseConfirmationRate(text: string): number | null {
  const patterns = [
    /pay items[\s\S]{0,1200}(?:^|\n)\s*total\s*\$?\s*([0-9][0-9, ]*(?:\.\d{1,2})?)/im,
    /(?:agreed\s+amount|customer\s+rate|all[\s-]?in)\s*[:#]?\s*\$?\s*([0-9][0-9, ]*(?:\.\d{1,2})?)/i,
    /flat\s*rate[\s\S]{0,160}\$\s*([0-9][0-9, ]*(?:\.\d{1,2})?)/i,
    /(?:^|\n)\s*(?:rate|line\s*haul|total\s+pay)\s*[:#/]?\s*\$\s*([0-9][0-9, ]*(?:\.\d{1,2})?)/im,
    /\$\s*([0-9][0-9, ]*(?:\.\d{1,2})?)\s*(?:\/\s*)?flat\s*rate/i,
    /(?:^|\n)\s*(?:rate|line\s*haul|total\s+pay)\s*[:#/]\s*([0-9][0-9, ]*(?:\.\d{1,2})?)/im,
  ];
  for (const pattern of patterns) {
    const value = freightFromCapture(text, pattern);
    if (value != null) return value;
  }
  return parseFreightMoney(
    labeled(text, ["agreed amount", "customer rate", "total pay", "linehaul", "flat rate", "rate"]) ?? "",
  );
}

function freightFromCapture(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match?.[1]) return null;
  return parseFreightMoney(match[1]);
}

function parseFreightMoney(value: string): number | null {
  const amount = parseMoney(value);
  if (amount == null || amount < 50 || amount > 50000) return null;
  return amount;
}

function dedupeExtraStops(stops: ParsedExtraStop[]): ParsedExtraStop[] {
  const seen = new Set<string>();
  const extras: ParsedExtraStop[] = [];
  for (const extra of stops) {
    if (!parsedStopHasDetails(extra.stop)) continue;
    const key = `${extra.kind}:${stopKey(extra.stop)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push(extra);
  }
  return extras;
}

function stopKey(stop: ParsedStop): string {
  return [stop.name, stop.street, stop.city, stop.state, stop.zip]
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join("|");
}

function isUsefulExtraStop(stop: ParsedStop, shipper: ParsedStop, consignee: ParsedStop, seen: Set<string>): boolean {
  if (!parsedStopHasDetails(stop) || !(stop.street.trim() || stop.city.trim())) return false;
  const key = stopKey(stop);
  if (!key || seen.has(key)) return false;
  const name = stop.name.trim().toLowerCase();
  if (name && (name === shipper.name.trim().toLowerCase() || name === consignee.name.trim().toLowerCase())) {
    return false;
  }
  return true;
}

type ActionStop = { kind: "pickup" | "delivery"; date: string; stop: ParsedStop };

function stopParseFromAction(action: ActionStop): StopParse {
  return {
    start: toIso(action.date, "08:00"),
    end: toIso(action.date, "17:00"),
    address: [action.stop.name, action.stop.street, cityStateFromStop(action.stop)].filter(Boolean).join(", "),
    stop: action.stop,
  };
}

const ACTION_LINE =
  /^\s*(?:\d+\s+)?(pick(?:\s*up)?|pickup|delivery|deliver|drop)\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})(?:\s+\d{1,2}:\d{2}\s*(?:am|pm)?)?\s*(.*)$/i;

function parseAscendActionStops(text: string): ActionStop[] {
  const sectionMatch = text.match(/stops\s*\/\s*actions([\s\S]*?)(?=\n\s*pay items\b|\n\s*terms of load|$)/i);
  const section = sectionMatch?.[1] ?? text;
  const lined = parseLinedActionStops(section);
  if (lined.length) return lined;
  return parseStackedActionStops(section === text ? text : section);
}

function parseLinedActionStops(text: string): ActionStop[] {
  const lines = text.split(/\n/);
  const stops: ActionStop[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index].match(ACTION_LINE);
    if (!header) continue;
    const body = [header[3] ?? ""];
    let cursor = index + 1;
    while (cursor < lines.length) {
      if (ACTION_LINE.test(lines[cursor])) break;
      if (/^\s*(?:pay items|terms of load)\b/i.test(lines[cursor])) break;
      body.push(lines[cursor]);
      cursor += 1;
    }
    const stop = parseAddressBlob(body.join("\n"));
    if (parsedStopHasDetails(stop) && (stop.street.trim() || stop.city.trim() || stop.name.trim())) {
      stops.push({
        kind: /deliver|drop/i.test(header[1]) ? "delivery" : "pickup",
        date: header[2],
        stop,
      });
    }
    index = cursor - 1;
  }
  return stops;
}

function parseStackedActionStops(text: string): ActionStop[] {
  const matches = [
    ...text.matchAll(
      /(?:^|\n)\s*(?:\d+\s*\n\s*)?(pickup|pick\s*up|delivery|deliver|drop)\s*\n\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s*\n([\s\S]{0,400}?)(?=\n\s*(?:\d+\s*\n\s*)?(?:delivery|deliver|drop|pickup|pick\s*up|pay items|terms of load)|$)/gi,
    ),
  ];
  return matches.flatMap((match) => {
    const stop = parseAddressBlob(match[3] ?? "");
    if (!parsedStopHasDetails(stop)) return [];
    return [
      {
        kind: /deliver|drop/i.test(match[1]) ? "delivery" : "pickup",
        date: match[2],
        stop,
      } satisfies ActionStop,
    ];
  });
}

function parseAscendExtraStops(text: string, shipper: ParsedStop, consignee: ParsedStop): ParsedExtraStop[] {
  const seen = new Set([stopKey(shipper), stopKey(consignee)].filter(Boolean));
  const extras: ParsedExtraStop[] = [];
  for (const action of parseAscendActionStops(text)) {
    if (!isUsefulExtraStop(action.stop, shipper, consignee, seen)) continue;
    seen.add(stopKey(action.stop));
    extras.push({ kind: action.kind, stop: action.stop });
  }
  return extras;
}

function parsePrintedExtraStops(text: string, shipper: ParsedStop, consignee: ParsedStop): ParsedExtraStop[] {
  const seen = new Set([stopKey(shipper), stopKey(consignee)].filter(Boolean));
  const extras: ParsedExtraStop[] = [];
  for (let n = 2; n <= 6; n += 1) {
    const shipperBlock = captureBlockRaw(
      text,
      new RegExp(`shipper\\s*${n}\\b`, "i"),
      /shipper\s*\d|consignee\s*\d|dispatch notes|carrier pay|page \d/i,
    );
    const consigneeBlock = captureBlockRaw(
      text,
      new RegExp(`consignee\\s*${n}\\b`, "i"),
      /shipper\s*\d|consignee\s*\d|dispatch notes|carrier pay|page \d/i,
    );
    const nextShipper = parseAddressBlob(shipperBlock);
    const shipperKey = stopKey(nextShipper);
    if (parsedStopHasDetails(nextShipper) && !seen.has(shipperKey)) {
      seen.add(shipperKey);
      extras.push({ kind: "pickup", stop: nextShipper });
    }
    const nextConsignee = parseAddressBlob(consigneeBlock);
    const consigneeKey = stopKey(nextConsignee);
    if (parsedStopHasDetails(nextConsignee) && !seen.has(consigneeKey)) {
      seen.add(consigneeKey);
      extras.push({ kind: "delivery", stop: nextConsignee });
    }
  }
  return extras;
}

function parseAscendStop(text: string, kind: "pickup" | "delivery"): StopParse {
  const action = kind === "pickup" ? "(?:pick\\s*up|pickup|pu)" : "(?:delivery|deliver|drop)";
  const until =
    kind === "pickup"
      ? "delivery|deliver|drop|pickup|pick\\s*up"
      : "pickup|pick\\s*up|delivery|deliver|drop|pay items|terms of load|terms";
  const oneLine = text.match(
    new RegExp(
      `(?:^|\\n|\\s)(?:\\d+\\s+)?${action}\\s+(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})(?:\\s+\\d{1,2}:\\d{2}\\s*(?:am|pm)?)?\\s+(.+?)(?=\\s+(?:\\d{1,2}\\s+)?(?:${until})|$)`,
      "is",
    ),
  );
  if (oneLine) {
    return makeStop(toIso(oneLine[1], "08:00"), toIso(oneLine[1], "17:00"), oneLine[2]);
  }

  const stacked = text.match(
    new RegExp(
      `${action}\\s*\\n\\s*(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})\\s*\\n([\\s\\S]{0,320}?)(?=\\n\\s*(?:\\d+\\s*\\n\\s*)?(?:delivery|deliver|drop|pickup|pay items|terms of load)|$)`,
      "i",
    ),
  );
  if (!stacked) return emptyStopParse();
  return makeStop(toIso(stacked[1], "08:00"), toIso(stacked[1], "17:00"), stacked[2]);
}

function cleanLocationCell(value: string): string {
  return clean(
    value
      .replace(/\b(?:preferred freezer|phone:|email:|contact)\b[\s\S]*/i, "")
      .replace(/\bUSA\b/g, ""),
  );
}

function parseAscendInstructions(text: string, equipment: string): string {
  const terms = captureBlock(text, /terms of load/i, /page\s+\d|powered by|ascendtms/i);
  const extras = [
    equipment ? `Equipment: ${equipment}.` : "",
    /continuous(?:\s+reefer|\s+mode)/i.test(text) ? "Continuous reefer." : "",
    /load locks?/i.test(text) ? "Two load locks." : "",
    /\bseals?\b/i.test(text) ? "Seal required." : "",
    text.match(/billing@[a-z0-9.-]+/i)?.[0] ? `Billing: ${text.match(/billing@[a-z0-9.-]+/i)?.[0]}` : "",
  ].filter(Boolean);
  const termLines = terms
    .split(/(?<=\.)\s+/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        /continuous|lock|seal|billing@|temperature|invoice|subject/i.test(line) &&
        !/electronic signature|triumphpay|quick pay/i.test(line),
    );
  return [...new Set([...termLines, ...extras])].join(" ");
}

function parsePrintedConfirmation(text: string): {
  customer_name: string;
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  commodity: string;
  weight: number | null;
  load_number: string;
  po_number: string;
  special_instructions: string;
  appointment_notes: string;
  shipper: ParsedStop;
  consignee: ParsedStop;
  extra_stops: ParsedExtraStop[];
} {
  const empty = {
    customer_name: "",
    origin: "",
    destination: "",
    pickup_start: "",
    pickup_end: "",
    delivery_start: "",
    delivery_end: "",
    commodity: "",
    weight: null as number | null,
    load_number: "",
    po_number: "",
    special_instructions: "",
    appointment_notes: "",
    shipper: emptyParsedStop(),
    consignee: emptyParsedStop(),
    extra_stops: [] as ParsedExtraStop[],
  };
  if (!/shipper\s*1|consignee\s*1|dispatch notes/i.test(text)) return empty;

  const shipperBlock = captureBlockRaw(text, /shipper\s*1/i, /consignee\s*1|dispatch notes|carrier pay/i);
  const consigneeBlock = captureBlockRaw(text, /consignee\s*1/i, /dispatch notes|carrier pay|page \d/i);
  const shipper = parseAddressBlob(shipperBlock);
  const consignee = parseAddressBlob(consigneeBlock);
  const pickup = windowFromStop(shipperBlock);
  const delivery = windowFromStop(consigneeBlock);
  const weightMatch =
    text.match(/weight\s*[:#]?\s*([\d,]+)\s*(?:lbs?|pounds)/i) ??
    shipperBlock.match(/([\d,]+)\s*(?:lbs?|pounds)/i);
  const loadNumber = text.match(/load\s*#\s*[:#]?\s*([A-Z0-9-]{3,20})/i)?.[1] ?? "";

  return {
    customer_name: firstNonAddressLine(shipperBlock),
    origin: cityStateFromStop(shipper) || cityStateOrEmpty(shipperBlock),
    destination: cityStateFromStop(consignee) || cityStateOrEmpty(consigneeBlock),
    pickup_start: pickup.start,
    pickup_end: pickup.end,
    delivery_start: delivery.start,
    delivery_end: delivery.end,
    commodity:
      labeled(text, ["description", "commodity"]) ??
      text.match(/description\s+([A-Z][A-Z0-9 /-]{2,40})/i)?.[1]?.trim() ??
      "",
    weight: weightMatch ? Number.parseInt(weightMatch[1].replace(/,/g, ""), 10) : null,
    load_number: loadNumber,
    po_number: labeled(text, ["purchase order #", "purchase order", "po #"]) ?? "",
    special_instructions: section(text, /dispatch notes/i),
    appointment_notes: labeled(text, ["appointment"]) ?? "",
    shipper,
    consignee,
    extra_stops: parsePrintedExtraStops(text, shipper, consignee),
  };
}

function captureBlock(text: string, start: RegExp, stop: RegExp): string {
  return clean(captureBlockRaw(text, start, stop));
}

function captureBlockRaw(text: string, start: RegExp, stop: RegExp): string {
  const match = text.match(new RegExp(`${start.source}([\\s\\S]*?)(?=${stop.source}|$)`, "i"));
  return (match?.[1] ?? "").trim();
}

function firstNonAddressLine(block: string): string {
  const line = block
    .split(",")[0]
    ?.replace(/phone:.*/i, "")
    .trim();
  if (!line || /^(date|time|type|qty|weight|shipper|consignee)\b/i.test(line)) return "";
  return line;
}

function windowFromStop(block: string): { start: string; end: string } {
  const date = block.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/);
  if (!date) return { start: "", end: "" };
  const clock = block.match(/(\d{1,2}:\d{2})\s*(am|pm)?/i);
  const startTime = normalizeClock(clock?.[1] ?? "08:00", clock?.[2]);
  return { start: toIso(date[1], startTime), end: toIso(date[1], "17:00") };
}

function normalizeClock(hhmm: string, ampm?: string): string {
  const [rawHour, rawMinute] = hhmm.split(":").map((part) => Number.parseInt(part, 10));
  let hour = rawHour;
  if (ampm && /pm/i.test(ampm) && hour < 12) hour += 12;
  if (ampm && /am/i.test(ampm) && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(rawMinute || 0).padStart(2, "0")}`;
}

type StopParse = { start: string; end: string; address: string; stop: ParsedStop };

function emptyStopParse(): StopParse {
  return { start: "", end: "", address: "", stop: emptyParsedStop() };
}

function makeStop(start: string, end: string, rawAddress: string): StopParse {
  const address = cleanLocationCell(rawAddress);
  return { start, end, address, stop: parseAddressBlob(rawAddress) };
}

function firstStop(...stops: StopParse[]): StopParse {
  return stops.find((stop) => stop.start || stop.address || parsedStopHasDetails(stop.stop)) ?? emptyStopParse();
}

function parseStopLine(text: string, pattern: RegExp): StopParse {
  const match = text.match(pattern);
  if (!match) return emptyStopParse();
  return makeStop(toIso(match[1], "08:00"), toIso(match[1], "17:00"), match[2] ?? "");
}

function parseStopBlock(text: string, heading: RegExp): StopParse {
  const match = text.match(
    new RegExp(
      `${heading.source}\\s*[:\\s]+(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})([\\s\\S]{0,240}?)(?=deliv|consignee|pay items|special|terms|shipper|$)`,
      "i",
    ),
  );
  if (!match) return emptyStopParse();
  const address = match[2]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(date|time|type|qty|weight|actions?)\b/i.test(line))
    .slice(0, 6)
    .join("\n");
  return makeStop(toIso(match[1], "08:00"), toIso(match[1], "17:00"), address);
}

function cityStateFromAddress(address: string): string {
  return cityStateOrEmpty(address) || address;
}

function cityStateOrEmpty(address: string): string {
  const matches = [
    ...address.matchAll(
      /\b([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+)*),[ \t]*([A-Z]{2})\b(?:[ \t]+\d{5}(?:-\d{4})?)?/g,
    ),
  ];
  const match = matches.at(-1);
  if (!match) return "";
  const city = match[1]
    .trim()
    .split(/\s+/)
    .filter((word) => !/^(?:N|S|E|W|NE|NW|SE|SW|St|Rd|Dr|Ave|Blvd|Ln|Ct|Hwy)$/i.test(word))
    .slice(-2)
    .join(" ");
  return city ? `${city}, ${match[2]}` : "";
}

function labeled(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}\\s*[:#-]\\s*(.+)$`, "im"));
    if (match?.[1]) {
      return clean(match[1]);
    }
  }
  return null;
}

function section(text: string, heading: RegExp): string {
  const match = text.match(new RegExp(`${heading.source}\\s*[:\\n]([\\s\\S]*)$`, "i"));
  if (!match?.[1]) return "";
  const body = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(equipment|rate|weight|commodity)\b/i.test(line));
  return body.join("\n").trim();
}

function linesMatching(text: string, pattern: RegExp): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => pattern.test(line));
}

function parseWindow(text: string, kind: "pickup" | "delivery"): { start: string; end: string } {
  const label = kind === "pickup" ? "pickup window" : "delivery window";
  const line = labeled(text, [label, kind]) ?? "";
  const dates = [...line.matchAll(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})(?:\s+(\d{1,2}:\d{2}))?/g)];
  if (dates.length >= 2) {
    return {
      start: toIso(dates[0][1], dates[0][2] ?? "08:00"),
      end: toIso(dates[1][1], dates[1][2] ?? "17:00"),
    };
  }
  if (dates.length === 1) {
    return {
      start: toIso(dates[0][1], dates[0][2] ?? "08:00"),
      end: toIso(dates[0][1], "17:00"),
    };
  }
  return { start: "", end: "" };
}

function toIso(datePart: string, timePart: string): string {
  const [a, b, c] = datePart.split(/[/-]/).map((part) => Number.parseInt(part, 10));
  const year = c < 100 ? 2000 + c : c;
  const [hour, minute] = timePart.split(":").map((part) => Number.parseInt(part, 10));
  const date = new Date(year, a - 1, b, hour, minute, 0, 0);
  if (Number.isNaN(date.getTime())) return "";
  return toInputDateTime(date.toISOString());
}

function parseMoney(value: string): number | null {
  const dollar = value.match(/\$\s*([0-9][0-9, ]*(?:\.\d{1,2})?)/);
  const raw = dollar?.[1] ?? value.match(/([0-9][0-9, ]*(?:\.\d{1,2})?)/)?.[1];
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").replace(/\s+/g, "");
  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function parseWeight(value: string): number | null {
  if (!value.trim()) return null;
  const match = value.replace(/,/g, "").match(/(\d{3,6})\s*(?:lbs?|pounds)\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[|]+/g, "").trim();
}

export function parsedToInputDefaults(parsed: ParsedRateCon) {
  return {
    ...parsed,
    pickup_start: parsed.pickup_start || toInputDateTime(new Date().toISOString()),
    pickup_end: parsed.pickup_end || parsed.pickup_start,
    delivery_start: parsed.delivery_start || parsed.pickup_end,
    delivery_end: parsed.delivery_end || parsed.delivery_start,
  };
}

export function isoFromParsedInput(value: string): string {
  if (!value) return new Date().toISOString();
  if (value.includes("T") && !value.endsWith("Z") && value.length <= 16) {
    return fromInputDateTime(value);
  }
  return value.includes("T") ? new Date(value).toISOString() : fromInputDateTime(value);
}
