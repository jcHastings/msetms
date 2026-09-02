import { fromInputDateTime, toInputDateTime } from "./format";
import { getOpenAiApiKey, getOpenAiBaseUrl, isOpenAiConfigured, loadRuntimeEnv, MIKE_OPENAI_MODEL } from "./env";
import {
  cityStateFromStop,
  emptyParsedRateCon,
  emptyParsedStop,
  flagsFromParsedGaps,
  matchCustomerName,
  mergeBrokerContact,
  normalizeParsedStop,
  parseBrokerContactFromText,
  parsedStopHasDetails,
  type ParsedExtraStop,
  type ParsedRateCon,
  type RateConFieldFlag,
} from "./rate-con-shared";
import { isReeferMode } from "./reefer-shared";
import { DEFAULT_LOAD_EQUIPMENT } from "./types";
import type { Customer } from "./types";

export const RATE_CON_AI_MISSING_KEY =
  "The AI rate-con reader is not connected. The same connection Mike uses is missing. Review any guessed fields or fill the load by hand. Nothing was saved.";

export const RATE_CON_AI_FAILED =
  "The AI rate-con reader could not finish. Review any guessed fields or fill the load by hand. Nothing was saved.";

export type RateConAiConfidence = "high" | "medium" | "low";

export type RateConAiStop = {
  kind?: string;
  name?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  schedule_type?: string;
  window_start?: string;
  window_end?: string;
  confirmation?: string;
  notes?: string;
  confidence?: string;
};

export type RateConAiDraft = {
  customer_name?: string;
  customer_confidence?: string;
  rate?: number | string | null;
  rate_confidence?: string;
  commodity?: string;
  weight?: number | string | null;
  load_number?: string;
  po_number?: string;
  equipment?: string;
  reefer_setpoint_f?: number | string | null;
  reefer_mode?: string;
  special_instructions?: string;
  appointment_notes?: string;
  stops?: RateConAiStop[];
  missing_fields?: string[];
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_ext?: string;
};

type RateConAiClient = (body: Record<string, unknown>) => Promise<string>;

let testClient: RateConAiClient | null = null;

/** Smoke / unit tests only. Never used in the dispatcher UI. */
export function setRateConAiTestClient(client: RateConAiClient | null): void {
  testClient = client;
}

export function redactRateConSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/OPENAI_API_KEY\s*=\s*\S+/gi, "OPENAI_API_KEY=[redacted]");
}

const SYSTEM_PROMPT = `You read trucking rate confirmations (any broker layout) and extract a load draft for MS Express TMS.
Return JSON only. Do not invent money or customer identity. If a field is not clearly printed, use null or "" and set confidence to low.
Extract every pickup and delivery stop in order. Do not drop extra stops.
Customer is the broker/bill-to (TQL, BMM Logistics, CEI Logistics, RXO, Allen Lund, etc.), not the shipper warehouse and not MS Express / M&S Loads.
Rate is the billed / agreed / total freight pay to the carrier — Carrier Freight Pay, Flat Rate / TOTAL, all-in. Not quantity 1, not fuel-per-mile, not a load number, not TONU/detention, not $0.00 next to a real total.
If no freight dollar amount is printed (TQL carrier information sheet), leave rate null and confidence low. Do not invent one.
Load number is the customer's rate-con / load # / TQL PO# / Order # (store as customer reference). Never invent an MSE trip number.
Stops may be labeled Pickup At / Deliver To, PICKUPS / DROPS, PU 1 / SO 2, Shipper / Consignee. Read every one.
schedule_type is "appointment" or "fcfs". confirmation is the stop PO / PU# / P/U number.
PRECOOL TO 60F and similar lines are the reefer setpoint.
Default equipment is 53' reefer. Reefer mode is continuous unless the document clearly says start/stop.
Do not add liftgate or inside pickup/delivery.
Broker/load contact is the person who booked the load: Name, email, phone, and extension from the document's contact-info block (any broker). Copy only what is printed. Leave blank when missing. Never invent an address or phone.
Do not use CARRIER CONTACT (the trucking company / driver). Do not use shipper or receiver phones in stop notes. Do not use "send POD to" billing lines unless that email is the same as the contact-info email.
Do not write this contact onto the customer card — it belongs on this load only.
Confidence is high, medium, or low. Money and customer must be low when guessed.
JSON shape:
{
  "customer_name": "",
  "customer_confidence": "high",
  "rate": 0,
  "rate_confidence": "high",
  "commodity": "",
  "weight": 0,
  "load_number": "",
  "po_number": "",
  "equipment": "reefer",
  "reefer_setpoint_f": null,
  "reefer_mode": "continuous",
  "special_instructions": "",
  "appointment_notes": "",
  "contact_name": "",
  "contact_email": "",
  "contact_phone": "",
  "contact_ext": "",
  "stops": [
    {
      "kind": "pickup",
      "name": "",
      "street": "",
      "city": "",
      "state": "",
      "zip": "",
      "phone": "",
      "schedule_type": "appointment",
      "window_start": "2026-08-21T08:00",
      "window_end": "2026-08-21T17:00",
      "confirmation": "",
      "notes": "",
      "confidence": "high"
    }
  ],
  "missing_fields": []
}`;

