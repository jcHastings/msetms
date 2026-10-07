/**
 * MS Express is the carrier on invoices and the company profile.
 * M&S Loads stays a bill-to customer. Remit street and AR email stay blank until the office sets them.
 * Existing profile rows are not overwritten.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-carrier-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";

async function main() {
  const { closeDb, getDb } = await import("../lib/db");
  const settings = await import("../lib/settings");
  const queries = await import("../lib/queries");
  const { buildTmsInvoice, paperworkCompanyName, renderTmsInvoicePdf } = await import("../lib/invoice");
  const loadMail = await import("../lib/load-mail");
  const { extractText } = await import("unpdf");

  const fresh = settings.getCompanySettings();
  assert.equal(fresh.company_name, "MS Express");
  assert.equal(fresh.dispatcher_phone, "402-302-0097");
  assert.equal(fresh.city, "Hastings");
  assert.equal(fresh.state, "NE");
  assert.equal(fresh.street, "");
  assert.equal(fresh.zip, "");
  assert.equal(fresh.ar_email, "");
  assert.equal(fresh.usdot, "3062879");
  assert.equal(fresh.mc, "056299");
  assert.equal(paperworkCompanyName("M&S Loads"), "MS Express");
  assert.equal(paperworkCompanyName("M&S Loads LLC"), "MS Express");
  assert.equal(paperworkCompanyName("MS Express"), "MS Express");
  assert.equal(paperworkCompanyName("Other Carrier"), "Other Carrier");
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/mail-shared.ts"), "utf8"), /ar@msloads\.com/);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), "lib/db.ts"), "utf8"), /street = '600 E 39th St'/);

  const customerId = queries.createCustomer({
    name: "Kayco",
    billing_notes: "",
    contacts: [{ name: "AP", role: "AP", phone: "", email: "ap@kayco.example" }],
  });
  const day = new Date(Date.now() - 86_400_000).toISOString();
  const loadId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Bayonne, NJ",
    pickup_start: day,
    pickup_end: day,
    delivery_start: day,
    delivery_end: day,
    weight: 40000,
    commodity: "Frozen beef",
    rate: 1400,
    notes: "",
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: "",
    reefer_setpoint_f: null,
    trailer_number: "",
    status: "available",
    truck_id: null,
    driver_id: null,
    trailer_id: null,
    load_number: "MSE-IDENT",
    oo_pay: null,
  } as Parameters<typeof queries.createLoad>[0]);
  getDb().prepare("UPDATE loads SET status = 'delivered' WHERE id = ?").run(loadId);

  const blocked = buildTmsInvoice(queries.getLoad(loadId)!);
  assert.equal(blocked.companyLegalName, "MS Express");
  assert.equal(blocked.companyEmail, "");
  assert.match(blocked.companyDocket ?? "", /USDOT 3062879/);
  assert.match(blocked.companyDocket ?? "", /MC 056299/);
  assert.match(blocked.issuerWarning ?? "", /Remit street address is blank/);
  assert.match(blocked.issuerWarning ?? "", /AR email is blank/);
  assert.doesNotMatch(blocked.companyLegalName, /M&S Loads/);
  await assert.rejects(() => loadMail.sendCustomerInvoiceMail(loadId, async () => {}), /cannot be emailed/);

  const blockedPdf = await renderTmsInvoicePdf(blocked);
  const blockedText = String((await extractText(new Uint8Array(blockedPdf), { mergePages: true })).text ?? "");
  assert.match(blockedText, /MS Express/);
  assert.match(blockedText, /USDOT 3062879/);
  assert.match(blockedText, /MC 056299/);
  assert.match(blockedText, /402-302-0097/);
  assert.match(blockedText, /Hastings/);
  assert.match(blockedText, /Remit to MS Express/);
  assert.doesNotMatch(blockedText, /M&S Loads|ar@msloads\.com/);

  getDb().prepare("UPDATE company_profile SET company_name = 'M&S Loads LLC', street = '', ar_email = '' WHERE id = 1").run();
  closeDb();
  const kept = settings.getCompanySettings();
  assert.equal(kept.company_name, "M&S Loads LLC", "migrate must not overwrite a stored profile name");
  assert.equal(kept.street, "");
  const renamed = buildTmsInvoice(queries.getLoad(loadId)!);
  assert.equal(renamed.companyLegalName, "MS Express");
  assert.match(renamed.issuerWarning ?? "", /looks like M&S Loads/);
  const renamedPdf = await renderTmsInvoicePdf(renamed);
  const renamedText = String((await extractText(new Uint8Array(renamedPdf), { mergePages: true })).text ?? "");
  assert.match(renamedText, /MS Express/);
  assert.doesNotMatch(renamedText, /M&S Loads|ar@msloads\.com/);
  await assert.rejects(() => loadMail.sendCustomerInvoiceMail(loadId, async () => {}), /cannot be emailed/);

  settings.updateCompanyContact({
    company_name: "MS Express",
    dispatcher_name: kept.dispatcher_name,
    dispatcher_phone: "402-302-0097",
    dispatcher_fax: "",
    dispatcher_email: kept.dispatcher_email,
    street: "100 Office Pl",
    city: "Hastings",
    state: "NE",
    zip: "68901",
    ar_email: "billing@msexpress.test",
    usdot: "3062879",
    mc: "056299",
  });
  assert.throws(
    () =>
      settings.updateCompanyContact({
        ...settings.getCompanySettings(),
        ar_email: "ar@msloads.com",
      }),
    /ar@msloads\.com/,
  );
  const ready = buildTmsInvoice(queries.getLoad(loadId)!);
  assert.equal(ready.issuerWarning, "");
  assert.equal(ready.companyEmail, "billing@msexpress.test");
  assert.match(ready.companyAddress, /100 Office Pl/);
  let sentFrom = "";
  let sentText = "";
  await loadMail.sendCustomerInvoiceMail(loadId, async (mail) => {
    sentFrom = mail.from ?? "";
    sentText = mail.text;
  });
  assert.equal(sentFrom, "billing@msexpress.test");
  assert.match(sentText, /MS Express · Accounts Receivable/);
  assert.doesNotMatch(sentText, /M&S Loads|ar@msloads\.com/);
  const readyPdf = await renderTmsInvoicePdf(ready);
  const readyText = String((await extractText(new Uint8Array(readyPdf), { mergePages: true })).text ?? "");
  assert.match(readyText, /billing@msexpress\.test/);
  assert.match(readyText, /100 Office Pl/);
  assert.doesNotMatch(readyText, /M&S Loads|ar@msloads\.com/);

  const draft = loadMail.composeCustomerInvoiceEmail({
    invoiceNumber: "INV-1",
    loadNumber: "MSE-IDENT",
    customerName: "Kayco",
    totalLabel: "$1,400.00",
  });
  assert.equal(draft.from, "billing@msexpress.test");
  assert.match(draft.text, /MS Express/);
  assert.doesNotMatch(draft.text, /M&S Loads|ar@msloads\.com/);
  console.log("carrier-identity-test: ok");
}

main()
  .then(() => fs.rmSync(tmp, { recursive: true, force: true }))
  .catch((error) => {
    console.error(error);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  });
