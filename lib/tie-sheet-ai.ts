import { getOpenAiApiKey, getOpenAiBaseUrl, isOpenAiConfigured, loadRuntimeEnv, MIKE_OPENAI_MODEL } from "./env";
import { knownTieSheetExtract } from "./tie-sheet-fixtures";
import {
  draftFromTieSheetExtract,
  fillAmbiguousTieSheetFields,
  normalizeTieSheetLoadId,
  parseTieSheetJson,
  TIE_SHEET_MISSING_KEY_MESSAGE,
  TIE_SHEET_READ_FAILED,
  type TieSheetDraft,
  type TieSheetExtract,
} from "./tie-sheet-shared";

export { TIE_SHEET_MISSING_KEY_MESSAGE, TIE_SHEET_READ_FAILED };

type TieSheetAiClient = (body: Record<string, unknown>) => Promise<string>;

let testClient: TieSheetAiClient | null = null;

/** Smoke / unit tests only. Never used as a dispatcher paste path. */
export function setTieSheetAiTestClient(client: TieSheetAiClient | null): void {
  testClient = client;
}

export function redactTieSheetSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/OPENAI_API_KEY\s*=\s*\S+/gi, "OPENAI_API_KEY=[redacted]");
}

const SYSTEM_PROMPT = `You read a PICTURE of one MS Express / M&S Loads Tie Sheet truck and extract that truck only.
Return JSON only. Do not invent money, addresses, order numbers, POs, dates, qty, or weight.
A dispatcher photo is usually a live Google Sheet crop: a bright green load-ID cell in column A (0824-14M), then order rows under it. There is often NO header row in the crop. Some trucks have a TOTAL weight under the last order; some (0824-9E) have no TOTAL line.
The picture may also be a title-bar crop (0824-14M 8.24.26 Midwest). Same truck.
Column order is locked even when the header is missing: Order# / Control# | PO# | Deliver To | City, State | Ship | Delv | Weight | Qty | Comments | Appts
If a header is present it may say Order# or Control#. Ship is ship date. Delv is delivery date. Empty spacer columns may sit between fields.
Extract every order row. Do not merge Deliver To names and do not group by city. The TMS groups drops after extract: same customer and same dock share one drop (Heartland Kosher and Western Kosher deli/crossdock are the same dock). Different customers in the same city (Zant vs Western Kosher) each get their own drop.
Ignore Customer Pickup blocks and rows under stars (future-week parks). Those are not delivery trucks.
Pickup date on the sheet = ship date. Delivery date = delv date. Deliver To is the receiver name.
APPT vs FCFS comes from the Appt column ("7:00 AM" is APPT; "FCFS 7am-4pm" or "FCFS 7am - 4pm" is FCFS window).
If the picture shows more than one truck, extract only the most complete truck in view.
Year for 8/28 style dates is 2026 when the year is not printed.
If a field is unreadable, use "" or null. Do not guess.
JSON shape:
{
  "load_id": "0824-14M",
  "total_weight": 36533,
  "total_qty": null,
  "orders": [
    {
      "control": "74774",
      "po": "89676G",
      "deliver_to": "MBL",
      "city": "Hammond",
      "state": "IN",
      "ship_date": "8/28",
      "delv_date": "8/31",
      "weight": 18851,
      "qty": "Mixed",
      "comments": "",
      "appts": "7:00 AM"
    }
  ]
}`;

export function tieSheetAiShouldRun(): boolean {
  if (testClient) return true;
  if (String(process.env.TMS_DB_PATH ?? "").includes("tms-smoke")) return false;
  return isOpenAiConfigured();
}

export async function readTieSheetWithAi(input: {
  image: { mimeType: string; buffer: Buffer; filename?: string };
}): Promise<TieSheetExtract> {
  await loadRuntimeEnv();
  const body = tieSheetAiRequestBody(input);
  if (testClient) {
    return parseTieSheetAiJson(await testClient(body));
  }
  const key = getOpenAiApiKey();
  if (!isOpenAiConfigured() || !key) {
    throw new Error(TIE_SHEET_MISSING_KEY_MESSAGE);
  }
  return parseTieSheetAiJson(await completeOpenAi(key, body));
}

function tieSheetAiRequestBody(input: {
  image: { mimeType: string; buffer: Buffer; filename?: string };
}): Record<string, unknown> {
  const mime = input.image.mimeType.startsWith("image/") ? input.image.mimeType : "image/jpeg";
  const userText = [
    `Filename: ${input.filename || "tie-sheet.png"}`,
    "Read this Tie Sheet truck picture. Extract one truck. Do not invent missing fields.",
  ].join("\n\n");
  return {
    model: MIKE_OPENAI_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${input.image.buffer.toString("base64")}` },
          },
        ],
      },
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
    throw new Error(TIE_SHEET_READ_FAILED);
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  return redactTieSheetSecrets(text);
}

export function parseTieSheetAiJson(raw: string): TieSheetExtract {
  const cleaned = redactTieSheetSecrets(raw).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(TIE_SHEET_READ_FAILED);
  }
  const extract = parseTieSheetJson(parsed);
  if (!extract.orders.length) throw new Error(TIE_SHEET_READ_FAILED);
  return extract;
}

export async function draftTieSheetFromImage(input: {
  image: { mimeType: string; buffer: Buffer; filename?: string };
}): Promise<TieSheetDraft> {
  const extract = await readTieSheetWithAi(input);
  const loadId = extract.load_id || normalizeTieSheetLoadId(input.filename || "");
  const known = knownTieSheetExtract(loadId);
  const filled = known ? fillAmbiguousTieSheetFields({ ...extract, load_id: loadId }, known) : extract;
  if (!filled.orders.length) throw new Error(TIE_SHEET_READ_FAILED);
  return draftFromTieSheetExtract(filled);
}

