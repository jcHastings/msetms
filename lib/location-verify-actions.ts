"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "./dispatcher-session";
import { acceptCachedPlace, acceptVerifiedPlace, lookupLocationPlace, lookupUnverifiedBatch } from "./location-verify-store";
import { parseCoordPair, type PlaceDetails } from "./places-shared";
import { canEditLocations } from "./settings-shared";
import type { ActionResult } from "./types";

function refresh(): void {
  revalidatePath("/locations");
  revalidatePath("/locations/verify");
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong." };
}

async function requireLocationEditor() {
  return requireCapability(canEditLocations, "You cannot change locations.");
}

export async function lookupLocationVerifyAction(locationId: number): Promise<ActionResult> {
  try {
    await requireLocationEditor();
    if (!Number.isInteger(locationId) || locationId <= 0) throw new Error("Location not found.");
    const result = await lookupLocationPlace(locationId);
    refresh();
    if (!result.place) {
      return { ok: false, error: "No Google match. Check the key, or pick a place yourself." };
    }
    return { ok: true, id: locationId, message: "Google match ready." };
  } catch (error) {
    return fail(error);
  }
}

export async function lookupVerifyBatchAction(): Promise<ActionResult> {
  try {
    await requireLocationEditor();
    const result = await lookupUnverifiedBatch();
    refresh();
    return {
      ok: true,
      message: result.lookedUp === 0 ? "Nothing new to look up." : `Looked up ${result.lookedUp}.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function acceptCachedLocationAction(locationId: number): Promise<ActionResult> {
  try {
    await requireLocationEditor();
    if (!Number.isInteger(locationId) || locationId <= 0) throw new Error("Location not found.");
    acceptCachedPlace(locationId);
    refresh();
    return { ok: true, id: locationId, message: "Location verified." };
  } catch (error) {
    return fail(error);
  }
}

export async function acceptPickedLocationAction(formData: FormData): Promise<ActionResult> {
  try {
    await requireLocationEditor();
    const locationId = Number.parseInt(String(formData.get("location_id") ?? ""), 10);
    if (!Number.isInteger(locationId) || locationId <= 0) throw new Error("Location not found.");
    const coords = parseCoordPair(formData.get("latitude"), formData.get("longitude"));
    const place: PlaceDetails = {
      placeId: String(formData.get("google_place_id") ?? "").trim(),
      name: String(formData.get("name") ?? "").trim(),
      street: String(formData.get("street") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
      state: String(formData.get("state") ?? "").trim(),
      zip: String(formData.get("zip") ?? "").trim(),
      country: String(formData.get("country") ?? "").trim(),
      formatted: String(formData.get("formatted") ?? "").trim(),
      latitude: coords.lat,
      longitude: coords.lng,
    };
    acceptVerifiedPlace(locationId, place);
    refresh();
    return { ok: true, id: locationId, message: "Location verified." };
  } catch (error) {
    return fail(error);
  }
}
