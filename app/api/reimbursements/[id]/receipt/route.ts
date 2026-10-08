import { getSignedInDispatcher } from "@/lib/dispatcher-session";
import { getSignedInDriver } from "@/lib/driver-session";
import { sanitizeName } from "@/lib/files";
import { ReimbursementAccessError, readReimbursementReceipt } from "@/lib/reimbursements";
import { canViewAccounting } from "@/lib/settings-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const dispatcher = await getSignedInDispatcher();
  const driver = await getSignedInDriver();
  const office = Boolean(dispatcher && canViewAccounting(dispatcher.role));
  if (!office && !driver) return new Response("Sign in", { status: 401 });
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isFinite(id)) return new Response("Not found", { status: 404 });
  try {
    const file = readReimbursementReceipt(id, { office, driverId: office ? null : driver?.id ?? null });
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${sanitizeName(file.filename)}"`,
        "Cache-Control": "private, no-store",
        "Content-Encoding": "identity",
      },
    });
  } catch (error) {
    if (error instanceof ReimbursementAccessError) {
      return new Response(error.message, { status: error.status });
    }
    return new Response("Receipt not found.", { status: 404 });
  }
}
