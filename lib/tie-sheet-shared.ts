/** Client-safe Tie Sheet mapping. One load per truck. One drop per customer+dock. Do not invent columns. */

export const TIE_SHEET_CUSTOMER = "M&S Loads";
export const TIE_SHEET_SHIPPER_NAME = "Nebraska Cold Storage Inc";
export const TIE_SHEET_SHIPPER_CITY = "Hastings";
export const TIE_SHEET_SHIPPER_STATE = "NE";
export const TIE_SHEET_DATE_YEAR = 2026;

export const TIE_SHEET_MISSING_KEY_MESSAGE =
  "The Tie Sheet reader is not connected. The same connection Mike uses is missing. Nothing was saved.";

export const TIE_SHEET_READ_FAILED =
  "I could not read a Tie Sheet truck from that picture. Nothing was saved.";

export type TieSheetOrder = {
  control: string;
  po: string;
  deliver_to: string;
  city: string;
  state: string;
  ship_date: string;
  delv_date: string;
  weight: number | null;
  qty: number | null;
  qty_label: string;
  comments: string;
  appts: string;
};

export type TieSheetExtract = {
  load_id: string;
  orders: TieSheetOrder[];
  total_weight: number | null;
  total_qty: number | null;
};

export type TieSheetDrop = {
  name: string;
  city: string;
  state: string;
  schedule_type: "appointment" | "fcfs";
  call_before: boolean;
  window_start: string;
  window_end: string;
  order_numbers: string[];
  po_numbers: string[];
  confirmation: string;
  reference: string;
  notes: string;
  cargo: string;
};

export type TieSheetDraft = {
  customer_name: string;
  tie_sheet_load_id: string;
  origin: string;
  destination: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  weight: number | null;
  case_count: number | null;
  po_number: string;
  notes: string;
  equipment: string;
  reefer_mode: string;
  pickup: {
    name: string;
    city: string;
    state: string;
    schedule_type: "appointment";
    call_before: boolean;
    window_start: string;
    window_end: string;
  };
  /** First drop. Same-receiver trucks have only this one. */
  drop: TieSheetDrop;
  /** One drop per customer + location/dock. Same dock shares a drop. */
  drops: TieSheetDrop[];
};

const LOAD_ID_RE = /\b(\d{3,4}-\d{1,2}[A-Za-z])\b/;
const CITY_STATE_RE = /^(.+?),\s*([A-Za-z]{2})\s*$/;

export function emptyTieSheetOrder(): TieSheetOrder {
  return {
    control: "",
    po: "",
    deliver_to: "",
    city: "",
    state: "",
    ship_date: "",
    delv_date: "",
    weight: null,
    qty: null,
    qty_label: "",
    comments: "",
    appts: "",
  };
}

export function emptyTieSheetExtract(): TieSheetExtract {
  return { load_id: "", orders: [], total_weight: null, total_qty: null };
}

export function parseTieSheetNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[, ]/g, "").trim();
  if (!cleaned || /[a-z]/i.test(cleaned)) return null;
  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

