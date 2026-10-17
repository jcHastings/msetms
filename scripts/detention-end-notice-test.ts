import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-detention-end-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";

// Fictional fixtures only. Public repo: no real names or addresses.
const APPT = "2026-06-02T14:00:00.000Z";
const ARRIVE = "2026-06-02T13:30:00.000Z";
const DEPART = "2026-06-02T20:00:00.000Z";
const at = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

async function pureRules() {
  const end = await import("../lib/detention-end");
  const rules = await import("../lib/detention-request");

  // 1. Driver tap wins, even over an earlier POD.
  const tapped = end.resolveDetentionEnd({
    arrivedAt: ARRIVE,
    departedAt: DEPART,
    emptiedAt: at(ARRIVE, 200),
    podAt: at(ARRIVE, 150),
    reeferOffAt: at(ARRIVE, 120),
  });
  assert.equal(tapped.source, "driver_empty");
  assert.equal(tapped.endAt, at(ARRIVE, 200));
  assert.equal(tapped.label, "driver tapped Empty");
  assert.equal(tapped.hosFlag, false);

  // 2. No tap: earliest of POD, reefer off, GPS depart. Within an hour of depart, no flag.
  const near = end.resolveDetentionEnd({
    arrivedAt: ARRIVE,
    departedAt: DEPART,
    podAt: at(DEPART, -40),
    reeferOffAt: at(DEPART, -25),
  });
  assert.equal(near.source, "pod");
  assert.equal(near.endAt, at(DEPART, -40));
  assert.equal(near.hosFlag, false);
  assert.equal(near.needsDeskPick, false);

  const gpsOnly = end.resolveDetentionEnd({ arrivedAt: ARRIVE, departedAt: DEPART });
  assert.equal(gpsOnly.source, "gps_depart");
  assert.equal(gpsOnly.label, "GPS depart");

  // 3. Reefer off more than 1 hour before GPS depart: HOS flag, desk picks.
  const reset = end.resolveDetentionEnd({
    arrivedAt: ARRIVE,
    departedAt: DEPART,
    reeferOffAt: at(DEPART, -61),
  });
  assert.equal(reset.hosFlag, true);
  assert.equal(reset.needsDeskPick, true);
  assert.equal(reset.source, "reefer_off", "earliest time shows until the desk picks");
  assert.deepEqual(reset.candidates.map((item) => item.source), ["reefer_off", "gps_depart"]);
  assert.equal(end.DETENTION_HOS_FLAG, "Driver may have stayed for HOS reset, check end time");

  const picked = end.resolveDetentionEnd({
    arrivedAt: ARRIVE,
    departedAt: DEPART,
    reeferOffAt: at(DEPART, -61),
    deskPick: "gps_depart",
  });
  assert.equal(picked.source, "gps_depart");
  assert.equal(picked.deskPicked, true);
  assert.equal(picked.needsDeskPick, false);

  const podReset = end.resolveDetentionEnd({ arrivedAt: ARRIVE, departedAt: DEPART, podAt: at(DEPART, -90) });
  assert.equal(podReset.hosFlag, true, "POD more than an hour before depart also flags");

  const exactlyHour = end.resolveDetentionEnd({ arrivedAt: ARRIVE, departedAt: DEPART, podAt: at(DEPART, -60) });
  assert.equal(exactlyHour.hosFlag, false, "exactly one hour is not more than one hour");

  // 4. Times outside the stop are ignored.
  const outside = end.resolveDetentionEnd({
    arrivedAt: ARRIVE,
    departedAt: DEPART,
    emptiedAt: at(ARRIVE, -10),
    podAt: at(DEPART, 30),
    reeferOffAt: at(ARRIVE, -5),
  });
  assert.equal(outside.source, "gps_depart");
  assert.equal(outside.hosFlag, false);

  // 5. The trigger bills to the end time, not the depart.
  const base = {
    loadStatus: "dispatched",
    stopKind: "delivery",
    arrivedAt: ARRIVE,
    departedAt: DEPART,
    scheduleType: "appointment",
    windowStart: APPT,
    windowEnd: "",
    freeMinutes: 120,
    roundMinutes: null,
    pickupsEnabled: false,
  };
  assert.equal(rules.detentionRequestTrigger(base).billableMinutes, 240);
  const ended = rules.detentionRequestTrigger({ ...base, endAt: at(APPT, 180) });
  assert.equal(ended.billableMinutes, 60);
  assert.equal(ended.endAt, at(APPT, 180));
  const insideFree = rules.detentionRequestTrigger({ ...base, endAt: at(APPT, 100) });
  assert.equal(insideFree.show, false, "unloaded inside free time is not detention");

  // 6. Free time: rate con, then contract, then 2 hours.
  assert.deepEqual(rules.resolveDetentionFree(60, 90), { freeMinutes: 60, freeSource: "rate_con" });
  assert.deepEqual(rules.resolveDetentionFree(null, 90), { freeMinutes: 90, freeSource: "contract" });
  assert.deepEqual(rules.resolveDetentionFree(null, null), { freeMinutes: 120, freeSource: "desk_clock" });
  assert.equal(
    rules.detentionRequestTrigger({ ...base, freeMinutes: null, contractFreeMinutes: 90 }).freeSource,
    "contract",
  );

  const email = rules.composeDetentionApprovalEmail({
    loadNumber: "55001",
    po: "PO-1",
    stopName: "Birch Cold Storage",
    city: "Springfield",
    state: "MO",
    scheduleType: "appointment",
    windowStart: APPT,
    arrivedAt: ARRIVE,
    departedAt: DEPART,
    arrivedGeofence: true,
    departedGeofence: true,
    endAt: at(APPT, 180),
    endLabel: "driver tapped Empty",
    noticeSentAt: at(APPT, 60),
    dwellMinutes: 240,
    freeMinutes: 120,
    freeSource: "contract",
    billableMinutes: 60,
  });
  assert.match(email.text, /Detention ended: .+ \(driver tapped Empty\)/);
  assert.match(email.text, /Detention notice sent: /);
  assert.match(email.text, /carrier agreement/);
  assert.equal(rules.approvalEmailHasDollarAmount(email.text), false);
}

