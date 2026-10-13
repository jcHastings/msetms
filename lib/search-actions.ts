"use server";

import { requireSignedInDispatcher } from "./dispatcher-session";
import { searchLoads, searchLocationPickerRows, type LocationPickerHit } from "./queries";
import type { LoadSearchCriteria } from "./search";
import type { LoadView } from "./types";

export async function searchLoadsAction(criteria: LoadSearchCriteria): Promise<LoadView[]> {
  await requireSignedInDispatcher();
  return searchLoads(criteria);
}

export async function searchLocationsAction(query: string): Promise<LocationPickerHit[]> {
  await requireSignedInDispatcher();
  return searchLocationPickerRows(query);
}