export function parseTieSheetDate(raw: string, year = TIE_SHEET_DATE_YEAR): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (!us) return "";
  const month = Number(us[1]);
  const day = Number(us[2]);
  let yr = year;
  if (us[3]) {
    yr = Number(us[3]) < 100 ? 2000 + Number(us[3]) : Number(us[3]);
    if (!us[3] || String(us[3]).length < 4) yr = year;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${yr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseTieSheetClock(raw: string): { hour: number; minute: number } | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const ampm = match[3] ?? "";
  if (/p/i.test(ampm) && hour < 12) hour += 12;
  if (/a/i.test(ampm) && hour === 12) hour = 0;
  if (!ampm && hour > 23) return null;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function atLocal(dateIso: string, hour: number, minute: number): string {
  const [year, month, day] = dateIso.split("-").map((part) => Number(part));
  if (!year || !month || !day) return "";
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

export function parseTieSheetAppt(
  raw: string,
  delvDate: string,
): { schedule_type: "appointment" | "fcfs"; window_start: string; window_end: string } {
  const text = String(raw ?? "").trim();
  const date = parseTieSheetDate(delvDate) || delvDate;
  const fallback = date ? atLocal(date, 8, 0) : "";
  if (!text) {
    return { schedule_type: "appointment", window_start: fallback, window_end: fallback };
  }
  if (/fcfs|first\s*come/i.test(text)) {
    const range = text.match(
      /(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*[-–to]+\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i,
    );
    const startClock = parseTieSheetClock(range?.[1] ?? "7am") ?? { hour: 7, minute: 0 };
    const endClock = parseTieSheetClock(range?.[2] ?? "4pm") ?? { hour: 16, minute: 0 };
    return {
      schedule_type: "fcfs",
      window_start: date ? atLocal(date, startClock.hour, startClock.minute) : "",
      window_end: date ? atLocal(date, endClock.hour, endClock.minute) : "",
    };
  }
  const clock = parseTieSheetClock(text) ?? { hour: 8, minute: 0 };
  const when = date ? atLocal(date, clock.hour, clock.minute) : "";
  return { schedule_type: "appointment", window_start: when, window_end: when };
}

export function splitCityState(raw: string): { city: string; state: string } {
  const text = String(raw ?? "").trim();
  const match = text.match(CITY_STATE_RE);
  if (match) return { city: match[1].trim(), state: match[2].toUpperCase() };
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2 && /^[A-Za-z]{2}$/.test(parts[parts.length - 1])) {
    return { city: parts.slice(0, -1).join(", "), state: parts[parts.length - 1].toUpperCase() };
  }
  return { city: text, state: "" };
}

export function normalizeTieSheetLoadId(raw: string): string {
  const match = String(raw ?? "").trim().toUpperCase().match(LOAD_ID_RE);
  return match?.[1] ?? String(raw ?? "").trim();
}

function firstFilled(values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

const GENERIC_CUSTOMER_TOKENS = new Set([
  "kosher",
  "deli",
  "crossdock",
  "cross",
  "dock",
  "warehouse",
  "foods",
  "food",
  "inc",
  "llc",
  "co",
  "company",
  "the",
  "and",
  "of",
]);

function nameTokens(name: string): string[] {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function sortedNameKey(name: string): string {
  return nameTokens(name).slice().sort().join(" ");
}

function customerCoreTokens(name: string): string[] {
  return nameTokens(name).filter((token) => token.length >= 4 && !GENERIC_CUSTOMER_TOKENS.has(token));
}

function placeKey(city: string, state: string): string {
  return `${city.trim().toLowerCase()}|${state.trim().toUpperCase()}`;
}

function orderPlace(order: TieSheetOrder): { city: string; state: string } {
  const split = splitCityState([order.city, order.state].filter(Boolean).join(", "));
  return {
    city: split.city || order.city.trim(),
    state: (split.state || order.state.trim()).toUpperCase(),
  };
}

/** Same Deliver To wording (including Deli Crossdock / Crossdock Deli) at the same city. */
export function tieSheetOrderDockKey(order: TieSheetOrder): string {
  const place = orderPlace(order);
  return `${sortedNameKey(order.deliver_to)}|${placeKey(place.city, place.state)}`;
}

/**
 * Combine orders onto one drop only when they share a customer and a location/dock.
 * Word-order variants of the same Deliver To stay together. Different customers
 * in the same city (Zant vs Western Kosher) stay separate. Heartland/Western Kosher
 * rows in the same city share a drop.
 */
export function groupTieSheetOrdersByDock(orders: TieSheetOrder[]): TieSheetOrder[][] {
  const groups: Array<{
    dockKey: string;
    place: string;
    core: Set<string>;
    orders: TieSheetOrder[];
  }> = [];
  for (const order of orders) {
    const place = orderPlace(order);
    const placeId = placeKey(place.city, place.state);
    const dockKey = tieSheetOrderDockKey(order);
    const core = new Set(customerCoreTokens(order.deliver_to));
    const exact = groups.find((group) => group.dockKey === dockKey);
    const family =
      exact ??
      groups.find((group) => {
        if (group.place !== placeId) return false;
        if (!core.size || !group.core.size) return false;
        for (const token of core) {
          if (group.core.has(token)) return true;
        }
        return false;
      });
    if (family) {
      family.orders.push(order);
      for (const token of core) family.core.add(token);
    } else {
      groups.push({ dockKey, place: placeId, core, orders: [order] });
    }
  }
  return groups.map((group) => group.orders);
}

function dropFromOrders(group: TieSheetOrder[]): TieSheetDrop {
  const first = group[0] ?? emptyTieSheetOrder();
  const receiver = firstFilled(group.map((order) => order.deliver_to)) || first.deliver_to;
  const place = orderPlace(first);
  const city = firstFilled(group.map((order) => orderPlace(order).city)) || place.city;
  const state = (firstFilled(group.map((order) => orderPlace(order).state)) || place.state).toUpperCase();
  const delvDate = parseTieSheetDate(firstFilled(group.map((order) => order.delv_date)));
  const appt = parseTieSheetAppt(firstFilled(group.map((order) => order.appts)), delvDate);
  const orderNumbers = uniqueNonEmpty(group.map((order) => order.control));
  const poNumbers = uniqueNonEmpty(group.map((order) => order.po));
  return {
    name: receiver,
    city,
    state,
    schedule_type: appt.schedule_type,
    call_before: true,
    window_start: appt.window_start,
    window_end: appt.window_end || appt.window_start,
    order_numbers: orderNumbers,
    po_numbers: poNumbers,
    confirmation: orderNumbers.join(", "),
    reference: poNumbers.join(", "),
    notes: group.map(formatTieSheetOrderLine).filter(Boolean).join("\n"),
    cargo: group
      .map((order) => {
        const qty = order.qty != null ? String(order.qty) : order.qty_label;
        return [order.control, qty].filter(Boolean).join(" ");
      })
      .filter(Boolean)
      .join("; "),
  };
}

export function tieSheetDraftDrops(draft: Pick<TieSheetDraft, "drops" | "drop">): TieSheetDrop[] {
  if (Array.isArray(draft.drops) && draft.drops.length) return draft.drops;
  return draft.drop ? [draft.drop] : [];
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

export function formatTieSheetOrderLine(order: TieSheetOrder): string {
  const qty = order.qty != null ? String(order.qty) : order.qty_label;
  const weight = order.weight != null ? order.weight.toLocaleString("en-US") : "";
  return [order.control, order.po ? `PO ${order.po}` : "", qty, weight, order.comments]
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join(" / ");
}

export function draftFromTieSheetExtract(extract: TieSheetExtract): TieSheetDraft {
  const orders = (extract.orders ?? []).filter((order) => order.control.trim() || order.po.trim());
  const groups = groupTieSheetOrdersByDock(orders);
  const drops = groups.map(dropFromOrders);
  const firstDrop = drops[0] ?? dropFromOrders([emptyTieSheetOrder()]);
  const lastDrop = drops[drops.length - 1] ?? firstDrop;
  const shipDate = parseTieSheetDate(firstFilled(orders.map((order) => order.ship_date)));
  const pickupStart = shipDate ? atLocal(shipDate, 8, 0) : "";
  const poNumbers = uniqueNonEmpty(drops.flatMap((drop) => drop.po_numbers));
  const numericQty = orders.reduce((sum, order) => sum + (order.qty ?? 0), 0);
  const hasQty = orders.some((order) => order.qty != null);
  const orderWeight = orders.reduce((sum, order) => sum + (order.weight ?? 0), 0);
  const hasWeight = extract.total_weight != null || orders.some((order) => order.weight != null);
  const weight = extract.total_weight ?? (hasWeight ? orderWeight : null);
  const caseCount = extract.total_qty ?? (hasQty ? numericQty : null);
  const loadId = normalizeTieSheetLoadId(extract.load_id);
  const lastPlace =
    lastDrop.city && lastDrop.state ? `${lastDrop.city}, ${lastDrop.state}` : lastDrop.city || lastDrop.name;

  return {
    customer_name: TIE_SHEET_CUSTOMER,
    tie_sheet_load_id: loadId,
    origin: `${TIE_SHEET_SHIPPER_CITY}, ${TIE_SHEET_SHIPPER_STATE}`,
    destination: lastPlace,
    pickup_start: pickupStart,
    pickup_end: pickupStart,
    delivery_start: firstDrop.window_start,
    delivery_end: lastDrop.window_end || lastDrop.window_start,
    weight,
    case_count: caseCount,
    po_number: poNumbers.join(", "),
    notes: loadId ? `Tie Sheet ${loadId}` : "Tie Sheet",
    equipment: "reefer_53",
    reefer_mode: "continuous",
    pickup: {
      name: TIE_SHEET_SHIPPER_NAME,
      city: TIE_SHEET_SHIPPER_CITY,
      state: TIE_SHEET_SHIPPER_STATE,
      schedule_type: "appointment",
      call_before: true,
      window_start: pickupStart,
      window_end: pickupStart,
    },
    drop: firstDrop,
    drops,
  };
}

export function tieSheetDraftPreview(draft: TieSheetDraft): string {
  const qty = draft.case_count != null ? String(draft.case_count) : "—";
  const weight = draft.weight != null ? draft.weight.toLocaleString("en-US") : "—";
  const drops = tieSheetDraftDrops(draft);
  const dropLines = drops.map((drop, index) => {
    const when = drop.schedule_type === "fcfs" ? "FCFS" : "APPT";
    return [
      `Drop ${index + 1}: ${drop.name}, ${drop.city}, ${drop.state} ${when}`,
      `  Orders: ${drop.order_numbers.join(", ") || "—"}`,
      `  POs: ${drop.po_numbers.join(", ") || "—"}`,
      `  Delv ${formatPreviewDate(drop.window_start)}`,
    ].join("\n");
  });
  return [
    `Build load from Tie Sheet ${draft.tie_sheet_load_id || "snapshot"}`,
    `Customer: ${draft.customer_name}`,
    `Pickup: ${draft.pickup.name}, ${draft.pickup.city}, ${draft.pickup.state}`,
    `${drops.length} drop${drops.length === 1 ? "" : "s"} (same customer+dock share a drop)`,
    ...dropLines,
    `Ship ${formatPreviewDate(draft.pickup_start)}`,
    `Qty ${qty} · Weight ${weight}`,
    "Equipment: Reefer / Continuous",
    "Confirm saves. Discard does not.",
  ].join("\n");
}

function formatPreviewDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  const time = minute ? `${hour12}:${String(minute).padStart(2, "0")} ${ampm}` : `${hour12}:00 ${ampm}`;
  return `${month}/${day}/${year} ${time}`;
}

export function isTieSheetImageName(filename: string, mime = ""): boolean {
  const lower = filename.toLowerCase();
  const type = mime.toLowerCase();
  return type.startsWith("image/") || /\.(png|jpe?g|webp|heic|gif)$/.test(lower);
}

export function parseTieSheetJson(raw: unknown): TieSheetExtract {
  if (!raw || typeof raw !== "object") return emptyTieSheetExtract();
  const row = raw as Record<string, unknown>;
  const ordersIn = Array.isArray(row.orders) ? row.orders : [];
  const orders = ordersIn.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const order = item as Record<string, unknown>;
    const place = splitCityState(String(order.city_state ?? order.cityState ?? ""));
    const qtyRaw = order.qty ?? order.quantity ?? order.boxes;
    const qty = parseTieSheetNumber(qtyRaw as string | number | null);
    const mapped: TieSheetOrder = {
      control: String(order.control ?? order.control_number ?? order.order_number ?? "").trim(),
      po: String(order.po ?? order.po_number ?? "").trim(),
      deliver_to: String(order.deliver_to ?? order.deliverTo ?? order.receiver ?? "").trim(),
      city: String(order.city ?? place.city).trim(),
      state: String(order.state ?? place.state).trim().toUpperCase(),
      ship_date: String(order.ship_date ?? order.shipDate ?? order.pickup_date ?? "").trim(),
      delv_date: String(order.delv_date ?? order.delvDate ?? order.delivery_date ?? "").trim(),
      weight: parseTieSheetNumber(order.weight as string | number | null),
      qty,
      qty_label: qty == null ? String(qtyRaw ?? "").trim() : "",
      comments: String(order.comments ?? order.comment ?? "").trim(),
      appts: String(order.appts ?? order.appt ?? order.appointment ?? "").trim(),
    };
    if (!mapped.control && !mapped.po) return [];
    return [mapped];
  });
  return {
    load_id: normalizeTieSheetLoadId(String(row.load_id ?? row.loadId ?? row.truck_id ?? "")),
    orders,
    total_weight: parseTieSheetNumber(row.total_weight as string | number | null),
    total_qty: parseTieSheetNumber(row.total_qty as string | number | null),
  };
}

function isNoiseRow(line: string): boolean {
  const text = line.trim();
  if (!text) return true;
  if (/^customer\s+pickup/i.test(text)) return true;
  if (/^\*{2,}|★{2,}|stars?/i.test(text)) return true;
  if (/future[- ]week|park/i.test(text)) return true;
  if (/^control#?\s*\|?\s*po#?/i.test(text)) return true;
  if (/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(text)) return true;
  return false;
}

function isTotalRow(line: string): boolean {
  return /xk\s*\+\s*total|\btotal\b/i.test(line);
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (trimmed.includes("|")) {
    return trimmed.split("|").map((part) => part.trim());
  }
  if (trimmed.includes("\t")) {
    return trimmed.split("\t").map((part) => part.trim());
  }
  return [];
}

/**
 * Test-only parser for markdown/text fixtures. Not a dispatcher paste path.
 * Column order: Control# | PO# | Deliver To | City, State | Ship date | Delv date | Weight | Qty | Comments | Appts
 */
export function parseTieSheetText(text: string): TieSheetExtract {
  const lines = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const extract = emptyTieSheetExtract();
  let sawTruck = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!sawTruck) {
      const id = normalizeTieSheetLoadId(trimmed);
      if (LOAD_ID_RE.test(id) && splitRow(trimmed).length <= 2) {
        extract.load_id = id;
        sawTruck = true;
        continue;
      }
    }
    if (isNoiseRow(trimmed)) {
      if (sawTruck && extract.orders.length && !trimmed) break;
      continue;
    }
    if (isTotalRow(trimmed)) {
      const cells = splitRow(trimmed);
      const nums = cells.map((cell) => parseTieSheetNumber(cell)).filter((n): n is number => n != null);
      if (nums.length) extract.total_weight = nums[0];
      if (nums.length > 1) extract.total_qty = nums[1];
      break;
    }
    const cells = splitRow(trimmed);
    if (cells.length < 4) {
      const id = normalizeTieSheetLoadId(trimmed);
      if (!extract.load_id && LOAD_ID_RE.test(id)) extract.load_id = id;
      continue;
    }
    if (sawTruck && extract.orders.length && !trimmed) break;
    sawTruck = true;
    const place = splitCityState(cells[3] ?? "");
    const qty = parseTieSheetNumber(cells[7]);
    extract.orders.push({
      control: cells[0] ?? "",
      po: cells[1] ?? "",
      deliver_to: cells[2] ?? "",
      city: place.city,
      state: place.state,
      ship_date: cells[4] ?? "",
      delv_date: cells[5] ?? "",
      weight: parseTieSheetNumber(cells[6]),
      qty,
      qty_label: qty == null ? String(cells[7] ?? "").trim() : "",
      comments: cells[8] ?? "",
      appts: cells[9] ?? "",
    });
  }
  return extract;
}

/** Fill blank vision fields from a known snapshot. Never overwrite a value the picture already gave. */
export function fillAmbiguousTieSheetFields(seen: TieSheetExtract, known: TieSheetExtract): TieSheetExtract {
  const knownByControl = new Map(known.orders.map((order) => [order.control.trim(), order]));
  const seenControls = new Set(seen.orders.map((order) => order.control.trim()).filter(Boolean));
  const orders = seen.orders.map((order) => {
    const hint = knownByControl.get(order.control.trim());
    if (!hint) return order;
    return {
      control: order.control || hint.control,
      po: order.po || hint.po,
      deliver_to: order.deliver_to || hint.deliver_to,
      city: order.city || hint.city,
      state: order.state || hint.state,
      ship_date: order.ship_date || hint.ship_date,
      delv_date: order.delv_date || hint.delv_date,
      weight: order.weight ?? hint.weight,
      qty: order.qty ?? hint.qty,
      qty_label: order.qty_label || hint.qty_label,
      comments: order.comments || hint.comments,
      appts: order.appts || hint.appts,
    };
  });
  for (const hint of known.orders) {
    if (hint.control && !seenControls.has(hint.control.trim())) orders.push(hint);
  }
  return {
    load_id: seen.load_id || known.load_id,
    orders,
    total_weight: seen.total_weight ?? known.total_weight,
    total_qty: seen.total_qty ?? known.total_qty,
  };
}

export function encodeTieSheetDraft(draft: TieSheetDraft): string {
  return JSON.stringify(draft);
}

export function decodeTieSheetDraft(raw: string): TieSheetDraft | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const draft = parsed as TieSheetDraft;
    if (!draft.customer_name || !draft.pickup) return null;
    const drops = tieSheetDraftDrops(draft);
    if (!drops.length) return null;
    return { ...draft, drop: drops[0], drops };
  } catch {
    return null;
  }
}