async function noticeRules() {
  const notice = await import("../lib/detention-notice");

  // Early for an appointment: clock starts at the appointment.
  const early = notice.detentionNoticeSchedule({
    scheduleType: "appointment",
    arrivedAt: ARRIVE,
    windowStart: APPT,
    rateConFreeMinutes: null,
    contractFreeMinutes: 90,
    leadMinutes: 60,
  });
  assert.ok(early);
  assert.equal(early.startAt, at(APPT, 90));
  assert.equal(early.dueAt, at(APPT, 30));
  assert.equal(early.alertAt, at(APPT, 10));
  assert.equal(early.freeSource, "contract");

  // FCFS arrival in the window, lead 0: notice due at the start.
  const atStart = notice.detentionNoticeSchedule({
    scheduleType: "fcfs",
    arrivedAt: "2026-06-02T15:00:00.000Z",
    windowStart: APPT,
    windowEnd: "2026-06-02T22:00:00.000Z",
    rateConFreeMinutes: null,
    contractFreeMinutes: null,
    leadMinutes: 0,
  });
  assert.ok(atStart);
  assert.equal(atStart.startAt, "2026-06-02T17:00:00.000Z");
  assert.equal(atStart.dueAt, atStart.startAt);
  assert.equal(atStart.alertAt, "2026-06-02T16:40:00.000Z");
  assert.equal(atStart.freeSource, "desk_clock");

  const open = (now: string, extra: Record<string, unknown> = {}) =>
    notice.detentionNoticeAlertOpen({
      schedule: early,
      now: new Date(now),
      loadStatus: "dispatched",
      stopKind: "delivery",
      pickupsEnabled: false,
      arrivedAt: ARRIVE,
      departedAt: "",
      emptiedAt: "",
      handled: false,
      ...extra,
    });
  assert.equal(open(at(APPT, 9)), false, "not before 20 minutes ahead of the due time");
  assert.equal(open(at(APPT, 10)), true);
  assert.equal(open(at(APPT, 45)), true, "still open after due, until detention starts");
  assert.equal(open(at(APPT, 90)), false);
  assert.equal(open(at(APPT, 20), { handled: true }), false);
  assert.equal(open(at(APPT, 20), { departedAt: at(APPT, 15) }), false);
  assert.equal(open(at(APPT, 20), { emptiedAt: at(APPT, 15) }), false);
  assert.equal(open(at(APPT, 20), { stopKind: "pickup" }), false);
  assert.equal(open(at(APPT, 20), { stopKind: "pickup", pickupsEnabled: true }), true);

  const mail = notice.composeDetentionNoticeEmail({
    loadNumber: "55001",
    po: "PO-1",
    stopName: "Birch Cold Storage",
    city: "Springfield",
    state: "MO",
    startAt: "2026-06-02T20:15:00.000Z",
    timeZone: "America/Chicago",
    signature: "Carrier signature",
  });
  assert.match(mail.text, /Detention will begin at 3:15 PM CDT\./);
  assert.equal(/\$\s?\d/.test(mail.text), false);
  assert.match(mail.subject, /Detention notice: Load 55001/);
}

