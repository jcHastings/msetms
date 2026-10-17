import fs from "node:fs";
import { recordLoadAudit } from "./audit";
import { getDb } from "./db";
import { invoiceAlreadySentWarning } from "./detention-lock";
import {
  approvalEmailHasDollarAmount,
  composeDetentionApprovalEmail,
  computeDetentionAmount,
  detentionRateLabel,
  detentionRequestTrigger,
  detentionSignature,
  isDetentionStatus,
  signatureHasBrokerageIdentity,
  timesMatchGeofence,
  DETENTION_REPLY_TO_DEFAULT,
  type DetentionDraftView,
  type DetentionRequestView,
  type DetentionStatus,
} from "./detention-request";
import { DETENTION_HOS_FLAG, detentionEndSourceLabel, isDetentionEndSource } from "./detention-end";
import { latestNoticeForStop } from "./detention-notice-store";
import { detentionEndForStop } from "./detention-signals";
import {
  detentionAmountCap,
  detentionTermLines,
  resolveDetentionTerms,
} from "./customer-contract-shared";
import { contractFreeMinutesForCustomer, readCustomerDetentionTerms } from "./customer-contracts";
import { parseDetentionTerms } from "./detention-terms";
import { getAttachment, getAttachmentPath, listAttachments } from "./files";
import { type OutgoingMail } from "./mail-shared";
import { isUsableEmail } from "./mail-shared";
import { recordSentMail } from "./mail-store";
import { resolveLoadCustomerEmail } from "./load-mail";
import { addPayItem } from "./pay-items";
import { getLoad } from "./queries";
import { getStop } from "./stops";

export type LoadDetentionTerms = {
  rate: number | null;
  freeMinutes: number | null;
  cap: number | null;
  roundMinutes: number | null;
  clause: string;
  scanned: boolean;
};

export type DetentionSettings = {
  replyTo: string;
  pickupsEnabled: boolean;
};

type RequestRow = {
  id: number;
  load_id: number;
  stop_id: number;
  status: string;
  rate: number | null;
  amount: number | null;
  pay_item_id: number | null;
  sent_at: string;
  note: string;
};

const ACTIVE = new Set<DetentionStatus>(["requested", "approved", "paid"]);

export function getDetentionSettings(): DetentionSettings {
  const row = getDb()
    .prepare("SELECT detention_reply_to, detention_pickups FROM company_profile WHERE id = 1")
    .get() as { detention_reply_to?: string; detention_pickups?: number } | undefined;
  const reply = String(row?.detention_reply_to ?? "").trim();
  return {
    replyTo: isUsableEmail(reply) ? reply : DETENTION_REPLY_TO_DEFAULT,
    pickupsEnabled: Number(row?.detention_pickups ?? 0) === 1,
  };
}

export function saveDetentionSettings(input: { replyTo: string; pickupsEnabled: boolean }): DetentionSettings {
  const reply = input.replyTo.trim();
  if (!isUsableEmail(reply)) throw new Error("Enter a reply-to email for detention requests.");
  if (signatureHasBrokerageIdentity(reply)) throw new Error("Detention replies stay on the carrier inbox.");
  const current = getDetentionSettings();
  getDb()
    .prepare("UPDATE company_profile SET detention_reply_to = ?, detention_pickups = ? WHERE id = 1")
    .run(reply, input.pickupsEnabled ? 1 : 0);
  getDb()
    .prepare(
      `INSERT INTO audit_log (actor, action, entity, entity_id, detail, created_at)
       VALUES ('dispatcher', 'update', 'detention_settings', 1, ?, ?)`,
    )
    .run(
      `reply-to ${current.replyTo} -> ${reply}; pickups ${current.pickupsEnabled ? "on" : "off"} -> ${input.pickupsEnabled ? "on" : "off"}`,
      new Date().toISOString(),
    );
  return getDetentionSettings();
}

