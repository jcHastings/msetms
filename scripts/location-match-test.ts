/**
 * Facility matching for rate-con stops and new locations.
 * Suggests only. Use is the only path that stores an alias, and it does not
 * rewrite the saved facility.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

const dbPath = path.join(os.tmpdir(), `tms-location-match-${Date.now()}-${process.pid}.db`);
process.env.TMS_DB_PATH = dbPath;
process.env.TMS_SKIP_SEED = "1";
process.env.TMS_SCRIPT_ACTOR_ROLE = "admin";

import { haversineMiles } from "../lib/places-shared";
import {
  GEOCODE_MATCH_METERS,
  normalizeFacilityAddress,
  suggestFacilityMatch,
  type FacilityRecord,
} from "../lib/location-match";

function facility(partial: Partial<FacilityRecord> & Pick<FacilityRecord, "id" | "name">): FacilityRecord {
  return {
    street: "",
    city: "",
    state: "",
    zip: "",
    latitude: null,
    longitude: null,
    archived_at: null,
    aliases: [],
    ...partial,
  };
}

function north(lat: number, lng: number, meters: number): { latitude: number; longitude: number } {
  return { latitude: lat + meters / 111_320, longitude: lng };
}

function metersBetween(
  lat: number,
  lng: number,
  other: { latitude: number; longitude: number },
): number {
  const miles = haversineMiles({ lat, lng }, { lat: other.latitude, lng: other.longitude });
  assert.ok(miles != null);
  return miles * 1609.344;
}

const lineage = facility({
  id: 1,
  name: "Lineage Logistics - Avenel",
  street: "275 Blair Road",
  city: "Avenel",
  state: "NJ",
  zip: "07001",
  latitude: 40.58,
  longitude: -74.27,
});

async function main() {
  const abbreviated = normalizeFacilityAddress({ street: "123 N Main St.", zip: "30301-1234" });
  assert.equal(abbreviated.line, "123 north main street");
  assert.equal(abbreviated.house, "123");
  assert.equal(abbreviated.core, "main");
  assert.equal(abbreviated.zip5, "30301");
  assert.equal(
    normalizeFacilityAddress({ street: "500 W Broadway Ave, Suite #12" }).line,
    "500 west broadway avenue",
  );

  const book = [
    lineage,
    facility({
      id: 2,
      name: "Nebraska Cold Storage",
      street: "600 East 39th Street",
      city: "Hastings",
      state: "NE",
      zip: "68901",
    }),
  ];

  const misspelled = suggestFacilityMatch(book, {
    name: "Lineage Avenel",
    street: "275 Bliar Rd",
    city: "Avenel",
    state: "NJ",
    zip: "07001",
  });
  assert.equal(misspelled?.id, 1, "a one-letter street misspelling in the same zip matches");
  assert.equal(misspelled?.reason, "address");

  const abbreviatedMatch = suggestFacilityMatch(book, {
    name: "Cold Storage",
    street: "600 E 39th St",
    city: "Hastings",
    state: "NE",
    zip: "68901",
  });
  assert.equal(abbreviatedMatch?.id, 2);
  assert.equal(abbreviatedMatch?.reason, "address");

  const suite = suggestFacilityMatch(
    [facility({ id: 3, name: "Broadway Dock", street: "500 West Broadway Avenue", city: "New York", state: "NY", zip: "10013" })],
    { name: "Bway", street: "500 W. Broadway Ave Suite 12", city: "New York", state: "NY", zip: "10013" },
  );
  assert.equal(suite?.id, 3);

  assert.equal(
    suggestFacilityMatch(book, {
      name: "Lineage Logistics - Avenel",
      street: "275 Blair Road",
      city: "Avenel",
      state: "NJ",
      zip: "07002",
    }),
    null,
    "the same street in a different zip is not a match",
  );
  assert.equal(
    suggestFacilityMatch(book, {
      name: "Lineage Logistics - Avenel",
      street: "276 Blair Road",
      city: "Avenel",
      state: "NJ",
      zip: "07001",
    }),
    null,
    "a different house number is not a match",
  );

  const zipHouse = suggestFacilityMatch(
    [
      facility({ id: 4, name: "Oak Plant", street: "100 Oak Street", city: "Kansas City", state: "MO", zip: "64108" }),
      facility({ id: 5, name: "Acme Foods", street: "100 Pine Street", city: "Kansas City", state: "MO", zip: "64108" }),
      facility({ id: 6, name: "Zenith", street: "100 Elm Street", city: "Kansas City", state: "MO", zip: "64108" }),
    ],
    { name: "Acme Warehouse", street: "100 Industrial Boulevard", city: "Kansas City", state: "MO", zip: "64108" },
  );
  assert.equal(zipHouse?.reason, "zip_house");
  assert.equal(zipHouse?.id, 5, "same zip and house number is a candidate, and the name only breaks the tie");

  assert.equal(
    suggestFacilityMatch(book, { name: "Lineage Logistics - Avenel", street: "", city: "", state: "", zip: "" }),
    null,
    "name similarity is never enough on its own",
  );

  const near = north(40.58, -74.27, 40);
  const far = north(40.58, -74.27, 180);
  assert.ok(metersBetween(40.58, -74.27, near) < GEOCODE_MATCH_METERS);
  assert.ok(metersBetween(40.58, -74.27, far) > GEOCODE_MATCH_METERS);
  const byPin = suggestFacilityMatch(book, {
    name: "Some Other Dock",
    street: "999 Nowhere Road",
    city: "Newark",
    state: "NJ",
    zip: "07102",
    ...near,
  });
  assert.equal(byPin?.id, 1);
  assert.equal(byPin?.reason, "geocode");
  assert.equal(
    suggestFacilityMatch(book, {
      name: "Some Other Dock",
      street: "999 Nowhere Road",
      city: "Newark",
      state: "NJ",
      zip: "07102",
      ...far,
    }),
    null,
    "a pin outside 100 meters does not match when the address also differs",
  );

  const closer = north(40.58, -74.27, 20);
  const alsoClose = north(40.58, -74.27, 80);
  const pinBook = [
    facility({ ...lineage, id: 7, name: "Other Dock", latitude: closer.latitude, longitude: closer.longitude }),
    facility({
      id: 8,
      name: "Lineage Logistics - Avenel",
      street: "1 Other Street",
      city: "Avenel",
      state: "NJ",
      zip: "07001",
      latitude: alsoClose.latitude,
      longitude: alsoClose.longitude,
    }),
  ];
  const primaryPin = suggestFacilityMatch(pinBook, {
    name: "Lineage Logistics - Avenel",
    street: "1 Other Street",
    city: "Avenel",
    state: "NJ",
    zip: "07001",
    latitude: 40.58,
    longitude: -74.27,
  });
  assert.equal(primaryPin?.id, 7, "the closer pin wins; the name does not override it");

  assert.equal(
    suggestFacilityMatch(
      [{ ...lineage, id: 9, archived_at: "2026-01-01T00:00:00.000Z" }],
      { name: "Lineage", street: "275 Blair Road", city: "Avenel", state: "NJ", zip: "07001" },
    ),
    null,
    "archived facilities are not suggested",
  );

  const aliased = facility({
    ...lineage,
    id: 10,
    aliases: [{ name: "Lineage Dock 4", street: "999 Warehouse Way", city: "Avenel", state: "NJ", zip: "07001" }],
  });
  const aliasHit = suggestFacilityMatch([aliased], {
    name: "Lineage Dock 4",
    street: "999 Warehouse Way",
    city: "Avenel",
    state: "NJ",
    zip: "07001",
  });
  assert.equal(aliasHit?.id, 10);
  assert.equal(aliasHit?.reason, "alias");
  assert.equal(
    suggestFacilityMatch([aliased], { name: "Lineage Dock 4", street: "", city: "Avenel", state: "NJ", zip: "07001" }),
    null,
    "an alias name without the saved address is not a match",
  );

  const queries = await import("../lib/queries");
  const { closeDb } = await import("../lib/db");
  const savedId = queries.createLocation({
    name: "Lineage Logistics - Avenel",
    street: "275 Blair Road",
    city: "Avenel",
    state: "NJ",
    zip: "07001",
    phone: "",
    notes: "",
    role: "both",
    scheduling_type: "appointment",
    hours: "",
    scheduling_notes: "",
    latitude: 40.58,
    longitude: -74.27,
  });
  const before = queries.getLocation(savedId);
  assert.ok(before);
  const variant = {
    name: "Lineage Avenel",
    street: "275 Bliar Rd",
    city: "Avenel",
    state: "NJ",
    zip: "07001",
  };
  const stored = queries.addLocationAlias(savedId, variant);
  assert.ok(stored);
  const afterAlias = queries.getLocation(savedId);
  assert.equal(afterAlias?.name, before.name);
  assert.equal(afterAlias?.street, before.street);
  assert.equal(afterAlias?.zip, before.zip);
  assert.equal(afterAlias?.latitude, before.latitude);
  const again = queries.addLocationAlias(savedId, variant);
  assert.equal(again?.id, stored.id, "saving the same variant twice does not add a second alias");
  assert.equal(queries.listLocationAliases(savedId).length, 1);

  const fromAlias = suggestFacilityMatch(queries.listFacilityMatchRecords(), variant);
  assert.equal(fromAlias?.id, savedId);
  assert.equal(fromAlias?.reason, "alias");

  const actions = await import("../lib/actions");
  const fuzzyForm = new FormData();
  fuzzyForm.set("name", "Lineage Avenel DC");
  fuzzyForm.set("street", "275 Bliar Road");
  fuzzyForm.set("city", "Avenel");
  fuzzyForm.set("state", "NJ");
  fuzzyForm.set("zip", "07001");
  const countBefore = queries.listLocations().length;
  const warned = await actions.createLocationAction(null, fuzzyForm);
  assert.equal(warned.ok, false);
  if (!warned.ok) {
    assert.equal(warned.duplicate, true);
    assert.equal(warned.existingId, savedId);
    assert.equal(warned.existingName, "Lineage Logistics - Avenel");
    assert.equal(warned.draft?.name, "Lineage Avenel DC");
    assert.equal(warned.draft?.street, "275 Bliar Road");
    assert.match(warned.error, /Looks like Lineage Logistics - Avenel/);
  }
  assert.equal(queries.listLocations().length, countBefore, "a suggestion does not insert a location");
  assert.equal(queries.getLocation(savedId)?.street, "275 Blair Road");

  const rateConForm = new FormData();
  rateConForm.set("name", "Lineage Avenel");
  rateConForm.set("street", "275 Blair Rd.");
  rateConForm.set("city", "Avenel");
  rateConForm.set("state", "NJ");
  rateConForm.set("zip", "07001");
  rateConForm.set("role", "shipper");
  const rateConWarned = await actions.saveRateConLocationAction(null, rateConForm);
  assert.equal(rateConWarned.ok, false);
  if (!rateConWarned.ok) {
    assert.equal(rateConWarned.duplicate, true);
    assert.equal(rateConWarned.existingId, savedId);
  }
  assert.equal(queries.listLocations().length, countBefore);

  const useForm = new FormData();
  useForm.set("use_existing", "1");
  useForm.set("existing_id", String(savedId));
  useForm.set("name", "Lineage Dock 9");
  useForm.set("street", "275 Blaire Rd");
  useForm.set("city", "Avenel");
  useForm.set("state", "NJ");
  useForm.set("zip", "07001");
  let redirected = false;
  try {
    await actions.createLocationAction(null, useForm);
  } catch (error) {
    const digest = error && typeof error === "object" && "digest" in error ? String((error as { digest: unknown }).digest) : "";
    redirected = digest.includes("NEXT_REDIRECT");
    if (!redirected) throw error;
  }
  assert.equal(redirected, true);
  assert.equal(queries.listLocations().length, countBefore, "Use does not create a second location");
  const used = queries.getLocation(savedId);
  assert.equal(used?.name, "Lineage Logistics - Avenel");
  assert.equal(used?.street, "275 Blair Road");
  assert.equal(used?.latitude, 40.58);
  const aliases = queries.listLocationAliases(savedId);
  assert.ok(aliases.some((alias) => alias.street === "275 Blaire Rd" && alias.name === "Lineage Dock 9"));
  const reused = suggestFacilityMatch(queries.listFacilityMatchRecords(), {
    name: "Lineage Dock 9",
    street: "275 Blaire Rd",
    city: "Avenel",
    state: "NJ",
    zip: "07001",
  });
  assert.equal(reused?.reason, "alias");
  assert.equal(reused?.id, savedId);

  const createNew = new FormData();
  createNew.set("confirm_duplicate", "1");
  createNew.set("name", "A Different Dock");
  createNew.set("street", "275 Blair Road");
  createNew.set("city", "Avenel");
  createNew.set("state", "NJ");
  createNew.set("zip", "07001");
  let createdRedirect = false;
  try {
    await actions.createLocationAction(null, createNew);
  } catch (error) {
    const digest = error && typeof error === "object" && "digest" in error ? String((error as { digest: unknown }).digest) : "";
    createdRedirect = digest.includes("NEXT_REDIRECT");
    if (!createdRedirect) throw error;
  }
  assert.equal(createdRedirect, true);
  assert.equal(queries.listLocations().length, countBefore + 1);
  assert.equal(queries.getLocation(savedId)?.name, "Lineage Logistics - Avenel");
  assert.equal(
    queries.listLocationAliases(savedId).some((alias) => alias.name === "A Different Dock"),
    false,
    "Create new does not write an alias onto the existing facility",
  );

  closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