async function rateConTimes() {
  const { normalizeWindow } = await import("../lib/rate-con-ai");
  const { rateConWindowToOfficeInput, zoneNearClock } = await import("../lib/rate-con-time");
  const { fromInputDateTime } = await import("../lib/format");
  const stored = (value: string) => fromInputDateTime(value);

  // Real-world shape (times only): rate con printed 14:00 CDT and 20:00 CDT.
  // The bug stored them as office time, an hour early.
  assert.equal(stored(normalizeWindow("2026-10-14T14:00 CDT")), "2026-10-14T19:00:00.000Z");
  assert.equal(stored(normalizeWindow("2026-10-15T20:00 CDT")), "2026-10-16T01:00:00.000Z");
  const text = "Appointment\nOct 14, 2026\n14:00 CDT\nAppointment\nOct 15, 2026\n20:00 CDT\n";
  assert.equal(stored(normalizeWindow("2026-10-14T14:00", text)), "2026-10-14T19:00:00.000Z", "zone printed beside the time");
  assert.equal(stored(normalizeWindow("2026-10-15T20:00", text)), "2026-10-16T01:00:00.000Z");
  assert.equal(stored(normalizeWindow("2026-10-14T14:00-05:00")), "2026-10-14T19:00:00.000Z");
  assert.equal(stored(normalizeWindow("10/14/2026 2:00 PM CDT")), "2026-10-14T19:00:00.000Z");
  assert.equal(stored(normalizeWindow("2026-12-01T08:00 CST")), "2026-12-01T14:00:00.000Z");
  assert.equal(stored(normalizeWindow("2026-10-14T14:00 Central")), "2026-10-14T19:00:00.000Z");
  assert.equal(stored(normalizeWindow("2026-10-14T14:00 EDT")), "2026-10-14T18:00:00.000Z");
  assert.equal(zoneNearClock("Delivery 2:00 PM CDT", "2026-10-14T14:00"), "-05:00");
  assert.equal(zoneNearClock("14:00 CDT and 14:00 EDT", "2026-10-14T14:00"), "", "mixed zones stay office time");
  // No zone anywhere: unchanged office-time behavior.
  assert.equal(normalizeWindow("2026-10-14T14:00", "no zone here"), "2026-10-14T14:00");
  assert.equal(rateConWindowToOfficeInput("not a date"), null);

  const { applyAiRateCon } = await import("../lib/rate-con-ai");
  const parsed = applyAiRateCon(
    {
      customer_name: "",
      stops: [
        { kind: "pickup", name: "Maple Farms", city: "Springfield", state: "MO", schedule_type: "appointment", window_start: "2026-10-14T14:00" },
        { kind: "delivery", name: "Birch Cold Storage", city: "Riverton", state: "TX", schedule_type: "appointment", window_start: "2026-10-15T20:00" },
      ],
    },
    [],
    undefined,
    text,
  );
  assert.equal(stored(parsed.shipper.window_start), "2026-10-14T19:00:00.000Z");
  assert.equal(stored(parsed.consignee.window_start), "2026-10-16T01:00:00.000Z");
}

