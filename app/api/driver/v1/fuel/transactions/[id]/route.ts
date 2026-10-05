import { handleDriverFuelTransactionDetail } from "@/lib/driver-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleDriverFuelTransactionDetail(request, context.params);
}