export function readLoadDetentionTerms(loadId: number): LoadDetentionTerms {
  const row = getDb()
    .prepare(
      `SELECT detention_rate, detention_free_minutes, detention_cap, detention_round_minutes,
              detention_clause, detention_terms_scanned
       FROM loads WHERE id = ?`,
    )
    .get(loadId) as Record<string, unknown> | undefined;
  if (!row) {
    return { rate: null, freeMinutes: null, cap: null, roundMinutes: null, clause: "", scanned: false };
  }
  return {
    rate: numberOrNull(row.detention_rate),
    freeMinutes: intOrNull(row.detention_free_minutes),
    cap: numberOrNull(row.detention_cap),
    roundMinutes: intOrNull(row.detention_round_minutes),
    clause: String(row.detention_clause ?? ""),
    scanned: Number(row.detention_terms_scanned ?? 0) === 1,
  };
}

export function markDetentionTermsUnscanned(loadId: number): void {
  getDb().prepare("UPDATE loads SET detention_terms_scanned = 0 WHERE id = ?").run(loadId);
}

export function saveDetentionTermsFromText(loadId: number, text: string): LoadDetentionTerms {
  const parsed = parseDetentionTerms(text);
  getDb()
    .prepare(
      `UPDATE loads SET
        detention_rate = ?,
        detention_free_minutes = ?,
        detention_cap = ?,
        detention_round_minutes = ?,
        detention_clause = ?,
        detention_terms_scanned = 1
       WHERE id = ?`,
    )
    .run(parsed.rate, parsed.freeMinutes, parsed.cap, parsed.roundMinutes, parsed.clause, loadId);
  return readLoadDetentionTerms(loadId);
}

export async function ensureDetentionTerms(loadId: number): Promise<LoadDetentionTerms> {
  const current = readLoadDetentionTerms(loadId);
  if (current.scanned) return current;
  const file = listAttachments(loadId)
    .filter((item) => item.kind === "rate_con")
    .sort((a, b) => b.id - a.id)[0];
  if (!file) {
    getDb().prepare("UPDATE loads SET detention_terms_scanned = 1 WHERE id = ?").run(loadId);
    return readLoadDetentionTerms(loadId);
  }
  const stored = getAttachmentPath(file);
  if (!stored || !fs.existsSync(stored)) {
    getDb().prepare("UPDATE loads SET detention_terms_scanned = 1 WHERE id = ?").run(loadId);
    return readLoadDetentionTerms(loadId);
  }
  const { extractDocumentText } = await import("./rate-con");
  const text = await extractDocumentText(fs.readFileSync(stored), file.mime_type || "", file.original_name);
  return saveDetentionTermsFromText(loadId, text);
}

export function detentionDraftHref(loadId: number, stopId: number): string {
  const load = getLoad(loadId);
  const stop = getStop(stopId);
  if (!load || !stop || stop.load_id !== loadId) return "";
  const resolved = resolveLoadDetention(loadId);
  const settings = getDetentionSettings();
  const trigger = detentionRequestTrigger({
    loadStatus: load.status,
    stopKind: stop.kind,
    arrivedAt: stop.arrived_at,
    departedAt: stop.departed_at,
    scheduleType: stop.schedule_type,
    windowStart: stop.window_start,
    windowEnd: stop.window_end,
    freeMinutes: readLoadDetentionTerms(loadId).freeMinutes,
    contractFreeMinutes: contractFreeMinutesForCustomer(load.customer_id),
    endAt: detentionEndForStop(stop).endAt,
    roundMinutes: resolved.billingIncrementMinutes.value,
    pickupsEnabled: settings.pickupsEnabled,
  });
  if (!trigger.show) return "";
  return `/loads/${loadId}?tab=stops&detention=${stopId}`;
}

export function detentionQboHint(loadId: number): string {
  const row = getDb()
    .prepare("SELECT COALESCE(SUM(applied_amount), 0) AS applied FROM qbo_payment_applications WHERE load_id = ?")
    .get(loadId) as { applied?: number } | undefined;
  const applied = Number(row?.applied ?? 0);
  if (!Number.isFinite(applied) || applied <= 0) return "";
  return `QuickBooks shows $${applied.toFixed(2)} applied on this load. That does not mark this detention paid.`;
}

