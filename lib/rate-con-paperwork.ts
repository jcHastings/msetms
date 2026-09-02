/** Stop PO vs confirmation, operational Directions, and load-level driver notes. */

import {
  cityStateFromStop,
  normalizeParsedStop,
  parseAddressBlob,
  parsedStopHasDetails,
  type ParsedExtraStop,
  type ParsedRateCon,
  type ParsedStop,
} from "./rate-con-shared";
import { parseReeferModeFromText, parseReeferSetpointFromText } from "./reefer-shared";

export type StopPaperwork = {
  reference: string;
  confirmation: string;
  quantity: string;
  schedule_type: string;
};

const LEGAL_HEADING =
  /(?:^|\n)\s*(?:fines?\s+schedule|back[\s-]*solicit(?:ation)?|attorney\s+fees|lawyer\s+fees|remit\s+to|terms\s+(?:and|&)\s+conditions|indemnif)/i;

const STOP_HEADER =
  /(?:^|\n)\s*(?:stop\s+\d+\s*[:.\-]\s*(?:pickup|delivery|pu|del)\b|(?:pickup|delivery)\s*\(\s*(?:pu|del)\s*\))/gi;

export function parseStopPaperwork(text: string): StopPaperwork {
  const raw = String(text ?? "");
  const pu = raw.match(/\bP\/?U\s*#\s*([A-Z0-9-]+)/i)?.[1]?.trim() ?? "";
  const po = raw.match(/\bPO\s*#\s*([A-Z0-9-]+)/i)?.[1]?.trim() ?? "";
  const conf = raw.match(/\bCONF(?:IRMATION)?\s*#\s*([A-Z0-9-]+)/i)?.[1]?.trim() ?? "";
  const cases = raw.match(/\(\s*(\d{2,5})\s*cases?\s*\)/i)?.[1] ?? raw.match(/\b(\d{2,5})\s*cases\b/i)?.[1] ?? "";
  return {
    reference: po || pu,
    confirmation: conf,
    quantity: cases ? `${cases} cases` : "",
    schedule_type: /set\s+appt|appointment\s+required|strict\s+loading\s+appts/i.test(raw) ? "appointment" : "",
  };
}

export function joinUniqueNotes(...parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const part of parts) {
    const text = String(part ?? "").trim();
    if (!text) continue;
    const key = text.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(text);
  }
  return lines.join("\n");
}

export function legalSectionIndex(text: string): number {
  const match = String(text ?? "").match(LEGAL_HEADING);
  return match?.index ?? -1;
}

export function stripLegalBoilerplate(text: string): string {
  const cut = legalSectionIndex(text);
  const body = cut >= 0 ? text.slice(0, cut) : text;
  return body
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isLegalBoilerplateLine(line))
    .join("\n")
    .trim();
}

export function isLegalBoilerplateLine(line: string): boolean {
  return /back[\s-]*solicit|attorney\s+fees|lawyer\s+fees|remit\s+to|fines?\s+schedule|indemnif|terms\s+(?:and|&)\s+conditions/i.test(
    line,
  );
}

export function applyStopPaperwork(stop: ParsedStop, extraText = ""): ParsedStop {
  const paper = parseStopPaperwork(`${stop.reference}\n${stop.confirmation}\n${stop.notes}\n${stop.quantity}\n${extraText}`);
  let reference = stop.reference.trim();
  let confirmation = stop.confirmation.trim();
  if (paper.reference && paper.confirmation && paper.reference !== paper.confirmation) {
    if (!reference || reference === confirmation) reference = paper.reference;
    if (!confirmation || confirmation === reference || confirmation === paper.reference) confirmation = paper.confirmation;
    if (reference === confirmation) {
      reference = paper.reference;
      confirmation = paper.confirmation;
    }
  } else {
    if (!reference) reference = paper.reference;
    if (!confirmation) confirmation = paper.confirmation;
    if (reference && reference === confirmation && paper.reference && paper.reference !== paper.confirmation) {
      reference = paper.reference;
      confirmation = paper.confirmation || confirmation;
    }
  }
  return normalizeParsedStop({
    ...stop,
    reference,
    confirmation,
    quantity: stop.quantity.trim() || paper.quantity,
    schedule_type: stop.schedule_type || paper.schedule_type,
    notes: stop.notes,
  });
}

function labeledBlock(chunk: string, label: string): string {
  const match = chunk.match(
    new RegExp(
      `(?:^|\\n)\\s*${label}\\s*[:\\-]?\\s*([\\s\\S]*?)(?=\\n\\s*(?:notes|directions|reference|location|date\\s*/?\\s*time|stop\\s+\\d|pickup|delivery|must pulp|driver must|trailer must|page\\s+\\d)|$)`,
      "i",
    ),
  );
  return String(match?.[1] ?? "").replace(/\s+/g, " ").trim();
}

function parseOperationalStopChunk(chunk: string): ParsedStop {
  const notes = labeledBlock(chunk, "notes");
  const directions = labeledBlock(chunk, "directions");
  const referenceLine = labeledBlock(chunk, "reference");
  const location = labeledBlock(chunk, "location");
  const address = parseAddressBlob(location || chunk);
  const mergedNotes = joinUniqueNotes(notes, directions);
  return applyStopPaperwork(
    normalizeParsedStop({
      ...address,
      notes: mergedNotes,
      schedule_type: /set\s+appt|appointment\s+required|strict\s+loading\s+appts/i.test(`${notes}\n${directions}`)
        ? "appointment"
        : address.schedule_type,
    }),
    `${referenceLine}\n${notes}\n${directions}`,
  );
}

export function parseBrokerOperationalStops(text: string): ParsedExtraStop[] {
  const raw = String(text ?? "");
  const headers = [...raw.matchAll(STOP_HEADER)];
  if (!headers.length) return [];
  const cut = legalSectionIndex(raw);
  const limit = cut >= 0 ? cut : raw.length;
  const stops: ParsedExtraStop[] = [];
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index][0] ?? "";
    const start = (headers[index].index ?? 0) + header.length;
    const end = index + 1 < headers.length ? (headers[index + 1].index ?? limit) : limit;
    if (start >= limit) break;
    const kind = /deliver/i.test(header) ? "delivery" : "pickup";
    const chunk = raw.slice(start, Math.max(start, Math.min(end, limit)));
    if (!/\bnotes\s*:|\bdirections\s*:|\b(?:p\/?u|po|conf)\s*#/i.test(chunk)) continue;
    const stop = parseOperationalStopChunk(chunk);
    if (parsedStopHasDetails(stop)) stops.push({ kind, stop });
  }
  return stops;
}

