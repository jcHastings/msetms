"use server";

import { getSignedInDispatcher } from "./dispatcher-session";
import { refreshIntegrationFeeds } from "./feed-refresh";
import { canWrite } from "./settings-shared";

/** Start the same pull the 10-minute feed uses. The page does not wait on it. */
export async function refreshFeedsNowAction(): Promise<void> {
  const dispatcher = await getSignedInDispatcher();
  if (!dispatcher || !canWrite(dispatcher.role)) return;
  void refreshIntegrationFeeds();
}
