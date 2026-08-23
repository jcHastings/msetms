import { extractText } from "unpdf";
import { fromInputDateTime, toInputDateTime } from "./format";
import type { Customer } from "./types";

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
  const customerName = labeled(text, ["customer", "bill to", "shipper", "account"]) ?? "";
  const matched = matchCustomer(customerName, customers);

  const special = section(text, /special instructions?/i);
  const appointment =
    labeled(text, ["appointment"]) ??
    linesMatching(special, /appointment|call \d+ minutes/i).join("\n");

  return {
    customer_name: customerName,
    customer_id: matched,
    origin: labeled(text, ["origin", "pickup location", "ship from"]) ?? "",
    destination: labeled(text, ["destination", "delivery location", "ship to", "consignee city"]) ?? "",
    pickup_start: parseWindow(text, "pickup").start,
    pickup_end: parseWindow(text, "pickup").end,
    delivery_start: parseWindow(text, "delivery").start,
    delivery_end: parseWindow(text, "delivery").end,
    rate: parseMoney(labeled(text, ["rate", "linehaul", "total pay"]) ?? ""),
    commodity: labeled(text, ["commodity", "product"]) ?? "",
    weight: parseWeight(labeled(text, ["weight", "lbs"]) ?? text),
    reference_number: labeled(text, ["ref #", "ref#", "reference", "rate con"]) ?? "",
    po_number: labeled(text, ["po #", "po#", "po number", "purchase order"]) ?? "",
    special_instructions: special,
    appointment_notes: appointment,
    reefer_setpoint_f: parseTemp(text),
    load_number_hint: labeled(text, ["load #", "load#", "load number"]) ?? "",
    raw_text: text,
  };
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
  const match = value.replace(/,/g, "").match(/(\d{3,6})\s*(?:lbs?|pounds)?/i);
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