function isLoadLevelOpsLine(line: string): boolean {
  if (!line || isLegalBoilerplateLine(line)) return false;
  if (/^page\s+\d+/i.test(line)) return false;
  if (/^load\s*(?:no\.?|number|#)\s*/i.test(line)) return false;
  if (/dispatch confirmation/i.test(line)) return false;
  return (
    /^must\b/i.test(line) ||
    /^driver must\b/i.test(line) ||
    /^trailer must\b/i.test(line) ||
    /gate fees|lumper fees|submit receipts|after-hours tracking|air chute|exposed insulation|pulp product/i.test(line)
  );
}

export function collectOperationalDispatchNotes(text: string): string {
  const cut = legalSectionIndex(text);
  const body = cut >= 0 ? text.slice(0, cut) : text;
  const headers = [...body.matchAll(/stop\s+\d+/gi)];
  let region = body;
  if (headers.length) {
    const last = headers[headers.length - 1];
    const afterHeader = body.slice(last.index ?? 0);
    const opsAt = afterHeader.search(/\n\s*(?:MUST PULP|Driver must|Trailer must|Page\s+\d)/i);
    if (opsAt >= 0) region = afterHeader.slice(opsAt);
  } else {
    const pulp = body.search(/MUST PULP/i);
    if (pulp >= 0) region = body.slice(pulp);
  }
  const lines = region
    .split(/\n/)
    .map((line) => line.trim())
    .filter(isLoadLevelOpsLine);
  return stripLegalBoilerplate(lines.join("\n"));
}

function stopMatchKey(stop: ParsedStop): string {
  return [stop.city, stop.state, stop.name].map((part) => part.trim().toLowerCase()).filter(Boolean).join("|");
}

function samePlace(left: ParsedStop, right: ParsedStop): boolean {
  if (left.city && right.city && left.city.toLowerCase() === right.city.toLowerCase()) {
    if (!left.state || !right.state || left.state === right.state) return true;
  }
  const leftName = left.name.trim().toLowerCase();
  const rightName = right.name.trim().toLowerCase();
  return Boolean(leftName && rightName && (leftName.includes(rightName) || rightName.includes(leftName)));
}

function mergeParsedStopDetails(base: ParsedStop, incoming?: ParsedStop | null): ParsedStop {
  if (!incoming || !parsedStopHasDetails(incoming)) return applyStopPaperwork(base);
  const notes = joinUniqueNotes(base.notes, incoming.notes);
  const filled = normalizeParsedStop({
    ...base,
    name: base.name || incoming.name,
    street: base.street || incoming.street,
    city: base.city || incoming.city,
    state: base.state || incoming.state,
    zip: base.zip || incoming.zip,
    phone: base.phone || incoming.phone,
    schedule_type: base.schedule_type || incoming.schedule_type,
    window_start: base.window_start || incoming.window_start,
    window_end: base.window_end || incoming.window_end,
    confirmation: base.confirmation,
    reference: base.reference,
    quantity: base.quantity || incoming.quantity,
    notes,
  });
  return applyStopPaperwork(filled, `${incoming.reference}\n${incoming.confirmation}\n${incoming.notes}\n${incoming.quantity}`);
}

function notesLookTruncated(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/must check in$/i.test(trimmed)) return true;
  return trimmed.length < 80;
}

export function enrichParsedRateConFromText(parsed: ParsedRateCon, rawText = ""): ParsedRateCon {
  const text = rawText || parsed.raw_text;
  if (!text.trim()) {
    return {
      ...parsed,
      shipper: applyStopPaperwork(parsed.shipper),
      consignee: applyStopPaperwork(parsed.consignee),
      extra_stops: parsed.extra_stops.map((extra) => ({ ...extra, stop: applyStopPaperwork(extra.stop) })),
    };
  }
  const blocks = parseBrokerOperationalStops(text);
  const pickups = blocks.filter((item) => item.kind === "pickup");
  const deliveries = blocks.filter((item) => item.kind === "delivery");
  let shipper = applyStopPaperwork(parsed.shipper);
  let consignee = applyStopPaperwork(parsed.consignee);
  let extraStops = parsed.extra_stops.map((extra) => ({ ...extra, stop: applyStopPaperwork(extra.stop) }));

  const unused = [...blocks];
  const take = (kind: "pickup" | "delivery", current: ParsedStop): ParsedStop => {
    const idx = unused.findIndex((item) => item.kind === kind && (samePlace(current, item.stop) || !parsedStopHasDetails(current)));
    const fallback = unused.findIndex((item) => item.kind === kind);
    const pick = idx >= 0 ? idx : !parsedStopHasDetails(current) ? fallback : -1;
    if (pick < 0) return current;
    const [block] = unused.splice(pick, 1);
    return mergeParsedStopDetails(current, block?.stop);
  };

  shipper = take("pickup", shipper);
  consignee = take("delivery", consignee);
  extraStops = extraStops.map((extra) => {
    const idx = unused.findIndex((item) => item.kind === extra.kind && samePlace(extra.stop, item.stop));
    if (idx < 0) return extra;
    const [block] = unused.splice(idx, 1);
    return { ...extra, stop: mergeParsedStopDetails(extra.stop, block?.stop) };
  });
  for (const leftover of unused) {
    if (!parsedStopHasDetails(leftover.stop)) continue;
    const already =
      samePlace(shipper, leftover.stop) ||
      samePlace(consignee, leftover.stop) ||
      extraStops.some((extra) => samePlace(extra.stop, leftover.stop));
    if (already) continue;
    extraStops.push(leftover);
  }

  if (!parsedStopHasDetails(shipper) && pickups[0]) shipper = pickups[0].stop;
  if (!parsedStopHasDetails(consignee) && deliveries[0]) consignee = deliveries[0].stop;

  const ops = collectOperationalDispatchNotes(text);
  let special = stripLegalBoilerplate(parsed.special_instructions);
  if (ops && (blocks.length > 0 || /MUST PULP/i.test(text))) {
    if (notesLookTruncated(special) || (ops.includes("MUST PULP") && !special.includes("MUST PULP"))) {
      special = joinUniqueNotes(special, ops);
    }
  }
  special = stripLegalBoilerplate(special);

  return {
    ...parsed,
    origin: parsed.origin || cityStateFromStop(shipper),
    destination: parsed.destination || cityStateFromStop(consignee),
    shipper,
    consignee,
    extra_stops: extraStops,
    special_instructions: special,
    reefer_setpoint_f: parsed.reefer_setpoint_f ?? parseReeferSetpointFromText(text) ?? parseReeferSetpointFromText(special),
    reefer_mode: parsed.reefer_mode || parseReeferModeFromText(text) || parseReeferModeFromText(special) || "",
    raw_text: parsed.raw_text || text,
  };
}