export function hintForRateConPrompt(hint: ParsedRateCon): Record<string, unknown> {
  return {
    customer_name: hint.customer_name,
    origin: hint.origin,
    destination: hint.destination,
    pickup_start: hint.pickup_start,
    pickup_end: hint.pickup_end,
    delivery_start: hint.delivery_start,
    delivery_end: hint.delivery_end,
    rate: hint.rate,
    commodity: hint.commodity,
    weight: hint.weight,
    reference_number: hint.reference_number,
    po_number: hint.po_number,
    load_number_hint: hint.load_number_hint,
    reefer_setpoint_f: hint.reefer_setpoint_f,
    reefer_mode: hint.reefer_mode,
    special_instructions: hint.special_instructions.slice(0, 800),
    shipper: hint.shipper,
    consignee: hint.consignee,
    extra_stops: hint.extra_stops,
  };
}

export function rateConAiShouldRun(): boolean {
  if (testClient) return true;
  if (String(process.env.TMS_DB_PATH ?? "").includes("tms-smoke")) return false;
  return isOpenAiConfigured();
}

export async function readRateConWithAi(input: {
  text: string;
  filename?: string;
  customers?: Customer[];
  hint?: ParsedRateCon;
  image?: { mimeType: string; buffer: Buffer } | null;
}): Promise<RateConAiDraft> {
  await loadRuntimeEnv();
  const body = rateConAiRequestBody(input);
  if (testClient) {
    return parseRateConAiJson(await testClient(body));
  }
  const key = getOpenAiApiKey();
  if (!isOpenAiConfigured() || !key) {
    throw new Error(RATE_CON_AI_MISSING_KEY);
  }
  return parseRateConAiJson(await completeOpenAi(key, body));
}

function rateConAiRequestBody(input: {
  text: string;
  filename?: string;
  customers?: Customer[];
  hint?: ParsedRateCon;
  image?: { mimeType: string; buffer: Buffer } | null;
}): Record<string, unknown> {
  const customerNames = (input.customers ?? [])
    .map((customer) => customer.name.trim())
    .filter(Boolean)
    .slice(0, 80);
  const hintJson = input.hint ? JSON.stringify(hintForRateConPrompt(input.hint)) : "{}";
  const text = (input.text || "").slice(0, 24000);
  const userText = [
    `Filename: ${input.filename || "rate-con"}`,
    customerNames.length ? `Known customers (match when possible):\n${customerNames.join("\n")}` : "No saved customers.",
    `Layout helper (may be wrong; ignore when the document disagrees):\n${hintJson}`,
    `Document text:\n${text || "(no selectable text — read the image)"}`,
  ].join("\n\n");

  const content: Array<Record<string, unknown>> = [{ type: "text", text: userText }];
  if (input.image && input.image.buffer.length > 0 && input.image.buffer.length < 4 * 1024 * 1024) {
    const mime = input.image.mimeType.startsWith("image/") ? input.image.mimeType : "image/jpeg";
    content.push({
      type: "image_url",
      image_url: { url: `data:${mime};base64,${input.image.buffer.toString("base64")}` },
    });
  }

  return {
    model: MIKE_OPENAI_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
  };
}

