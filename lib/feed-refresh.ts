import { cronTokenFromEnv } from "./cron-auth";
import { integrationErrorCode, integrationErrorCodeFromText } from "./integration-log";
import { forceRefreshReeferSnapshots } from "./integrations/orbcomm";
import { syncQboPaymentsFromCdc } from "./integrations/qbo-payments";
import { pullSamsaraRouteFeed } from "./integrations/samsara-routes";
import { forceRefreshSamsaraFleet } from "./integrations/samsara";

/** Each feed stops on its own. Four of these still fit under the timer's 110s curl cap. */
const FEED_DEADLINE_MS = 20_000;

export type FeedRefreshSummary = {
  ok: boolean;
  busy?: boolean;
  saved: { orbcomm: number; fleet: number; routes: number; payments: number };
  errors: string[];
};

function labeled(feed: string, text: string | undefined): string | null {
  const raw = text?.trim() ?? "";
  if (!raw) return null;
  return `${feed}: ${integrationErrorCodeFromText(raw)}`;
}

let refreshRunning = false;

/**
 * Orbcomm, then fleet/GPS, then route audit. One feed's failure or deadline
 * does not skip the others. A second call while this is running returns busy
 * and does not start another pull.
 */
export async function refreshIntegrationFeeds(): Promise<FeedRefreshSummary> {
  if (refreshRunning) {
    return { ok: true, busy: true, saved: { orbcomm: 0, fleet: 0, routes: 0, payments: 0 }, errors: [] };
  }
  refreshRunning = true;
  try {
    return await runIsolatedFeeds();
  } finally {
    refreshRunning = false;
  }
}

async function runIsolatedFeeds(): Promise<FeedRefreshSummary> {
  const saved = { orbcomm: 0, fleet: 0, routes: 0, payments: 0 };
  const errors: string[] = [];

  const orbcommSignal = AbortSignal.timeout(FEED_DEADLINE_MS);
  try {
    const reefer = await forceRefreshReeferSnapshots(orbcommSignal);
    saved.orbcomm = reefer.saved;
    const error = labeled("orbcomm", orbcommSignal.aborted ? "timeout" : reefer.result.error);
    if (error) errors.push(error);
  } catch (error) {
    errors.push(`orbcomm: ${integrationErrorCode(error)}`);
  }

  const fleetSignal = AbortSignal.timeout(FEED_DEADLINE_MS);
  try {
    const fleet = await forceRefreshSamsaraFleet(fleetSignal);
    saved.fleet = fleet.saved;
    const error = labeled("fleet", fleetSignal.aborted ? "timeout" : fleet.result.error);
    if (error) errors.push(error);
  } catch (error) {
    errors.push(`fleet: ${integrationErrorCode(error)}`);
  }

  const routeSignal = AbortSignal.timeout(FEED_DEADLINE_MS);
  try {
    const routes = await pullSamsaraRouteFeed(routeSignal);
    saved.routes = routes.saved;
    const error = labeled("routes", routeSignal.aborted ? "timeout" : routes.error);
    if (error) errors.push(error);
  } catch (error) {
    errors.push(`routes: ${integrationErrorCode(error)}`);
  }

  const paymentSignal = AbortSignal.timeout(FEED_DEADLINE_MS);
  try {
    const payments = await syncQboPaymentsFromCdc();
    saved.payments = payments.saved;
    const error = labeled("payments", paymentSignal.aborted ? "timeout" : payments.error);
    if (error) errors.push(error);
  } catch (error) {
    errors.push(`payments: ${integrationErrorCode(error)}`);
  }

  return { ok: errors.length === 0, saved, errors };
}

export function feedRefreshToken(): string | undefined {
  return cronTokenFromEnv();
}
