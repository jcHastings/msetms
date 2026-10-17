/**
 * Dispatch SMS text for the driver.
 * Fixtures only. Does not send SMS, open a database, or read .env.
 */
import assert from "node:assert/strict";
import { formatDriverDispatchText, formatLoadSummary, type LoadSummaryInput } from "../lib/load-summary";

const NOW = new Date("2026-08-29T14:00:00.000Z");

const baseLoad = {
  load_number: "MSE-2201",
  origin: "Hastings, NE",
  destination: "Bronx, NY",
  pickup_start: "2026-08-23T08:00:00.000-04:00",
  pickup_end: "2026-08-23T17:00:00.000-04:00",
  delivery_start: "2026-08-25T08:00:00.000-04:00",
  delivery_end: "2026-08-25T17:00:00.000-04:00",
  commodity: "Beef",
  reefer_setpoint_f: 26,
  reefer_mode: "continuous" as const,
  special_instructions: "Call before arrival",
  appointment_notes: "",
  public_notes: "Scale ticket in the door.",
  notes: "INTERNAL do not print",
  driver_name: "Jose Ortega",
  driver_phone: "555-0100",
  driver_type: "company_driver",
  rate: 3100,
  oo_pay: null,
  truck_unit: "26",
  trailer_number: "MS1519",
  your_leg: "Hastings, NE → Omaha, NE",
};

const multiStopFixture: LoadSummaryInput = {
  ...baseLoad,
  stops: [
    {
      kind: "pickup",
      name: "Westside Foods",
      street: "4100 Industrial Rd",
      city: "Hastings",
      state: "NE",
      zip: "68901",
      window_start: "2026-08-23T08:00:00.000-04:00",
      window_end: "2026-08-23T17:00:00.000-04:00",
      schedule_type: "fcfs",
    },
    {
      kind: "delivery",
      name: "Bronx DC",
      street: "1200 Food Center Dr",
      city: "Bronx",
      state: "NY",
      zip: "10474",
      window_start: "2026-08-25T08:00:00.000-04:00",
      window_end: "",
      schedule_type: "appointment",
    },
    {
      kind: "pickup",
      name: "Midwest Cold",
      street: "900 Packer Ave",
      city: "Omaha",
      state: "NE",
      zip: "68102",
      window_start: "",
      window_end: "",
      schedule_type: "",
    },
    {
      kind: "delivery",
      name: "",
      street: "72 New Hook Rd",
      city: "Bayonne",
      state: "NJ",
      zip: "",
      window_start: "2026-08-26T09:00:00.000-04:00",
      window_end: "",
      schedule_type: "appointment",
    },
  ],
};

const MULTI_STOP_TEXT = [
  "Good morning, Jose. Hope you're having a great day.",
  "",
  "Load MSE-2201",
  "",
  "Shipper",
  "Westside Foods",
  "4100 Industrial Rd",
  "Hastings, NE 68901",
  "Pickup 08/23 8:00 AM–5:00 PM",
  "",
  "Receiver",
  "Bronx DC",
  "1200 Food Center Dr",
  "Bronx, NY 10474",
  "Delivery 08/25 8:00 AM",
  "",
  "Shipper",
  "Midwest Cold",
  "900 Packer Ave",
  "Omaha, NE 68102",
  "",
  "Receiver",
  "72 New Hook Rd",
  "Bayonne, NJ",
  "Delivery 08/26 9:00 AM",
  "",
  "Truck 26 · Trailer MS1519",
  "Reefer 26°F Continuous",
  "",
  "Your leg: Hastings, NE → Omaha, NE",
  "Special instructions: Call before arrival",
  "Notes: Scale ticket in the door.",
].join("\n");

function assertNoEmptyFieldLines(text: string): void {
  assert.doesNotMatch(text, /undefined/);
  assert.doesNotMatch(text, /\n{3,}/);
  assert.equal(text, text.trim());
  for (const line of text.split("\n")) {
    if (line === "") continue;
    assert.equal(line, line.trim());
    assert.notEqual(line, "");
  }
}

function stopSection(text: string, marker: string): string {
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, marker);
  const rest = text.slice(start);
  const end = rest.indexOf("\n\n");
  return end === -1 ? rest : rest.slice(0, end);
}

function smsSegments(body: string): { chars: number; segments: number } {
  const chars = Array.from(body).length;
  const segments = chars <= 70 ? 1 : Math.ceil(chars / 67);
  return { chars, segments };
}