async function storeFlow() {
  const queries = await import("../lib/queries");
  const stops = await import("../lib/stops");
  const store = await import("../lib/detention-store");
  const noticeStore = await import("../lib/detention-notice-store");
  const signals = await import("../lib/detention-signals");
  const { getDb } = await import("../lib/db");
  const db = getDb();

  const customerId = queries.createCustomer({
    name: "Harbor Lane Freight",
    billing_notes: "",
    main_email: "desk@example.test",
    contacts: [],
  });
  signals.saveCustomerDetentionTerms(customerId, { leadMinutes: "60", contractFreeMinutes: "90" });
  assert.deepEqual(signals.readCustomerDetentionTerms(customerId), { leadMinutes: 60, contractFreeMinutes: 90 });
  assert.throws(() => signals.saveCustomerDetentionTerms(customerId, { leadMinutes: 0, contractFreeMinutes: "-5" }), /minutes/);

  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO trailers (unit_number, orbcomm_asset_id, created_at, updated_at) VALUES ('T-900', 'ORB-900', ?, ?)",
  ).run(now, now);
  const trailerId = Number((db.prepare("SELECT id FROM trailers WHERE unit_number = 'T-900'").get() as { id: number }).id);

  function makeLoad(number: string) {
    const id = queries.createLoad({
      customer_id: customerId,
      origin: "Springfield, MO",
      destination: "Riverton, TX",
      pickup_start: APPT,
      pickup_end: APPT,
      delivery_start: APPT,
      delivery_end: APPT,
      weight: 20000,
      commodity: "Frozen goods",
      rate: 1800,
      notes: "",
      special_instructions: "",
      appointment_notes: "",
      reference_number: "",
      po_number: `PO-${number}`,
      reefer_setpoint_f: null,
      trailer_number: "",
      status: "dispatched",
      truck_id: null,
      driver_id: null,
      load_number: number,
    });
    db.prepare("UPDATE loads SET contact_email = 'broker@example.test', trailer_id = ? WHERE id = ?").run(trailerId, id);
    return id;
  }

  // Notice: truck still at the receiver.
  const loadA = makeLoad("55101");
  const stopA = stops.addStop(loadA, {
    kind: "delivery",
    name: "Birch Cold Storage",
    city: "Riverton",
    state: "TX",
    window_start: APPT,
    schedule_type: "appointment",
    arrived_at: ARRIVE,
  });
  const load = queries.getLoad(loadA)!;
  const stopRow = stops.getStop(stopA)!;
  assert.deepEqual(noticeStore.detentionNoticeAlertsForLoad(load, [stopRow], new Date(at(APPT, 5))), []);
  const alerts = noticeStore.detentionNoticeAlertsForLoad(load, [stopRow], new Date(at(APPT, 12)));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].startAt, at(APPT, 90), "appointment + 90 contract minutes");
  assert.equal(alerts[0].dueAt, at(APPT, 30), "60 minutes notice");
  assert.equal(alerts[0].overdue, false);

  const { listExceptionInbox } = await import("../lib/exceptions");
  const inbox = listExceptionInbox(new Date(at(APPT, 12)));
  const desk = inbox.items.find((item) => item.kind === "detention_notice" && item.loadId === loadA);
  assert.ok(desk, "desk alert 20 minutes before the notice is due");
  assert.equal(desk.id, `${loadA}:detention_notice:${stopA}`);
  assert.match(desk.title, /Detention starts 10:30 AM CDT/);
  assert.match(desk.detail, /Approve to email the broker, or Dismiss/);

  const captured: Array<{ from?: string; replyTo?: string; to: string; text: string }> = [];
  const sent = await noticeStore.sendDetentionNotice({
    loadId: loadA,
    stopId: stopA,
    actor: "Fixture Desk",
    send: async (mail) => {
      captured.push(mail);
      return { messageId: "notice-55101" };
    },
  });
  assert.equal(captured.length, 1, "one email, only after Approve");
  assert.equal(captured[0].from, "dispatch@msloads.com");
  assert.equal(captured[0].replyTo, "dispatch@msloads.com");
  assert.equal(captured[0].to, "broker@example.test");
  assert.match(captured[0].text, /Detention will begin at 10:30 AM CDT\./);
  assert.equal(sent.status, "sent");
  assert.equal(sent.startAt, at(APPT, 90));
  assert.ok(sent.sentAt);
  assert.equal(
    (db.prepare("SELECT kind FROM sent_mail WHERE load_id = ?").get(loadA) as { kind: string }).kind,
    "detention_notice",
  );
  assert.deepEqual(noticeStore.detentionNoticeAlertsForLoad(load, [stopRow], new Date(at(APPT, 20))), []);
  await assert.rejects(
    () => noticeStore.sendDetentionNotice({ loadId: loadA, stopId: stopA, actor: "x", send: async () => ({}) }),
    /already handled/,
  );

  // The detention record carries the notice time and the end source.
  stops.stampStopTime(stopA, "emptied_at", at(APPT, 200));
  stops.stampStopTime(stopA, "departed_at", at(APPT, 230));
  const draftA = await store.buildDetentionDraft(loadA, stopA);
  assert.equal(draftA.end.source, "driver_empty");
  assert.equal(draftA.freeSource, "contract");
  assert.equal(draftA.billableMinutes, 110, "appointment + 90 free, ended by the Empty tap at +200");
  assert.ok(draftA.notice);
  assert.match(draftA.body, /Detention notice sent: /);
  assert.match(draftA.body, /Detention ended: .+ \(driver tapped Empty\)/);
  const request = await store.sendDetentionRequest({
    loadId: loadA,
    stopId: stopA,
    to: "broker@example.test",
    subject: draftA.subject,
    body: draftA.body,
    attachmentIds: [],
    actor: "Fixture Desk",
    send: async () => ({ messageId: "request-55101" }),
  });
  const requestRow = db
    .prepare("SELECT end_at, end_source, notice_sent_at, notice_start_at, notice_id FROM detention_requests WHERE id = ?")
    .get(request.id) as Record<string, unknown>;
  assert.equal(requestRow.end_source, "driver_empty");
  assert.equal(requestRow.end_at, at(APPT, 200));
  assert.equal(requestRow.notice_sent_at, sent.sentAt);
  assert.equal(requestRow.notice_start_at, at(APPT, 90));
  assert.equal(Number(requestRow.notice_id), sent.id);

  // Dismiss sends nothing.
  const loadB = makeLoad("55102");
  const stopB = stops.addStop(loadB, {
    kind: "delivery",
    name: "Birch Cold Storage",
    city: "Riverton",
    state: "TX",
    window_start: APPT,
    schedule_type: "appointment",
    arrived_at: ARRIVE,
  });
  const dismissed = noticeStore.dismissDetentionNotice({ loadId: loadB, stopId: stopB, actor: "Fixture Desk" });
  assert.equal(dismissed.status, "dismissed");
  assert.equal(dismissed.sentAt, "");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sent_mail WHERE load_id = ?").get(loadB) as { n: number }).n, 0);

  // Reefer turned off 3 hours before the GPS depart: HOS flag, desk must pick before Send.
  stops.stampStopTime(stopB, "departed_at", at(APPT, 420));
  const readings = [
    ["Continuous running", at(APPT, -60)],
    ["Continuous running", at(APPT, 100)],
    ["Power Off", at(APPT, 240)],
    ["Power Off", at(APPT, 300)],
  ];
  for (const [mode, recorded] of readings) {
    db.prepare(
      "INSERT INTO reefer_readings (trailer_id, operating_mode, source, recorded_at) VALUES ('ORB 900', ?, 'orbcomm', ?)",
    ).run(mode, recorded);
  }
  assert.equal(signals.reeferOffAtStop(loadB, ARRIVE, at(APPT, 420)), at(APPT, 240));
  const draftB = await store.buildDetentionDraft(loadB, stopB);
  assert.equal(draftB.end.hosFlag, true);
  assert.equal(draftB.end.needsDeskPick, true);
  assert.equal(draftB.end.source, "reefer_off");
  assert.equal(draftB.end.flagText, "Driver may have stayed for HOS reset, check end time");
  await assert.rejects(
    () =>
      store.sendDetentionRequest({
        loadId: loadB,
        stopId: stopB,
        to: "broker@example.test",
        subject: draftB.subject,
        body: draftB.body,
        attachmentIds: [],
        actor: "Fixture Desk",
        send: async () => {
          throw new Error("must not send");
        },
      }),
    /Pick the detention end time/,
  );
  assert.throws(() => store.setDetentionEndPick({ loadId: loadB, stopId: stopB, source: "driver_empty" }), /not on this stop/);
  store.setDetentionEndPick({ loadId: loadB, stopId: stopB, source: "reefer_off" });
  const pickedB = await store.buildDetentionDraft(loadB, stopB);
  assert.equal(pickedB.end.deskPicked, true);
  assert.equal(pickedB.end.needsDeskPick, false);
  assert.equal(pickedB.billableMinutes, 150);

  // A reefer already off when the truck arrived is not an unload signal.
  const loadC = makeLoad("55103");
  db.prepare("DELETE FROM reefer_readings").run();
  db.prepare(
    "INSERT INTO reefer_readings (trailer_id, operating_mode, source, recorded_at) VALUES ('T-900', 'Power Off', 'orbcomm', ?)",
  ).run(at(APPT, 60));
  assert.equal(signals.reeferOffAtStop(loadC, ARRIVE, DEPART), "");
}

async function main() {
  await pureRules();
  await noticeRules();
  await rateConTimes();
  await storeFlow();
  console.log("detention end + notice + rate-con zone tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
