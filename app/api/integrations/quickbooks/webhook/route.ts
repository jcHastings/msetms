import { ingestQboWebhook } from "@/lib/integrations/qbo-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Intuit Payment webhook. Bad signatures are rejected. The body is not trusted; the Payment is read with GET. */
export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const result = await ingestQboWebhook({
      rawBody,
      signature: request.headers.get("intuit-signature") ?? "",
    });
    return Response.json(
      { ok: result.ok, accepted: result.accepted, reason: result.reason, applied: result.applied },
      { status: result.httpStatus },
    );
  } catch {
    return Response.json({ ok: false, accepted: false, reason: "error", applied: 0 }, { status: 500 });
  }
}
