/**
 * Driver Assist: registration (truck gated, trailer fleet-wide), company docs (IFTA, insurance cards),
 * personal docs, and facility answers for any shipper/receiver. Office company-doc upload, history, expiry.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-assist-docs-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";
process.env.TRUSTED_PROXY = "1";

const BASE = "http://localhost:3000/api/driver/v1";
const PASSWORD = "Driver1$ab";
const PNG = fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/driver-api/pod.png"));

type Doc = { id: number; kind: string; owner_type: string; owner_id: number; unit_label: string; href: string };
type Reply = { answer: string; unknown: boolean; documents: Doc[]; facility?: { id: number; name: string }; choices?: Array<{ id: number; label: string }> };

function isoDay(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pngFile(name: string): File {
  return new File([new Uint8Array(PNG)], name, { type: "image/png" });
}

async function main() {
  const queries = await import("../lib/queries");
  const { getDb } = await import("../lib/db");
  const { addFleetDocument } = await import("../lib/files");
  const assist = await import("../lib/driver-assist");
  const company = await import("../lib/company-docs");
  const companyActions = await import("../lib/company-docs-actions");
  const { saveFacilityInfoFromForm } = await import("../lib/location-facility");
  const loginRoute = await import("../app/api/driver/v1/auth/login/route");
  const assistRoute = await import("../app/api/driver/v1/assist/route");
  const docRoute = await import("../app/api/driver/v1/assist/docs/[fleetDocumentId]/route");
  const companyDocRoute = await import("../app/api/driver/v1/assist/company-docs/[companyDocumentId]/route");
  const db = getDb();

  const customerId = queries.createCustomer({ name: "Assist Docs Customer", billing_notes: "", contacts: [] });
  function driver(name: string, email: string) {
    return queries.createDriver({
      name,
      phone: "555-0700",
      email,
      license: "CDL",
      pin: String(Math.floor(1000 + Math.random() * 8999)),
      password: PASSWORD,
      truck_id: null,
      status: "available",
    });
  }
  const drvA = driver("Ana Assigned", "ana@msloads.test");
  const drvB = driver("Ben Other", "ben@msloads.test");
  const drvC = driver("Cy Unassigned", "cy@msloads.test");
  const drvD = driver("Dee Inactive", "dee@msloads.test");
  const drvE = driver("Eli Missing", "eli@msloads.test");

  const truck = (unit: string) => queries.createTruck({ unit_number: unit, type: "sleeper", capacity_lbs: 50000, status: "available" });
  const trailer = (unit: string) => queries.createTrailer({ unit_number: unit, type: "reefer" });
  const t1 = truck("8701");
  const t2 = truck("8702");
  const t3 = truck("8703");
  const r1 = trailer("MS5312");
  const r2 = trailer("MS2205");
  const r3 = trailer("MS7777");
  const rx = trailer("MX9100");
  db.prepare("UPDATE trailers SET division = 'MSX' WHERE id = ?").run(rx);

  function load(driverId: number, truckId: number, trailerId: number, n: string) {
    const pickup = new Date(Date.now() + 86_400_000);
    const id = queries.createLoad({
      customer_id: customerId,
      origin: "Hastings, NE",
      destination: "Omaha, NE",
      pickup_start: pickup.toISOString(),
      pickup_end: pickup.toISOString(),
      delivery_start: new Date(pickup.getTime() + 86_400_000).toISOString(),
      delivery_end: new Date(pickup.getTime() + 90_000_000).toISOString(),
      weight: 40000,
      commodity: "Frozen beef",
      rate: 2400,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "RC-ASSIST",
      po_number: "",
      reefer_setpoint_f: null,
      trailer_number: "",
      status: "dispatched",
      truck_id: truckId,
      driver_id: driverId,
      trailer_id: trailerId,
      load_number: n,
      oo_pay: null,
    } as Parameters<typeof queries.createLoad>[0]);
    db.prepare("UPDATE loads SET truck_id = ?, trailer_id = ? WHERE id = ?").run(truckId, trailerId, id);
    return id;
  }
  load(drvA, t1, r1, "MSE-AD-1");
  load(drvB, t2, r2, "MSE-AD-2");
  load(drvE, t3, r3, "MSE-AD-3");
  load(drvD, t1, r1, "MSE-AD-4");

  const fleet = (ownerType: "truck" | "trailer" | "driver", ownerId: number, kind: "registration" | "dot_inspection" | "cdl" | "med_card" | "insurance", name: string) =>
    addFleetDocument({ ownerType, ownerId, kind, originalName: name, buffer: PNG, mimeType: "image/png" });
  const t1Reg = fleet("truck", t1, "registration", "t1-reg.png");
  const t2Reg = fleet("truck", t2, "registration", "t2-reg.png");
  const r1Reg = fleet("trailer", r1, "registration", "r1-reg.png");
  const r2Reg = fleet("trailer", r2, "registration", "r2-reg.png");
  const r2Dot = fleet("trailer", r2, "dot_inspection", "r2-dot.png");
  const rxReg = fleet("trailer", rx, "registration", "msx-reg.png");
  const aCdl = fleet("driver", drvA, "cdl", "a-cdl.png");
  const aMed = fleet("driver", drvA, "med_card", "a-med.png");
  const bCdl = fleet("driver", drvB, "cdl", "b-cdl.png");

  const get = (id: number) => queries.getDriver(id)!;
  const ask = (id: number, q: string, facilityId?: number) => assist.answerDriverAssist(get(id), q, { facilityId }) as Reply;
  const ids = (reply: Reply) => reply.documents.map((doc) => `${doc.owner_type}:${doc.id}`);
  const fleetKey = (doc: { id: number; owner_type: string }) => `${doc.owner_type}:${doc.id}`;

  /* ---------- Registration: truck gated, trailer fleet-wide ---------- */
  let r = ask(drvA, "trailer registration");
  assert.deepEqual(ids(r), [fleetKey(r1Reg)], "trailer registration → assigned trailer only");
  assert.equal(r.documents[0].unit_label, "Trailer MS5312");
  for (const q of ["truck registration", "cab card", "IRP cab card please", "tractor reg"]) {
    assert.deepEqual(ids(ask(drvA, q)), [fleetKey(t1Reg)], `${q} → assigned truck`);
  }
  for (const q of ["registration", "regestration", "registrations?", "my regs", "reg", "Registartion for my truck and trailer"]) {
    assert.deepEqual(new Set(ids(ask(drvA, q))), new Set([fleetKey(t1Reg), fleetKey(r1Reg)]), `${q} → truck + trailer`);
  }
  for (const q of ["trailer reg", "trailer registraton", "trailr registration"]) {
    assert.deepEqual(ids(ask(drvA, q)), [fleetKey(r1Reg)], `${q} → trailer`);
  }
  for (const q of ["trailer 2205 registration", "#2205 reg", "T2205 registration", "registration for trailer MS2205", "trailer ms-2205 reg"]) {
    assert.deepEqual(ids(ask(drvA, q)), [fleetKey(r2Reg)], `${q} → named trailer fleet-wide`);
  }
  r = ask(drvA, "trailer 9999 registration");
  assert.equal(r.unknown, true);
  assert.match(r.answer, /Trailer 9999 not found/);
  r = ask(drvA, "trailer 9100 registration");
  assert.equal(r.documents.length, 0, "MSX trailer is not an MS Express unit");
  assert.match(r.answer, /not found in MS Express units/);
  r = ask(drvA, "truck 8702 registration");
  assert.equal(r.documents.length, 0, "named truck that is not theirs is denied");
  assert.match(r.answer, /Truck 8702 is not assigned to you/);
  r = ask(drvC, "trailer registration");
  assert.equal(r.unknown, true);
  assert.equal(r.answer.split("\n")[0], assist.DRIVER_ASSIST_WHICH_TRAILER, "no assignment → ask which trailer");
  assert.deepEqual(ids(ask(drvC, "trailer MS2205 registration")), [fleetKey(r2Reg)]);
  r = ask(drvE, "registration");
  assert.equal(r.documents.length, 0);
  assert.match(r.answer, /Truck 8703: no registration on file/);
  assert.match(r.answer, /Trailer MS7777: no registration on file/);
  r = ask(drvA, "trailer registration");
  assert.ok(!ids(r).includes(fleetKey(r2Reg)) && !ids(r).includes(fleetKey(t2Reg)), "no leak of another unit by default");

  /* ---------- Personal docs stay private ---------- */
  assert.deepEqual(ids(ask(drvA, "CDL")), [fleetKey(aCdl)]);
  assert.deepEqual(ids(ask(drvA, "medical card")), [fleetKey(aMed)]);
  assert.deepEqual(ids(ask(drvB, "my cdl")), [fleetKey(bCdl)]);
  assert.ok(!ids(ask(drvA, "CDL")).includes(fleetKey(bCdl)));
  r = ask(drvA, "My truck docs");
  assert.deepEqual(new Set(ids(r)), new Set([fleetKey(t1Reg), fleetKey(r1Reg), fleetKey(aCdl), fleetKey(aMed)]));

  /* ---------- Office company docs: upload, history, viewer denied, expiry ---------- */
  const alertsBefore = company.companyDocAlerts();
  assert.ok(alertsBefore.some((a) => /IFTA license is missing/.test(a.message)), "required IFTA missing warning");
  assert.ok(alertsBefore.some((a) => /Insurance cards is missing/.test(a.message)), "required insurance missing warning");
  assert.match(ask(drvA, "IFTA license").answer, /IFTA license is not on file/);

  function form(entries: Record<string, string | File>): FormData {
    const fd = new FormData();
    for (const [k, v] of Object.entries(entries)) fd.append(k, v);
    return fd;
  }
  process.env.TMS_SCRIPT_ACTOR_ROLE = "viewer";
  const viewerTry = await companyActions.uploadCompanyDocAction(null, form({ slot: "ifta_license", file: pngFile("ifta.png"), expires_on: isoDay(200) }));
  assert.equal(viewerTry.ok, false, "viewer cannot upload");
  delete process.env.TMS_SCRIPT_ACTOR_ROLE;
  const noDate = await companyActions.uploadCompanyDocAction(null, form({ slot: "ifta_license", file: pngFile("ifta.png"), expires_on: "" }));
  assert.equal(noDate.ok, false, "expiry date is required");

  const ifta1 = await companyActions.uploadCompanyDocAction(null, form({ slot: "ifta_license", file: pngFile("ifta-2025.png"), expires_on: isoDay(10) }));
  assert.equal(ifta1.ok, true);
  const ifta2 = await companyActions.uploadCompanyDocAction(null, form({ slot: "ifta_license", file: pngFile("ifta-2026.png"), expires_on: isoDay(20) }));
  assert.equal(ifta2.ok, true);
  const iftaHistory = company.listCompanyDocHistory("ifta_license");
  assert.deepEqual(iftaHistory.map((d) => d.status), ["current", "replaced"], "new IFTA replaces old; old stays in history");
  assert.equal(iftaHistory[1].id, ifta1.ok ? ifta1.id : -1);
  assert.equal(company.listCurrentCompanyDocs("ifta_license").length, 1);
  const iftaAlerts = company.companyDocAlerts().filter((a) => a.label === "IFTA license");
  assert.equal(iftaAlerts.length, 1);
  assert.equal(iftaAlerts[0].severity, "expiring", "office warning before expiry");
  assert.ok(queries.listUpcomingCompliance().some((a) => a.kind === "company_doc" && a.severity === "expiring"), "warning shows on Workbench/Compliance list");

  const insCompany = await companyActions.uploadCompanyDocAction(null, form({ slot: "insurance_card", file: pngFile("ins-company.png"), expires_on: isoDay(300) }));
  const insR2 = await companyActions.uploadCompanyDocAction(null, form({ slot: "insurance_card", file: pngFile("ins-r2.png"), expires_on: isoDay(300), unit: `trailer:${r2}` }));
  const insT2 = await companyActions.uploadCompanyDocAction(null, form({ slot: "insurance_card", file: pngFile("ins-t2-old.png"), expires_on: isoDay(-3), unit: `truck:${t2}` }));
  assert.ok(insCompany.ok && insR2.ok && insT2.ok);
  assert.ok(company.companyDocAlerts().some((a) => a.severity === "expired" && /Truck 8702/.test(a.message)), "expired per-unit card warns");
  const insT2New = await companyActions.uploadCompanyDocAction(null, form({ slot: "insurance_card", file: pngFile("ins-t2.png"), expires_on: isoDay(300), replaces_id: String(insT2.ok ? insT2.id : 0) }));
  assert.ok(insT2New.ok);
  assert.equal(company.listCurrentCompanyDocs("insurance_card").length, 3, "multi-file slot keeps several current; replace swaps one");
  const insMsx = await companyActions.uploadCompanyDocAction(null, form({ slot: "insurance_card", file: pngFile("msx.png"), expires_on: isoDay(300), unit: `trailer:${rx}` }));
  assert.equal(insMsx.ok, false, "no M&S Loads / non-MSE units on company docs");
  assert.ok(company.listCurrentCompanyDocs().every((d) => d.division === "MSE"));
  const removable = await companyActions.uploadCompanyDocAction(null, form({ slot: "insurance_card", file: pngFile("ins-extra.png"), expires_on: isoDay(300) }));
  assert.ok(removable.ok);
  const retired = await companyActions.retireCompanyDocAction(null, form({ id: String(removable.ok ? removable.id : 0) }));
  assert.ok(retired.ok);
  assert.ok(company.listCompanyDocHistory("insurance_card").some((d) => d.status === "retired"));

  const key = (id: number) => `company:${id}`;
  const iftaCurrentId = ifta2.ok ? ifta2.id! : -1;
  /* ---------- Assist: IFTA for any active driver, not tied to assignment ---------- */
  for (const q of ["IFTA", "IFTA license", "iftf license", "ifat", "fuel tax license", "Where is the IFTA?"]) {
    for (const who of [drvA, drvC]) {
      const reply = ask(who, q);
      assert.deepEqual(ids(reply), [key(iftaCurrentId)], `${q} → current IFTA for driver ${who}`);
    }
  }
  assert.ok(!ids(ask(drvA, "IFTA license")).includes(fleetKey(aCdl)), "IFTA license is not the CDL");

  /* ---------- Assist: insurance cards ---------- */
  const companyCard = key(insCompany.ok ? insCompany.id! : -1);
  const r2Card = key(insR2.ok ? insR2.id! : -1);
  const t2Card = key(insT2New.ok ? insT2New.id! : -1);
  for (const q of ["insurance card", "proof of insurance", "COI", "insurence", "insurance"]) {
    assert.deepEqual(ids(ask(drvA, q)), [companyCard], `${q} → company card for A`);
  }
  assert.deepEqual(new Set(ids(ask(drvB, "insurance card"))), new Set([companyCard, t2Card, r2Card]), "B gets company + assigned units' cards");
  assert.deepEqual(new Set(ids(ask(drvA, "insurance card for trailer 2205"))), new Set([companyCard, r2Card]), "per-unit card is fleet-wide");
  assert.deepEqual(ids(ask(drvC, "insurance card")), [companyCard], "no assignment → company card");

  /* ---------- Inactive driver gets nothing ---------- */
  db.prepare("UPDATE drivers SET active = 0 WHERE id = ?").run(drvD);
  for (const q of ["IFTA", "registration", "insurance card", "When does Nebraska Cold Storage open?"]) {
    const reply = ask(drvD, q);
    assert.equal(reply.answer, assist.DRIVER_ASSIST_INACTIVE);
    assert.equal(reply.documents.length, 0);
  }

  /* ---------- Byte endpoints ---------- */
  async function token(email: string): Promise<string> {
    const res = await loginRoute.POST(new Request(`${BASE}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) }));
    assert.equal(res.status, 200, `login ${email}`);
    return ((await res.json()) as { token: string }).token;
  }
  const tokA = await token("ana@msloads.test");
  const fetchFleet = async (tok: string, id: number) =>
    (await docRoute.GET(new Request(`${BASE}/assist/docs/${id}`, { headers: { Authorization: `Bearer ${tok}` } }), { params: Promise.resolve({ fleetDocumentId: String(id) }) })).status;
  const fetchCompany = async (tok: string, id: number) =>
    (await companyDocRoute.GET(new Request(`${BASE}/assist/company-docs/${id}`, { headers: { Authorization: `Bearer ${tok}` } }), { params: Promise.resolve({ companyDocumentId: String(id) }) })).status;
  assert.equal(await fetchFleet(tokA, r2Reg.id), 200, "any active driver can open another trailer's registration");
  assert.equal(await fetchFleet(tokA, r2Dot.id), 403, "another trailer's non-registration docs stay gated");
  assert.equal(await fetchFleet(tokA, t2Reg.id), 403, "another truck's registration stays gated");
  assert.equal(await fetchFleet(tokA, rxReg.id), 403, "MSX trailer registration is not MS Express");
  assert.equal(await fetchFleet(tokA, bCdl.id), 403, "another driver's CDL is private");
  assert.equal(await fetchFleet(tokA, t1Reg.id), 200);
  assert.equal(await fetchCompany(tokA, iftaCurrentId), 200, "active driver opens current IFTA");
  assert.equal(await fetchCompany(tokA, ifta1.ok ? ifta1.id! : -1), 404, "replaced IFTA version is office-only");
  db.prepare("UPDATE drivers SET active = 1 WHERE id = ?").run(drvD);
  const tokD = await token("dee@msloads.test");
  db.prepare("UPDATE drivers SET active = 0 WHERE id = ?").run(drvD);
  assert.ok([401, 403].includes(await fetchCompany(tokD, iftaCurrentId)), "inactive driver denied company doc");
  assert.ok([401, 403].includes(await fetchFleet(tokD, r1Reg.id)), "inactive driver denied registration");

  /* ---------- Facilities: any shipper/receiver, facility fields only ---------- */
  const loc = (name: string, extra: Partial<{ street: string; city: string; state: string; zip: string; phone: string; notes: string; hours: string; scheduling_notes: string; scheduling_type: "fcfs" | "appointment" }> = {}) =>
    queries.createLocation({
      name,
      street: extra.street ?? "",
      city: extra.city ?? "Hastings",
      state: extra.state ?? "NE",
      zip: extra.zip ?? "",
      phone: extra.phone ?? "",
      notes: extra.notes ?? "",
      role: "both",
      scheduling_type: extra.scheduling_type ?? "fcfs",
      hours: extra.hours ?? "",
      scheduling_notes: extra.scheduling_notes ?? "",
    });
  loc("Nebraska Cold Storage Inc");
  const ncs = loc("Nebraska Cold Storage Inc", {
    street: "100 Example Dock Road",
    zip: "68901",
    phone: "402-555-0142",
    hours: "0800-1700",
    scheduling_type: "appointment",
    scheduling_notes: "Call 402-555-0142 to check in",
    notes: "Rate $2.10/mi PRIVATE billing contact",
  });
  loc("Nebraska Cold Storage Inc");
  loc("Americold - Wichita", { city: "Wichita", state: "KS" });
  loc("Americold - Omaha", { city: "Omaha", state: "NE" });

  r = ask(drvA, "When does Nebraska Cold Storage open?");
  assert.equal(r.facility?.id, ncs, "duplicates collapse to the complete record");
  assert.match(r.answer, /0800-1700/);
  for (const q of ["When does Nebraska Cold Storage close?", "NCS hours", "nebraska cold storge hours", "what time does nebraska cold storage inc open"]) {
    const reply = ask(drvC, q);
    assert.equal(reply.facility?.id, ncs, q);
    assert.match(reply.answer, /0800-1700/, q);
  }
  r = ask(drvA, "Do they have onsite parking?", ncs);
  assert.equal(r.unknown, true);
  assert.match(r.answer, /Parking info for Nebraska Cold Storage Inc \(Hastings, NE\) is not on file/);
  r = ask(drvC, "Do they have onsite parking?");
  assert.equal(r.answer, assist.DRIVER_ASSIST_WHICH_PLACE, "pronoun without context → ask which place");
  const fd = form({ facility_fields: "1", receiving_hours: "Mon-Fri 06:00-14:00", shipping_hours: "", parking: "yes", overnight_parking: "bogus", parking_notes: "Lot on 39th St", gate_dock_notes: "" });
  saveFacilityInfoFromForm(ncs, fd);
  const saved = queries.getLocation(ncs)!;
  assert.equal(saved.parking, "yes");
  assert.equal(saved.overnight_parking, "", "invalid select value is not stored");
  r = ask(drvA, "Do they have onsite parking?", ncs);
  assert.match(r.answer, /Onsite parking: yes\./);
  assert.match(r.answer, /Lot on 39th St/);
  assert.doesNotMatch(r.answer, /Overnight/, "empty field is not guessed");
  r = ask(drvA, "When does Nebraska Cold Storage receive?");
  assert.match(r.answer, /Receiving hours: Mon-Fri 06:00-14:00/);
  r = ask(drvA, "gate and dock notes for nebraska cold storage");
  assert.match(r.answer, /Gate and dock notes for .* is not on file/);
  r = ask(drvA, "Tell me about Nebraska Cold Storage");
  assert.match(r.answer, /100 Example Dock Road/);
  assert.match(r.answer, /Call 402-555-0142 to check in/);
  for (const forbidden of [/\$/, /Rate/i, /PRIVATE/, /billing/i, /2400/, /Assist Docs Customer/, /Ben/, /RC-ASSIST/]) {
    assert.doesNotMatch(r.answer, forbidden, `facility answer must not leak ${forbidden}`);
  }
  assert.doesNotMatch(JSON.stringify(r), /rate|invoice|customer_id|oo_pay/i);
  r = ask(drvA, "Americold hours");
  assert.equal(r.unknown, true);
  assert.equal(r.choices?.length, 2, "several matches → ask which one");
  assert.match(r.answer, /Which one\?/);
  const omaha = r.choices!.find((c) => /Omaha/.test(c.label))!;
  r = ask(drvA, "Americold hours (Americold - Omaha (Omaha, NE))", omaha.id);
  assert.equal(r.facility?.id, omaha.id, "tapping a choice answers for that place");

  const lincoln = loc("Nebraska Cold Storage - Lincoln", { city: "Lincoln", state: "NE", hours: "0700-1500" });
  r = ask(drvA, "When does Nebraska Cold Storage open?");
  assert.deepEqual(new Set(r.choices?.map((c) => c.id)), new Set([ncs, lincoln]), "two distinct sites → ask which");
  r = ask(drvA, "When does Nebraska Cold Storage open?", ncs);
  assert.equal(r.facility?.id, ncs, "picked site answers");
  assert.equal(ask(drvA, "NCS Hastings hours").facility?.id, ncs, "acronym + city narrows");
  assert.equal(ask(drvA, "Nebraska Cold Storage Lincoln hours").facility?.id, lincoln);
  r = ask(drvC, "When does Americold Atlanta open?");
  assert.equal(r.answer, assist.DRIVER_ASSIST_PLACE_NOT_FOUND, "named place not in TMS → not found, no guessing");
  r = ask(drvC, "When does Crete Cold Storage open?");
  assert.equal(r.answer, assist.DRIVER_ASSIST_PLACE_NOT_FOUND);

  /* ---------- Assist route wiring (facility_id round trip) ---------- */
  const res = await assistRoute.POST(new Request(`${BASE}/assist`, { method: "POST", headers: { Authorization: `Bearer ${tokA}`, "content-type": "application/json" }, body: JSON.stringify({ question: "do they have parking", facility_id: ncs }) }));
  assert.equal(res.status, 200);
  assert.match(((await res.json()) as Reply).answer, /Onsite parking: yes/);

  console.log("driver-assist docs + facility tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
