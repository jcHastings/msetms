import { handleDriverStopCheck } from "@/lib/driver-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; stopId: string }> },
) {
  return handleDriverStopCheck(request, context.params);
}
