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
  const { buildTmsInvoice, isCompanyCustomerName, paperworkCompanyName, renderTmsInvoicePdf } = await import("../lib/invoice");
  const identity = await import("../lib/carrier-identity");
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
  assert.equal(paperworkCompanyName("M & S Loads"), "MS Express");
  assert.equal(paperworkCompanyName("M and S Loads"), "MS Express");
  assert.equal(paperworkCompanyName("M&S Loads LLC - MS Express"), "MS Express");
  assert.equal(paperworkCompanyName("MS Express"), "MS Express");
  assert.equal(paperworkCompanyName("M&S Loads DBA MS Express"), "M&S Loads DBA MS Express");
  assert.equal(paperworkCompanyName("  m&s   loads   dba   ms   express  "), "m&s   loads   dba   ms   express");
  assert.equal(paperworkCompanyName("M AND S LOADS DBA MS EXPRESS"), "M AND S LOADS DBA MS EXPRESS");
  assert.equal(paperworkCompanyName("M and S Loads DBA MS Express"), "M and S Loads DBA MS Express");
  assert.equal(paperworkCompanyName("M & S Loads DBA MS Express"), "M & S Loads DBA MS Express");
  assert.equal(paperworkCompanyName("M& S Loads DBA MS Express"), "M& S Loads DBA MS Express");
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
  const { addAttachment } = await import("../lib/files");
  addAttachment({
    loadId,
    kind: "pod",
    originalName: "pod.pdf",
    buffer: Buffer.from("%PDF-1.4"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const { deliverAutoInvoice } = await import("../lib/auto-invoice");
  const skippedAuto = await deliverAutoInvoice(loadId, async () => {
    throw new Error("auto invoice must not send");
  });
  assert.equal(skippedAuto.sent, false);
  assert.match(skippedAuto.skipped, /cannot be emailed/);

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
    ar_email: "ar@msloads.com",
    usdot: "3062879",
    mc: "056299",
  });
  assert.equal(settings.getCompanySettings().ar_email, "ar@msloads.com");
  const ready = buildTmsInvoice(queries.getLoad(loadId)!);
  assert.equal(ready.issuerWarning, "");
  assert.equal(ready.companyEmail, "ar@msloads.com");
  assert.match(ready.companyAddress, /100 Office Pl/);
  let sentFrom = "";
  let sentText = "";
  await loadMail.sendCustomerInvoiceMail(loadId, async (mail) => {
    sentFrom = mail.from ?? "";
    sentText = mail.text;
  });
  assert.equal(sentFrom, "ar@msloads.com");
  assert.match(sentText, /MS Express · Accounts Receivable/);
  assert.doesNotMatch(sentText, /M&S Loads|jc@msloads\.com|970613|Nanuet/);
  const readyPdf = await renderTmsInvoicePdf(ready);
  const readyText = String((await extractText(new Uint8Array(readyPdf), { mergePages: true })).text ?? "");
  assert.match(readyText, /ar@msloads\.com/);
  assert.match(readyText, /100 Office Pl/);
  assert.doesNotMatch(readyText, /M&S Loads|jc@msloads\.com|970613|Nanuet/);

  settings.updateCompanyContact({
    ...settings.getCompanySettings(),
    ar_email: "",
  });
  const blankAgain = buildTmsInvoice(queries.getLoad(loadId)!);
  assert.match(blankAgain.issuerWarning ?? "", /AR email is blank/);
  await assert.rejects(() => loadMail.sendCustomerInvoiceMail(loadId, async () => {}), /cannot be emailed/);
  settings.updateCompanyContact({
    ...settings.getCompanySettings(),
    ar_email: "ar@msloads.com",
  });

  const draft = loadMail.composeCustomerInvoiceEmail({
    invoiceNumber: "INV-1",
    loadNumber: "MSE-IDENT",
    customerName: "Kayco",
    totalLabel: "$1,400.00",
  });
  assert.equal(draft.from, "ar@msloads.com");
  assert.equal(draft.replyTo, "ar@msloads.com");
  assert.match(draft.text, /MS Express/);
  assert.doesNotMatch(draft.text, /M&S Loads|jc@msloads\.com/);

  const allowedIdentity = {
    company_name: "M&S Loads DBA MS Express",
    street: "100 Office Pl",
    city: "Hastings",
    state: "NE",
    zip: "68901",
    ar_email: "ar@msloads.com",
    dispatcher_email: "ana@msloads.com",
    dispatcher_phone: "402-302-0097",
    usdot: "3062879",
    mc: "056299",
  };
  const acceptNames = [
    "M&S Loads DBA MS Express",
    "m&s loads dba ms express",
    "  M&S   Loads   DBA   MS   Express  ",
    "M and S Loads DBA MS Express",
    "M & S Loads DBA MS Express",
    "M& S Loads DBA MS Express",
  ];
  for (const company_name of acceptNames) {
    const compact = company_name.toLowerCase().replace(/[^a-z0-9]/g, "");
    assert.equal(compact.includes("msloads") || compact.includes("mandsloads"), true);
    assert.equal(identity.looksLikeMsLoadsName(company_name), false, company_name);
    const gaps = identity.invoiceIssuerProblems({ ...allowedIdentity, company_name });
    assert.equal(gaps.includes("company_name"), false, company_name);
    assert.deepEqual(gaps, [], `accepted name should not block: ${company_name}`);
    identity.assertInvoiceIssuerReady({ ...allowedIdentity, company_name });
    assert.equal(identity.invoiceIssuerLegalName(company_name), company_name.trim());
    assert.equal(paperworkCompanyName(company_name), company_name.trim());
    assert.equal(identity.isMsExpressLegalName(company_name), true);
  }
  assert.equal(identity.looksLikeMsLoadsName("M&S Loads"), true);
  assert.equal(identity.looksLikeMsLoadsName("M&S Loads LLC"), true);
  assert.ok(identity.invoiceIssuerProblems({ ...allowedIdentity, company_name: "M&S Loads" }).includes("company_name"));
  assert.ok(identity.invoiceIssuerProblems({ ...allowedIdentity, company_name: "M&S Loads LLC" }).includes("company_name"));
  assert.throws(() => identity.assertInvoiceIssuerReady({ ...allowedIdentity, company_name: "M&S Loads" }), /M&S Loads/);
  assert.throws(() => identity.assertInvoiceIssuerReady({ ...allowedIdentity, company_name: "M&S Loads LLC" }), /M&S Loads/);
  assert.equal(isCompanyCustomerName("Express", "M&S Loads DBA MS Express"), false);
  assert.equal(isCompanyCustomerName("DBA", "M&S Loads DBA MS Express"), false);
  assert.equal(isCompanyCustomerName("Express Logistics", "M&S Loads DBA MS Express"), false);
  assert.equal(isCompanyCustomerName("M & S Loads LLC.", "M&S Loads"), false);
  assert.equal(isCompanyCustomerName("M&S Loads LLC", "MS Express"), false);
  assert.equal(isCompanyCustomerName("MS Express", "Kayco"), true);
  assert.equal(isCompanyCustomerName("M&S Loads", "M&S Loads"), true);
  assert.equal(isCompanyCustomerName("M & S Loads", "M&S Loads"), true);
  assert.equal(isCompanyCustomerName("M&S Loads DBA MS Express", "MS Express"), true);
  assert.equal(isCompanyCustomerName("M and S Loads DBA MS Express", "Other Carrier"), true);
  assert.deepEqual(
    identity.invoiceIssuerProblems({ ...allowedIdentity, company_name: "MS Express" }),
    [],
    "operating name MS Express stays allowed",
  );
  assert.equal(identity.isBrokerageMc("056299"), false);
  assert.equal(identity.isBrokerageMc("MC 056299"), false);
  assert.equal(identity.isBrokerageMc("MC-056299"), false);
  assert.equal(identity.isBrokerageMc(allowedIdentity.usdot), false);
  assert.equal(identity.isBrokerageEmail(allowedIdentity.ar_email), false);
  assert.equal(identity.isBrokerageAddress(allowedIdentity), false);

  const blockNames = ["M&S Loads", "M&S Loads LLC", "M & S Loads", "M and S Loads", "M&S Loads LLC - MS Express"];
  for (const company_name of blockNames) {
    const gaps = identity.invoiceIssuerProblems({ ...allowedIdentity, company_name });
    assert.ok(gaps.includes("company_name"), `blocked name: ${company_name}`);
    assert.match(identity.invoiceIssuerWarning(gaps), /looks like M&S Loads/);
    assert.equal(identity.invoiceIssuerLegalName(company_name), "MS Express");
    assert.equal(identity.isMsExpressLegalName(company_name), false);
  }
  const mcGaps = identity.invoiceIssuerProblems({ ...allowedIdentity, company_name: "MS Express", mc: "MC-970613" });
  assert.ok(mcGaps.includes("brokerage_mc"));
  assert.match(identity.invoiceIssuerWarning(mcGaps), /MC-970613/);
  assert.match(identity.invoiceIssuerWarning(mcGaps), /056299/);
  assert.equal(identity.invoiceIssuerDocket(allowedIdentity.usdot, "MC-970613"), "USDOT 3062879 · MC 056299");
  assert.equal(identity.isBrokerageMc("970613"), true);
  assert.equal(identity.isBrokerageMc("MC 970613"), true);

  const emailGaps = identity.invoiceIssuerProblems({
    ...allowedIdentity,
    company_name: "MS Express",
    ar_email: "JC@msloads.com",
  });
  assert.ok(emailGaps.includes("brokerage_email"));
  assert.equal(emailGaps.includes("ar_email"), false);
  assert.match(identity.invoiceIssuerWarning(emailGaps), /jc@msloads\.com/);
  assert.match(identity.invoiceIssuerWarning(emailGaps), /ar@msloads\.com/);
  assert.equal(identity.usableArEmail("jc@msloads.com"), "");
  assert.equal(identity.usableArEmail("ar@msloads.com"), "ar@msloads.com");
  const dispatcherEmailGaps = identity.invoiceIssuerProblems({
    ...allowedIdentity,
    company_name: "MS Express",
    dispatcher_email: "jc@msloads.com",
  });
  assert.ok(dispatcherEmailGaps.includes("brokerage_email"));

  const nanuet = {
    ...allowedIdentity,
    company_name: "MS Express",
    street: "228 East Route 59 #190",
    city: "Nanuet",
    state: "NY",
    zip: "10954",
  };
  const nanuetGaps = identity.invoiceIssuerProblems(nanuet);
  assert.ok(nanuetGaps.includes("brokerage_address"));
  assert.match(identity.invoiceIssuerWarning(nanuetGaps), /Nanuet/);
  assert.equal(identity.paperworkIssuer(nanuet).city, "Hastings");
  assert.equal(identity.paperworkIssuer(nanuet).state, "NE");
  assert.equal(identity.paperworkIssuer(nanuet).street, "");
  assert.equal(identity.paperworkIssuer(nanuet).zip, "");
  const deerfield = {
    ...allowedIdentity,
    company_name: "MS Express",
    street: "100 Sample St",
    city: "Deerfield Beach",
    state: "FL",
    zip: "33441",
  };
  const deerfieldGaps = identity.invoiceIssuerProblems(deerfield);
  assert.ok(deerfieldGaps.includes("brokerage_address"));
  assert.match(identity.invoiceIssuerWarning(deerfieldGaps), /Deerfield Beach/);
  assert.equal(identity.paperworkIssuer(deerfield).city, "Hastings");
  assert.equal(identity.isBrokerageAddress({ street: "228 E Route 59", city: "Hastings", state: "NE", zip: "68901" }), true);

  const settingsPage = fs.readFileSync(path.join(process.cwd(), "app/settings/company/page.tsx"), "utf8");
  const qboSend = fs.readFileSync(path.join(process.cwd(), "lib/integrations/quickbooks.ts"), "utf8");
  assert.match(settingsPage, /invoiceIssuerProblems\(settings\)/);
  assert.match(qboSend, /invoiceIssuerProblems\(getCompanySettings\(\)\)/);

  settings.updateCompanyContact({
    ...settings.getCompanySettings(),
    ...allowedIdentity,
  });
  const legalInvoice = buildTmsInvoice(queries.getLoad(loadId)!);
  assert.equal(legalInvoice.issuerWarning, "");
  assert.equal(legalInvoice.companyLegalName, "M&S Loads DBA MS Express");
  assert.equal(legalInvoice.companyEmail, "ar@msloads.com");
  assert.match(legalInvoice.companyDocket ?? "", /USDOT 3062879/);
  assert.match(legalInvoice.companyDocket ?? "", /MC 056299/);
  const legalPdf = await renderTmsInvoicePdf(legalInvoice);
  const legalText = String((await extractText(new Uint8Array(legalPdf), { mergePages: true })).text ?? "");
  assert.match(legalText, /M&S Loads DBA MS Express/);
  assert.match(legalText, /USDOT 3062879/);
  assert.match(legalText, /MC 056299/);
  assert.match(legalText, /Hastings/);
  assert.match(legalText, /402-302-0097/);
  assert.match(legalText, /ar@msloads\.com/);
  assert.doesNotMatch(legalText, /jc@msloads\.com|970613|Nanuet|Deerfield Beach/);
  await loadMail.sendCustomerInvoiceMail(loadId, async () => {});

  const storedDba = "M & S Loads DBA MS Express";
  settings.updateCompanyContact({
    ...settings.getCompanySettings(),
    company_name: storedDba,
  });
  const storedInvoice = buildTmsInvoice(queries.getLoad(loadId)!);
  assert.equal(storedInvoice.companyLegalName, storedDba);
  assert.equal(storedInvoice.issuerWarning, "");
  const storedPdf = await renderTmsInvoicePdf(storedInvoice);
  const storedText = String((await extractText(new Uint8Array(storedPdf), { mergePages: true })).text ?? "");
  assert.match(storedText, /M & S Loads DBA MS Express/);
  const { generateBolPdf } = await import("../lib/bol");
  const bol = await generateBolPdf(loadId, null, { persistDraft: false });
  const bolText = String((await extractText(new Uint8Array(bol.buffer), { mergePages: true })).text ?? "");
  assert.match(bolText, /M & S Loads DBA MS Express/);
  assert.equal(bol.model.carrierName, storedDba);
  const { listDefaultedDocuments } = await import("../lib/load-documents");
  const confirmation = listDefaultedDocuments(loadId).find((row) => row.key === "carrier_confirmation");
  assert.ok(confirmation?.source.includes(storedDba));
  await loadMail.sendCustomerInvoiceMail(loadId, async () => {});
  const autoId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Bayonne, NJ",
    pickup_start: day,
    pickup_end: day,
    delivery_start: day,
    delivery_end: day,
    weight: 40000,
    commodity: "Frozen beef",
    rate: 900,
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
    load_number: "MSE-AUTO",
    oo_pay: null,
  } as Parameters<typeof queries.createLoad>[0]);
  getDb().prepare("UPDATE loads SET status = 'delivered' WHERE id = ?").run(autoId);
  const { addAttachment: addAutoPod } = await import("../lib/files");
  addAutoPod({
    loadId: autoId,
    kind: "pod",
    originalName: "auto-pod.pdf",
    buffer: Buffer.from("%PDF-1.4"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const autoSent = await deliverAutoInvoice(autoId, async () => {});
  assert.equal(autoSent.sent, true, autoSent.skipped);
  settings.updateCompanyContact({
    ...settings.getCompanySettings(),
    company_name: "M&S Loads LLC",
  });
  const autoBlockedId = queries.createLoad({
    customer_id: customerId,
    origin: "Hastings, NE",
    destination: "Bayonne, NJ",
    pickup_start: day,
    pickup_end: day,
    delivery_start: day,
    delivery_end: day,
    weight: 40000,
    commodity: "Frozen beef",
    rate: 900,
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
    load_number: "MSE-AUTO-BLOCK",
    oo_pay: null,
  } as Parameters<typeof queries.createLoad>[0]);
  getDb().prepare("UPDATE loads SET status = 'delivered' WHERE id = ?").run(autoBlockedId);
  addAutoPod({
    loadId: autoBlockedId,
    kind: "pod",
    originalName: "auto-block-pod.pdf",
    buffer: Buffer.from("%PDF-1.4"),
    mimeType: "application/pdf",
    uploadedBy: "dispatcher",
  });
  const autoBlocked = await deliverAutoInvoice(autoBlockedId, async () => {
    throw new Error("auto invoice must not send");
  });
  assert.equal(autoBlocked.sent, false);
  assert.match(autoBlocked.skipped, /M&S Loads/);
  await assert.rejects(() => loadMail.sendCustomerInvoiceMail(autoBlockedId, async () => {}), /M&S Loads/);

  settings.updateCompanyContact({
    ...settings.getCompanySettings(),
    company_name: "M&S Loads",
  });
  await assert.rejects(() => loadMail.sendCustomerInvoiceMail(loadId, async () => {}), /looks like M&S Loads/);
  const barePdf = await renderTmsInvoicePdf(buildTmsInvoice(queries.getLoad(loadId)!));
  const bareText = String((await extractText(new Uint8Array(barePdf), { mergePages: true })).text ?? "");
  assert.match(bareText, /MS Express/);
  assert.doesNotMatch(bareText, /M&S Loads/);

  settings.updateCompanyContact({
    ...settings.getCompanySettings(),
    company_name: "MS Express",
    mc: "MC-970613",
  });
  await assert.rejects(() => loadMail.sendCustomerInvoiceMail(loadId, async () => {}), /MC-970613/);
  const mcPdf = await renderTmsInvoicePdf(buildTmsInvoice(queries.getLoad(loadId)!));
  const mcText = String((await extractText(new Uint8Array(mcPdf), { mergePages: true })).text ?? "");
  assert.match(mcText, /MC 056299/);
  assert.doesNotMatch(mcText, /970613/);

  settings.updateCompanyContact({
    ...settings.getCompanySettings(),
    mc: "056299",
    ar_email: "jc@msloads.com",
  });
  await assert.rejects(() => loadMail.sendCustomerInvoiceMail(loadId, async () => {}), /jc@msloads\.com/);
  const emailPdf = await renderTmsInvoicePdf(buildTmsInvoice(queries.getLoad(loadId)!));
  const emailText = String((await extractText(new Uint8Array(emailPdf), { mergePages: true })).text ?? "");
  assert.doesNotMatch(emailText, /jc@msloads\.com/);

  settings.updateCompanyContact({
    ...settings.getCompanySettings(),
    ar_email: "ar@msloads.com",
    street: "228 East Route 59 #190",
    city: "Nanuet",
    state: "NY",
    zip: "10954",
  });
  await assert.rejects(() => loadMail.sendCustomerInvoiceMail(loadId, async () => {}), /Nanuet/);
  const nanuetPdf = await renderTmsInvoicePdf(buildTmsInvoice(queries.getLoad(loadId)!));
  const nanuetText = String((await extractText(new Uint8Array(nanuetPdf), { mergePages: true })).text ?? "");
  assert.doesNotMatch(nanuetText, /Nanuet|10954|Route 59/);
  assert.match(nanuetText, /Hastings/);

  settings.updateCompanyContact({
    ...settings.getCompanySettings(),
    street: "100 Sample St",
    city: "Deerfield Beach",
    state: "FL",
    zip: "33441",
  });
  await assert.rejects(() => loadMail.sendCustomerInvoiceMail(loadId, async () => {}), /Deerfield Beach/);
  const deerfieldPdf = await renderTmsInvoicePdf(buildTmsInvoice(queries.getLoad(loadId)!));
  const deerfieldText = String((await extractText(new Uint8Array(deerfieldPdf), { mergePages: true })).text ?? "");
  assert.doesNotMatch(deerfieldText, /Deerfield/);

  console.log("carrier-identity-test: ok");
}

main()
  .then(() => fs.rmSync(tmp, { recursive: true, force: true }))
  .catch((error) => {
    console.error(error);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  });
