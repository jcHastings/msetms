import { handleDriverAssistDocument } from "@/lib/driver-assist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ fleetDocumentId: string }> }) {
  return handleDriverAssistDocument(request, context.params);
}
