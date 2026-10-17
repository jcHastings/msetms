import { handleDriverFuelReceipts } from "@/lib/driver-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleDriverFuelReceipts(request);
}

export async function POST(request: Request) {
  return handleDriverFuelReceipts(request);
}
