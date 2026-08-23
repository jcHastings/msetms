"use server";

import { getPlaceDetails, searchPlaces } from "./places";
import type { PlaceDetails, PlaceSuggestion } from "./places-shared";

export async function searchPlacesAction(query: string): Promise<PlaceSuggestion[]> {
  return searchPlaces(query);
}

export async function placeDetailsAction(placeId: string): Promise<PlaceDetails> {
  return getPlaceDetails(placeId);
}
