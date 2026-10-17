/** "Detention starting soon" notices. Nothing sends until a dispatcher taps Approve. */

import { recordLoadAudit } from "./audit";
import { getDb } from "./db";
import { MS_EXPRESS_CARRIER } from "./carrier-identity";
import {
  composeDetentionNoticeEmail,
  detentionNoticeAlertOpen,
  detentionNoticeSchedule,
  type DetentionNoticeSchedule,
} from "./detention-notice";
import { approvalEmailHasDollarAmount, detentionSignature, DETENTION_REPLY_TO_DEFAULT } from "./detention-request";
import { readCustomerDetentionTerms } from "./detention-signals";
import { resolveLoadCustomerEmail } from "./load-mail";
import { isUsableEmail, MAIL_FROM_DEFAULT, type OutgoingMail } from "./mail-shared";
import { recordSentMail } from "./mail-store";
import { getLoad } from "./queries";
import { getStop, type LoadStop } from "./stops";
import { timeZoneForStop } from "./wall-time";

export type DetentionNoticeRow = {
  id: number;
  loadId: number;
  stopId: number;
  status: "sent" | "dismissed";
  startAt: string;
  dueAt: string;
  leadMinutes: number;
  sentAt: string;
  toEmail: string;
  actedBy: string;
};

export type DetentionNoticeAlert = {
  loadId: number;
  stopId: number;
  stopName: string;
  startAt: string;
  dueAt: string;
  leadMinutes: number;
  overdue: boolean;
  timeZone: string;
};

export type DetentionNoticeDraft = {
  loadId: number;
  stopId: number;
  to: string;
  replyTo: string;
  subject: string;
  body: string;
  schedule: DetentionNoticeSchedule;
};

function noticeReplyTo(): string {
  const row = getDb().prepare("SELECT detention_reply_to FROM company_profile WHERE id = 1").get() as
    | { detention_reply_to?: string }
    | undefined;
  const reply = String(row?.detention_reply_to ?? "").trim();
  return isUsableEmail(reply) ? reply : DETENTION_REPLY_TO_DEFAULT;
}

function noticePickups(): boolean {
  const row = getDb().prepare("SELECT detention_pickups FROM company_profile WHERE id = 1").get() as
    | { detention_pickups?: number }
    | undefined;
  return Number(row?.detention_pickups ?? 0) === 1;
}

function asNotice(row: Record<string, unknown>): DetentionNoticeRow {
  return {
    id: Number(row.id),
    loadId: Number(row.load_id),
    stopId: Number(row.stop_id),
    status: row.status === "dismissed" ? "dismissed" : "sent",
    startAt: String(row.start_at ?? ""),
    dueAt: String(row.due_at ?? ""),
    leadMinutes: Number(row.lead_min ?? 0),
    sentAt: String(row.sent_at ?? ""),
    toEmail: String(row.to_email ?? ""),
    actedBy: String(row.acted_by ?? ""),
  };
}

export function latestNoticeForStop(stopId: number): DetentionNoticeRow | null {
  const row = getDb()
    .prepare("SELECT * FROM detention_notices WHERE stop_id = ? ORDER BY id DESC LIMIT 1")
    .get(stopId) as Record<string, unknown> | undefined;
  return row ? asNotice(row) : null;
}

type NoticeStop = Pick<
  LoadStop,
  "id" | "kind" | "name" | "city" | "state" | "window_start" | "window_end" | "arrived_at" | "departed_at" | "schedule_type"
> & { emptied_at?: string };

export function noticeScheduleForStop(
  load: { id: number; customer_id: number | null },
  stop: NoticeStop,
): DetentionNoticeSchedule | null {
  const terms = getDb()
    .prepare("SELECT detention_free_minutes FROM loads WHERE id = ?")
    .get(load.id) as { detention_free_minutes?: number | null } | undefined;
  const customer = readCustomerDetentionTerms(load.customer_id);
  return detentionNoticeSchedule({
    scheduleType: stop.schedule_type,
    arrivedAt: stop.arrived_at,
    windowStart: stop.window_start,
    windowEnd: stop.window_end,
    rateConFreeMinutes: terms?.detention_free_minutes ?? null,
    contractFreeMinutes: customer.contractFreeMinutes,
    leadMinutes: customer.leadMinutes,
  });
}

/** Open desk alerts for one load. Opens 20 minutes before the notice is due, closes at detention start. */
export function detentionNoticeAlertsForLoad(
  load: { id: number; status: string; customer_id: number | null },
  stops: NoticeStop[],
  now = new Date(),
): DetentionNoticeAlert[] {
  const pickups = noticePickups();
  const alerts: DetentionNoticeAlert[] = [];
  for (const stop of stops) {
    if (!String(stop.arrived_at ?? "").trim()) continue;
    const schedule = noticeScheduleForStop(load, stop);
    const open = detentionNoticeAlertOpen({
      schedule,
      now,
      loadStatus: load.status,
      stopKind: stop.kind,
      pickupsEnabled: pickups,
      arrivedAt: stop.arrived_at,
      departedAt: stop.departed_at,
      emptiedAt: stop.emptied_at,
      handled: Boolean(latestNoticeForStop(stop.id)),
    });
    if (!open || !schedule) continue;
    alerts.push({
      loadId: load.id,
      stopId: stop.id,
      stopName: stop.name || (stop.kind === "delivery" ? "Delivery" : "Pickup"),
      startAt: schedule.startAt,
      dueAt: schedule.dueAt,
      leadMinutes: schedule.leadMinutes,
      overdue: now.getTime() >= Date.parse(schedule.dueAt),
      timeZone: timeZoneForStop(stop.state, stop.city),
    });
  }
  return alerts;
}

