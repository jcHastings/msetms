import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tms-samsara-address-"));
process.env.TMS_DB_PATH = path.join(tmp, "tms.db");
process.env.TMS_DATA_DIR = tmp;
process.env.TMS_SKIP_SEED = "1";
delete process.env.SAMSARA_API_TOKEN;
delete process.env.SAMSARA_ADDRESS_TAG_IDS;

type FetchCall = {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
  auth: string;
};

function installFetch(handler: (call: FetchCall) => Response): FetchCall[] {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: FetchCall = {
      method: String(init?.method ?? "GET").toUpperCase(),
      url,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
      auth: String(headers.Authorization ?? ""),
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return Object.assign(calls, { restore: () => { globalThis.fetch = original; } });
}

async function main() {
  const shared = await import("../lib/samsara-address-shared");
  const queries = await import("../lib/queries");
  const syncMod = await import("../lib/integrations/samsara-addresses");

  const integrationSource = fs.readFileSync(path.join(process.cwd(), "lib/integrations/samsara-addresses.ts"), "utf8");
  assert.match(integrationSource, /\/addresses/);
  assert.match(integrationSource, /method,\s*\n\s*headers:/);
  assert.doesNotMatch(integrationSource, /orbcomm|geocodeAddress|places/i);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/samsara-address-shared.ts"), "utf8"), /Read Addresses \+ Write Addresses/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "lib/samsara-address-shared.ts"), "utf8"), /msetms/);
  const actionsSource = fs.readFileSync(path.join(process.cwd(), "lib/actions.ts"), "utf8");
  assert.equal((actionsSource.match(/syncLocationToSamsara\(/g) ?? []).length >= 3, true);
  assert.match(actionsSource, /syncLocationToSamsaraAction/);
  const ui = fs.readFileSync(path.join(process.cwd(), "components/samsara-address-sync.tsx"), "utf8");
  assert.match(ui, /Sync to Samsara/);
  assert.match(ui, /Trailers stay on Orbcomm/);
  assert.match(ui, /SAMSARA_ADDRESS_SCOPES/);
  assert.match(fs.readFileSync(path.join(process.cwd(), "app/locations/[id]/page.tsx"), "utf8"), /SamsaraAddressSync/);

  const pin = { latitude: 34.006121, longitude: -117.532884 };
  const costco = queries.createLocation({
    name: "Costco DC 961",
    street: "11600 Riverside Dr",
    city: "Mira Loma",
    state: "CA",
    zip: "91752",
    phone: "555-0100",
    notes: "private door code 4412",
    role: "receiver",
    scheduling_type: "appointment",
    hours: "Mon–Fri 04:00–13:00",
    scheduling_notes: "Dock 12. Appt required.",
    latitude: pin.latitude,
    longitude: pin.longitude,
  });
  const repeat = queries.createLocation({
    name: "Costco DC 961",
    street: "200 Dock B",
    city: "Mira Loma",
    state: "CA",
    zip: "91752",
    phone: "",
    notes: "",
    role: "receiver",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
    latitude: 34.007,
    longitude: -117.531,
  });
  const westside = queries.createLocation({
    name: "Westside dock",
    street: "40 West St",
    city: "Chicago",
    state: "IL",
    zip: "60608",
    phone: "",
    notes: "do not send this private note",
    role: "both",
    scheduling_type: "fcfs",
    hours: "",
    scheduling_notes: "FCFS. Gate on the west side.",
    latitude: 41.878113,
    longitude: -87.629799,
  });
  const noPin = queries.createLocation({
    name: "Nebraska Cold Storage",
    street: "600 E 39th St",
    city: "Hastings",
    state: "NE",
    zip: "68901",
    phone: "",
    notes: "",
    role: "receiver",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
  });
  const noStreet = queries.createLocation({
    name: "Name only yard",
    street: "",
    city: "Jackson",
    state: "MS",
    zip: "",
    phone: "",
    notes: "",
    role: "shipper",
    scheduling_type: "fcfs",
    hours: "",
    scheduling_notes: "",
    latitude: 32.3,
    longitude: -90.18,
  });

  const built = shared.buildSamsaraAddressPayload(queries.getLocation(costco)!);
  assert.equal(built.ok, true);
  if (built.ok) {
    assert.equal(built.body.latitude, pin.latitude);
    assert.equal(built.body.longitude, pin.longitude);
    assert.equal(built.body.geofence.circle.latitude, pin.latitude);
    assert.equal(built.body.geofence.circle.longitude, pin.longitude);
    assert.equal(built.body.geofence.circle.radiusMeters, 250);
    assert.equal(built.body.externalIds.msetms, String(costco));
    assert.equal(built.body.notes, "Dock 12. Appt required.");
    assert.deepEqual(built.body.tagIds, [shared.SAMSARA_ADDRESS_TAG_ID_DEFAULT]);
    assert.equal(shared.SAMSARA_ADDRESS_TAG_ID_DEFAULT, "4456991");
    assert.doesNotMatch(JSON.stringify(built.body), /4412/);
  }
  process.env.SAMSARA_ADDRESS_TAG_IDS = "111, 222,111";
  const tagged = shared.buildSamsaraAddressPayload(queries.getLocation(costco)!);
  assert.equal(tagged.ok, true);
  if (tagged.ok) assert.deepEqual(tagged.body.tagIds, ["111", "222"]);
  const { getSamsaraAddressTagIds } = await import("../lib/env");
  assert.deepEqual(getSamsaraAddressTagIds(), ["111", "222"]);
  delete process.env.SAMSARA_ADDRESS_TAG_IDS;
  assert.deepEqual(getSamsaraAddressTagIds(), ["4456991"]);
  assert.deepEqual(shared.samsaraAddressTagIds(undefined), ["4456991"]);
  assert.deepEqual(shared.samsaraAddressTagIds("  "), ["4456991"]);
  assert.equal(shared.isGenericAddressNotFound(404, { message: "Not Found", requestId: "req" }, ""), true);
  assert.equal(shared.isGenericAddressNotFound(404, { message: "Not Found" }, '{"message":"Not Found"}'), true);
  assert.equal(shared.isGenericAddressNotFound(404, null, "Not Found"), true);
  assert.equal(shared.isGenericAddressNotFound(404, { message: "feature is not enabled" }, ""), false);
  assert.equal(shared.isGenericAddressNotFound(400, { message: "Not Found" }, ""), false);
  assert.doesNotMatch(shared.SAMSARA_ADDRESS_MESSAGES.tag_scope, /feature/i);
  assert.match(shared.SAMSARA_ADDRESS_MESSAGES.tag_scope, /tagIds/);
  assert.match(shared.SAMSARA_ADDRESS_MESSAGES.tag_scope, /still saved/);
  const repeatBody = shared.buildSamsaraAddressPayload(queries.getLocation(repeat)!);
  assert.equal(repeatBody.ok, true);
  if (repeatBody.ok && built.ok) {
    assert.notEqual(repeatBody.body.externalIds.msetms, built.body.externalIds.msetms);
    assert.equal(repeatBody.body.externalIds.msetms, String(repeat));
  }
  assert.equal(shared.buildSamsaraAddressPayload(queries.getLocation(noPin)!).ok, false);
  assert.equal(shared.buildSamsaraAddressPayload({
    id: noPin,
    name: "Nebraska Cold Storage",
    street: "600 E 39th St",
    city: "Hastings",
    state: "NE",
    zip: "68901",
    latitude: null,
    longitude: null,
  }).ok, false);
  assert.equal(shared.storedPin(null, -87.6), null);
  assert.equal(shared.storedPin(91, -87.6), null);
  assert.equal(shared.samsaraAddressIdForRouting(null), null);
  assert.equal(shared.samsaraAddressIdForRouting({ samsara_address_id: "  " }), null);

  let calls = installFetch(() => {
    throw new Error("Samsara must not be called");
  });
  const missingPin = await syncMod.syncLocationToSamsara(noPin);
  assert.equal(missingPin.ok, false);
  if (!missingPin.ok) {
    assert.equal(missingPin.reason, "missing_coordinates");
    assert.match(missingPin.message, /Nothing was sent/);
    assert.match(missingPin.message, /No pin/);
  }
  assert.equal(calls.length, 0, "missing pin must not call Samsara");
  assert.equal(queries.getLocation(noPin)?.samsara_address_id ?? null, null);
  assert.match(queries.getLocation(noPin)?.samsara_address_error ?? "", /No pin/);

  const incomplete = await syncMod.syncLocationToSamsara(noStreet);
  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) assert.equal(incomplete.reason, "incomplete_address");
  assert.equal(calls.length, 0, "incomplete address must not call Samsara");

  const badPinId = queries.createLocation({
    name: "Bad pin",
    street: "1 Main",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    phone: "",
    notes: "",
    role: "both",
    scheduling_type: "fcfs",
    hours: "",
    scheduling_notes: "",
    latitude: 91,
    longitude: -96.8,
  });
  const badPin = await syncMod.syncLocationToSamsara(badPinId);
  assert.equal(badPin.ok, false);
  if (!badPin.ok) assert.equal(badPin.reason, "missing_coordinates");
  assert.equal(calls.length, 0, "out of range pin must not call Samsara");
  assert.equal(queries.getLocation(badPinId)?.latitude, 91);

  const missingToken = await syncMod.syncLocationToSamsara(costco);
  assert.equal(missingToken.ok, false);
  if (!missingToken.ok) {
    assert.equal(missingToken.reason, "token_missing");
    assert.equal(missingToken.setupBlocker, true);
    assert.match(missingToken.message, /Samsara is not connected/);
    assert.match(missingToken.message, /Read Addresses \+ Write Addresses/);
  }
  assert.equal(calls.length, 0, "missing token must not call Samsara");

  process.env.SAMSARA_API_TOKEN = "test-not-a-real-token";
  calls = installFetch((call) => {
    assert.equal(call.auth.startsWith("Bearer "), true);
    assert.equal(call.url.includes("test-not-a-real-token"), false);
    if (call.method === "GET") {
      return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    }
    assert.equal(call.method, "POST");
    assert.equal(call.url, "https://api.samsara.com/addresses");
    const sent = call.body as {
      latitude: number;
      longitude: number;
      externalIds: { msetms: string };
      geofence: { circle: { latitude: number; longitude: number; radiusMeters: number } };
      notes?: string;
    };
    assert.equal(sent.latitude, pin.latitude);
    assert.equal(sent.longitude, pin.longitude);
    assert.equal(sent.geofence.circle.latitude, pin.latitude);
    assert.equal(sent.geofence.circle.longitude, pin.longitude);
    assert.equal(sent.geofence.circle.radiusMeters, shared.SAMSARA_ADDRESS_RADIUS_METERS);
    assert.equal(sent.externalIds.msetms, String(costco));
    assert.deepEqual((call.body as { tagIds?: string[] }).tagIds, ["4456991"]);
    assert.doesNotMatch(JSON.stringify(sent), /4412/);
    assert.equal(JSON.stringify(sent).includes("test-not-a-real-token"), false);
    return new Response(
      JSON.stringify({
        data: {
          id: "addr-costco",
          externalIds: { msetms: String(costco) },
          latitude: 1,
          longitude: 2,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  const created = await syncMod.syncLocationToSamsara(costco);
  assert.equal(created.ok, true);
  if (created.ok) {
    assert.equal(created.addressId, "addr-costco");
    assert.equal(created.reused, false);
  }
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  assert.equal(calls.filter((call) => call.method === "GET").length, 1);
  assert.equal(calls[0]?.url, `https://api.samsara.com/addresses/msetms:${costco}`);
  const costcoRow = queries.getLocation(costco);
  assert.equal(costcoRow?.samsara_address_id, "addr-costco");
  assert.equal(costcoRow?.samsara_address_error, "");
  assert.equal(costcoRow?.latitude, pin.latitude, "sync must not replace the stored pin");
  assert.equal(costcoRow?.longitude, pin.longitude);
  assert.equal(shared.samsaraAddressIdForRouting(costcoRow), "addr-costco");

  calls = installFetch((call) => {
    if (call.method === "GET") {
      return new Response(
        JSON.stringify({ data: { id: "addr-west", externalIds: { msetms: String(westside) } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    assert.equal(call.method, "PATCH");
    assert.equal(call.url, "https://api.samsara.com/addresses/addr-west");
    const sent = call.body as { latitude: number; longitude: number; externalIds: { msetms: string }; notes: string };
    assert.equal(sent.latitude, 41.878113);
    assert.equal(sent.longitude, -87.629799);
    assert.equal(sent.externalIds.msetms, String(westside));
    assert.equal(sent.notes, "FCFS. Gate on the west side.");
    assert.deepEqual((call.body as { tagIds?: string[] }).tagIds, ["4456991"]);
    assert.doesNotMatch(JSON.stringify(sent), /do not send this private note/);
    return new Response(
      JSON.stringify({ data: { id: "addr-west", externalIds: { msetms: String(westside) } } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  const reused = await syncMod.syncLocationToSamsara(westside);
  assert.equal(reused.ok, true);
  if (reused.ok) assert.equal(reused.reused, true);
  assert.equal(calls.some((call) => call.method === "POST"), false, "existing external id must PATCH, not POST");
  assert.equal(queries.getLocation(westside)?.samsara_address_id, "addr-west");

  queries.saveLocationSamsaraAddress(repeat, { samsaraAddressId: "addr-keep", error: "" });
  calls = installFetch((call) => {
    assert.equal(call.method, "GET");
    return new Response(JSON.stringify({ message: "forbidden" }), { status: 403 });
  });
  const forbidden = await syncMod.syncLocationToSamsara(repeat);
  assert.equal(forbidden.ok, false);
  if (!forbidden.ok) {
    assert.equal(forbidden.reason, "scopes_insufficient");
    assert.equal(forbidden.setupBlocker, true);
    assert.match(forbidden.message, /HTTP 403/);
    assert.match(forbidden.message, /Read Addresses \+ Write Addresses/);
  }
  assert.equal(calls.length, 1);
  assert.equal(queries.getLocation(repeat)?.samsara_address_id, "addr-keep");
  assert.equal(queries.getLocation(repeat)?.latitude, 34.007);

  calls = installFetch(() => new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 }));
  const unauthorized = await syncMod.syncLocationToSamsara(repeat);
  assert.equal(unauthorized.ok, false);
  if (!unauthorized.ok) {
    assert.equal(unauthorized.reason, "scopes_insufficient");
    assert.match(unauthorized.message, /HTTP 401/);
  }
  assert.equal(calls.every((call) => call.method === "GET"), true);
  assert.equal(queries.getLocation(repeat)?.samsara_address_id, "addr-keep");

  calls = installFetch((call) => {
    if (call.method === "GET") return new Response("missing", { status: 404 });
    if (call.method === "POST") {
      return new Response(JSON.stringify({ message: "external id already exists" }), { status: 409 });
    }
    assert.equal(call.method, "PATCH");
    assert.equal(call.url, `https://api.samsara.com/addresses/msetms:${repeat}`);
    return new Response(
      JSON.stringify({ data: { id: "addr-repeat", externalIds: { msetms: String(repeat) } } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  const collided = await syncMod.syncLocationToSamsara(repeat);
  assert.equal(collided.ok, true);
  if (collided.ok) {
    assert.equal(collided.reused, true);
    assert.equal(collided.addressId, "addr-repeat");
  }
  assert.equal(queries.getLocation(repeat)?.samsara_address_id, "addr-repeat");

  calls = installFetch((call) => {
    if (call.method === "GET") {
      return new Response(
        JSON.stringify({ data: { id: "addr-foreign", externalIds: { msetms: "999999" } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error("must not write a foreign address");
  });
  const foreign = await syncMod.syncLocationToSamsara(westside);
  assert.equal(foreign.ok, false);
  if (!foreign.ok) assert.equal(foreign.reason, "request_failed");
  assert.equal(calls.length, 1);
  assert.equal(queries.getLocation(westside)?.samsara_address_id, "addr-west");

  const tagMiss = queries.createLocation({
    name: "Tag scope dock",
    street: "9 Tag St",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    phone: "",
    notes: "",
    role: "receiver",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
    latitude: 32.7767,
    longitude: -96.797,
  });
  calls = installFetch((call) => {
    if (call.method === "GET") return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    assert.equal(call.method, "POST");
    assert.deepEqual((call.body as { tagIds?: string[] }).tagIds, ["4456991"]);
    return new Response(JSON.stringify({ message: "Not Found", requestId: "req-tag" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  });
  const tagScoped = await syncMod.syncLocationToSamsara(tagMiss);
  assert.equal(tagScoped.ok, false);
  if (!tagScoped.ok) {
    assert.equal(tagScoped.reason, "tag_scope");
    assert.equal(tagScoped.setupBlocker, false);
    assert.match(tagScoped.message, /tag-scoped/i);
    assert.match(tagScoped.message, /tagIds/);
    assert.doesNotMatch(tagScoped.message, /feature/i);
  }
  assert.equal(queries.getLocation(tagMiss)?.samsara_address_id ?? null, null);
  assert.match(queries.getLocation(tagMiss)?.samsara_address_error ?? "", /tagIds/);
  assert.equal(queries.getLocation(tagMiss)?.name, "Tag scope dock");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);

  calls = installFetch(() => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  });
  const timedOut = await syncMod.syncLocationToSamsara(costco);
  assert.equal(timedOut.ok, false);
  if (!timedOut.ok) {
    assert.match(timedOut.message, /timed out/);
    assert.match(timedOut.message, /still saved/);
  }
  assert.equal(queries.getLocation(costco)?.name, "Costco DC 961");
  assert.equal(queries.getLocation(costco)?.samsara_address_id, "addr-costco");
  assert.equal(queries.getLocation(costco)?.latitude, pin.latitude);

  delete process.env.SAMSARA_API_TOKEN;
  delete process.env.SAMSARA_ADDRESS_TAG_IDS;
  console.log("samsara address sync ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