export async function buildDetentionDraft(loadId: number, stopId: number): Promise<DetentionDraftView> {
  const loaded = loadContext(loadId, stopId);
  await ensureDetentionTerms(loadId);
  const resolved = resolveLoadDetention(loadId);
  const settings = getDetentionSettings();
  const trigger = detentionRequestTrigger({
    loadStatus: loaded.load.status,
    stopKind: loaded.stop.kind,
    arrivedAt: loaded.stop.arrived_at,
    departedAt: loaded.stop.departed_at,
    scheduleType: loaded.stop.schedule_type,
    windowStart: loaded.stop.window_start,
    windowEnd: loaded.stop.window_end,
    freeMinutes: readLoadDetentionTerms(loadId).freeMinutes,
    contractFreeMinutes: contractFreeMinutesForCustomer(loaded.load.customer_id),
    endAt: detentionEndForStop(loaded.stop).endAt,
    roundMinutes: resolved.billingIncrementMinutes.value,
    pickupsEnabled: settings.pickupsEnabled,
  });
  if (!trigger.show) {
    throw new Error("Detention draft opens after arrive and depart are both set and the dwell is past free time.");
  }
  const stamps = geofenceStamps(loaded.load.truck_id, stopId);
  const arrivedGeofence = timesMatchGeofence(loaded.stop.arrived_at, stamps);
  const departedGeofence = timesMatchGeofence(loaded.stop.departed_at, stamps);
  const po = firstText(loaded.load.po_number, loaded.load.customer_reference, loaded.stop.reference);
  const end = detentionEndForStop(loaded.stop);
  const notice = latestNoticeForStop(stopId);
  const noticeSent = notice && notice.status === "sent" ? notice : null;
  const email = composeDetentionApprovalEmail({
    loadNumber: loaded.load.load_number,
    po,
    stopName: loaded.stop.name,
    city: loaded.stop.city,
    state: loaded.stop.state,
    scheduleType: loaded.stop.schedule_type,
    windowStart: loaded.stop.window_start,
    windowEnd: loaded.stop.window_end,
    arrivedAt: loaded.stop.arrived_at,
    departedAt: loaded.stop.departed_at,
    arrivedGeofence,
    departedGeofence,
    endAt: end.endAt,
    endLabel: end.label,
    noticeSentAt: noticeSent?.sentAt ?? "",
    dwellMinutes: trigger.dwellMinutes,
    freeMinutes: trigger.freeMinutes,
    freeSource: trigger.freeSource,
    billableMinutes: trigger.billableMinutes,
  });
  if (approvalEmailHasDollarAmount(email.text) || signatureHasBrokerageIdentity(detentionSignature())) {
    throw new Error("Detention approval email could not be prepared.");
  }
  const active = activeRequest(stopId);
  return {
    loadId,
    stopId,
    loadNumber: loaded.load.load_number,
    to: resolveLoadCustomerEmail(loaded.load),
    cc: "",
    replyTo: settings.replyTo,
    subject: email.subject,
    body: email.text,
    clause: resolved.conditions.value ?? "",
    rate: resolved.rate.value,
    rateLabel: rateLabelFor(resolved),
    freeMinutes: trigger.freeMinutes,
    freeSource: trigger.freeSource,
    billableMinutes: trigger.billableMinutes,
    cap: detentionAmountCap(resolved),
    roundMinutes: resolved.billingIncrementMinutes.value,
    termsLines: detentionTermLines(resolved),
    attachments: paperworkChoices(loadId),
    request: active ? toView(active) : null,
    invoiceWarning: invoiceAlreadySentWarning(loadId),
    qboHint: detentionQboHint(loadId),
    computedAmount: computeDetentionAmount(resolved.rate.value, trigger.billableMinutes, detentionAmountCap(resolved)),
    end: {
      endAt: end.endAt,
      source: end.source,
      label: end.label,
      hosFlag: end.hosFlag,
      flagText: end.hosFlag ? DETENTION_HOS_FLAG : "",
      needsDeskPick: end.needsDeskPick,
      deskPicked: end.deskPicked,
      candidates: end.candidates.map((item) => ({
        source: item.source,
        label: detentionEndSourceLabel(item.source),
        at: item.at,
      })),
    },
    notice: noticeSent
      ? { sentAt: noticeSent.sentAt, startAt: noticeSent.startAt, leadMinutes: noticeSent.leadMinutes }
      : null,
  };
}