export function buildDetentionNoticeDraft(loadId: number, stopId: number): DetentionNoticeDraft {
  const load = getLoad(loadId);
  const stop = getStop(stopId);
  if (!load || !stop || stop.load_id !== loadId) throw new Error("Load or stop was not found.");
  const schedule = noticeScheduleForStop(load, stop);
  if (!schedule) throw new Error("Detention start is unknown. Set the arrival or appointment first.");
  const po = [load.po_number, load.customer_reference, stop.reference].map((v) => String(v ?? "").trim()).find(Boolean) ?? "";
  const email = composeDetentionNoticeEmail({
    loadNumber: load.load_number,
    po,
    stopName: stop.name,
    city: stop.city,
    state: stop.state,
    startAt: schedule.startAt,
    timeZone: timeZoneForStop(stop.state, stop.city),
    signature: detentionSignature(),
  });
  return {
    loadId,
    stopId,
    to: resolveLoadCustomerEmail(load),
    replyTo: noticeReplyTo(),
    subject: email.subject,
    body: email.text,
    schedule,
  };
}

/** Dispatcher tapped Approve. Sends the short notice and logs the time on the stop. */
export async function sendDetentionNotice(input: {
  loadId: number;
  stopId: number;
  actor: string;
  send: (mail: OutgoingMail) => Promise<{ messageId?: string } | void>;
}): Promise<DetentionNoticeRow> {
  if (latestNoticeForStop(input.stopId)) throw new Error("This stop's detention notice was already handled.");
  const draft = buildDetentionNoticeDraft(input.loadId, input.stopId);
  if (!isUsableEmail(draft.to)) throw new Error("Add the broker email on the load, or the customer's main email.");
  if (approvalEmailHasDollarAmount(draft.body)) throw new Error("Detention notice could not be prepared.");
  const sent = await input.send({
    to: draft.to,
    from: MAIL_FROM_DEFAULT,
    fromName: MS_EXPRESS_CARRIER.legalName,
    subject: draft.subject,
    text: draft.body,
    replyTo: draft.replyTo,
  });
  const sentMailId = recordSentMail({ loadId: input.loadId, kind: "detention_notice", to: draft.to, subject: draft.subject });
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO detention_notices (
        load_id, stop_id, status, start_at, due_at, lead_min, free_min, free_source,
        to_email, subject, body, sent_at, sent_mail_id, message_id, acted_by, created_at, updated_at
      ) VALUES (?, ?, 'sent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.loadId,
      input.stopId,
      draft.schedule.startAt,
      draft.schedule.dueAt,
      draft.schedule.leadMinutes,
      draft.schedule.freeMinutes,
      draft.schedule.freeSource,
      draft.to,
      draft.subject,
      draft.body,
      now,
      sentMailId,
      String(sent?.messageId ?? "").trim() || String(sentMailId),
      input.actor,
      now,
      now,
    );
  recordLoadAudit({
    loadId: input.loadId,
    action: "detention_notice_sent",
    field: "detention_notice",
    newValue: `to ${draft.to}; starts ${draft.schedule.startAt}; due ${draft.schedule.dueAt}`,
  });
  const row = latestNoticeForStop(input.stopId);
  if (!row || row.id !== Number(result.lastInsertRowid)) throw new Error("Detention notice was not saved.");
  return row;
}

/** Dispatcher tapped Dismiss. Nothing is sent. */
export function dismissDetentionNotice(input: { loadId: number; stopId: number; actor: string }): DetentionNoticeRow {
  if (latestNoticeForStop(input.stopId)) throw new Error("This stop's detention notice was already handled.");
  const load = getLoad(input.loadId);
  const stop = getStop(input.stopId);
  if (!load || !stop || stop.load_id !== input.loadId) throw new Error("Load or stop was not found.");
  const schedule = noticeScheduleForStop(load, stop);
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO detention_notices (
        load_id, stop_id, status, start_at, due_at, lead_min, free_min, free_source, acted_by, created_at, updated_at
      ) VALUES (?, ?, 'dismissed', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.loadId,
      input.stopId,
      schedule?.startAt ?? "",
      schedule?.dueAt ?? "",
      schedule?.leadMinutes ?? 0,
      schedule?.freeMinutes ?? null,
      schedule?.freeSource ?? "",
      input.actor,
      now,
      now,
    );
  recordLoadAudit({ loadId: input.loadId, action: "detention_notice_dismissed", field: "detention_notice", newValue: "dismissed" });
  return latestNoticeForStop(input.stopId)!;
}
