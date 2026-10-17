"use server";

import { requireSignedInDispatcher } from "./dispatcher-session";
import { getPlaceDetails, searchPlaces } from "./places";
import type { PlaceDetails, PlaceSuggestion } from "./places-shared";

export async function searchPlacesAction(query: string): Promise<PlaceSuggestion[]> {
  await requireSignedInDispatcher();
  return searchPlaces(query);
}

export async function placeDetailsAction(placeId: string): Promise<PlaceDetails> {
  await requireSignedInDispatcher();
  return getPlaceDetails(placeId);
}
