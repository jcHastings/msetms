import { daysUntil } from "./compliance";
import { getDb } from "./db";
import { formatDate } from "./format";
import { sendMail } from "./integrations/mail";
import { isMailConfigured } from "./env";
import { isUsableEmail, type OutgoingMail } from "./mail-shared";
import { listDrivers, listTrailers, listTrucks } from "./queries";
import { cleanSafetyDate } from "./safety-shared";
import { complianceWindows, getCompanySettings, listDispatcherUsers } from "./settings";
import type { ComplianceWindows } from "./settings-shared";
import {
  ALERT_TRIGGERS,
  alertActionsLabel,
  alertTriggerByKey,
  isAlertTriggerKey,
  parseRecipientIds,
  type AlertRuleRecord,
  type AlertTriggerKey,
  type OfficeNotification,
} from "./alert-rules-shared";

export type { AlertRuleRecord, OfficeNotification } from "./alert-rules-shared";
export {
  ALERT_TRIGGERS,
  alertActionsLabel,
  alertTriggerByKey,
  groupedAlertTriggers,
  isAlertTriggerKey,
} from "./alert-rules-shared";

type RuleRow = {
  id: number;
  name: string;
  trigger_key: string;
  recipient_ids: string;
  message: string;
  created_at: string;
  updated_at: string;
};

