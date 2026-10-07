import { handleDriverAssist } from "@/lib/driver-assist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleDriverAssist(request);
}
