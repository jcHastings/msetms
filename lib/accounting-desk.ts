import { getDb } from "./db";
import { loadIsOnAccountingDesk } from "./accounting-desk-shared";
import { recordLoadChanges } from "./audit";
import { getLoad, listLoads } from "./queries";
import { canAccessAccounting } from "./settings-shared";
import { isBillableStatus, type AccountingDesk, type LoadView } from "./types";

function now(): string {
  return new Date().toISOString();
}

export function assertCanEditLoadRecord(load: LoadView, role: string): void {
  if (!loadIsOnAccountingDesk(load)) return;
  if (!canAccessAccounting(role)) {
    throw new Error("This load is in Accounting. Send it back before changing dispatch fields.");
  }
}

export function sendLoadToAccounting(loadId: number): LoadView {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (load.non_revenue) throw new Error("Empty move — no customer invoice.");
  if (load.accounting_desk === "accounting") return load;
  if (load.accounting_desk === "archived") {
    throw new Error("Unarchive this load before sending it back to Accounting.");
  }
  if (!isBillableStatus(load.status)) {
    throw new Error("Mark the load Delivered before sending to Accounting.");
  }
  const returnStatus = load.status === "accounting" ? "delivered" : load.status;
  getDb()
    .prepare(
      `UPDATE loads SET
        accounting_desk = 'accounting',
        accounting_return_status = ?,
        accounting_sent_at = ?,
        status = 'accounting',
        ready_to_invoice = 1,
        updated_at = ?
       WHERE id = ?`,
    )
    .run(returnStatus, now(), now(), loadId);
  recordLoadChanges(loadId, "status", [
    { field: "status", oldValue: load.status, newValue: "accounting" },
    { field: "accounting_desk", oldValue: load.accounting_desk || "operations", newValue: "accounting" },
  ]);
  const next = getLoad(loadId);
  if (!next) throw new Error("Load not found.");
  return next;
}

export function returnLoadToOperations(loadId: number): LoadView {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (load.accounting_desk === "operations" && load.status !== "accounting") return load;
  const saved = load.accounting_return_status.trim();
  const nextStatus = saved && saved !== "accounting" ? saved : "delivered";
  getDb()
    .prepare(
      `UPDATE loads SET
        accounting_desk = 'operations',
        accounting_return_status = '',
        status = ?,
        updated_at = ?
       WHERE id = ?`,
    )
    .run(nextStatus, now(), loadId);
  recordLoadChanges(loadId, "status", [
    { field: "status", oldValue: load.status, newValue: nextStatus },
    { field: "accounting_desk", oldValue: load.accounting_desk || "operations", newValue: "operations" },
  ]);
  const next = getLoad(loadId);
  if (!next) throw new Error("Load not found.");
  return next;
}

export function archiveAccountingLoad(loadId: number): LoadView {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (load.accounting_desk !== "accounting") {
    throw new Error("Send the load to Accounting before archiving.");
  }
  getDb()
    .prepare("UPDATE loads SET accounting_desk = 'archived', updated_at = ? WHERE id = ?")
    .run(now(), loadId);
  recordLoadChanges(loadId, "update", [
    { field: "accounting_desk", oldValue: "accounting", newValue: "archived" },
  ]);
  const next = getLoad(loadId);
  if (!next) throw new Error("Load not found.");
  return next;
}

export function unarchiveAccountingLoad(loadId: number): LoadView {
  const load = getLoad(loadId);
  if (!load) throw new Error("Load not found.");
  if (load.accounting_desk !== "archived") {
    throw new Error("This load is not archived.");
  }
  getDb()
    .prepare(
      `UPDATE loads SET
        accounting_desk = 'accounting',
        status = 'accounting',
        updated_at = ?
       WHERE id = ?`,
    )
    .run(now(), loadId);
  recordLoadChanges(loadId, "update", [
    { field: "accounting_desk", oldValue: "archived", newValue: "accounting" },
  ]);
  const next = getLoad(loadId);
  if (!next) throw new Error("Load not found.");
  return next;
}

export function listLoadsOnAccountingDesk(desk: Extract<AccountingDesk, "accounting" | "archived">): LoadView[] {
  return listLoads({ status: "all" }).filter((load) => load.accounting_desk === desk);
}

export type QboItemMap = { category: string; qbo_item_id: string; qbo_item_name: string };
export type QboVendorMap = { payee: string; qbo_vendor_id: string; qbo_vendor_name: string };

export function listQboItemMaps(): QboItemMap[] {
  return getDb().prepare("SELECT * FROM qbo_item_maps ORDER BY category").all() as QboItemMap[];
}

export function upsertQboItemMap(category: string, qboItemId: string, qboItemName: string): void {
  getDb()
    .prepare(
      `INSERT INTO qbo_item_maps (category, qbo_item_id, qbo_item_name)
       VALUES (?, ?, ?)
       ON CONFLICT(category) DO UPDATE SET qbo_item_id = excluded.qbo_item_id, qbo_item_name = excluded.qbo_item_name`,
    )
    .run(category.trim(), qboItemId.trim(), qboItemName.trim());
}

export function listQboVendorMaps(): QboVendorMap[] {
  return getDb().prepare("SELECT * FROM qbo_vendor_maps ORDER BY payee").all() as QboVendorMap[];
}

export function upsertQboVendorMap(payee: string, qboVendorId: string, qboVendorName: string): void {
  getDb()
    .prepare(
      `INSERT INTO qbo_vendor_maps (payee, qbo_vendor_id, qbo_vendor_name)
       VALUES (?, ?, ?)
       ON CONFLICT(payee) DO UPDATE SET qbo_vendor_id = excluded.qbo_vendor_id, qbo_vendor_name = excluded.qbo_vendor_name`,
    )
    .run(payee.trim(), qboVendorId.trim(), qboVendorName.trim());
}
