import { ingestSamsaraWebhook } from "@/lib/integrations/samsara-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Samsara Event Subscriptions. Bad signatures soft-fail and are not applied. */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await ingestSamsaraWebhook({
    rawBody,
    signature: request.headers.get("x-samsara-signature") ?? "",
    timestamp: request.headers.get("x-samsara-timestamp") ?? "",
    eventTypeHeader: request.headers.get("x-samsara-event-type") ?? "",
  });
  return Response.json(result, { status: 200 });
}
