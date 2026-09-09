import { getDb } from "./db";
import { writeAudit } from "./desk";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  recoveryHashesMatch,
  totpAuthUri,
  totpQrDataUrl,
  verifyTotpCode,
} from "./totp";

type TotpRow = {
  id: number;
  name: string;
  totp_secret: string;
  totp_pending_secret: string;
  totp_enrolled: number;
};

function totpRow(dispatcherId: number): TotpRow | null {
  return (
    (getDb()
      .prepare(
        "SELECT id, name, totp_secret, totp_pending_secret, totp_enrolled FROM dispatchers WHERE id = ?",
      )
      .get(dispatcherId) as TotpRow | undefined) ?? null
  );
}

export function isDispatcherTotpEnrolled(dispatcherId: number): boolean {
  const row = totpRow(dispatcherId);
  return Boolean(row?.totp_enrolled && row.totp_secret);
}

export function countUnusedRecoveryCodes(dispatcherId: number): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS count FROM dispatcher_totp_recovery_codes WHERE dispatcher_id = ? AND used_at = ''",
    )
    .get(dispatcherId) as { count: number };
  return row.count;
}

export function beginTotpEnrollment(dispatcherId: number): { secret: string; uri: string } {
  const row = totpRow(dispatcherId);
  if (!row) throw new Error("Dispatcher was not found.");
  if (row.totp_enrolled && row.totp_secret) {
    throw new Error("2-step is already on. Ask an admin to reset it first.");
  }
  const secret = row.totp_pending_secret || generateTotpSecret();
  if (!row.totp_pending_secret) {
    getDb().prepare("UPDATE dispatchers SET totp_pending_secret = ?, totp_enrolled = 0 WHERE id = ?").run(
      secret,
      dispatcherId,
    );
  }
  return { secret, uri: totpAuthUri(row.name, secret) };
}

export async function enrollmentQr(dispatcherId: number): Promise<{
  secret: string;
  uri: string;
  qrDataUrl: string;
} | null> {
  const row = totpRow(dispatcherId);
  if (!row?.totp_pending_secret || row.totp_enrolled) return null;
  const uri = totpAuthUri(row.name, row.totp_pending_secret);
  return {
    secret: row.totp_pending_secret,
    uri,
    qrDataUrl: await totpQrDataUrl(uri),
  };
}

export function cancelTotpEnrollment(dispatcherId: number): void {
  const row = totpRow(dispatcherId);
  if (!row) throw new Error("Dispatcher was not found.");
  if (row.totp_enrolled) throw new Error("2-step is already on.");
  getDb().prepare("UPDATE dispatchers SET totp_pending_secret = '' WHERE id = ?").run(dispatcherId);
}

export function confirmTotpEnrollment(dispatcherId: number, code: string): string[] {
  const row = totpRow(dispatcherId);
  if (!row) throw new Error("Dispatcher was not found.");
  if (row.totp_enrolled && row.totp_secret) {
    throw new Error("2-step is already on.");
  }
  const secret = row.totp_pending_secret;
  if (!secret) throw new Error("Start 2-step setup first.");
  if (!verifyTotpCode(secret, code)) {
    throw new Error("That authenticator code is not valid. Try the next one.");
  }
  const recoveryCodes = generateRecoveryCodes();
  const db = getDb();
  db.prepare("DELETE FROM dispatcher_totp_recovery_codes WHERE dispatcher_id = ?").run(dispatcherId);
  const insert = db.prepare(
    "INSERT INTO dispatcher_totp_recovery_codes (dispatcher_id, code_hash, used_at) VALUES (?, ?, '')",
  );
  for (const recovery of recoveryCodes) {
    insert.run(dispatcherId, hashRecoveryCode(recovery));
  }
  db.prepare(
    "UPDATE dispatchers SET totp_secret = ?, totp_pending_secret = '', totp_enrolled = 1 WHERE id = ?",
  ).run(secret, dispatcherId);
  writeAudit("totp_enroll", "dispatcher", dispatcherId, row.name);
  return recoveryCodes;
}

export function verifyDispatcherTotp(dispatcherId: number, code: string): boolean {
  const row = totpRow(dispatcherId);
  if (!row?.totp_enrolled || !row.totp_secret) return false;
  return verifyTotpCode(row.totp_secret, code);
}

export function consumeRecoveryCode(dispatcherId: number, code: string): void {
  const row = totpRow(dispatcherId);
  if (!row?.totp_enrolled) throw new Error("2-step is not on for this user.");
  const unused = getDb()
    .prepare(
      "SELECT id, code_hash FROM dispatcher_totp_recovery_codes WHERE dispatcher_id = ? AND used_at = ''",
    )
    .all(dispatcherId) as Array<{ id: number; code_hash: string }>;
  const match = unused.find((item) => recoveryHashesMatch(item.code_hash, code));
  if (!match) throw new Error("That recovery code is not valid.");
  getDb()
    .prepare("UPDATE dispatcher_totp_recovery_codes SET used_at = ? WHERE id = ?")
    .run(new Date().toISOString(), match.id);
  writeAudit("totp_recovery", "dispatcher", dispatcherId, row.name);
}

export function resetDispatcherTotp(dispatcherId: number, actorName: string): void {
  const row = totpRow(dispatcherId);
  if (!row) throw new Error("Dispatcher was not found.");
  const db = getDb();
  db.prepare("DELETE FROM dispatcher_totp_recovery_codes WHERE dispatcher_id = ?").run(dispatcherId);
  db.prepare(
    "UPDATE dispatchers SET totp_secret = '', totp_pending_secret = '', totp_enrolled = 0 WHERE id = ?",
  ).run(dispatcherId);
  writeAudit("totp_reset", "dispatcher", dispatcherId, `${row.name} by ${actorName}`);
}
