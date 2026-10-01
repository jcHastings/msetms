"use server";

import { requireSignedInDispatcher } from "./dispatcher-session";
import { searchLoads } from "./queries";
import type { LoadSearchCriteria } from "./search";
import type { LoadView } from "./types";

export async function searchLoadsAction(criteria: LoadSearchCriteria): Promise<LoadView[]> {
  await requireSignedInDispatcher();
  return searchLoads(criteria);
}
