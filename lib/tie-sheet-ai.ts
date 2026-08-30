import { getOpenAiApiKey, getOpenAiBaseUrl, isOpenAiConfigured, loadRuntimeEnv, MIKE_OPENAI_MODEL } from "./env";
import {
  draftFromTieSheetExtract,
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
A truck is a green load-ID cell in column A (example 0824-14M), then one row per order.
Column order is locked: Control# | PO# | Deliver To | City, State | Ship date | Delv date | Weight | Qty | Comments | Appts
Blank row between trucks. Needs XK + TOTAL sits on the line immediately under the last order (no skipped row).
Ignore Customer Pickup blocks and rows under stars (future-week parks). Those are not delivery trucks.
Pickup date on the sheet = ship date. Delivery date = delv date. Deliver To is the receiver name.
APPT vs FCFS comes from the Appt column ("7:00 AM" is APPT; "FCFS 7am - 4pm" is FCFS window).
If the picture shows more than one truck, extract only the most complete truck in view.
Year for 8/28 style dates is 2026 when the year is not printed.
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
  if (!extract.orders.length) throw new Error(TIE_SHEET_READ_FAILED);
  return draftFromTieSheetExtract(extract);
}