const text = formatDriverDispatchText(multiStopFixture, { locale: "en", now: NOW });
assert.equal(text, MULTI_STOP_TEXT);
assertNoEmptyFieldLines(text);
assert.match(text, /^Good morning, Jose\./);
assert.match(text, /Load MSE-2201/);
assert.match(text, /Truck 26 · Trailer MS1519/);
assert.match(text, /Reefer 26°F Continuous/);
assert.match(text, /Your leg: Hastings, NE → Omaha, NE/);
assert.match(text, /Special instructions: Call before arrival/);
assert.match(text, /Notes: Scale ticket in the door\./);
assert.doesNotMatch(text, /INTERNAL|3100|\$3/);

const westside = text.indexOf("Westside Foods");
const bronx = text.indexOf("Bronx DC");
const midwest = text.indexOf("Midwest Cold");
const bayonne = text.indexOf("72 New Hook Rd");
assert.ok(westside < bronx && bronx < midwest && midwest < bayonne, "stops stay in route order");

const missingAppointment = stopSection(text, "Midwest Cold");
assert.equal(missingAppointment, "Midwest Cold\n900 Packer Ave\nOmaha, NE 68102");
assert.doesNotMatch(missingAppointment, /Pickup|Delivery|Appointment/);

const missingZipAndFacility = stopSection(text, "Receiver\n72 New Hook Rd");
assert.equal(missingZipAndFacility, "Receiver\n72 New Hook Rd\nBayonne, NJ\nDelivery 08/26 9:00 AM");
assert.doesNotMatch(missingZipAndFacility, /undefined|,\s*$/);

const undefinedFields: LoadSummaryInput = {
  ...baseLoad,
  special_instructions: "",
  public_notes: "",
  your_leg: "",
  truck_unit: "",
  trailer_number: "",
  reefer_setpoint_f: null,
  stops: [
    {
      kind: "pickup",
      name: "undefined",
      street: "1 Dock St",
      city: "Austin",
      state: "TX",
      zip: "undefined",
      window_start: "undefined",
      window_end: "undefined",
      schedule_type: "appointment",
    },
    {
      kind: "delivery",
      name: "undefined",
      street: "",
      city: "Dallas",
      state: "TX",
      zip: null,
      window_start: null,
      window_end: null,
    },
  ],
};
const cleaned = formatLoadSummary(undefinedFields);
assert.equal(
  cleaned,
  ["Load MSE-2201", "Shipper\n1 Dock St\nAustin, TX", "Receiver\nDallas, TX"].join("\n\n"),
);
assertNoEmptyFieldLines(cleaned);
assert.doesNotMatch(cleaned, /Pickup|Delivery|Appointment/);

const cityOnly = formatLoadSummary({
  load_number: "MSE-1042",
  customer_reference: "1006153",
  po_number: "1006153",
  origin: "Hastings, NE",
  destination: "Bronx, NY",
  pickup_start: "2026-08-23T08:00:00.000-04:00",
  pickup_end: "2026-08-23T17:00:00.000-04:00",
  delivery_start: "2026-08-25T08:00:00.000-04:00",
  delivery_end: "2026-08-25T17:00:00.000-04:00",
  commodity: "Beef",
  reefer_setpoint_f: 26,
  reefer_mode: "continuous",
  special_instructions: "",
  appointment_notes: "",
  driver_name: "Denise Ortega",
  driver_phone: "555-0100",
  driver_type: "company_driver",
  rate: 3100,
  oo_pay: null,
  truck_unit: "26",
  trailer_number: "MS1519",
  stops: [
    {
      kind: "pickup",
      name: "Hastings",
      city: "Hastings",
      state: "NE",
      window_start: "2026-08-23T08:00:00.000-04:00",
      window_end: "2026-08-23T17:00:00.000-04:00",
      schedule_type: "fcfs",
    },
    {
      kind: "delivery",
      city: "Bronx",
      state: "NY",
      window_start: "2026-08-25T08:00:00.000-04:00",
      window_end: "2026-08-25T17:00:00.000-04:00",
      schedule_type: "fcfs",
    },
  ],
});
assert.equal(
  cityOnly,
  [
    "Load MSE-1042",
    "Shipper\nHastings, NE\nPickup 08/23 8:00 AM–5:00 PM",
    "Receiver\nBronx, NY\nDelivery 08/25 8:00 AM–5:00 PM",
    "Truck 26 · Trailer MS1519\nReefer 26°F Continuous",
  ].join("\n\n"),
);

const segments = smsSegments(text);
assert.equal(segments.chars, 509);
assert.equal(segments.segments, 8);

console.log(`dispatch-sms-test ok (${segments.chars} chars, ${segments.segments} UCS-2 segments)`);