/** Desk picks which time ends detention after the HOS flag. Blank clears the pick. */
export function setDetentionEndPick(input: { loadId: number; stopId: number; source: string }): void {
  const loaded = loadContext(input.loadId, input.stopId);
  const source = input.source.trim();
  if (source && !isDetentionEndSource(source)) throw new Error("Pick an end time from the list.");
  if (source) {
    const end = detentionEndForStop(loaded.stop);
    if (!end.candidates.some((item) => item.source === source)) throw new Error("That time is not on this stop.");
  }
  const old = String(loaded.stop.detention_end_pick ?? "");
  if (old === source) return;
  getDb().prepare("UPDATE load_stops SET detention_end_pick = ? WHERE id = ?").run(source, input.stopId);
  recordLoadAudit({
    loadId: input.loadId,
    action: "detention_end_pick",
    field: "detention_end_pick",
    oldValue: detentionEndSourceLabel(old) || old,
    newValue: detentionEndSourceLabel(source) || "cleared",
  });
}

export async function sendDetentionRequest(input: {
  loadId: number;
  stopId: number;
  to: string;
  cc?: string;
  subject: string;
  body: string;
  attachmentIds: number[];
  actor: string;
  send: (mail: OutgoingMail) => Promise<{ messageId?: string } | void>;
}): Promise<{ id: number; sentMailId: number }> {
  const draft = await buildDetentionDraft(input.loadId, input.stopId);
  if (draft.request && ACTIVE.has(draft.request.status)) {
    throw new Error("A detention request is already open for this stop.");
  }
  const to = input.to.trim();
  if (!isUsableEmail(to)) throw new Error("Add the broker email on the load, or the customer's main email.");
  const cc = String(input.cc ?? "").trim();
  if (cc && !isUsableEmail(cc)) throw new Error("Check the copy address.");
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) throw new Error("Email is empty.");
  if (approvalEmailHasDollarAmount(body)) {
    throw new Error("The first detention email asks for approval only. Remove the dollar amount.");
  }
  if (draft.end.needsDeskPick) {
    throw new Error("Pick the detention end time first. The driver may have stayed for an HOS reset.");
  }
  const settings = getDetentionSettings();
  const noticeRow = draft.notice ? latestNoticeForStop(input.stopId) : null;
  const files = mailFiles(input.loadId, input.attachmentIds);
  const sent = await input.send({
    to,
    cc: cc || undefined,
    subject,
    text: body,
    replyTo: settings.replyTo,
    fromName: detentionSignature().split("\n")[0],
    attachments: files.map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType,
    })),
  });
  const sentMailId = recordSentMail({
    loadId: input.loadId,
    kind: "detention_request",
    to,
    subject,
  });
  const messageId = String(sent?.messageId ?? "").trim() || String(sentMailId);
  const now = new Date().toISOString();
  const resolved = resolveLoadDetention(input.loadId);
  const result = getDb()
    .prepare(
      `INSERT INTO detention_requests (
        load_id, stop_id, status, arrived_at, departed_at, clock_start, time_source,
        rate_source, rate, free_min, billable_min, round_min, cap, amount, clause,
        to_email, cc, recipients, subject, body, sent_at, sent_by, message_id, sent_mail_id,
        note, created_by, status_by, created_at, updated_at,
        end_at, end_source, end_flag, notice_id, notice_sent_at, notice_start_at
      ) VALUES (
        ?, ?, 'requested', ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, NULL, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        '', ?, '', ?, ?,
        ?, ?, ?, ?, ?, ?
      )`,
    )
    .run(
      input.loadId,
      input.stopId,
      draftStop(input.stopId).arrived_at,
      draftStop(input.stopId).departed_at,
      triggerClock(input.loadId, input.stopId),
      timeSource(input.loadId, input.stopId),
      resolved.rate.source === "missing" ? "missing" : resolved.rate.source,
      resolved.rate.value,
      draft.freeMinutes,
      draft.billableMinutes,
      resolved.billingIncrementMinutes.value,
      detentionAmountCap(resolved),
      resolved.conditions.value ?? "",
      to,
      cc,
      JSON.stringify({ to, cc, replyTo: settings.replyTo }),
      subject,
      body,
      now,
      input.actor,
      messageId,
      sentMailId,
      input.actor,
      now,
      now,
      draft.end.endAt,
      draft.end.deskPicked ? `desk:${draft.end.source}` : draft.end.source,
      draft.end.flagText,
      noticeRow?.id ?? null,
      noticeRow?.sentAt ?? "",
      noticeRow?.startAt ?? "",
    );
  recordLoadAudit({
    loadId: input.loadId,
    action: "detention_request_sent",
    field: "detention_request",
    newValue: `to ${to}; ${subject}; no amount`,
  });
  return { id: Number(result.lastInsertRowid), sentMailId };
}

