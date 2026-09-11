import { handleDriverLoadDetail } from "@/lib/driver-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleDriverLoadDetail(request, context.params);
}
