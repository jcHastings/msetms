import type Database from "better-sqlite3";

function atHour(offsetDays: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function now(): string {
  return new Date().toISOString();
}

export function seedDatabase(db: Database.Database): void {
  const created = now();

  const insertCustomer = db.prepare(
    `INSERT INTO customers (name, billing_notes, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
  );
  const insertContact = db.prepare(
    `INSERT INTO contacts (customer_id, name, role, phone, email)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertTruck = db.prepare(
    `INSERT INTO trucks (unit_number, type, capacity_lbs, status, samsara_vehicle_id, samsara_trailer_id, orbcomm_asset_id, trailer_number, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertDriver = db.prepare(
    `INSERT INTO drivers (name, phone, license, pin, samsara_driver_id, truck_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertLoad = db.prepare(
    `INSERT INTO loads (
      load_number, customer_id, origin, destination,
      pickup_start, pickup_end, delivery_start, delivery_end,
      weight, commodity, rate, notes, status, truck_id, driver_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const seed = db.transaction(() => {
    const heartland = Number(
      insertCustomer.run(
        "Heartland Foods Co.",
        "Net 30. Send invoices to ap@heartlandfoods.example. POD required.",
        created,
        created,
      ).lastInsertRowid,
    );
    insertContact.run(heartland, "Megan Alvarez", "Shipping", "(312) 555-0148", "megan.alvarez@heartlandfoods.example");
    insertContact.run(heartland, "Robert Chen", "AP", "(312) 555-0192", "ap@heartlandfoods.example");

    const summit = Number(
      insertCustomer.run(
        "Summit Building Supply",
        "Freight prepaid. Confirm liftgate on boxed shipments.",
        created,
        created,
      ).lastInsertRowid,
    );
    insertContact.run(summit, "Dana Whitlock", "Logistics", "(317) 555-0114", "dana.w@summitbuild.example");

    const riverCity = Number(
      insertCustomer.run(
        "River City Produce",
        "Reefer only. Maintain 34–38°F. Detention after 2 hours.",
        created,
        created,
      ).lastInsertRowid,
    );
    insertContact.run(riverCity, "Luis Navarro", "Dispatch", "(901) 555-0166", "lnavarro@rivercityproduce.example");

    const apex = Number(
      insertCustomer.run(
        "Apex Auto Parts",
        "Weekly settlement. Reference PO on every BOL.",
        created,
        created,
      ).lastInsertRowid,
    );
    insertContact.run(apex, "Kimberly Frost", "Procurement", "(313) 555-0177", "kfrost@apexauto.example");

    const prairie = Number(
      insertCustomer.run(
        "Prairie Grain Cooperative",
        "Scale tickets required. No Saturday deliveries.",
        created,
        created,
      ).lastInsertRowid,
    );
    insertContact.run(prairie, "Hank Dillard", "Elevator Mgr", "(816) 555-0133", "hdillard@prairiegrain.example");

    const gulf = Number(
      insertCustomer.run(
        "Gulf Coast Packaging",
        "Bill-to: Gulf Coast Packaging, 4400 Portway, Houston TX 77015",
        created,
        created,
      ).lastInsertRowid,
    );
    insertContact.run(gulf, "Alicia Grant", "Traffic", "(713) 555-0188", "agrant@gulfpack.example");

    const blueRidge = Number(
      insertCustomer.run(
        "Blue Ridge Appliances",
        "Appointment required at DC. Use dock 12–18.",
        created,
        created,
      ).lastInsertRowid,
    );
    insertContact.run(blueRidge, "Chris Patton", "Warehouse", "(615) 555-0129", "cpatton@blueridgeapp.example");

    insertCustomer.run(
      "Delta Cold Storage",
      "Reefer only. Rate cons come from traffic@deltacold.example.",
      created,
      created,
    );

    const t101 = Number(insertTruck.run("101", "dry_van", 45000, "available", "", "", "", "", created, created).lastInsertRowid);
    const t102 = Number(insertTruck.run("102", "dry_van", 45000, "in_use", "", "", "", "", created, created).lastInsertRowid);
    const t108 = Number(insertTruck.run("108", "reefer", 44000, "available", "samsara-veh-108", "", "orbcomm-tr-8801", "TR-8801", created, created).lastInsertRowid);
    const t112 = Number(insertTruck.run("112", "reefer", 44000, "in_use", "samsara-veh-112", "", "orbcomm-tr-7742", "TR-7742", created, created).lastInsertRowid);
    const t118 = Number(insertTruck.run("118", "dry_van", 45000, "in_use", "", "", "", "", created, created).lastInsertRowid);
    const t205 = Number(insertTruck.run("205", "flatbed", 48000, "in_use", "", "", "", "", created, created).lastInsertRowid);
    const t210 = Number(insertTruck.run("210", "flatbed", 48000, "maintenance", "", "", "", "", created, created).lastInsertRowid);
    insertTruck.run("301", "box", 26000, "available", "", "", "", "", created, created);

    const marcus = Number(
      insertDriver.run("Marcus Hale", "(502) 555-0101", "KY-D-448291", "1024", "samsara-drv-marcus", t102, "on_duty", created, created)
        .lastInsertRowid,
    );
    const denise = Number(
      insertDriver.run("Denise Ortega", "(901) 555-0102", "TN-CDL-772110", "1125", "samsara-drv-denise", t112, "on_duty", created, created)
        .lastInsertRowid,
    );
    const james = Number(
      insertDriver.run("James Whitaker", "(314) 555-0103", "MO-CDL-190334", "1186", "samsara-drv-james", t118, "on_duty", created, created)
        .lastInsertRowid,
    );
    const cole = Number(
      insertDriver.run("Cole Brennan", "(615) 555-0104", "TN-CDL-551902", "2051", "samsara-drv-cole", t205, "on_duty", created, created)
        .lastInsertRowid,
    );
    insertDriver.run("Priya Shah", "(317) 555-0105", "IN-CDL-883441", "1010", "", t101, "available", created, created);
    insertDriver.run("Angela Ruiz", "(312) 555-0106", "IL-CDL-229817", "1080", "", t108, "available", created, created);
    insertDriver.run("Tyrell Brooks", "(901) 555-0107", "MS-CDL-104552", "3000", "", null, "available", created, created);
    insertDriver.run("Sam Keene", "(816) 555-0108", "KS-CDL-667320", "2100", "", t210, "off_duty", created, created);

    insertLoad.run(
      "MSE-1042",
      heartland,
      "Chicago, IL",
      "Indianapolis, IN",
      atHour(1, 8, 0),
      atHour(1, 14, 0),
      atHour(1, 16, 0),
      atHour(1, 20, 0),
      38400,
      "Packaged grocery",
      1850,
      "Live unload. Call Megan 60 minutes out.",
      "available",
      null,
      null,
      created,
      created,
    );
    insertLoad.run(
      "MSE-1043",
      riverCity,
      "Memphis, TN",
      "Atlanta, GA",
      atHour(0, 6, 0),
      atHour(0, 10, 0),
      atHour(1, 5, 0),
      atHour(1, 11, 0),
      41200,
      "Fresh produce",
      2400,
      "Reefer set 36°F. Pulp product at pickup.",
      "available",
      null,
      null,
      created,
      created,
    );
    insertLoad.run(
      "MSE-1044",
      apex,
      "Detroit, MI",
      "Cincinnati, OH",
      atHour(0, 9, 0),
      atHour(0, 13, 0),
      atHour(0, 17, 0),
      atHour(0, 21, 0),
      35600,
      "Auto parts",
      1625,
      "PO 88421 on BOL. No tarps.",
      "assigned",
      t102,
      marcus,
      created,
      created,
    );
    insertLoad.run(
      "MSE-1045",
      riverCity,
      "Nashville, TN",
      "Dallas, TX",
      atHour(-1, 7, 0),
      atHour(-1, 11, 0),
      atHour(0, 16, 0),
      atHour(0, 22, 0),
      42800,
      "Chilled dairy",
      3100,
      "Picked yesterday 09:40. Driver check-call at 14:00.",
      "in_transit",
      t112,
      denise,
      created,
      created,
    );
    insertLoad.run(
      "MSE-1046",
      prairie,
      "Kansas City, MO",
      "St. Louis, MO",
      atHour(-1, 10, 0),
      atHour(-1, 15, 0),
      atHour(0, 8, 0),
      atHour(0, 12, 0),
      44000,
      "Bagged feed",
      980,
      "Scale ticket in door pocket.",
      "in_transit",
      t118,
      james,
      created,
      created,
    );
    insertLoad.run(
      "MSE-1047",
      gulf,
      "Houston, TX",
      "Memphis, TN",
      atHour(-6, 8, 0),
      atHour(-6, 14, 0),
      atHour(-5, 10, 0),
      atHour(-5, 16, 0),
      40150,
      "Corrugated packaging",
      2250,
      "Delivered. POD emailed to Alicia.",
      "delivered",
      null,
      null,
      created,
      created,
    );
    insertLoad.run(
      "MSE-1048",
      blueRidge,
      "Atlanta, GA",
      "Nashville, TN",
      atHour(-4, 11, 0),
      atHour(-4, 16, 0),
      atHour(-3, 8, 0),
      atHour(-3, 14, 0),
      22100,
      "Appliances",
      1450,
      "Appointment kept. Dock 14.",
      "delivered",
      null,
      null,
      created,
      created,
    );
    insertLoad.run(
      "MSE-1049",
      summit,
      "Louisville, KY",
      "Columbus, OH",
      atHour(-2, 8, 0),
      atHour(-2, 12, 0),
      atHour(-2, 15, 0),
      atHour(-2, 19, 0),
      28900,
      "Lumber",
      1100,
      "Shipper cancelled — mill downtime.",
      "cancelled",
      null,
      null,
      created,
      created,
    );
    insertLoad.run(
      "MSE-1050",
      heartland,
      "Indianapolis, IN",
      "Chicago, IL",
      atHour(3, 7, 0),
      atHour(3, 11, 0),
      atHour(3, 14, 0),
      atHour(3, 18, 0),
      36750,
      "Frozen bakery",
      1720,
      "Needs a reefer. Backhaul after Atlanta produce if possible.",
      "available",
      null,
      null,
      created,
      created,
    );
    insertLoad.run(
      "MSE-1051",
      summit,
      "Louisville, KY",
      "Nashville, TN",
      atHour(1, 6, 30),
      atHour(1, 10, 0),
      atHour(1, 13, 0),
      atHour(1, 17, 0),
      39200,
      "Steel studs",
      1350,
      "Flatbed. 4-foot tarps. Chains in the box.",
      "assigned",
      t205,
      cole,
      created,
      created,
    );
    insertLoad.run(
      "MSE-1052",
      apex,
      "Cincinnati, OH",
      "Detroit, MI",
      atHour(2, 9, 0),
      atHour(2, 15, 0),
      atHour(2, 18, 0),
      atHour(3, 8, 0),
      31800,
      "Auto parts",
      1580,
      "Drop trailer preferred. Confirm yard hours.",
      "available",
      null,
      null,
      created,
      created,
    );
    insertLoad.run(
      "MSE-1053",
      blueRidge,
      "Nashville, TN",
      "Memphis, TN",
      atHour(0, 13, 0),
      atHour(0, 17, 0),
      atHour(1, 8, 0),
      atHour(1, 12, 0),
      18600,
      "White goods",
      890,
      "Box truck is fine. Residential liftgate not needed — DC delivery.",
      "available",
      null,
      null,
      created,
      created,
    );

    const extras = db.prepare(
      `UPDATE loads SET
        special_instructions = ?, appointment_notes = ?, reference_number = ?, po_number = ?,
        reefer_setpoint_f = ?, trailer_number = ?, driver_progress = ?
       WHERE load_number = ?`,
    );
    extras.run(
      "Reefer set 36°F. Pulp product at pickup.\nCall Luis 60 minutes out.\nLumper possible at Atlanta DC.",
      "Atlanta DC appointment; dock 4–7.",
      "RC-1043",
      "PO-44118",
      36,
      "TR-8801",
      "",
      "MSE-1043",
    );
    extras.run(
      "Picked yesterday 09:40. Maintain 34°F.\nPhotograph seals and trailer number.\nDriver check-call at 14:00.",
      "Dallas appointment window this evening.",
      "RC-1045",
      "PO-55209",
      34,
      "TR-7742",
      "en_route_delivery",
      "MSE-1045",
    );
    extras.run(
      "Scale ticket in door pocket.",
      "",
      "RC-1046",
      "",
      null,
      "",
      "en_route_delivery",
      "MSE-1046",
    );
    extras.run("PO 88421 on BOL. No tarps.", "", "RC-1044", "PO-88421", null, "", "", "MSE-1044");
    extras.run(
      "Flatbed. 4-foot tarps. Chains in the box.",
      "",
      "RC-1051",
      "",
      null,
      "",
      "",
      "MSE-1051",
    );

    const insertReading = db.prepare(
      `INSERT INTO reefer_readings (
        load_id, truck_id, trailer_id, setpoint_f, temperature_f, door_open, alarm, source, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'demo', ?)`,
    );
    const load1043 = db.prepare("SELECT id FROM loads WHERE load_number = 'MSE-1043'").get() as { id: number };
    const load1045 = db.prepare("SELECT id FROM loads WHERE load_number = 'MSE-1045'").get() as { id: number };
    insertReading.run(load1043.id, t108, "TR-8801", 36, 36.4, 0, "", atHour(0, 5, 40));
    insertReading.run(load1045.id, t112, "TR-7742", 34, 33.8, 0, "", atHour(0, 11, 15));
    insertReading.run(load1045.id, t112, "TR-7742", 34, 34.2, 0, "", atHour(0, 13, 5));
  });

  seed();
}