export function setDetentionStatus(input: {
  requestId: number;
  status: "approved" | "denied" | "paid";
  actor: string;
  rate?: number | null;
  amount?: number | null;
  note?: string;
}): DetentionRequestView {
  const row = requireRequest(input.requestId);
  const note = String(input.note ?? "").trim();
  const now = new Date().toISOString();
  let auditValue: string = input.status;
  if (input.status === "approved") {
    if (row.status !== "requested") throw new Error("Approve a request that is still waiting.");
    const rate = input.rate != null ? Number(input.rate) : numberOrNull(row.rate);
    if (rate == null || !Number.isFinite(rate) || rate <= 0) {
      throw new Error(detentionRateLabel(null));
    }
    const resolved = resolveLoadDetention(row.load_id);
    const computed = computeDetentionAmount(rate, Number(row.billable_min ?? 0), detentionAmountCap(resolved));
    const amount = input.amount != null ? Number(input.amount) : computed;
    if (amount == null || !Number.isFinite(amount) || amount <= 0) throw new Error("Enter the detention amount.");
    const rateSource =
      resolved.rate.value != null && Math.abs(resolved.rate.value - rate) < 0.001 && resolved.rate.source !== "missing"
        ? resolved.rate.source
        : "entered";
    getDb()
      .prepare(
        `UPDATE detention_requests
         SET status = 'approved', rate = ?, amount = ?, rate_source = ?, note = ?, status_by = ?,
             approved_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(roundMoney(rate), roundMoney(amount), rateSource, note, input.actor, now, now, row.id);
    auditValue = `approved; rate ${roundMoney(rate)}; amount ${roundMoney(amount)}`;
  } else if (input.status === "denied") {
    if (row.status !== "requested") throw new Error("Deny a request that is still waiting.");
    getDb()
      .prepare(
        `UPDATE detention_requests
         SET status = 'denied', note = ?, status_by = ?, denied_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(note, input.actor, now, now, row.id);
  } else {
    if (row.status !== "approved") throw new Error("Mark paid only after the broker approves.");
    getDb()
      .prepare(
        `UPDATE detention_requests
         SET status = 'paid', note = ?, status_by = ?, paid_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(note, input.actor, now, now, row.id);
  }
  recordLoadAudit({
    loadId: row.load_id,
    action: "detention_status",
    field: "detention_status",
    oldValue: row.status,
    newValue: auditValue,
  });
  return toView(requireRequest(input.requestId));
}

export function addDetentionLine(input: { requestId: number; actor: string }): { payItemId: number; warning: string } {
  const row = requireRequest(input.requestId);
  if (row.status !== "approved") throw new Error("Add the detention line only after the broker approves.");
  if (row.pay_item_id) throw new Error("Detention line is already on this load.");
  const load = getLoad(row.load_id);
  const stop = getStop(row.stop_id);
  if (!load || !stop) throw new Error("Load or stop was not found.");
  const before = loadSnapshot(row.load_id);
  const warning = invoiceAlreadySentWarning(row.load_id);
  const rate = numberOrNull(row.rate);
  const amount = numberOrNull(row.amount);
  if (rate == null || amount == null) throw new Error(detentionRateLabel(rate));
  const hours = Math.round((Number(row.billable_min ?? 0) / 60) * 100) / 100;
  const payItemId = addPayItem(row.load_id, {
    side: "income",
    bill_to: "customer",
    payee: load.customer_name,
    category: "detention",
    rate,
    qty: hours > 0 ? hours : 1,
    total: amount,
    notes: `Detention ${stop.name || stop.city || "stop"}, request #${row.id}`,
  });
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE detention_requests SET pay_item_id = ?, updated_at = ? WHERE id = ?")
    .run(payItemId, now, row.id);
  recordLoadAudit({
    loadId: row.load_id,
    action: "detention_line",
    field: "detention_pay_item",
    newValue: `pay item ${payItemId}; amount ${amount.toFixed(2)}`,
  });
  const after = loadSnapshot(row.load_id);
  if (after.status !== before.status || after.qboInvoiceId !== before.qboInvoiceId || after.qboSentAt !== before.qboSentAt) {
    throw new Error("Detention line must not change the load or its invoice.");
  }
  if (after.invoiceCount !== before.invoiceCount || after.invoiceMailCount !== before.invoiceMailCount) {
    throw new Error("Detention line must not change the load or its invoice.");
  }
  return { payItemId, warning };
}

function resolveLoadDetention(loadId: number) {
  const load = getLoad(loadId);
  const rateCon = readLoadDetentionTerms(loadId);
  const contract = load ? readCustomerDetentionTerms(load.customer_id) : null;
  return resolveDetentionTerms(rateCon, contract);
}

function rateLabelFor(resolved: ReturnType<typeof resolveDetentionTerms>): string {
  if (resolved.rate.source === "contract" && resolved.rate.value != null) {
    return `$${resolved.rate.value.toFixed(2)} per hour from the customer contract`;
  }
  return detentionRateLabel(resolved.rate.source === "missing" ? null : resolved.rate.value);
}

function loadContext(loadId: number, stopId: number) {
  const load = getLoad(loadId);
  const stop = getStop(stopId);
  if (!load || !stop || stop.load_id !== loadId) throw new Error("Load or stop was not found.");
  return { load, stop };
}

function draftStop(stopId: number) {
  const stop = getStop(stopId);
  if (!stop) throw new Error("Stop was not found.");
  return stop;
}

function triggerClock(loadId: number, stopId: number): string {
  const loaded = loadContext(loadId, stopId);
  const terms = readLoadDetentionTerms(loadId);
  const trigger = detentionRequestTrigger({
    loadStatus: loaded.load.status,
    stopKind: loaded.stop.kind,
    arrivedAt: loaded.stop.arrived_at,
    departedAt: loaded.stop.departed_at,
    scheduleType: loaded.stop.schedule_type,
    windowStart: loaded.stop.window_start,
    windowEnd: loaded.stop.window_end,
    freeMinutes: terms.freeMinutes,
    contractFreeMinutes: contractFreeMinutesForCustomer(loaded.load.customer_id),
    endAt: detentionEndForStop(loaded.stop).endAt,
    roundMinutes: terms.roundMinutes,
    pickupsEnabled: true,
  });
  return trigger.clockStart;
}

function timeSource(loadId: number, stopId: number): string {
  const load = getLoad(loadId);
  const stop = getStop(stopId);
  if (!load || !stop) return "";
  const stamps = geofenceStamps(load.truck_id, stopId);
  const arrived = timesMatchGeofence(stop.arrived_at, stamps);
  const departed = timesMatchGeofence(stop.departed_at, stamps);
  if (arrived && departed) return "geofence";
  if (arrived || departed) return "mixed";
  return "typed";
}

function geofenceStamps(truckId: number | null, stopId: number): string[] {
  const stamps: string[] = [];
  if (truckId) {
    const rows = getDb()
      .prepare("SELECT recorded_at FROM truck_gps_readings WHERE truck_id = ?")
      .all(truckId) as Array<{ recorded_at?: string }>;
    for (const row of rows) stamps.push(String(row.recorded_at ?? ""));
  }
  const events = getDb()
    .prepare("SELECT event_time FROM samsara_webhook_events WHERE stop_id = ?")
    .all(stopId) as Array<{ event_time?: string }>;
  for (const row of events) stamps.push(String(row.event_time ?? ""));
  return stamps;
}

function paperworkChoices(loadId: number): DetentionDraftView["attachments"] {
  return listAttachments(loadId)
    .filter((file) => file.kind === "pod" || file.kind === "bol")
    .map((file) => ({
      id: file.id,
      name: file.original_name,
      kind: file.kind,
      selected: true,
    }));
}

function mailFiles(loadId: number, ids: number[]) {
  const allowed = new Set(paperworkChoices(loadId).map((file) => file.id));
  const used = new Set<string>();
  return ids.filter((id) => allowed.has(id)).map((id) => {
    const file = getAttachment(id);
    if (!file || file.load_id !== loadId) throw new Error("That document is not on this load.");
    const stored = getAttachmentPath(file);
    if (!stored || !fs.existsSync(stored)) throw new Error(`${file.original_name} is missing.`);
    return {
      filename: uniqueName(file.original_name, used),
      contentType: file.mime_type || "application/octet-stream",
      content: fs.readFileSync(stored),
    };
  });
}

function uniqueName(name: string, used: Set<string>): string {
  const safe = name.replace(/[^\w.\- ]+/g, "").trim() || "document";
  if (!used.has(safe.toLowerCase())) {
    used.add(safe.toLowerCase());
    return safe;
  }
  const next = `copy-${safe}`;
  used.add(next.toLowerCase());
  return next;
}

function activeRequest(stopId: number): RequestRow | null {
  const row = latestRequest(stopId);
  if (!row || !isDetentionStatus(row.status) || !ACTIVE.has(row.status)) return null;
  return row;
}

function latestRequest(stopId: number): RequestRow | null {
  const row = getDb()
    .prepare("SELECT * FROM detention_requests WHERE stop_id = ? ORDER BY id DESC LIMIT 1")
    .get(stopId) as Record<string, unknown> | undefined;
  return row ? asRequest(row) : null;
}

function requireRequest(id: number): RequestRow & { billable_min: number | null } {
  const row = getDb().prepare("SELECT * FROM detention_requests WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Detention request was not found.");
  const request = asRequest(row);
  return { ...request, billable_min: intOrNull(row.billable_min) };
}

function asRequest(row: Record<string, unknown>): RequestRow {
  const status = String(row.status ?? "");
  return {
    id: Number(row.id),
    load_id: Number(row.load_id),
    stop_id: Number(row.stop_id),
    status: isDetentionStatus(status) ? status : "requested",
    rate: numberOrNull(row.rate),
    amount: numberOrNull(row.amount),
    pay_item_id: row.pay_item_id == null ? null : Number(row.pay_item_id),
    sent_at: String(row.sent_at ?? ""),
    note: String(row.note ?? ""),
  };
}

function toView(row: RequestRow): DetentionRequestView {
  const status = isDetentionStatus(row.status) ? row.status : "requested";
  return {
    id: row.id,
    status,
    rate: row.rate,
    amount: row.amount,
    payItemId: row.pay_item_id,
    sentAt: row.sent_at,
    note: row.note,
  };
}

function loadSnapshot(loadId: number) {
  const load = getDb()
    .prepare("SELECT status, qbo_invoice_id, qbo_sent_at FROM loads WHERE id = ?")
    .get(loadId) as { status?: string; qbo_invoice_id?: string; qbo_sent_at?: string } | undefined;
  const invoices = getDb()
    .prepare("SELECT COUNT(*) AS count FROM attachments WHERE load_id = ? AND kind = 'invoice'")
    .get(loadId) as { count: number };
  const mail = getDb()
    .prepare("SELECT COUNT(*) AS count FROM sent_mail WHERE load_id = ? AND kind = 'customer_invoice'")
    .get(loadId) as { count: number };
  return {
    status: String(load?.status ?? ""),
    qboInvoiceId: String(load?.qbo_invoice_id ?? ""),
    qboSentAt: String(load?.qbo_sent_at ?? ""),
    invoiceCount: Number(invoices.count),
    invoiceMailCount: Number(mail.count),
  };
}

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function intOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number == null ? null : Math.round(number);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
