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
    `INSERT INTO trucks (unit_number, type, capacity_lbs, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertDriver = db.prepare(
    `INSERT INTO drivers (name, phone, license, truck_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

    const t101 = Number(insertTruck.run("101", "dry_van", 45000, "available", created, created).lastInsertRowid);
    const t102 = Number(insertTruck.run("102", "dry_van", 45000, "in_use", created, created).lastInsertRowid);
    const t108 = Number(insertTruck.run("108", "reefer", 44000, "available", created, created).lastInsertRowid);
    const t112 = Number(insertTruck.run("112", "reefer", 44000, "in_use", created, created).lastInsertRowid);
    const t118 = Number(insertTruck.run("118", "dry_van", 45000, "in_use", created, created).lastInsertRowid);
    const t205 = Number(insertTruck.run("205", "flatbed", 48000, "in_use", created, created).lastInsertRowid);
    const t210 = Number(insertTruck.run("210", "flatbed", 48000, "maintenance", created, created).lastInsertRowid);
    insertTruck.run("301", "box", 26000, "available", created, created);

    const marcus = Number(
      insertDriver.run("Marcus Hale", "(502) 555-0101", "KY-D-448291", t102, "on_duty", created, created)
        .lastInsertRowid,
    );
    const denise = Number(
      insertDriver.run("Denise Ortega", "(901) 555-0102", "TN-CDL-772110", t112, "on_duty", created, created)
        .lastInsertRowid,
    );
    const james = Number(
      insertDriver.run("James Whitaker", "(314) 555-0103", "MO-CDL-190334", t118, "on_duty", created, created)
        .lastInsertRowid,
    );
    const cole = Number(
      insertDriver.run("Cole Brennan", "(615) 555-0104", "TN-CDL-551902", t205, "on_duty", created, created)
        .lastInsertRowid,
    );
    insertDriver.run("Priya Shah", "(317) 555-0105", "IN-CDL-883441", t101, "available", created, created);
    insertDriver.run("Angela Ruiz", "(312) 555-0106", "IL-CDL-229817", t108, "available", created, created);
    insertDriver.run("Tyrell Brooks", "(901) 555-0107", "MS-CDL-104552", null, "available", created, created);
    insertDriver.run("Sam Keene", "(816) 555-0108", "KS-CDL-667320", t210, "off_duty", created, created);

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
  });

  seed();
}
