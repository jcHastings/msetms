import { requireCapability, viewOnlyWriteResponse } from "@/lib/dispatcher-session";
import { commitPaystubPreview, commitPaystubQueue, PaystubHttpError, type OfficePaystubEdit } from "@/lib/paystubs";
import { canUploadPaystubs, VIEW_ONLY_WRITE_MESSAGE } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function denyViewer(): Promise<Response | null> {
  try {
    await requireCapability(canUploadPaystubs, VIEW_ONLY_WRITE_MESSAGE);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign in as a dispatcher to continue.";
    if (/View-only access/.test(message)) return viewOnlyWriteResponse();
    return new Response(message, { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

function asEdit(value: unknown): OfficePaystubEdit | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const driverRaw = row.driverId;
  const driverId = driverRaw == null || driverRaw === "" ? null : Number(driverRaw);
  return {
    key: String(row.key ?? ""),
    driverId: driverId == null || Number.isNaN(driverId) ? null : driverId,
    employeeName: String(row.employeeName ?? ""),
    payDate: String(row.payDate ?? ""),
    periodStart: String(row.periodStart ?? ""),
    periodEnd: String(row.periodEnd ?? ""),
    gross: String(row.gross ?? ""),
    net: String(row.net ?? ""),
    skip: Boolean(row.skip),
  };
}

export async function POST(request: Request) {
  const denied = await denyViewer();
  if (denied) return denied;
  let body: {
    previewId?: string;
    rows?: unknown[];
    queue?: unknown[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Send the review as JSON." }, { status: 400 });
  }
  try {
    const dispatcher = await requireCapability(canUploadPaystubs, VIEW_ONLY_WRITE_MESSAGE);
    const rows = Array.isArray(body.rows) ? body.rows.map(asEdit).filter((row): row is OfficePaystubEdit => Boolean(row?.key)) : [];
    const queue = Array.isArray(body.queue)
      ? body.queue
          .map((item) => {
            const edit = asEdit(item);
            const id = Number((item as { id?: unknown })?.id);
            return edit && id ? { ...edit, id } : null;
          })
          .filter((row): row is OfficePaystubEdit & { id: number } => Boolean(row))
      : [];
    const preview = body.previewId
      ? await commitPaystubPreview({ previewId: String(body.previewId), rows, uploadedBy: dispatcher.name })
      : { ok: true as const, saved: 0, results: [] };
    const queued = queue.length ? await commitPaystubQueue({ rows: queue, uploadedBy: dispatcher.name }) : { ok: true as const, saved: 0, results: [] };
    return Response.json({
      ok: true,
      runId: "runId" in preview ? preview.runId : undefined,
      saved: preview.saved + queued.saved,
      results: [...preview.results, ...queued.results],
    });
  } catch (error) {
    if (error instanceof PaystubHttpError) {
      return Response.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Could not save paystubs.";
    if (/View-only access/.test(message)) return viewOnlyWriteResponse();
    return Response.json({ ok: false, error: "Could not save paystubs." }, { status: 500 });
  }
}
