import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-settlement-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
delete process.env.TMS_SCRIPT_ACTOR_ROLE;

const WEEK = "2026-09-21";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function receipt(name = "receipt.png"): File {
  return new File([png], name, { type: "image/png" });
}

function throwsMessage(fn: () => unknown, pattern: RegExp): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, pattern);
    return true;
  });
}

async function main() {
  const payWeek = await import("../lib/pay-week");
  const reimbursements = await import("../lib/reimbursements");
  const statements = await import("../lib/settlement-statement");
  const queries = await import("../lib/queries");
  const payItems = await import("../lib/pay-items");
  const db = await import("../lib/db");
  const pdf = await import("../lib/settlement-statement-pdf");

  const week = payWeek.payWeekContaining("2026-09-23");
  assert.equal(week.from, "2026-09-21");
  assert.equal(week.to, "2026-09-27");
  assert.equal(payWeek.inPayWeek("2026-09-27T23:00:00.000Z", week.from, week.to), true);
  assert.equal(payWeek.inPayWeek("2026-09-28T12:00:00.000Z", week.from, week.to), false);
  assert.equal(payWeek.shiftPayWeek(WEEK, 1).from, "2026-09-28");

  throwsMessage(() => reimbursements.parseReimbursementAmount(""), /Enter an amount/);
  throwsMessage(() => reimbursements.parseReimbursementAmount("0"), /greater than zero/);
  throwsMessage(() => reimbursements.parseReimbursementAmount("0.00"), /greater than zero/);
  throwsMessage(() => reimbursements.parseReimbursementAmount("-5"), /greater than zero/);
  throwsMessage(() => reimbursements.parseReimbursementAmount("abc"), /greater than zero/);
  throwsMessage(() => reimbursements.parseReimbursementAmount("12.345"), /greater than zero/);
  assert.equal(reimbursements.parseReimbursementAmount("12.50"), 12.5);
  assert.equal(reimbursements.parseReimbursementAmount("$1,250.00"), 1250);

  const templates = statements.listDeductionTemplates();
  assert.equal(templates.length, 3);
  assert.deepEqual(
    templates.map((row) => row.name).sort(),
    ["Example: ELD / insurance chargeback", "Example: Escrow", "Example: Fuel advance"],
  );
  assert.ok(templates.every((row) => row.active === 0 && row.example === 1));

  assert.equal(statements.loadIncludedOnStatement({ status: "cancelled", accounting_desk: "accounting" }), false);
  assert.equal(statements.loadIncludedOnStatement({ status: "delivered", accounting_desk: "operations" }, false), false);
  assert.equal(statements.loadIncludedOnStatement({ status: "delivered", accounting_desk: "operations" }), true);

  const customerId = queries.createCustomer({ name: "Settlement Yard", billing_notes: "", contacts: [] });
  const ooId = queries.createDriver({
    name: "Steve Eller",
    phone: "555-0150",
    license: "NE-CDL-STEVE",
    driver_type: "owner_operator",
    company_name: "3K3B Trucking LLC",
    truck_id: null,
    status: "available",
  });
  const companyId = queries.createDriver({
    name: "Jose Luis Torres",
    phone: "555-0151",
    license: "NE-CDL-JOSE",
    driver_type: "company_driver",
    truck_id: null,
    status: "available",
  });
  const flatId = queries.createDriver({
    name: "Chris Ceferino",
    phone: "555-0152",
    license: "NE-CDL-CHRIS",
    driver_type: "owner_operator",
    company_name: "Lumig Transports LLC",
    truck_id: null,
    status: "available",
  });
  const otherId = queries.createDriver({
    name: "Other Driver",
    phone: "555-0153",
    license: "NE-CDL-OTHER",
    truck_id: null,
    status: "available",
  });

  function loadInput(driverId: number, extra: Record<string, unknown> = {}) {
    return {
      customer_id: customerId,
      origin: "Omaha, NE",
      destination: "Hastings, NE",
      pickup_start: "2026-09-21T14:00:00.000Z",
      pickup_end: "2026-09-21T16:00:00.000Z",
      delivery_start: "2026-09-23T14:00:00.000Z",
      delivery_end: "2026-09-23T18:00:00.000Z",
      weight: 20000,
      commodity: "Frozen",
      rate: null as number | null,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: "",
      reefer_setpoint_f: null,
      trailer_number: "",
      status: "delivered",
      truck_id: null,
      driver_id: driverId,
      ...extra,
    };
  }

  const ooLoad = queries.createLoad(
    loadInput(ooId, {
      load_number: "MSE-1070",
      rate: 5000,
      oo_percent: 85,
      oo_pay: 4250,
    }),
  );
  db.getDb().prepare("UPDATE loads SET route_miles = ? WHERE id = ?").run(1593.1, ooLoad);
  payItems.addPayItem(ooLoad, {
    side: "expense",
    bill_to: "driver",
    payee: "Steve Eller",
    category: "detention",
    rate: 80,
    qty: 1,
    total: 80,
    notes: "Shipper hold",
  });
  queries.createLoad(
    loadInput(ooId, {
      load_number: "MSE-SUN",
      rate: 1000,
      oo_percent: 80,
      oo_pay: 800,
      delivery_start: "2026-09-27T14:00:00.000Z",
      delivery_end: "2026-09-27T20:00:00.000Z",
    }),
  );
  queries.createLoad(
    loadInput(ooId, {
      load_number: "MSE-CANCEL",
      rate: 9000,
      oo_pay: 9000,
      status: "cancelled",
    }),
  );
  queries.createLoad(
    loadInput(ooId, {
      load_number: "MSE-NEXT",
      rate: 700,
      oo_pay: 700,
      pickup_start: "2026-09-28T14:00:00.000Z",
      pickup_end: "2026-09-28T16:00:00.000Z",
      delivery_start: "2026-09-28T18:00:00.000Z",
      delivery_end: "2026-09-28T22:00:00.000Z",
    }),
  );
  queries.createLoad(
    loadInput(companyId, {
      load_number: "1006198",
      rate: 2000,
    }),
  );
  const flatLoad = queries.createLoad(
    loadInput(flatId, {
      load_number: "MSE-FLAT",
      rate: 5000,
      oo_percent: 85,
      oo_pay: 4250,
    }),
  );
  payItems.addPayItem(flatLoad, {
    side: "expense",
    bill_to: "driver",
    payee: "Chris Ceferino",
    category: "flat_rate",
    rate: 3100,
    qty: 1,
    total: 3100,
    notes: "",
  });

  const ooBefore = statements.buildSettlement(ooId, WEEK);
  assert.ok(ooBefore);
  assert.equal(ooBefore.statementNumber, `SS-20260921-${ooId}`);
  assert.equal(ooBefore.ownerOperatorCompany, "3K3B Trucking LLC");
  assert.deepEqual(
    ooBefore.loads.map((line) => line.loadNumber).sort(),
    ["MSE-1070", "MSE-SUN"],
  );
  const main = ooBefore.loads.find((line) => line.loadNumber === "MSE-1070");
  assert.ok(main);
  assert.equal(main.linehaul, 4250);
  assert.equal(main.ooPercent, 85);
  assert.equal(main.miles, 1593.1);
  assert.equal(ooBefore.extras.length, 1);
  assert.equal(ooBefore.extras[0].amount, 80);
  assert.equal(ooBefore.gross, 5130);
  assert.equal(ooBefore.deductionTotal, 0);
  assert.equal(ooBefore.net, 5130);

  const companyBefore = statements.buildSettlement(companyId, WEEK);
  assert.ok(companyBefore);
  assert.equal(companyBefore.loads.length, 1);
  assert.equal(companyBefore.loads[0].linehaul, null);
  assert.equal(companyBefore.gross, 0);
  assert.equal(companyBefore.deductionTotal, 0);
  assert.equal(companyBefore.net, 0);
  assert.equal(JSON.stringify(companyBefore).includes("2000"), false);

  const flatBefore = statements.buildSettlement(flatId, WEEK);
  assert.ok(flatBefore);
  assert.equal(flatBefore.loads[0].linehaul, 3100);
  assert.equal(flatBefore.extras.length, 0);
  assert.equal(flatBefore.gross, 3100);

  statements.saveDeductionTemplate({
    name: "Trailer wash",
    amount: 10,
    basis: "per_load",
    appliesTo: "owner_operator",
    active: true,
  });
  statements.saveDeductionTemplate({
    name: "ELD",
    amount: 40,
    basis: "fixed",
    appliesTo: "company_driver",
    active: true,
  });
  statements.addStatementOneOff({ driverId: ooId, weekStart: WEEK, name: "Cash advance", amount: 5 });

  const ooDeducted = statements.buildSettlement(ooId, WEEK);
  assert.ok(ooDeducted);
  assert.equal(ooDeducted.deductionTotal, 25);
  assert.equal(ooDeducted.net, 5105);
  const companyDeducted = statements.buildSettlement(companyId, WEEK);
  assert.ok(companyDeducted);
  assert.equal(companyDeducted.gross, 0);
  assert.equal(companyDeducted.deductionTotal, 40);
  assert.equal(companyDeducted.net, -40);

  await assert.rejects(
    () =>
      reimbursements.submitDriverReimbursement({
        driverId: ooId,
        driverName: "Steve Eller",
        amount: 45.5,
        category: "lumper",
        loadId: ooLoad,
        file: new File([], "receipt.png", { type: "image/png" }),
      }),
    /receipt photo is required/i,
  );
  await assert.rejects(
    () =>
      reimbursements.submitDriverReimbursement({
        driverId: otherId,
        driverName: "Other Driver",
        amount: 10,
        category: "tolls",
        loadId: ooLoad,
        file: receipt(),
      }),
    /not yours/i,
  );

  const approvedId = await reimbursements.submitDriverReimbursement({
    driverId: ooId,
    driverName: "Steve Eller",
    amount: "45.50",
    category: "lumper",
    loadId: ooLoad,
    note: "Night lumper",
    file: receipt(),
  });
  const owned = reimbursements.getReimbursement(approvedId);
  assert.ok(owned?.attachment_id);
  assert.equal(reimbursements.reimbursementDriverForAttachment(owned.attachment_id), ooId);
  assert.throws(
    () => reimbursements.readReimbursementReceipt(approvedId, { office: false, driverId: otherId }),
    (error: unknown) => error instanceof reimbursements.ReimbursementAccessError && error.status === 403,
  );
  const ownReceipt = reimbursements.readReimbursementReceipt(approvedId, { office: false, driverId: ooId });
  assert.equal(ownReceipt.buffer.length, png.length);

  const waitingId = await reimbursements.submitDriverReimbursement({
    driverId: ooId,
    driverName: "Steve Eller",
    amount: 12,
    category: "scale",
    file: receipt("scale.png"),
  });
  process.env.TMS_SCRIPT_ACTOR_ROLE = "viewer";
  const actions = await import("../lib/settlement-actions");
  const blockedForm = new FormData();
  blockedForm.set("id", String(waitingId));
  const blocked = await actions.approveReimbursementAction(null, blockedForm);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.error ?? "", /View-only access/);
  delete process.env.TMS_SCRIPT_ACTOR_ROLE;
  assert.equal(reimbursements.getReimbursement(waitingId)?.status, "submitted");

  db.getDb().prepare("UPDATE driver_reimbursements SET created_at = ? WHERE id = ?").run("2026-09-23T15:00:00.000Z", approvedId);
  const approved = reimbursements.approveReimbursement(approvedId, new Date("2026-09-24T15:00:00.000Z"));
  assert.equal(approved.status, "approved");
  assert.equal(approved.settlement_week_start, WEEK);

  const rejectedId = await reimbursements.submitDriverReimbursement({
    driverId: ooId,
    driverName: "Steve Eller",
    amount: 8,
    category: "other",
    file: receipt("other.png"),
  });
  const rejected = reimbursements.rejectReimbursement(rejectedId, "Not a company expense");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reject_reason, "Not a company expense");
  assert.equal(rejected.settlement_week_start, "");

  const withReimburse = statements.buildSettlement(ooId, WEEK);
  assert.ok(withReimburse);
  assert.equal(withReimburse.reimbursementTotal, 45.5);
  assert.equal(withReimburse.reimbursements.length, 1);
  assert.equal(withReimburse.reimbursements[0].categoryLabel, "Lumper");
  assert.equal(withReimburse.reimbursements[0].loadNumber, "MSE-1070");
  assert.equal(withReimburse.net, 5150.5);
  assert.equal(withReimburse.gross + withReimburse.reimbursementTotal - withReimburse.deductionTotal, withReimburse.net);

  const stamped = statements.markSettlementRecordPaid(ooId, WEEK, new Date("2026-10-02T15:00:00.000Z"));
  assert.equal(stamped.reimbursements, 1);
  const paidRow = reimbursements.getReimbursement(approvedId);
  assert.equal(paidRow?.status, "paid");
  assert.equal(paidRow?.paid_at, "2026-10-02T15:00:00.000Z");
  assert.equal(paidRow?.settlement_week_start, WEEK);
  assert.equal(reimbursements.getReimbursement(waitingId)?.status, "submitted");
  const again = statements.markSettlementRecordPaid(ooId, WEEK, new Date("2026-10-03T15:00:00.000Z"));
  assert.equal(again.reimbursements, 0);
  assert.equal(again.paidAt, stamped.paidAt);
  const paidStatement = statements.buildSettlement(ooId, WEEK);
  assert.equal(paidStatement?.reimbursementTotal, 45.5);
  assert.equal(paidStatement?.reimbursements[0].status, "paid");
  assert.equal(paidStatement?.net, 5150.5);
  assert.equal(reimbursements.placeReimbursementWeek(ooId, "2026-09-23T15:00:00.000Z"), "2026-09-28");

  const bytes = await pdf.renderSettlementPdf(paidStatement!);
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");

  const payPage = fs.readFileSync(path.join(process.cwd(), "app/driver/pay/page.tsx"), "utf8");
  assert.match(payPage, /getSignedInDriver\(/);
  assert.match(payPage, /buildSettlement\(driver\.id/);
  assert.doesNotMatch(payPage, /searchParams\.get\(\s*["']driver/);
  assert.doesNotMatch(payPage, /query\.driver/);

  const uiFiles = [
    "app/driver/pay/page.tsx",
    "app/driver/reimbursements/page.tsx",
    "app/driver/reimbursements/new/page.tsx",
    "components/reimbursement-form.tsx",
    "components/reimbursement-queue.tsx",
    "components/reimbursement-review-actions.tsx",
    "components/settlement-document.tsx",
    "components/mark-statement-paid-button.tsx",
    "lib/settlement-actions.ts",
  ];
  const ui = uiFiles.map((file) => fs.readFileSync(path.join(process.cwd(), file), "utf8")).join("\n");
  assert.doesNotMatch(ui, /mailto:|quickbooks|\bACH\b|withhold/i);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/settlement-statement.ts"), "utf8"), /does not move money/i);
  assert.doesNotMatch(
    fs.readFileSync(path.join(process.cwd(), "lib/settlement-actions.ts"), "utf8"),
    /closeDriverPayPeriod/,
  );

  console.log("settlement statement tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
