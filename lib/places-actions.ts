"use server";

import { getPlaceDetails, searchPlaces, type PlaceDetails, type PlaceSuggestion } from "./places";

export async function searchPlacesAction(query: string): Promise<PlaceSuggestion[]> {
  return searchPlaces(query);
}

export async function placeDetailsAction(placeId: string): Promise<PlaceDetails> {
  return getPlaceDetails(placeId);
}