async function completeOpenAi(key: string, body: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${getOpenAiBaseUrl().replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(RATE_CON_AI_FAILED);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  return redactRateConSecrets(text);
}

export function parseRateConAiJson(raw: string): RateConAiDraft {
  const cleaned = redactRateConSecrets(raw).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(RATE_CON_AI_FAILED);
  }
  if (!parsed || typeof parsed !== "object") throw new Error(RATE_CON_AI_FAILED);
  return parsed as RateConAiDraft;
}

export function applyAiRateCon(
  draft: RateConAiDraft,
  customers: Customer[] = [],
  hint: ParsedRateCon = emptyParsedRateCon(),
  rawText = "",
): ParsedRateCon {
  const customerName = String(draft.customer_name ?? "").trim();
  const customerConfidence = asConfidence(draft.customer_confidence);
  const useCustomer = Boolean(customerName) && customerConfidence !== "low";
  const customerId = useCustomer ? matchCustomerName(customerName, customers) : null;

  const rateConfidence = asConfidence(draft.rate_confidence);
  const rate = rateConfidence === "low" ? null : parseOptionalNumber(draft.rate);

  const aiStops = (Array.isArray(draft.stops) ? draft.stops : []).flatMap(stopFromAi);
  const pickups = aiStops.filter((item) => item.kind === "pickup");
  const deliveries = aiStops.filter((item) => item.kind === "delivery");
  const usedHintStops = !pickups.length && !deliveries.length;
  const shipper = pickups[0]?.stop ?? (usedHintStops ? hint.shipper : emptyParsedStop());
  const consignee = deliveries[0]?.stop ?? (usedHintStops ? hint.consignee : emptyParsedStop());
  const extraStops: ParsedExtraStop[] = usedHintStops
    ? hint.extra_stops
    : [...pickups.slice(1), ...deliveries.slice(1)];

  const firstPickup = pickups[0];
  const firstDelivery = deliveries[0];
  const equipment = mapEquipment(draft.equipment) || DEFAULT_LOAD_EQUIPMENT;
  const reeferMode = isReeferMode(String(draft.reefer_mode ?? ""))
    ? String(draft.reefer_mode)
    : /reefer/i.test(equipment)
      ? "continuous"
      : "";

  const parsed: ParsedRateCon = {
    customer_name: customerName,
    customer_id: customerId,
    origin: cityStateFromStop(shipper) || hint.origin,
    destination: cityStateFromStop(consignee) || hint.destination,
    pickup_start: firstPickup?.stop.window_start || hint.pickup_start,
    pickup_end: firstPickup?.stop.window_end || firstPickup?.stop.window_start || hint.pickup_end,
    delivery_start: firstDelivery?.stop.window_start || hint.delivery_start,
    delivery_end: firstDelivery?.stop.window_end || firstDelivery?.stop.window_start || hint.delivery_end,
    rate,
    commodity: String(draft.commodity ?? "").trim() || hint.commodity,
    weight: parseOptionalNumber(draft.weight) ?? (usedHintStops ? hint.weight : null),
    reference_number: String(draft.load_number ?? "").trim() || hint.reference_number,
    po_number: String(draft.po_number ?? "").trim() || hint.po_number,
    special_instructions: String(draft.special_instructions ?? "").trim() || hint.special_instructions,
    appointment_notes: String(draft.appointment_notes ?? "").trim() || hint.appointment_notes,
    reefer_setpoint_f: parseOptionalNumber(draft.reefer_setpoint_f) ?? hint.reefer_setpoint_f,
    reefer_mode: reeferMode || hint.reefer_mode || "continuous",
    equipment,
    load_number_hint: String(draft.load_number ?? "").trim() || hint.load_number_hint,
    raw_text: rawText || hint.raw_text,
    shipper,
    consignee,
    extra_stops: extraStops,
    shipper_location_id: null,
    consignee_location_id: null,
    ...mergeBrokerContact(
      {
        contact_name: String(draft.contact_name ?? "").trim(),
        contact_email: String(draft.contact_email ?? "").trim(),
        contact_phone: String(draft.contact_phone ?? "").trim(),
        contact_ext: String(draft.contact_ext ?? "").trim(),
      },
      parseBrokerContactFromText(rawText || hint.raw_text),
    ),
    field_flags: [],
    reader: "ai",
  };

  const flags = flagsFromParsedGaps(parsed);
  if (customerName && customerConfidence === "low") {
    flags.unshift({
      key: "customer",
      label: "Customer",
      status: "low",
      message: `Customer was unclear${customerName ? ` (saw “${customerName}”)` : ""}. Confirm before save.`,
    });
  }
  if (rateConfidence === "low") {
    flags.unshift({
      key: "rate",
      label: "Customer rate",
      status: "low",
      message: "Rate was unclear. Enter the billed amount — it was not filled in.",
    });
  }
  if (usedHintStops && (parsedStopHasDetails(shipper) || parsedStopHasDetails(consignee))) {
    flags.push({
      key: "stops",
      label: "Stops",
      status: "low",
      message: "Stops came from a layout helper, not the AI reader. Confirm each address.",
    });
  }
  parsed.field_flags = dedupeFlags(flags);
  return parsed;
}

