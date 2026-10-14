import { getDb } from "./db";
import { QBO_SEND_CLAIM_STALE_MS } from "./qbo-send-lock";

/**
 * One UPDATE claims the load only when no send is in progress, or the claim is stale.
 * The timestamp is the claim. Empty means the load is free.
 */
export function claimQboLoadSend(loadId: number, now = new Date()): { claimedAt: string } | null {
  const claimedAt = now.toISOString();
  const staleBefore = new Date(now.getTime() - QBO_SEND_CLAIM_STALE_MS).toISOString();
  const result = getDb()
    .prepare(
      `UPDATE loads
       SET qbo_send_claimed_at = ?
       WHERE id = ?
         AND (
           TRIM(IFNULL(qbo_send_claimed_at, '')) = ''
           OR qbo_send_claimed_at < ?
         )`,
    )
    .run(claimedAt, loadId, staleBefore);
  return result.changes === 1 ? { claimedAt } : null;
}

/** Clears only the claim this send took, including when the send throws. */
export function releaseQboLoadSend(loadId: number, claimedAt: string): void {
  getDb()
    .prepare("UPDATE loads SET qbo_send_claimed_at = '' WHERE id = ? AND qbo_send_claimed_at = ?")
    .run(loadId, claimedAt);
}