type Match = {
  subjectKey: string;
  subject: string;
  label: string;
  expiresOn: string;
  days: number;
  href: string;
  message: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function mapRule(row: RuleRow): AlertRuleRecord {
  const key = isAlertTriggerKey(row.trigger_key) ? row.trigger_key : "driver_license";
  return {
    id: row.id,
    name: row.name,
    trigger_key: key,
    recipient_ids: parseRecipientIds(row.recipient_ids),
    message: row.message,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function listAlertRules(): AlertRuleRecord[] {
  return (getDb().prepare("SELECT * FROM alert_rules ORDER BY id").all() as RuleRow[]).map(mapRule);
}

export function getAlertRule(id: number): AlertRuleRecord | null {
  const row = getDb().prepare("SELECT * FROM alert_rules WHERE id = ?").get(id) as RuleRow | undefined;
  return row ? mapRule(row) : null;
}

function requireTrigger(key: string): AlertTriggerKey {
  if (!isAlertTriggerKey(key)) throw new Error("Pick a trucking alert trigger.");
  return key;
}

function requireRecipients(ids: number[]): number[] {
  const unique = parseRecipientIds(ids);
  if (unique.length === 0) throw new Error("Pick at least one office user.");
  const users = listDispatcherUsers(false);
  const allowed = new Set(users.map((user) => user.id));
  const valid = unique.filter((id) => allowed.has(id));
  if (valid.length === 0) throw new Error("Pick at least one active TMS user.");
  return valid;
}

export function createAlertRule(input: {
  name: string;
  triggerKey: string;
  recipientIds: number[];
  message?: string;
}): AlertRuleRecord {
  const name = input.name.trim();
  if (!name) throw new Error("Name of alert is required.");
  const triggerKey = requireTrigger(input.triggerKey);
  const recipientIds = requireRecipients(input.recipientIds);
  const stamp = nowIso();
  const result = getDb()
    .prepare(
      `INSERT INTO alert_rules (name, trigger_key, recipient_ids, message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(name, triggerKey, JSON.stringify(recipientIds), String(input.message ?? "").trim(), stamp, stamp);
  const created = getAlertRule(Number(result.lastInsertRowid));
  if (!created) throw new Error("Could not save the alert.");
  return created;
}

export function deleteAlertRule(id: number): void {
  getDb().prepare("DELETE FROM alert_rule_fires WHERE rule_id = ?").run(id);
  getDb().prepare("DELETE FROM user_notifications WHERE rule_id = ?").run(id);
  getDb().prepare("DELETE FROM alert_rules WHERE id = ?").run(id);
}

export function listOfficeNotifications(dispatcherId: number, limit = 20): OfficeNotification[] {
  return getDb()
    .prepare(
      `SELECT * FROM user_notifications
       WHERE dispatcher_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(dispatcherId, limit) as OfficeNotification[];
}

export function unreadOfficeNotificationCount(dispatcherId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as count FROM user_notifications
       WHERE dispatcher_id = ? AND trim(read_at) = ''`,
    )
    .get(dispatcherId) as { count: number };
  return row.count;
}

export function markOfficeNotificationRead(id: number, dispatcherId: number): void {
  getDb()
    .prepare(
      `UPDATE user_notifications SET read_at = ?
       WHERE id = ? AND dispatcher_id = ? AND trim(read_at) = ''`,
    )
    .run(nowIso(), id, dispatcherId);
}

export function markAllOfficeNotificationsRead(dispatcherId: number): void {
  getDb()
    .prepare(
      `UPDATE user_notifications SET read_at = ?
       WHERE dispatcher_id = ? AND trim(read_at) = ''`,
    )
    .run(nowIso(), dispatcherId);
}

function windowForTrigger(key: AlertTriggerKey, windows: ComplianceWindows): number {
  if (key === "truck_registration" || key === "trailer_registration") return windows.registrationDays;
  if (key === "truck_dot" || key === "trailer_dot") return windows.dotDays;
  return windows.driverDays;
}

function matchDate(
  expiresOn: string,
  windowDays: number,
  subject: string,
  label: string,
  subjectKey: string,
  href: string,
): Match | null {
  const day = cleanSafetyDate(expiresOn);
  const days = daysUntil(day);
  if (days == null) return null;
  if (days > windowDays) return null;
  const when = formatDate(`${day}T12:00:00`);
  const message =
    days < 0
      ? `${subject}: ${label} expired ${when}.`
      : `${subject}: ${label} expires ${when} (${days} day${days === 1 ? "" : "s"}).`;
  return { subjectKey, subject, label, expiresOn: day, days, href, message };
}

export function collectTriggerMatches(
  key: AlertTriggerKey,
  windows: ComplianceWindows = complianceWindows(),
): Match[] {
  const windowDays = windowForTrigger(key, windows);
  if (key === "driver_license") {
    return listDrivers()
      .map((driver) =>
        matchDate(
          driver.license_expires,
          windowDays,
          driver.name,
          "driver license",
          `driver:${driver.id}:license`,
          "/safety",
        ),
      )
      .filter((item): item is Match => Boolean(item));
  }
  if (key === "driver_medical") {
    return listDrivers()
      .map((driver) =>
        matchDate(
          driver.medical_expires,
          windowDays,
          driver.name,
          "DOT medical card",
          `driver:${driver.id}:medical`,
          "/safety",
        ),
      )
      .filter((item): item is Match => Boolean(item));
  }
  if (key === "driver_drug_test") {
    return listDrivers()
      .map((driver) =>
        matchDate(
          driver.drug_test_next,
          windowDays,
          driver.name,
          "last drug test",
          `driver:${driver.id}:drug`,
          "/safety",
        ),
      )
      .filter((item): item is Match => Boolean(item));
  }
  if (key === "driver_insurance") {
    const settings = getCompanySettings();
    const match = matchDate(
      settings.insurance_expires,
      windowDays,
      settings.insurance_provider.trim() || "Company insurance",
      "insurance",
      "company:insurance",
      "/settings/insurance",
    );
    return match ? [match] : [];
  }
  if (key === "truck_registration") {
    return listTrucks()
      .map((truck) =>
        matchDate(
          truck.registration_expires,
          windowDays,
          `Unit ${truck.unit_number}`,
          "registration",
          `truck:${truck.id}:registration`,
          "/fleet",
        ),
      )
      .filter((item): item is Match => Boolean(item));
  }
  if (key === "truck_dot") {
    return listTrucks()
      .map((truck) =>
        matchDate(
          truck.dot_expires,
          windowDays,
          `Unit ${truck.unit_number}`,
          "DOT inspection",
          `truck:${truck.id}:dot`,
          "/fleet",
        ),
      )
      .filter((item): item is Match => Boolean(item));
  }
  if (key === "trailer_registration") {
    return listTrailers()
      .map((trailer) =>
        matchDate(
          trailer.registration_expires,
          windowDays,
          `Trailer ${trailer.unit_number}`,
          "registration",
          `trailer:${trailer.id}:registration`,
          "/fleet",
        ),
      )
      .filter((item): item is Match => Boolean(item));
  }
  return listTrailers()
    .map((trailer) =>
      matchDate(
        trailer.dot_expires,
        windowDays,
        `Trailer ${trailer.unit_number}`,
        "DOT inspection",
        `trailer:${trailer.id}:dot`,
        "/fleet",
      ),
    )
    .filter((item): item is Match => Boolean(item));
}

function alreadyFired(ruleId: number, subjectKey: string, expiresOn: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT id FROM alert_rule_fires
       WHERE rule_id = ? AND subject_key = ? AND expires_on = ?`,
    )
    .get(ruleId, subjectKey, expiresOn) as { id: number } | undefined;
  return Boolean(row);
}

function recordFire(ruleId: number, subjectKey: string, expiresOn: string): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO alert_rule_fires (rule_id, subject_key, expires_on, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(ruleId, subjectKey, expiresOn, nowIso());
}

function insertNotification(input: {
  dispatcherId: number;
  ruleId: number;
  title: string;
  body: string;
  href: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO user_notifications (dispatcher_id, rule_id, title, body, href, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, '', ?)`,
    )
    .run(input.dispatcherId, input.ruleId, input.title, input.body, input.href, nowIso());
}

export function recipientNamesForRule(rule: AlertRuleRecord): string[] {
  const users = listDispatcherUsers(true);
  return rule.recipient_ids
    .map((id) => users.find((user) => user.id === id)?.name)
    .filter((name): name is string => Boolean(name));
}

export function alertRuleListRows(): Array<
  AlertRuleRecord & { watching: string; actions: string; triggerLabel: string }
> {
  return listAlertRules().map((rule) => {
    const trigger = alertTriggerByKey(rule.trigger_key);
    return {
      ...rule,
      triggerLabel: trigger?.label ?? rule.trigger_key,
      watching: trigger?.watching ?? rule.trigger_key,
      actions: alertActionsLabel(recipientNamesForRule(rule)),
    };
  });
}

export function syncAlertNotifications(): { created: number; emails: OutgoingMail[] } {
  const rules = listAlertRules();
  const windows = complianceWindows();
  const users = listDispatcherUsers(false);
  const emailOn = Boolean(getCompanySettings().alert_emails_enabled) && isMailConfigured();
  let created = 0;
  const emails: OutgoingMail[] = [];
  for (const rule of rules) {
    const matches = collectTriggerMatches(rule.trigger_key, windows);
    for (const match of matches) {
      if (alreadyFired(rule.id, match.subjectKey, match.expiresOn)) continue;
      recordFire(rule.id, match.subjectKey, match.expiresOn);
      const extra = rule.message.trim();
      const body = extra ? `${match.message}\n${extra}` : match.message;
      for (const userId of rule.recipient_ids) {
        const user = users.find((row) => row.id === userId);
        if (!user) continue;
        insertNotification({
          dispatcherId: user.id,
          ruleId: rule.id,
          title: rule.name,
          body,
          href: match.href,
        });
        created += 1;
        if (emailOn && isUsableEmail(user.email)) {
          emails.push({
            to: user.email.trim(),
            subject: `MS Express alert: ${rule.name}`,
            text: body,
          });
        }
      }
    }
  }
  return { created, emails };
}

export async function deliverAlertEmails(emails: OutgoingMail[]): Promise<void> {
  for (const email of emails) {
    try {
      await sendMail(email);
    } catch {
      // Office inbox still has the in-TMS notice.
    }
  }
}

export function alertCatalogHasNoBrokerageTriggers(): boolean {
  const blob = ALERT_TRIGGERS.map((item) => `${item.key} ${item.label} ${item.watching}`).join(" ").toLowerCase();
  return ![
    "hazmat",
    "twic",
    "fast",
    "passport",
    "edi",
    "convoy",
    "tender",
    "ltl",
  ].some((word) => blob.includes(word));
}
