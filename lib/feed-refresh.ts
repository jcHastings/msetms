import { cronTokenFromEnv } from "./cron-auth";
import { integrationErrorCodeFromText } from "./integration-log";
import { forceRefreshReeferSnapshots } from "./integrations/orbcomm";
import { pullSamsaraRouteFeed } from "./integrations/samsara-routes";
import { forceRefreshSamsaraFleet } from "./integrations/samsara";

export type FeedRefreshSummary = {
  ok: boolean;
  saved: { orbcomm: number; fleet: number; routes: number };
  errors: string[];
};

function labeled(feed: string, text: string | undefined): string | null {
  const raw = text?.trim() ?? "";
  if (!raw) return null;
  return `${feed}: ${integrationErrorCodeFromText(raw)}`;
}

/** Same Orbcomm, fleet/GPS, and route-audit pulls the office pages run, without the page cache. */
export async function refreshIntegrationFeeds(): Promise<FeedRefreshSummary> {
  const saved = { orbcomm: 0, fleet: 0, routes: 0 };
  const errors: string[] = [];

  try {
    const reefer = await forceRefreshReeferSnapshots();
    saved.orbcomm = reefer.saved;
    const error = labeled("orbcomm", reefer.result.error);
    if (error) errors.push(error);
  } catch {
    errors.push("orbcomm: error");
  }

  try {
    const fleet = await forceRefreshSamsaraFleet();
    saved.fleet = fleet.saved;
    const error = labeled("fleet", fleet.result.error);
    if (error) errors.push(error);
  } catch {
    errors.push("fleet: error");
  }

  try {
    const routes = await pullSamsaraRouteFeed();
    saved.routes = routes.saved;
    const error = labeled("routes", routes.error);
    if (error) errors.push(error);
  } catch {
    errors.push("routes: error");
  }

  return { ok: errors.length === 0, saved, errors };
}

export function feedRefreshToken(): string | undefined {
  return cronTokenFromEnv();
}
