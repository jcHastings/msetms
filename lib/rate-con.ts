import { extractText } from "unpdf";
import { fromInputDateTime, toInputDateTime } from "./format";
import type { Customer } from "./types";

export function emptyParsedRateCon(): ParsedRateCon {
  return {
    customer_name: "",
    customer_id: null,
    origin: "",
    destination: "",
    pickup_start: "",
    pickup_end: "",
    delivery_start: "",
    delivery_end: "",
    rate: null,
    commodity: "",
    weight: null,
    reference_number: "",
    po_number: "",
    special_instructions: "",
    appointment_notes: "",
    reefer_setpoint_f: null,
    load_number_hint: "",
    raw_text: "",
  };
}

export type ParsedRateCon = {
  customer_name: string;
  customer_id: number | null;
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  rate: number | null;
  commodity: string;
  weight: number | null;
  reference_number: string;
  po_number: string;
  special_instructions: string;
  appointment_notes: string;
  reefer_setpoint_f: number | null;
  load_number_hint: string;
  raw_text: string;
};

export async function extractDocumentText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const isPdf = mimeType.includes("pdf") || filename.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const result = await extractText(new Uint8Array(buffer), { mergePages: true });
    return String(result.text ?? "").trim();
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

  throw new Error("Upload a PDF or an image of the rate confirmation.");
}

