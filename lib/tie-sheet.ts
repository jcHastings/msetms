import { attachInboxToLoad } from "./files";
import { matchLocationForStop } from "./locations";
import {
  createLoad,
  createLocation,
  findOrCreateCustomer,
  getLoad,
  getLocation,
  listLocations,
  updateLoadDetails,
  updateLocation,
  type LoadInput,
} from "./queries";
import { replaceStops, type StopInput } from "./stops";
import {
  TIE_SHEET_CUSTOMER,
  TIE_SHEET_SHIPPER_CITY,
  TIE_SHEET_SHIPPER_NAME,
  TIE_SHEET_SHIPPER_STATE,
  tieSheetDraftDrops,
  type TieSheetDraft,
} from "./tie-sheet-shared";

export {
  decodeTieSheetDraft,
  draftFromTieSheetExtract,
  encodeTieSheetDraft,
  parseTieSheetText,
  tieSheetDraftPreview,
  TIE_SHEET_CUSTOMER,
  TIE_SHEET_MISSING_KEY_MESSAGE,
  TIE_SHEET_READ_FAILED,
  TIE_SHEET_SHIPPER_NAME,
} from "./tie-sheet-shared";

function findOrCreateBookLocation(input: {
  name: string;
  city: string;
  state: string;
  role: "shipper" | "receiver";
  schedule_type: "appointment" | "fcfs";
}): number | null {
  const existing = matchLocationForStop(listLocations(), {
    name: input.name,
    city: input.city,
    state: input.state,
  });
  if (existing) {
    keepAppointmentAndCallBefore(existing.id, input.role === "shipper" ? "appointment" : input.schedule_type);
    return existing.id;
  }
  if (!input.name.trim() || !input.city.trim()) return null;
  return createLocation({
    name: input.name.trim(),
    street: "",
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    zip: "",
    phone: "",
    notes: "",
    role: input.role,
    scheduling_type: input.schedule_type,
    hours: "",
    scheduling_notes: "",
    call_before: 1,
  });
}

function keepAppointmentAndCallBefore(id: number, scheduleType: "appointment" | "fcfs"): void {
  const location = getLocation(id);
  if (!location) return;
  const nextSchedule = location.role === "shipper" || scheduleType === "appointment" ? "appointment" : location.scheduling_type || scheduleType;
  if (location.call_before && location.scheduling_type === nextSchedule) return;
  updateLocation(id, {
    name: location.name,
    street: location.street,
    city: location.city,
    state: location.state,
    zip: location.zip,
    phone: location.phone,
    notes: location.notes,
    role: location.role,
    scheduling_type: nextSchedule === "fcfs" ? "fcfs" : "appointment",
    hours: location.hours,
    scheduling_notes: location.scheduling_notes,
    call_before: 1,
    latitude: location.latitude,
    longitude: location.longitude,
    google_place_id: location.google_place_id,
  });
}

export function saveTieSheetDraft(
  draft: TieSheetDraft,
  options: { inboxId?: string } = {},
): { id: number; load_number: string } {
  if (!draft.pickup_start || !draft.delivery_start) {
    throw new Error("The picture is missing pickup or delivery dates. Nothing was saved.");
  }
  const customerId = findOrCreateCustomer(draft.customer_name || TIE_SHEET_CUSTOMER);
  const drops = tieSheetDraftDrops(draft);
  if (!drops.length) throw new Error("The picture is missing a delivery. Nothing was saved.");
  const lastDrop = drops[drops.length - 1];
  const shipperId = findOrCreateBookLocation({
    name: draft.pickup.name || TIE_SHEET_SHIPPER_NAME,
    city: draft.pickup.city || TIE_SHEET_SHIPPER_CITY,
    state: draft.pickup.state || TIE_SHEET_SHIPPER_STATE,
    role: "shipper",
    schedule_type: "appointment",
  });
  const dropLocationIds = drops.map((drop) =>
    findOrCreateBookLocation({
      name: drop.name,
      city: drop.city,
      state: drop.state,
      role: "receiver",
      schedule_type: drop.schedule_type,
    }),
  );
  const consigneeId = dropLocationIds[dropLocationIds.length - 1] ?? null;

  const input: LoadInput = {
    customer_id: customerId,
    origin: draft.origin,
    destination: draft.destination || `${lastDrop.city}, ${lastDrop.state}`,
    pickup_start: draft.pickup_start,
    pickup_end: draft.pickup_end || draft.pickup_start,
    delivery_start: draft.delivery_start,
    delivery_end: draft.delivery_end || draft.delivery_start,
    weight: draft.weight,
    commodity: "",
    rate: null,
    notes: draft.notes,
    special_instructions: "",
    appointment_notes: "",
    reference_number: "",
    po_number: draft.po_number,
    reefer_setpoint_f: null,
    reefer_mode: draft.reefer_mode || "continuous",
    trailer_number: "",
    trailer_id: null,
    shipper_location_id: shipperId,
    consignee_location_id: consigneeId,
    status: "available",
    truck_id: null,
    driver_id: null,
    equipment: draft.equipment || "reefer_53",
    customer_reference: "",
  };
  const id = createLoad(input);
  updateLoadDetails(id, { case_count: draft.case_count, equipment: draft.equipment || "reefer_53" });

  const pickup: StopInput = {
    kind: "pickup",
    location_id: shipperId,
    name: draft.pickup.name || TIE_SHEET_SHIPPER_NAME,
    street: "",
    city: draft.pickup.city || TIE_SHEET_SHIPPER_CITY,
    state: draft.pickup.state || TIE_SHEET_SHIPPER_STATE,
    zip: "",
    phone: "",
    window_start: draft.pickup.window_start || draft.pickup_start,
    window_end: draft.pickup.window_end || draft.pickup_end || draft.pickup_start,
    confirmation: "",
    cargo: "",
    reference: "",
    instructions: "",
    notes: "",
    schedule_type: "appointment",
  };
  const dropStops: StopInput[] = drops.map((drop, index) => ({
    kind: "delivery",
    location_id: dropLocationIds[index],
    name: drop.name,
    street: "",
    city: drop.city,
    state: drop.state,
    zip: "",
    phone: "",
    window_start: drop.window_start || draft.delivery_start,
    window_end: drop.window_end || drop.window_start || draft.delivery_end || draft.delivery_start,
    confirmation: drop.confirmation,
    cargo: drop.cargo,
    reference: drop.reference,
    instructions: drop.notes,
    notes: drop.notes,
    schedule_type: drop.schedule_type,
  }));
  replaceStops(id, [pickup, ...dropStops]);

  if (options.inboxId) {
    try {
      attachInboxToLoad(id, options.inboxId, "other", "dispatcher");
    } catch {
      // Picture is optional on the saved load. The draft already confirmed.
    }
  }

  const load = getLoad(id);
  return { id, load_number: load?.load_number || "" };
}