export function decorateHintRateCon(hint: ParsedRateCon): ParsedRateCon {
  return {
    ...hint,
    equipment: hint.equipment || DEFAULT_LOAD_EQUIPMENT,
    reefer_mode: hint.reefer_mode || "continuous",
    reader: hint.raw_text.trim() ? "hint" : "none",
    field_flags: flagsFromParsedGaps(hint),
  };
}

function stopFromAi(row: RateConAiStop): ParsedExtraStop[] {
  const kind = /deliver|drop|consignee/i.test(String(row.kind ?? "")) ? "delivery" : "pickup";
  const stop = normalizeParsedStop({
    name: row.name,
    street: row.street,
    city: row.city,
    state: row.state,
    zip: row.zip,
    phone: row.phone,
    schedule_type: /fcfs|first\s*come/i.test(String(row.schedule_type ?? ""))
      ? "fcfs"
      : /appoint/i.test(String(row.schedule_type ?? ""))
        ? "appointment"
        : "",
    window_start: normalizeWindow(row.window_start),
    window_end: normalizeWindow(row.window_end),
    confirmation: row.confirmation,
    notes: row.notes,
  });
  if (!stop.name.trim() && !stop.street.trim() && !stop.city.trim()) return [];
  return [{ kind, stop }];
}

function asConfidence(value: string | undefined): RateConAiConfidence {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "low") return "low";
  if (raw === "medium") return "medium";
  return "high";
}

function parseOptionalNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[$,]/g, "").replace(/\s+/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function mapEquipment(value: string | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (/dry|van/.test(raw) && !/reefer|refrigerat/.test(raw)) return "dry_van_53";
  if (/flat/.test(raw)) return "flatbed";
  if (/box/.test(raw)) return "box";
  if (/power/.test(raw)) return "power_only";
  if (/reefer|refrigerat|temp/.test(raw)) return DEFAULT_LOAD_EQUIPMENT;
  return "";
}

function normalizeWindow(value: string | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16);
  const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}:\d{2})(?:\s*(am|pm))?)?/i);
  if (us) {
    const year = Number(us[3]) < 100 ? 2000 + Number(us[3]) : Number(us[3]);
    const clock = normalizeClock(us[4] ?? "08:00", us[5]);
    const date = new Date(year, Number(us[1]) - 1, Number(us[2]), ...clock);
    if (Number.isNaN(date.getTime())) return "";
    return toInputDateTime(date.toISOString());
  }
  try {
    if (raw.includes("T") && raw.length <= 16) return toInputDateTime(fromInputDateTime(raw));
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    return toInputDateTime(date.toISOString());
  } catch {
    return "";
  }
}

function normalizeClock(hhmm: string, ampm?: string): [number, number] {
  const [rawHour, rawMinute] = hhmm.split(":").map((part) => Number.parseInt(part, 10));
  let hour = rawHour;
  if (ampm && /pm/i.test(ampm) && hour < 12) hour += 12;
  if (ampm && /am/i.test(ampm) && hour === 12) hour = 0;
  return [hour, rawMinute || 0];
}

function dedupeFlags(flags: RateConFieldFlag[]): RateConFieldFlag[] {
  const seen = new Set<string>();
  const out: RateConFieldFlag[] = [];
  for (const flag of flags) {
    if (seen.has(flag.key)) continue;
    seen.add(flag.key);
    out.push(flag);
  }
  return out;
}