export function parseRateConText(rawText: string, customers: Customer[] = []): ParsedRateCon {
  const text = rawText.replace(/\r/g, "");
  const ascend = parseAscendConfirmation(text);
  const customerName =
    labeled(text, ["customer", "bill to", "account", "broker"]) ??
    ascend.customer_name ??
    "";
  const matched = matchCustomer(customerName, customers);

  const special =
    section(text, /special instructions?/i) ||
    ascend.special_instructions ||
    "";
  const appointment =
    labeled(text, ["appointment"]) ??
    linesMatching(special, /appointment|call \d+ minutes/i).join("\n");
  const pickup = parseWindow(text, "pickup");
  const delivery = parseWindow(text, "delivery");

  return {
    customer_name: customerName,
    customer_id: matched,
    origin:
      labeled(text, ["origin", "pickup location", "ship from"]) ??
      ascend.origin ??
      "",
    destination:
      labeled(text, ["destination", "delivery location", "ship to", "consignee city"]) ??
      ascend.destination ??
      "",
    pickup_start: pickup.start || ascend.pickup_start || "",
    pickup_end: pickup.end || ascend.pickup_end || "",
    delivery_start: delivery.start || ascend.delivery_start || "",
    delivery_end: delivery.end || ascend.delivery_end || "",
    rate: parseMoney(labeled(text, ["rate", "linehaul", "total pay", "flat rate"]) ?? "") ?? ascend.rate,
    commodity: labeled(text, ["commodity", "product"]) ?? ascend.commodity ?? "",
    weight: parseWeight(labeled(text, ["weight"]) ?? "") ?? ascend.weight,
    reference_number:
      labeled(text, ["ref #", "ref#", "reference", "rate con"]) ??
      ascend.load_number ??
      "",
    po_number: labeled(text, ["po #", "po#", "po number", "purchase order"]) ?? "",
    special_instructions: special,
    appointment_notes: appointment,
    reefer_setpoint_f: parseTemp(text),
    load_number_hint: labeled(text, ["load #", "load#", "load number"]) ?? ascend.load_number ?? "",
    raw_text: text,
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
  };
  if (!/load confirmation/i.test(text)) return empty;

  const flat = text.replace(/\s+/g, " ");
  const loadNumber = text.match(/load\s*#\s*(\d{3,8})/i)?.[1] ?? "";
  const weightMatch =
    text.match(/weight\s*[:#]?\s*([\d,]+)\s*(?:lbs?|pounds)/i) ??
    flat.match(/weight\s+([\d,]+)\s*(?:lbs?|pounds)/i);
  const commodity =
    labeled(text, ["commodity"]) ??
    text.match(/commodity\s+([A-Z][A-Z0-9 /-]{2,40})/i)?.[1]?.trim() ??
    "";
  const rate =
    parseMoney(text.match(/(?:rate|flat rate|line\s*haul)\s*[:#]?\s*\$?\s*([\d,]+(?:\.\d+)?)/i)?.[0] ?? "") ??
    parseMoney(flat.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:\/\s*)?(?:flat rate)?/i)?.[0] ?? "") ??
    parseMoney(flat.match(/pay items[\s\S]{0,80}\$\s*([\d,]+(?:\.\d+)?)/i)?.[0] ?? "");

  const pickup = firstStop(
    parseStopLine(text, /pick(?:up)?\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+)/i),
    parseStopBlock(text, /pick(?:\s*up)?(?:\s+date)?/i),
  );
  const delivery = firstStop(
    parseStopLine(text, /deliv(?:ery)?\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+)/i),
    parseStopBlock(text, /deliv(?:ery)?(?:\s+date)?/i),
  );

  const terms = section(text, /terms|special instructions?|notes/i);
  const extras = [
    /continuous reefer/i.test(text) ? "Continuous reefer." : "",
    /load locks?/i.test(text) ? "Two load locks." : "",
    /\bseal\b/i.test(text) ? "Seal required." : "",
    text.match(/billing@[a-z0-9.-]+/i)?.[0]
      ? `Billing: ${text.match(/billing@[a-z0-9.-]+/i)?.[0]}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    customer_name: "",
    origin: cityStateFromAddress(pickup.address),
    destination: cityStateFromAddress(delivery.address),
    pickup_start: pickup.start,
    pickup_end: pickup.end,
    delivery_start: delivery.start,
    delivery_end: delivery.end,
    rate,
    commodity: commodity.replace(/\s+/g, " "),
    weight: weightMatch ? Number.parseInt(weightMatch[1].replace(/,/g, ""), 10) : null,
    load_number: loadNumber,
    special_instructions: [terms, extras].filter(Boolean).join("\n"),
  };
}

function firstStop(
  ...stops: Array<{ start: string; end: string; address: string }>
): { start: string; end: string; address: string } {
  return stops.find((stop) => stop.start || stop.address) ?? { start: "", end: "", address: "" };
}

function parseStopLine(
  text: string,
  pattern: RegExp,
): { start: string; end: string; address: string } {
  const match = text.match(pattern);
  if (!match) return { start: "", end: "", address: "" };
  const start = toIso(match[1], "08:00");
  const end = toIso(match[1], "17:00");
  return { start, end, address: clean(match[2] ?? "") };
}

function parseStopBlock(
  text: string,
  heading: RegExp,
): { start: string; end: string; address: string } {
  const match = text.match(
    new RegExp(
      `${heading.source}\\s*[:\\s]+(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})([\\s\\S]{0,240}?)(?=deliv|consignee|pay items|special|terms|shipper|$)`,
      "i",
    ),
  );
  if (!match) return { start: "", end: "", address: "" };
  const address = clean(
    match[2]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^(date|time|type|qty|weight|actions?)\b/i.test(line))
      .slice(0, 4)
      .join(", "),
  );
  return { start: toIso(match[1], "08:00"), end: toIso(match[1], "17:00"), address };
}

function cityStateFromAddress(address: string): string {
  const match = address.match(/([A-Za-z .'-]+),\s*([A-Z]{2})(?:\s+\d{5})?/);
  if (!match) return address;
  return `${match[1].trim()}, ${match[2]}`;
}

function matchCustomer(name: string, customers: Customer[]): number | null {
  if (!name) return null;
  const needle = name.toLowerCase();
  const exact = customers.find((customer) => customer.name.toLowerCase() === needle);
  if (exact) return exact.id;
  const partial = customers.find(
    (customer) =>
      customer.name.toLowerCase().includes(needle) || needle.includes(customer.name.toLowerCase()),
  );
  return partial?.id ?? null;
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
  const match = value.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : null;
}

function parseWeight(value: string): number | null {
  if (!value.trim()) return null;
  const match = value.replace(/,/g, "").match(/(\d{3,6})\s*(?:lbs?|pounds)\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseTemp(text: string): number | null {
  const match = text.match(/(?:reefer\s*)?(?:setpoint|set point|temp(?:erature)?)\s*[:#]?\s*(-?\d+(?:\.\d+)?)\s*°?\s*F/i);
  if (match) return Number.parseFloat(match[1]);
  const bare = text.match(/(-?\d+(?:\.\d+)?)\s*°\s*F/);
  return bare ? Number.parseFloat(bare[1]) : null;
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
